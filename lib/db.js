import { randomUUID } from "crypto";
import pg from "pg";
import { computeMasteryUpdate } from "./mastery.js";

const { Pool } = pg;

const globalForDb = globalThis;

function createPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_URL.includes("localhost") ||
      process.env.DATABASE_URL.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
  });
}

export const pool = globalForDb.dbPool ?? createPool();

if (process.env.NODE_ENV !== "production" && pool) {
  globalForDb.dbPool = pool;
}

export async function query(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return pool.query(text, params);
}

export async function getUserByEmail(email) {
  const result = await query(
    "SELECT id, name, email, password FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0] ?? null;
}

export async function createUser({ id, name, email, password }) {
  const result = await query(
    `INSERT INTO users (id, name, email, password)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email`,
    [id, name, email, password]
  );
  return result.rows[0];
}

export async function getScoresForUser(userId) {
  const result = await query(
    `SELECT id, mode, region, level, score, updated_at AS "updatedAt", created_at AS "createdAt"
     FROM game_scores
     WHERE user_id = $1
     ORDER BY mode, region, level`,
    [userId]
  );
  return result.rows;
}

export async function getScoreForGame(userId, mode, region, level) {
  const result = await query(
    `SELECT id, score FROM game_scores
     WHERE user_id = $1 AND mode = $2 AND region = $3 AND level = $4`,
    [userId, mode, region, level]
  );
  return result.rows[0] ?? null;
}

export async function upsertScore({ id, userId, mode, region, level, score }) {
  const result = await query(
    `INSERT INTO game_scores (id, user_id, mode, region, level, score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, mode, region, level)
     DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()
     RETURNING id, mode, region, level, score, updated_at AS "updatedAt"`,
    [id, userId, mode, region, level, score]
  );
  return result.rows[0];
}


export async function recordPracticeSession(userId) {
  const result = await query(
    `INSERT INTO practice_sessions (id, user_id, practiced_at)
     VALUES ($1, $2, CURRENT_DATE)
     ON CONFLICT (user_id, practiced_at) DO NOTHING`,
    [randomUUID(), userId]
  );
  return { recorded: result.rowCount > 0 };
}

export async function getStreakForUser(userId) {
  // Gaps-and-islands: each consecutive run of days collapses to a single
  // group because (practiced_at - row_number) stays constant within a run.
  const result = await query(
    `WITH days AS (
       SELECT DISTINCT practiced_at
       FROM practice_sessions
       WHERE user_id = $1
     ),
     grouped AS (
       SELECT
         practiced_at,
         practiced_at - (ROW_NUMBER() OVER (ORDER BY practiced_at))::int AS grp
       FROM days
     ),
     runs AS (
       SELECT
         COUNT(*)::int AS length,
         MAX(practiced_at) AS end_date
       FROM grouped
       GROUP BY grp
     )
     SELECT
       COALESCE(MAX(length), 0) AS "longestStreak",
       COALESCE(
         MAX(length) FILTER (WHERE end_date >= CURRENT_DATE - 1),
         0
       ) AS "currentStreak"
     FROM runs`,
    [userId]
  );

  const row = result.rows[0] ?? { currentStreak: 0, longestStreak: 0 };
  return {
    currentStreak: Number(row.currentStreak) || 0,
    longestStreak: Number(row.longestStreak) || 0,
  };
}

const OUTCOME_COLUMNS = new Set([
  "first_try_correct",
  "second_try_correct",
  "needed_reveal",
]);

const STAT_RETURNING = `
  country_id AS "countryId",
  mode,
  level,
  first_try_correct AS "firstTryCorrect",
  second_try_correct AS "secondTryCorrect",
  needed_reveal AS "neededReveal",
  response_time_ms_sum AS "responseTimeMsSum",
  response_time_count AS "responseTimeCount",
  mastery_score AS "masteryScore",
  fast_streak AS "fastStreak",
  speed_baseline_ms AS "speedBaselineMs",
  graduated,
  last_attempt_at AS "lastAttemptAt"
`;

export async function getCountryStatsForUser(userId, { mode, level } = {}) {
  const conditions = ["user_id = $1"];
  const params = [userId];

  if (mode) {
    params.push(mode);
    conditions.push(`mode = $${params.length}`);
  }
  if (level != null) {
    params.push(level);
    conditions.push(`level = $${params.length}`);
  }

  const result = await query(
    `SELECT ${STAT_RETURNING}
     FROM country_stats
     WHERE ${conditions.join(" AND ")}`,
    params
  );
  return result.rows;
}

export async function recordCountryPerformance({
  statId,
  attemptId,
  userId,
  countryId,
  mode,
  level,
  gameType,
  outcome,
  responseTimeMs = null,
}) {
  // Whitelist the outcome before using it as a column name, since it is
  // interpolated into the SQL below rather than passed as a bound parameter.
  if (!OUTCOME_COLUMNS.has(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}`);
  }
  const column = outcome;

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();
  const trackResponseTime = responseTimeMs != null && outcome !== "needed_reveal";

  try {
    await client.query("BEGIN");

    const existingResult = await client.query(
      `SELECT country_id AS "countryId",
              first_try_correct AS "firstTryCorrect",
              second_try_correct AS "secondTryCorrect",
              needed_reveal AS "neededReveal",
              response_time_ms_sum AS "responseTimeMsSum",
              response_time_count AS "responseTimeCount",
              mastery_score AS "masteryScore",
              fast_streak AS "fastStreak",
              speed_baseline_ms AS "speedBaselineMs",
              graduated
       FROM country_stats
       WHERE user_id = $1 AND country_id = $2 AND mode = $3 AND level = $4
       FOR UPDATE`,
      [userId, countryId, mode, level]
    );

    const existing = existingResult.rows[0] ?? null;
    const masteryFields = computeMasteryUpdate(existing, {
      outcome,
      responseTimeMs: trackResponseTime ? responseTimeMs : null,
      gameType,
    });

    await client.query(
      `INSERT INTO country_attempts (
         id, user_id, country_id, mode, level, game_type, outcome, response_time_ms
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        attemptId,
        userId,
        countryId,
        mode,
        level,
        gameType,
        outcome,
        trackResponseTime ? responseTimeMs : null,
      ]
    );

    const params = [
      statId,
      userId,
      countryId,
      mode,
      level,
      masteryFields.masteryScore,
      masteryFields.fastStreak,
      masteryFields.speedBaselineMs,
      masteryFields.graduated,
    ];

    let responseTimeSumValue = "0";
    let responseTimeCountValue = "0";
    let responseTimeUpdate = "";

    if (trackResponseTime) {
      params.push(responseTimeMs);
      responseTimeSumValue = `$${params.length}`;
      responseTimeCountValue = "1";
      responseTimeUpdate = `,
        response_time_ms_sum = country_stats.response_time_ms_sum + $${params.length},
        response_time_count = country_stats.response_time_count + 1`;
    }

    const result = await client.query(
      `INSERT INTO country_stats (
         id, user_id, country_id, mode, level,
         ${column},
         response_time_ms_sum,
         response_time_count,
         mastery_score,
         fast_streak,
         speed_baseline_ms,
         graduated,
         last_attempt_at
       )
       VALUES (
         $1, $2, $3, $4, $5,
         1,
         ${responseTimeSumValue},
         ${responseTimeCountValue},
         $6, $7, $8, $9, NOW()
       )
       ON CONFLICT (user_id, country_id, mode, level)
       DO UPDATE SET
         ${column} = country_stats.${column} + 1
         ${responseTimeUpdate},
         mastery_score = $6,
         fast_streak = $7,
         speed_baseline_ms = $8,
         graduated = $9,
         last_attempt_at = NOW(),
         updated_at = NOW()
       RETURNING ${STAT_RETURNING}`,
      params
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
