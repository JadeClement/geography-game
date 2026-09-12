/**
 * Per-session Learn "boring detection": if the learner is cruising through
 * easy formats, raise the ease cap so the next queued country is asked harder.
 *
 * easeCap is a tier number: 4 (easiest) … 2 (hardest this feature will go).
 * Country order is unchanged; only upcoming formats may be rewritten.
 */

import { QUESTION_TIERS, ROUND_OUTCOMES } from "@worldly/constants";

export const LEARN_ESCALATION = {
  MIN_EASE_CAP: 2,
  MAX_EASE_CAP: 4,
  DEFAULT_EASE_CAP: 4,
  /** Consecutive first-try corrects at this cap required to drop one step. */
  STREAK_TO_HARDEN: {
    4: 4,
    3: 2,
  },
};

const TIER_NUMBER = {
  [QUESTION_TIERS.TIER_1]: 1,
  [QUESTION_TIERS.TIER_2]: 2,
  [QUESTION_TIERS.TIER_3]: 3,
  [QUESTION_TIERS.TIER_4]: 4,
};

const TIER_BY_NUMBER = {
  1: QUESTION_TIERS.TIER_1,
  2: QUESTION_TIERS.TIER_2,
  3: QUESTION_TIERS.TIER_3,
  4: QUESTION_TIERS.TIER_4,
};

function clampEaseCap(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return LEARN_ESCALATION.DEFAULT_EASE_CAP;
  return Math.min(
    LEARN_ESCALATION.MAX_EASE_CAP,
    Math.max(LEARN_ESCALATION.MIN_EASE_CAP, n)
  );
}

export function createLearnEscalation() {
  return {
    easeCap: LEARN_ESCALATION.DEFAULT_EASE_CAP,
    streak: 0,
  };
}

export function normalizeLearnEscalation(raw) {
  const base = createLearnEscalation();
  if (!raw || typeof raw !== "object") return base;
  return {
    easeCap: clampEaseCap(raw.easeCap ?? base.easeCap),
    streak: Math.max(0, Math.floor(Number(raw.streak) || 0)),
  };
}

export function tierNumberFromTier(tier) {
  return TIER_NUMBER[tier] ?? null;
}

export function tierFromEaseCap(easeCap) {
  return TIER_BY_NUMBER[clampEaseCap(easeCap)] ?? QUESTION_TIERS.TIER_4;
}

/**
 * True when `question` is easier (higher tier number) than the current cap.
 */
export function shouldRewriteQuestion(question, easeCap) {
  if (!question) return false;
  const n = tierNumberFromTier(question.tier);
  if (n == null) return false;
  return n > clampEaseCap(easeCap);
}

/**
 * @param {{ easeCap?: number, streak?: number }|null} state
 * @param {{ tier?: string, outcome?: string }} event
 * @returns {{ easeCap: number, streak: number }}
 */
export function applyLearnEscalation(state, { tier, outcome } = {}) {
  const current = normalizeLearnEscalation(state);
  if (outcome !== ROUND_OUTCOMES.FIRST_TRY_CORRECT) {
    return createLearnEscalation();
  }

  const answered = tierNumberFromTier(tier);
  if (answered == null || answered !== current.easeCap) {
    return { easeCap: current.easeCap, streak: 0 };
  }

  const streak = current.streak + 1;
  const needed = LEARN_ESCALATION.STREAK_TO_HARDEN[current.easeCap];
  if (
    needed &&
    streak >= needed &&
    current.easeCap > LEARN_ESCALATION.MIN_EASE_CAP
  ) {
    return { easeCap: current.easeCap - 1, streak: 0 };
  }
  return { easeCap: current.easeCap, streak };
}
