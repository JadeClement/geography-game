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
  level INT NOT NULL DEFAULT 1,
  score INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, mode, region, level)
);

CREATE INDEX IF NOT EXISTS game_scores_user_id_idx ON game_scores (user_id);
`;

async function main() {
  if (!pool) {
    console.error("DATABASE_URL is not set. Add it to your .env file first.");
    process.exit(1);
  }

  await query(SCHEMA);
  console.log("Database tables are ready.");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
