/**
 * Free-tier Learn quota + subscription status helpers.
 *
 * Pure functions only (no DB/HTTP) so they can be unit-tested directly.
 * The server (`POST /api/learn-sessions/start`) is the only caller that
 * decides allowed / not-allowed; the client never evaluates these itself.
 */
import {
  FREE_DAILY_LEARN_SESSION_LIMIT,
  PREMIUM_SUBSCRIPTION_STATUSES,
} from "@worldly/constants";

export const DEFAULT_TIME_ZONE = "UTC";

/**
 * True when `timeZone` is an IANA zone the runtime's Intl understands.
 * @param {unknown} timeZone
 */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** A valid IANA zone, or `DEFAULT_TIME_ZONE` when missing/invalid. */
export function resolveTimeZone(timeZone) {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/**
 * The calendar date (`YYYY-MM-DD`) that `date` falls on in `timeZone`.
 * Falls back to UTC for a missing/invalid zone.
 *
 * Trust boundary: the zone is client-reported (`Intl...resolvedOptions().timeZone`),
 * so a user could spoof it to shift their "day" and squeeze out extra free
 * sessions. That is an accepted tradeoff for a soft usage cap — do not add
 * geo-IP or similar to compensate.
 *
 * @param {Date} date
 * @param {string | null | undefined} timeZone
 */
export function getLocalDateString(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // en-CA formats as YYYY-MM-DD
}

/**
 * @param {number} sessionCount sessions already started today
 * @param {number} [limit]
 */
export function hasReachedDailyLimit(sessionCount, limit = FREE_DAILY_LEARN_SESSION_LIMIT) {
  const used = Number.isFinite(sessionCount) ? sessionCount : 0;
  return used >= limit;
}

/** Free sessions left today, never negative. */
export function getSessionsRemaining(sessionCount, limit = FREE_DAILY_LEARN_SESSION_LIMIT) {
  const used = Number.isFinite(sessionCount) ? sessionCount : 0;
  return Math.max(0, limit - used);
}

/**
 * True while the subscription is `active` or `trialing` and its current period
 * (when known) hasn't ended.
 *
 * @param {{ subscriptionStatus?: string | null, currentPeriodEnd?: Date | string | number | null }} subscription
 * @param {Date} [now]
 */
export function isPremiumActive({ subscriptionStatus, currentPeriodEnd } = {}, now = new Date()) {
  if (!PREMIUM_SUBSCRIPTION_STATUSES.includes(subscriptionStatus)) return false;
  if (currentPeriodEnd == null) return true;
  const end = new Date(currentPeriodEnd).getTime();
  if (Number.isNaN(end)) return true;
  return end > now.getTime();
}
