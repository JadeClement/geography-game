/**
 * country_stats level-collapse planner and migration script.
 *
 * Run: node --import ./scripts/register-alias.mjs --test scripts/test-collapse-level-rows.js
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeStatGroup,
  planCollapse,
} from "@worldly/core/learn/collapseLevelRows";
import {
  collapseCountryStatsLevels,
} from "./collapse-country-stats-levels.js";

function row(overrides) {
  return {
    id: overrides.id,
    user_id: "user-1",
    country_id: "FRA",
    mode: "countries",
    skill_domain: "location",
    level: "F1",
    mastery_score: 0,
    first_try_correct: 0,
    second_try_correct: 0,
    needed_reveal: 0,
    incorrect: 0,
    response_time_ms_sum: 0,
    response_time_count: 0,
    fast_streak: 0,
    speed_baseline_ms: null,
    graduated: false,
    last_attempt_at: "2026-01-01T00:00:00Z",
    last_outcome: "first_try_correct",
    last_correct_at: "2026-01-01T00:00:00Z",
    last_correct_session: 1,
    ...overrides,
  };
}

const FOUR_ROW_GROUP = [
  row({
    id: "r-f1",
    level: "F1",
    mastery_score: 0.55,
    first_try_correct: 4,
    second_try_correct: 1,
    needed_reveal: 0,
    incorrect: 0,
    response_time_ms_sum: 4000,
    response_time_count: 4,
    fast_streak: 0,
    speed_baseline_ms: 1800,
    graduated: false,
    last_attempt_at: "2026-06-01T00:00:00Z",
    last_outcome: "second_try_correct",
    last_correct_at: "2026-06-01T00:00:00Z",
    last_correct_session: 3,
  }),
  row({
    id: "r-f2",
    level: "F2",
    mastery_score: 0.2,
    first_try_correct: 1,
    last_attempt_at: "2026-09-14T04:00:00Z",
    last_outcome: "first_try_correct",
    last_correct_at: "2026-09-14T04:00:00Z",
    last_correct_session: 8,
    fast_streak: 1,
    speed_baseline_ms: 900,
  }),
  row({
    id: "r-n1",
    level: "N1",
    mastery_score: 0.36,
    first_try_correct: 2,
    incorrect: 1,
    last_attempt_at: "2026-08-01T00:00:00Z",
    last_outcome: "incorrect",
    last_correct_at: "2026-07-01T00:00:00Z",
    last_correct_session: 5,
    graduated: true,
    fast_streak: 2,
    speed_baseline_ms: 1200,
  }),
  row({
    id: "r-n2",
    level: "N2",
    mastery_score: 0.4,
    first_try_correct: 3,
    needed_reveal: 1,
    last_attempt_at: "2026-09-13T12:00:00Z",
    last_outcome: "needed_reveal",
    last_correct_at: "2026-09-13T11:00:00Z",
    last_correct_session: 7,
    fast_streak: 0,
    speed_baseline_ms: 1500,
  }),
];

test("a 4-row group merges to the documented values", () => {
  const plan = mergeStatGroup(FOUR_ROW_GROUP);
  assert.equal(plan.keeperId, "r-f1");
  assert.equal(plan.merged.mastery_score, 0.55);
  assert.equal(plan.merged.first_try_correct, 10);
  assert.equal(plan.merged.second_try_correct, 1);
  assert.equal(plan.merged.needed_reveal, 1);
  assert.equal(plan.merged.incorrect, 1);
  assert.equal(plan.merged.response_time_ms_sum, 4000);
  assert.equal(plan.merged.response_time_count, 4);
  assert.equal(plan.merged.fast_streak, 0);
  assert.equal(plan.merged.speed_baseline_ms, 1800);
  assert.equal(plan.merged.graduated, true);
  assert.equal(plan.merged.level, "F2");
  assert.equal(plan.merged.last_outcome, "first_try_correct");
  assert.equal(plan.merged.last_attempt_at, "2026-09-14T04:00:00Z");
  assert.equal(plan.merged.last_correct_at, "2026-09-14T04:00:00Z");
  assert.equal(plan.merged.last_correct_session, 8);
  assert.deepEqual(plan.deleteIds.sort(), ["r-f2", "r-n1", "r-n2"]);
});

test("planCollapse is idempotent on a second run", () => {
  const first = planCollapse(FOUR_ROW_GROUP);
  assert.equal(first.deleteCount, 3);
  const mergedRow = {
    ...FOUR_ROW_GROUP[0],
    ...first.plans[0].merged,
    id: first.plans[0].keeperId,
  };
  const second = planCollapse([mergedRow]);
  assert.equal(second.deleteCount, 0);
  assert.equal(second.mergeCount, 0);
  assert.equal(second.groupCount, 1);
});

test("dry-run writes nothing", async () => {
  const calls = [];
  const queryFn = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    return { rows: FOUR_ROW_GROUP };
  };
  const report = await collapseCountryStatsLevels({ dryRun: true, queryFn });
  assert.equal(report.wrote, false);
  assert.equal(report.deleteCount, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /SELECT/i);
  assert.equal(
    calls.some((call) => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(call.sql)),
    false
  );
});

test("apply copies the pre-state into a backup table before deleting", async () => {
  const writes = [];
  const queryFn = async (sql, params) => {
    const text = String(sql);
    if (/^\s*SELECT/i.test(text) && /FROM country_stats/i.test(text)) {
      return { rows: FOUR_ROW_GROUP };
    }
    writes.push(text.replace(/\s+/g, " ").trim());
    return { rows: [] };
  };
  const report = await collapseCountryStatsLevels({
    dryRun: false,
    queryFn,
    now: new Date("2026-09-14T12:00:00Z"),
  });
  assert.equal(report.wrote, true);
  assert.ok(report.backupTable.startsWith("country_stats_backup_"));
  assert.match(writes[0], /^CREATE TABLE country_stats_backup_.* AS TABLE country_stats$/);
  assert.ok(writes.some((sql) => sql.startsWith("UPDATE country_stats")));
  assert.ok(writes.some((sql) => sql.startsWith("DELETE FROM country_stats")));
  const backupIndex = writes.findIndex((sql) => sql.startsWith("CREATE TABLE country_stats_backup_"));
  const deleteIndex = writes.findIndex((sql) => sql.startsWith("DELETE FROM country_stats"));
  assert.ok(backupIndex >= 0 && deleteIndex > backupIndex);
});
