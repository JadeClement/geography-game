import { pool, query } from "../lib/db.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  region TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'F1',
  score INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mode, region, level)
);

CREATE INDEX IF NOT EXISTS game_scores_user_id_idx ON game_scores (user_id);

CREATE TABLE IF NOT EXISTS country_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  level TEXT NOT NULL,
  first_try_correct INT NOT NULL DEFAULT 0,
  second_try_correct INT NOT NULL DEFAULT 0,
  needed_reveal INT NOT NULL DEFAULT 0,
  response_time_ms_sum BIGINT NOT NULL DEFAULT 0,
  response_time_count INT NOT NULL DEFAULT 0,
  mastery_score REAL NOT NULL DEFAULT 0,
  fast_streak INT NOT NULL DEFAULT 0,
  speed_baseline_ms INT,
  graduated BOOLEAN NOT NULL DEFAULT false,
  last_attempt_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, country_id, mode, level)
);

CREATE INDEX IF NOT EXISTS country_stats_user_lookup_idx
  ON country_stats (user_id, mode, level);

CREATE TABLE IF NOT EXISTS country_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  level TEXT NOT NULL,
  game_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  response_time_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS country_attempts_user_lookup_idx
  ON country_attempts (user_id, country_id, mode, level, created_at DESC);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practiced_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, practiced_at)
);

CREATE INDEX IF NOT EXISTS practice_sessions_user_lookup_idx
  ON practice_sessions (user_id, practiced_at DESC);
`;

const MIGRATIONS = `
ALTER TABLE country_stats ADD COLUMN IF NOT EXISTS mastery_score REAL NOT NULL DEFAULT 0;
ALTER TABLE country_stats ADD COLUMN IF NOT EXISTS fast_streak INT NOT NULL DEFAULT 0;
ALTER TABLE country_stats ADD COLUMN IF NOT EXISTS speed_baseline_ms INT;
ALTER TABLE country_stats ADD COLUMN IF NOT EXISTS graduated BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE country_stats ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
`;

// Convert numeric levels (1-4) to section codes. Idempotent: already-converted
// codes fall through the CASE unchanged via level::text.
const LEVEL_CASE = `CASE level::text
  WHEN '1' THEN 'F1'
  WHEN '2' THEN 'F2'
  WHEN '3' THEN 'N1'
  WHEN '4' THEN 'N2'
  ELSE level::text
END`;

const LEVEL_MIGRATIONS = `
ALTER TABLE game_scores ALTER COLUMN level DROP DEFAULT;
ALTER TABLE game_scores ALTER COLUMN level TYPE TEXT USING (${LEVEL_CASE});
ALTER TABLE game_scores ALTER COLUMN level SET DEFAULT 'F1';
ALTER TABLE country_stats ALTER COLUMN level TYPE TEXT USING (${LEVEL_CASE});
ALTER TABLE country_attempts ALTER COLUMN level TYPE TEXT USING (${LEVEL_CASE});
`;

async function main() {
  if (!pool) {
    console.error("DATABASE_URL is not set. Add it to your .env file first.");
    process.exit(1);
  }

  await query(SCHEMA);
  await query(MIGRATIONS);
  await query(LEVEL_MIGRATIONS);
  console.log("Database tables are ready.");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
