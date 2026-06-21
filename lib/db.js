import pg from "pg";

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

export async function getCountryStatsForUser(userId, { mode, level }) {
  const result = await query(
    `SELECT country_id AS "countryId",
            mode,
            level,
            first_try_correct AS "firstTryCorrect",
            second_try_correct AS "secondTryCorrect",
            needed_reveal AS "neededReveal",
            response_time_ms_sum AS "responseTimeMsSum",
            response_time_count AS "responseTimeCount"
     FROM country_stats
     WHERE user_id = $1 AND mode = $2 AND level = $3`,
    [userId, mode, level]
  );
  return result.rows;
}

export async function incrementCountryStat({
  id,
  userId,
  countryId,
  mode,
  level,
  outcome,
  responseTimeMs = null,
}) {
  const columnMap = {
    first_try_correct: "first_try_correct",
    second_try_correct: "second_try_correct",
    needed_reveal: "needed_reveal",
  };

  const column = columnMap[outcome];
  if (!column) {
    throw new Error("Invalid outcome.");
  }

  const trackResponseTime = responseTimeMs != null && outcome !== "needed_reveal";
  const responseTimeClause = trackResponseTime
    ? `, response_time_ms_sum = country_stats.response_time_ms_sum + $6
       , response_time_count = country_stats.response_time_count + 1`
    : "";

  const params = [id, userId, countryId, mode, level];
  if (trackResponseTime) {
    params.push(responseTimeMs);
  }

  const result = await query(
    `INSERT INTO country_stats (
       id, user_id, country_id, mode, level,
       ${column},
       response_time_ms_sum,
       response_time_count
     )
     VALUES (
       $1, $2, $3, $4, $5,
       1,
       ${trackResponseTime ? "$6" : "0"},
       ${trackResponseTime ? "1" : "0"}
     )
     ON CONFLICT (user_id, country_id, mode, level)
     DO UPDATE SET
       ${column} = country_stats.${column} + 1
       ${responseTimeClause}
       , updated_at = NOW()
     RETURNING country_id AS "countryId",
               first_try_correct AS "firstTryCorrect",
               second_try_correct AS "secondTryCorrect",
               needed_reveal AS "neededReveal",
               response_time_ms_sum AS "responseTimeMsSum",
               response_time_count AS "responseTimeCount"`,
    params
  );

  return result.rows[0];
}
