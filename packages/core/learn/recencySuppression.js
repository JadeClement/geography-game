// Hybrid recency suppression for Learn mode
// session sampling.
//
// After a correct answer, a country's sampling
// weight is reduced until both conditions clear:
//   1. Enough sessions have passed
//   2. Enough time has elapsed
// Either condition clearing lifts suppression.

// Thresholds per mastery band.
// sessions: minimum sessions since last correct
// hours: minimum hours since last correct
// Both must clear for full weight to return.
const SUPPRESSION_THRESHOLDS = [
  { maxMastery: 0.30, sessions: 0,        hours: 0   },
  { maxMastery: 0.50, sessions: 1,        hours: 8   },
  { maxMastery: 0.65, sessions: 2,        hours: 16  },
  { maxMastery: 0.75, sessions: 3,        hours: 24  },
  { maxMastery: 0.85, sessions: 5,        hours: 48  },
  { maxMastery: 0.90, sessions: 8,        hours: 96  },
  { maxMastery: Infinity, sessions: Infinity, hours: Infinity },
];

export { SUPPRESSION_THRESHOLDS };

function getThresholds(masteryScore) {
  for (const band of SUPPRESSION_THRESHOLDS) {
    if (masteryScore < band.maxMastery) {
      return {
        sessions: band.sessions,
        hours: band.hours,
      };
    }
  }
  return { sessions: Infinity, hours: Infinity };
}

// getRecencyModifier(stat, currentSessionNumber, now)
// stat: a country_stats row including
//   last_correct_at, last_correct_session,
//   last_outcome, mastery_score
// currentSessionNumber: users.total_sessions
//   at the start of this session
// now: Date.now() — pass explicitly for
//   testability
// Returns: 0.05 – 1.0
//   1.0 = full weight, no suppression
//   0.05 = minimum weight, maximum suppression
export function getRecencyModifier(
  stat, currentSessionNumber, now
) {
    // No suppression if last outcome was a complete miss
  // or a reveal — country needs to come back soon
  const outcome = stat.lastOutcome;
  if (!outcome ||
      outcome === "needed_reveal" ||
      outcome === "incorrect") {
    return 1.0;
  }

  // second_try_correct is a weak correct signal —
  // the user needed a prompt, so suppression
  // applies but at half strength compared to
  // first_try_correct. The modifier floor is
  // raised to 0.5 so the country still appears
  // relatively soon.
  const isWeakCorrect =
    outcome === "second_try_correct";

  // No suppression if no correct answer on record
  if (!stat.lastCorrectAt ||
      stat.lastCorrectSession == null) {
    return 1.0;
  }

  const thresholds = getThresholds(stat.masteryScore);

  // No suppression threshold for this mastery band
  if (thresholds.sessions === 0 &&
      thresholds.hours === 0) {
    return 1.0;
  }

  // Graduated territory — exclude entirely.
  // Return 0 so the caller can filter these out.
  if (thresholds.sessions === Infinity) {
    return 0;
  }

  const sessionsSince = Math.max(0,
    currentSessionNumber - stat.lastCorrectSession
  );
  const hoursSince =
    (now - new Date(stat.lastCorrectAt).getTime()) /
    (1000 * 60 * 60);

  const sessionsSuppressed =
    sessionsSince < thresholds.sessions;
  const hoursSuppressed =
    hoursSince < thresholds.hours;

  // Both conditions must be active for
  // suppression to apply.
  // If either has cleared, return full weight.
  if (!sessionsSuppressed || !hoursSuppressed) {
    return 1.0;
  }

  // Both suppressed: compute progress toward
  // clearing. Use the condition furthest from
  // clearing (smallest progress ratio) as
  // the binding constraint.
  const sessionProgress = thresholds.sessions > 0
    ? sessionsSince / thresholds.sessions
    : 1.0;

  const hoursProgress = thresholds.hours > 0
    ? hoursSince / thresholds.hours
    : 1.0;

  // Most suppressed (furthest from clearing)
  const progress = Math.min(
    sessionProgress, hoursProgress
  );

    // Weak correct (second_try_correct):
  //   ramps from 0.50 → 1.0 as progress
  //   approaches 1.0. Country stays fairly
  //   visible but is deprioritized slightly.
  //
  // Strong correct (first_try_correct):
  //   ramps from 0.05 → 1.0 as progress
  //   approaches 1.0. Country is heavily
  //   suppressed until thresholds clear.

  if (isWeakCorrect) {
    return 0.50 + (0.50 * progress);
  }
  return 0.05 + (0.95 * progress);
}

// getSamplingWeight(stat, currentSessionNumber, now)
// The complete weight for a country in the
// sampling pool, combining the existing
// EMA-based weight with the recency modifier.
export function getSamplingWeight(
  stat, currentSessionNumber, now
) {
  // Existing formula: (1 - mastery)² + 0.05
  const masteryScore = stat.masteryScore ?? 0;
  const baseWeight =
    Math.pow(1 - masteryScore, 2) + 0.05;

  const modifier = getRecencyModifier(
    stat, currentSessionNumber, now
  );

  // modifier === 0 means graduated territory —
  // exclude from pool entirely
  if (modifier === 0) return 0;

  return baseWeight * modifier;
}
