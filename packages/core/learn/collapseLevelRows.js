/**
 * Pure merge planner for collapsing country_stats off `level`.
 *
 * One stored score per (user_id, country_id, mode, skill_domain). `level` becomes
 * informational (most recently played). Used by the migration script and tests.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timeMs(value) {
  if (value == null || value === "") return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function pick(row, snake, camel) {
  return row?.[snake] ?? row?.[camel];
}

export function cellKey(row) {
  const userId = pick(row, "user_id", "userId");
  const countryId = pick(row, "country_id", "countryId");
  const mode = row?.mode;
  const domain = pick(row, "skill_domain", "skillDomain") || "general";
  return `${userId}\0${countryId}\0${mode}\0${domain}`;
}

export function groupStatsForCollapse(rows = []) {
  const map = new Map();
  for (const row of rows ?? []) {
    const key = cellKey(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.values()];
}

function compareAttemptDesc(a, b) {
  const dt =
    timeMs(pick(b, "last_attempt_at", "lastAttemptAt")) -
    timeMs(pick(a, "last_attempt_at", "lastAttemptAt"));
  if (dt !== 0) return dt;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

function sumField(rows, snake, camel) {
  let total = 0;
  for (const row of rows) total += num(pick(row, snake, camel));
  return total;
}

/**
 * Merge one (user, country, mode, domain) group into a single row payload.
 *
 * @returns {{ keeperId: string, merged: object, deleteIds: string[] } | null}
 */
export function mergeStatGroup(rows = []) {
  const group = (rows ?? []).filter(Boolean);
  if (group.length === 0) return null;

  let bestScore = -Infinity;
  const scoreWinners = [];
  for (const row of group) {
    const score = num(pick(row, "mastery_score", "masteryScore"));
    if (score > bestScore) {
      bestScore = score;
      scoreWinners.length = 0;
      scoreWinners.push(row);
    } else if (score === bestScore) {
      scoreWinners.push(row);
    }
  }
  scoreWinners.sort(compareAttemptDesc);
  const scoreSource = scoreWinners[0];
  const latest = [...group].sort(compareAttemptDesc)[0];

  let lastCorrectAt = null;
  let lastCorrectMs = 0;
  let lastCorrectSession = null;
  for (const row of group) {
    const at = pick(row, "last_correct_at", "lastCorrectAt");
    const t = timeMs(at);
    if (t > lastCorrectMs) {
      lastCorrectMs = t;
      lastCorrectAt = at;
    }
    const sess = pick(row, "last_correct_session", "lastCorrectSession");
    if (sess != null && sess !== "") {
      const n = Number(sess);
      if (Number.isFinite(n) && (lastCorrectSession == null || n > lastCorrectSession)) {
        lastCorrectSession = n;
      }
    }
  }

  const merged = {
    id: scoreSource.id,
    mastery_score: bestScore,
    first_try_correct: sumField(group, "first_try_correct", "firstTryCorrect"),
    second_try_correct: sumField(group, "second_try_correct", "secondTryCorrect"),
    needed_reveal: sumField(group, "needed_reveal", "neededReveal"),
    incorrect: sumField(group, "incorrect", "incorrect"),
    response_time_ms_sum: sumField(group, "response_time_ms_sum", "responseTimeMsSum"),
    response_time_count: sumField(group, "response_time_count", "responseTimeCount"),
    fast_streak: num(pick(scoreSource, "fast_streak", "fastStreak")),
    speed_baseline_ms: pick(scoreSource, "speed_baseline_ms", "speedBaselineMs") ?? null,
    graduated: group.some((row) => Boolean(row.graduated)),
    last_attempt_at: pick(latest, "last_attempt_at", "lastAttemptAt") ?? null,
    last_outcome: pick(latest, "last_outcome", "lastOutcome") ?? null,
    last_correct_at: lastCorrectAt,
    last_correct_session: lastCorrectSession,
    level: latest.level,
  };

  const deleteIds = group
    .filter((row) => row.id !== scoreSource.id)
    .map((row) => row.id);

  return { keeperId: scoreSource.id, merged, deleteIds };
}

export function sizeDistribution(groups) {
  const counts = new Map();
  for (const group of groups) {
    const n = group.length;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n_rows, groupsCount]) => ({ n_rows, groups: groupsCount }));
}

export function planCollapse(rows = []) {
  const groups = groupStatsForCollapse(rows);
  const plans = [];
  for (const group of groups) {
    const plan = mergeStatGroup(group);
    if (plan && plan.deleteIds.length > 0) plans.push(plan);
  }
  return {
    totalRows: rows.length,
    groupCount: groups.length,
    mergeCount: plans.length,
    deleteCount: plans.reduce((sum, plan) => sum + plan.deleteIds.length, 0),
    sizeDistribution: sizeDistribution(groups),
    plans,
  };
}
