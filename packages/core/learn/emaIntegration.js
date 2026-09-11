/**
 * Step 6 — Learn-mode EMA update integration helpers.
 *
 * Given a normalized answer event from LearnQuestionRenderer, these helpers:
 *  1. Map the event to a ROUND_OUTCOMES value.
 *  2. Resolve the LEARN_EMA_MULTIPLIERS key (e.g. `tier_1_correct_fast`).
 *  3. Look up the numeric multiplier for that key.
 *  4. Build the /api/country-stats POST payload (with `learnModeMultiplier`),
 *     which flows through recordCountryPerformance → computeMasteryUpdate.
 *
 * IMPORTANT (Step 6.4): the PRIMARY `countryId` is recorded for most question
 * types. Ranking questions (`drag_to_rank`) also write a weighted update for
 * every country in the set via `event.countryUpdates`. Neighbor set questions
 * (`neighbor_recall_all`, `neighbor_select_all`, `brazil_non_neighbors`) keep
 * a single primary write, with `learnModeMultiplier` scaled by how much of
 * the set was right.
 *
 * The existing Test-mode EMA formula is untouched; `learnModeMultiplier` defaults
 * to 1 everywhere so Test-mode calls (which never pass it) are unaffected.
 */

import { ROUND_OUTCOMES, GAME_TYPE_FOR_STATS, LEARN_EMA_MULTIPLIERS } from "@worldly/constants";
import { distancePenaltyScale } from "./mapGuess.js";

/** Set-answer neighbor types: partial credit scales the subject's EMA. */
export const NEIGHBOR_SET_QUESTION_TYPES = new Set([
  "neighbor_recall_all",
  "neighbor_select_all",
  "brazil_non_neighbors",
]);

/**
 * 0–1 credit for a neighbor set answer.
 * Hits over the true set, with extras shrinking the score so "select everything"
 * is not free. 4/6 with no extras → 2/3; 6/6 with 2 extras → 6/8.
 */
export function neighborSetCredit({
  correctIds = [],
  selectedIds = [],
  extraCount = null,
} = {}) {
  const correct = [...new Set((correctIds ?? []).filter(Boolean))];
  const total = correct.length;
  if (total === 0) return 1;
  const correctSet = new Set(correct);
  const selected = [...new Set((selectedIds ?? []).filter(Boolean))];
  let hits = 0;
  let extrasFromSelected = 0;
  for (const id of selected) {
    if (correctSet.has(id)) hits += 1;
    else extrasFromSelected += 1;
  }
  const extras = Math.max(
    extrasFromSelected,
    Number.isFinite(extraCount) ? Math.max(0, extraCount) : 0
  );
  let credit = hits / total;
  if (extras > 0) credit *= total / (total + extras);
  return Math.min(1, Math.max(0, credit));
}

/**
 * Maps a Learn answer event to a round outcome:
 * - correct, no prior miss           → first_try_correct
 * - correct after a soft miss        → second_try_correct
 * - a clue/reveal was used (any)     → needed_reveal
 * - wrong, no clue used              → incorrect (complete miss)
 */
export function outcomeFromEvent({ correct, revealUsed, priorMiss } = {}) {
  if (revealUsed) return ROUND_OUTCOMES.NEEDED_REVEAL;
  if (correct && priorMiss) return ROUND_OUTCOMES.SECOND_TRY_CORRECT;
  if (correct) return ROUND_OUTCOMES.FIRST_TRY_CORRECT;
  return ROUND_OUTCOMES.INCORRECT;
}

/**
 * Resolves the LEARN_EMA_MULTIPLIERS key string for a tier + outcome. Mirrors
 * resolveLearnEmaMultiplier's branching so the logged key and applied value never
 * diverge. Returns null for unknown tiers (→ neutral 1.0 multiplier).
 */
export function resolveMultiplierKey(tier, outcome, { fast = false } = {}) {
  const isCorrect = outcome === ROUND_OUTCOMES.FIRST_TRY_CORRECT;
  const isReveal = outcome === ROUND_OUTCOMES.NEEDED_REVEAL;

  switch (tier) {
    case "tier_1":
      if (isCorrect) return fast ? "tier_1_correct_fast" : "tier_1_correct_slow";
      if (isReveal) return "tier_1_reveal";
      return "tier_1_wrong";
    case "tier_2":
      if (isCorrect) return fast ? "tier_2_correct_fast" : "tier_2_correct_slow";
      return "tier_2_wrong"; // no separate tier_2_reveal key in the table
    case "tier_3":
      return isCorrect ? "tier_3_correct" : "tier_3_wrong";
    case "tier_4":
      return isCorrect ? "tier_4_correct" : "tier_4_wrong";
    default:
      return null;
  }
}

/**
 * Full resolution for a Learn answer event → { outcome, multiplierKey, multiplier }.
 */
export function resolveLearnEma(event) {
  const outcome = outcomeFromEvent(event);
  const multiplierKey = resolveMultiplierKey(event?.tier, outcome, { fast: event?.fast });
  const multiplier =
    multiplierKey != null && multiplierKey in LEARN_EMA_MULTIPLIERS
      ? LEARN_EMA_MULTIPLIERS[multiplierKey]
      : 1;
  return { outcome, multiplierKey, multiplier };
}

/**
 * Builds the /api/country-stats POST body for a Learn answer. Records the PRIMARY
 * country only. `mode`/`level` come from the active session.
 *
 * @param {object} event - normalized answer event (from LearnQuestionRenderer)
 * @param {{ mode: string, level: string }} session
 * @returns {{ payload: object, meta: { outcome, multiplierKey, multiplier } }}
 */
export function buildLearnStatPayload(event, { mode, level, currentSessionNumber } = {}) {
  const questionType = event?.questionType ?? event?.type ?? null;
  const setCredit = NEIGHBOR_SET_QUESTION_TYPES.has(questionType)
    ? neighborSetCredit({
        correctIds: Array.isArray(event?.correctAnswer) ? event.correctAnswer : [],
        selectedIds: Array.isArray(event?.selectedValue) ? event.selectedValue : [],
        extraCount: Array.isArray(event?.wrongValues) ? event.wrongValues.length : null,
      })
    : null;
  const partialSet = setCredit != null && setCredit > 0 && setCredit < 1 - 1e-9 && !event?.correct;

  const emaEvent = partialSet
    ? { ...event, correct: true, revealUsed: false, priorMiss: false, fast: false }
    : event;
  const { outcome, multiplierKey, multiplier } = resolveLearnEma(emaEvent);
  let applied = multiplier;
  if (partialSet) {
    applied = multiplier * setCredit;
  } else if (
    !event?.correct &&
    !event?.revealUsed &&
    event?.distanceKm != null &&
    Number.isFinite(event.distanceKm)
  ) {
    applied = multiplier * distancePenaltyScale(event.distanceKm);
  }
  const payload = {
    countryId: event.countryId,
    mode,
    level,
    gameType: GAME_TYPE_FOR_STATS.LEARNING,
    outcome,
    // Partial set credit is a slow first-try so fast-streak does not advance.
    responseTimeMs: partialSet ? null : event.responseTimeMs ?? null,
    learnModeMultiplier: applied,
    questionTier: event.tier ?? null,
    questionType,
    predictedSuccess:
      event.predictedSuccess != null && Number.isFinite(event.predictedSuccess)
        ? event.predictedSuccess
        : null,
    currentSessionNumber:
      Number.isInteger(currentSessionNumber) && currentSessionNumber >= 0
        ? currentSessionNumber
        : undefined,
  };
  return {
    payload,
    meta: {
      outcome,
      multiplierKey,
      multiplier: applied,
      setCredit: partialSet ? setCredit : setCredit === 1 ? 1 : null,
    },
  };
}

/**
 * Ranking questions emit one payload per country in the set. Everything else
 * returns a single payload for the primary country.
 */
export function buildLearnStatPayloads(event, session) {
  const updates = Array.isArray(event?.countryUpdates) ? event.countryUpdates : [];
  if (updates.length === 0) {
    return [buildLearnStatPayload(event, session)];
  }
  return updates
    .filter((update) => update?.countryId)
    .map((update) =>
      buildLearnStatPayload(
        {
          ...event,
          countryId: update.countryId,
          correct: Boolean(update.correct),
          // Per-country placement never inherits the overall miss's distance.
          distanceKm: undefined,
        },
        session
      )
    );
}

/**
 * Dev-visible logging (Step 6.5): question type, tier, and multiplier used,
 * alongside the mastery update. No-op in production.
 */
export function logLearnEmaUpdate(event, meta) {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.debug(
    "[learn-ema]",
    `type=${event?.questionType} tier=${event?.tier}`,
    `outcome=${meta?.outcome} key=${meta?.multiplierKey} x=${meta?.multiplier}`,
    `country=${event?.countryId} correct=${event?.correct} fast=${event?.fast} reveal=${event?.revealUsed}`,
    event?.distanceKm != null && Number.isFinite(event.distanceKm)
      ? `distanceKm=${Math.round(event.distanceKm)}`
      : ""
  );
}
