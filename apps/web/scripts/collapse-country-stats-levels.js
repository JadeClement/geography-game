/**
 * Collapse country_stats off `level` as part of identity.
 *
 * One row per (user_id, country_id, mode, skill_domain). `level` is kept as
 * the most recently played level on the cell.
 *
 * Usage:
 *   node --env-file=.env apps/web/scripts/collapse-country-stats-levels.js --dry-run
 *   node --env-file=.env apps/web/scripts/collapse-country-stats-levels.js
 *   node --env-file=.env apps/web/scripts/collapse-country-stats-levels.js --rollback <backup_table>
 *
 * Run this (or `npm run db:setup`) and finish the index rebuild BEFORE deploying
 * the upsert that conflicts on (user_id, country_id, mode, skill_domain).
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool, query } from "../lib/db.js";
import { planCollapse } from "@worldly/core/learn/collapseLevelRows";

const SELECT_ALL = `
  SELECT id, user_id, country_id, mode, level, skill_domain,
         first_try_correct, second_try_correct, needed_reveal, incorrect,
         response_time_ms_sum, response_time_count,
         mastery_score, fast_streak, speed_baseline_ms, graduated,
         last_attempt_at, last_outcome, last_correct_at, last_correct_session
  FROM country_stats
`;

export const NEW_INDEXES_SQL = `
DROP INDEX IF EXISTS country_stats_general_unique_idx;
DROP INDEX IF EXISTS country_stats_domain_unique_idx;
DROP INDEX IF EXISTS country_stats_user_lookup_idx;
DROP INDEX IF EXISTS country_stats_domain_lookup_idx;
DROP INDEX IF EXISTS country_stats_recency_idx;
ALTER TABLE country_stats
  DROP CONSTRAINT IF EXISTS country_stats_user_id_country_id_mode_level_key;

CREATE UNIQUE INDEX IF NOT EXISTS country_stats_cell_unique_idx
  ON country_stats (user_id, country_id, mode, skill_domain);

CREATE INDEX IF NOT EXISTS country_stats_user_lookup_idx
  ON country_stats (user_id, mode);

CREATE INDEX IF NOT EXISTS country_stats_domain_lookup_idx
  ON country_stats (user_id, mode, skill_domain);

CREATE INDEX IF NOT EXISTS country_stats_recency_idx
  ON country_stats (user_id, mode, last_correct_session)
  WHERE last_correct_session IS NOT NULL;
`;

export const OLD_INDEXES_SQL = `
DROP INDEX IF EXISTS country_stats_cell_unique_idx;
DROP INDEX IF EXISTS country_stats_user_lookup_idx;
DROP INDEX IF EXISTS country_stats_domain_lookup_idx;
DROP INDEX IF EXISTS country_stats_recency_idx;

CREATE UNIQUE INDEX IF NOT EXISTS country_stats_general_unique_idx
  ON country_stats (user_id, country_id, mode, level)
  WHERE skill_domain = 'general';

CREATE UNIQUE INDEX IF NOT EXISTS country_stats_domain_unique_idx
  ON country_stats (user_id, country_id, mode, level, skill_domain)
  WHERE skill_domain <> 'general';

CREATE INDEX IF NOT EXISTS country_stats_user_lookup_idx
  ON country_stats (user_id, mode, level);

CREATE INDEX IF NOT EXISTS country_stats_domain_lookup_idx
  ON country_stats (user_id, mode, level, skill_domain);

CREATE INDEX IF NOT EXISTS country_stats_recency_idx
  ON country_stats (user_id, mode, level, last_correct_session)
  WHERE last_correct_session IS NOT NULL;
`;

function backupTableName(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `country_stats_backup_${stamp}`;
}

function isSafeIdent(name) {
  return /^[a-z_][a-z0-9_]*$/i.test(name);
}

export function summarizePlan(plan, backupName = null) {
  return {
    totalRows: plan.totalRows,
    groupCount: plan.groupCount,
    rowsAfter: plan.groupCount,
    mergeCount: plan.mergeCount,
    deleteCount: plan.deleteCount,
    sizeDistribution: plan.sizeDistribution,
    backupTable: backupName,
  };
}

function statements(sql) {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

async function runStatements(run, sql) {
  for (const statement of statements(sql)) {
    await run(statement);
  }
}

async function applyCollapse(run, plan, backupName) {
  let usedBackup = null;
  if (plan.deleteCount > 0) {
    await run(`CREATE TABLE ${backupName} AS TABLE country_stats`);
    usedBackup = backupName;
    for (const group of plan.plans) {
      const m = group.merged;
      await run(
        `UPDATE country_stats SET
           mastery_score = $2,
           first_try_correct = $3,
           second_try_correct = $4,
           needed_reveal = $5,
           incorrect = $6,
           response_time_ms_sum = $7,
           response_time_count = $8,
           fast_streak = $9,
           speed_baseline_ms = $10,
           graduated = $11,
           last_attempt_at = $12,
           last_outcome = $13,
           last_correct_at = $14,
           last_correct_session = $15,
           level = $16,
           updated_at = NOW()
         WHERE id = $1`,
        [
          group.keeperId,
          m.mastery_score,
          m.first_try_correct,
          m.second_try_correct,
          m.needed_reveal,
          m.incorrect,
          m.response_time_ms_sum,
          m.response_time_count,
          m.fast_streak,
          m.speed_baseline_ms,
          m.graduated,
          m.last_attempt_at,
          m.last_outcome,
          m.last_correct_at,
          m.last_correct_session,
          m.level,
        ]
      );
      await run(`DELETE FROM country_stats WHERE id = ANY($1::text[])`, [
        group.deleteIds,
      ]);
    }
  }
  await runStatements(run, NEW_INDEXES_SQL);
  return usedBackup;
}

/**
 * @param {{ dryRun?: boolean, queryFn?: Function, now?: Date }} opts
 */
export async function collapseCountryStatsLevels({
  dryRun = false,
  queryFn = null,
  now = new Date(),
} = {}) {
  const runSelect = queryFn ?? query;
  const result = await runSelect(SELECT_ALL);
  const rows = result.rows ?? [];
  const plan = planCollapse(rows);
  const backupName = backupTableName(now);

  if (dryRun) {
    return { dryRun: true, wrote: false, ...summarizePlan(plan, backupName) };
  }

  if (queryFn) {
    const backupTable = await applyCollapse(queryFn, plan, backupName);
    return {
      dryRun: false,
      wrote: true,
      backupTable,
      ...summarizePlan(plan, backupTable),
    };
  }

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const backupTable = await applyCollapse(
      (text, params) => client.query(text, params),
      plan,
      backupName
    );
    await client.query("COMMIT");
    return {
      dryRun: false,
      wrote: true,
      backupTable,
      ...summarizePlan(plan, backupTable),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rollbackCountryStatsLevels(backupName, queryFn = null) {
  if (!isSafeIdent(backupName)) {
    throw new Error(`Refusing to restore from unsafe table name: ${backupName}`);
  }

  const run = queryFn ?? query;
  const exists = await run(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [backupName]
  );
  if (!exists.rows?.length) {
    throw new Error(`Backup table ${backupName} does not exist.`);
  }

  const apply = async (exec) => {
    await runStatements(exec, OLD_INDEXES_SQL);
    await exec("DELETE FROM country_stats");
    await exec(`INSERT INTO country_stats SELECT * FROM ${backupName}`);
  };

  if (queryFn) {
    await apply(queryFn);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await apply((text, params) => client.query(text, params));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const rollbackIdx = argv.indexOf("--rollback");
  const rollback =
    rollbackIdx >= 0 ? argv[rollbackIdx + 1] ?? null : null;
  return { dryRun, rollback };
}

async function main() {
  if (!pool) {
    console.error("DATABASE_URL is not set. Add it to your .env file first.");
    process.exit(1);
  }

  const { dryRun, rollback } = parseArgs(process.argv.slice(2));
  try {
    if (rollback) {
      await rollbackCountryStatsLevels(rollback);
      console.log(`Restored country_stats from ${rollback} and rebuilt the old indexes.`);
      return;
    }
    const report = await collapseCountryStatsLevels({ dryRun });
    console.log(JSON.stringify(report, null, 2));
    if (dryRun) {
      console.log("Dry-run: no writes. Re-run without --dry-run to apply.");
    }
  } finally {
    await pool.end();
  }
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
