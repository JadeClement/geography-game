import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("worldly.db");
  }
  return dbPromise;
}

export async function initialize() {
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cached_countries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capital TEXT,
      region TEXT,
      population INTEGER,
      area REAL,
      neighbors TEXT,
      languages TEXT,
      flag_url TEXT,
      facts TEXT,
      cached_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_answers (
      id TEXT PRIMARY KEY,
      country_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      level TEXT NOT NULL,
      outcome TEXT NOT NULL,
      response_time_ms INTEGER,
      game_type TEXT NOT NULL,
      learn_mode_multiplier REAL,
      timestamp INTEGER NOT NULL,
      synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS today_session_cache (
      session_id TEXT PRIMARY KEY,
      question_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS facts_seen (
      country_id TEXT NOT NULL,
      fact_index INTEGER NOT NULL,
      seen_at INTEGER NOT NULL,
      PRIMARY KEY (country_id, fact_index)
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export async function getMeta(key: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = ?`,
    [key]
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function cacheCountriesFromJSON(countries: any[]) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const c of countries) {
      if (!c.enabled) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO cached_countries
         (id, name, capital, region, population, area, neighbors, languages, flag_url, facts, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.iso3,
          c.name,
          c.capital ?? null,
          c.region ?? "world",
          c.population ?? null,
          c.area ?? null,
          JSON.stringify(c.neighbors ?? []),
          JSON.stringify(c.languages ?? []),
          null,
          JSON.stringify(c.facts ?? []),
          now,
        ]
      );
    }
  });
  await setMeta("countries_cached_at", String(now));
}

export async function getCountriesFromCache() {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(`SELECT * FROM cached_countries`);
  return rows.map((r) => ({
    id: r.id,
    iso3: r.id,
    name: r.name,
    capital: r.capital,
    region: r.region,
    population: r.population,
    area: r.area,
    neighbors: JSON.parse(r.neighbors || "[]"),
    languages: JSON.parse(r.languages || "[]"),
    facts: JSON.parse(r.facts || "[]"),
  }));
}

export async function recordPendingAnswer(answer: {
  id: string;
  countryId: string;
  mode: string;
  level: string;
  outcome: string;
  responseTimeMs?: number | null;
  gameType: string;
  learnModeMultiplier?: number | null;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO pending_answers
     (id, country_id, mode, level, outcome, response_time_ms, game_type, learn_mode_multiplier, timestamp, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      answer.id,
      answer.countryId,
      answer.mode,
      answer.level,
      answer.outcome,
      answer.responseTimeMs ?? null,
      answer.gameType,
      answer.learnModeMultiplier ?? null,
      Date.now(),
    ]
  );
}

export async function getPendingAnswers() {
  const db = await getDb();
  return db.getAllAsync<any>(
    `SELECT * FROM pending_answers WHERE synced = 0 ORDER BY timestamp ASC`
  );
}

export async function markAnswerSynced(id: string) {
  const db = await getDb();
  await db.runAsync(`UPDATE pending_answers SET synced = 1 WHERE id = ?`, [id]);
}

export async function cacheTodaySession(session: {
  sessionId: string;
  questionData: unknown;
}) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO today_session_cache (session_id, question_data, created_at, completed)
     VALUES (?, ?, ?, 0)`,
    [session.sessionId, JSON.stringify(session.questionData), Date.now()]
  );
}

export async function getTodaySession() {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM today_session_cache ORDER BY created_at DESC LIMIT 1`
  );
  if (!row) return null;
  return {
    sessionId: row.session_id,
    questionData: JSON.parse(row.question_data),
    createdAt: row.created_at,
    completed: Boolean(row.completed),
  };
}

export async function markFactSeen(countryId: string, factIndex: number) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO facts_seen (country_id, fact_index, seen_at) VALUES (?, ?, ?)`,
    [countryId, factIndex, Date.now()]
  );
}

export async function getSeenFactsForCountry(countryId: string) {
  const db = await getDb();
  const rows = await db.getAllAsync<{ fact_index: number }>(
    `SELECT fact_index FROM facts_seen WHERE country_id = ?`,
    [countryId]
  );
  return rows.map((r) => r.fact_index);
}

export async function clearLocalUserData() {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM pending_answers;
    DELETE FROM today_session_cache;
    DELETE FROM facts_seen;
  `);
}

export { Platform };
