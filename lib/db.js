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
