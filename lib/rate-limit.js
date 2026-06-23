import { randomUUID } from "crypto";
import { query } from "./db.js";

export async function countRateLimitEvents(key, windowMs) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM rate_limit_events
     WHERE key = $1 AND created_at > NOW() - ($2 * INTERVAL '1 millisecond')`,
    [key, windowMs]
  );
  return result.rows[0]?.count ?? 0;
}

export async function getLatestRateLimitEvent(key) {
  const result = await query(
    `SELECT created_at AS "createdAt"
     FROM rate_limit_events
     WHERE key = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [key]
  );
  return result.rows[0] ?? null;
}

export async function recordRateLimitEvent(key) {
  await query(
    `INSERT INTO rate_limit_events (id, key) VALUES ($1, $2)`,
    [randomUUID(), key]
  );
}

export async function isRateLimited(key, { max, windowMs }) {
  const count = await countRateLimitEvents(key, windowMs);
  return count >= max;
}

export async function secondsUntilRateLimitAllowed(key, minIntervalMs) {
  const latest = await getLatestRateLimitEvent(key);
  if (!latest) return 0;
  const elapsed = Date.now() - new Date(latest.createdAt).getTime();
  const remaining = minIntervalMs - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
