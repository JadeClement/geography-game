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
 * IMPORTANT (Step 6.4): only the PRIMARY `countryId` is ever recorded — the
 * comparison country in Tier 3/4 questions is never written. Callers must record
 * one stat per answered question using `event.countryId` only.
 *
 * The existing Test-mode EMA formula is untouched; `learnModeMultiplier` defaults
 * to 1 everywhere so Test-mode calls (which never pass it) are unaffected.
 */

import { ROUND_OUTCOMES, GAME_TYPE_FOR_STATS, LEARN_EMA_MULTIPLIERS } from "@worldly/constants";

/**
 * Maps a Learn answer event to a round outcome:
 * - correct, no clue / prior miss    → first_try_correct
 * - correct after a soft miss        → second_try_correct
 * - a clue/reveal was used (any)     → needed_reveal
 * - wrong, no clue used              → second_try_correct (the "miss" penalty path)
 */
export function outcomeFromEvent({ correct, revealUsed, priorMiss } = {}) {
  if (revealUsed) return ROUND_OUTCOMES.NEEDED_REVEAL;
  if (correct && priorMiss) return ROUND_OUTCOMES.SECOND_TRY_CORRECT;
  if (correct) return ROUND_OUTCOMES.FIRST_TRY_CORRECT;
  return ROUND_OUTCOMES.SECOND_TRY_CORRECT;
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
export function buildLearnStatPayload(event, { mode, level }) {
  const { outcome, multiplierKey, multiplier } = resolveLearnEma(event);
  const payload = {
    countryId: event.countryId,
    mode,
    level,
    gameType: GAME_TYPE_FOR_STATS.LEARNING,
    outcome,
    responseTimeMs: event.responseTimeMs ?? null,
    learnModeMultiplier: multiplier,
  };
  return { payload, meta: { outcome, multiplierKey, multiplier } };
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
    `country=${event?.countryId} correct=${event?.correct} fast=${event?.fast} reveal=${event?.revealUsed}`
  );
}
