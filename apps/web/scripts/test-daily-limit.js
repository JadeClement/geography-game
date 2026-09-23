/**
 * Free-tier Learn quota, premium status, and local-day helpers.
 *
 * Run: node --import ./scripts/register-alias.mjs --test scripts/test-daily-limit.js
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TIME_ZONE,
  getLocalDateString,
  getSessionsRemaining,
  hasReachedDailyLimit,
  isPremiumActive,
  isValidTimeZone,
  resolveTimeZone,
} from "@/lib/subscription";
import { FREE_DAILY_LEARN_SESSION_LIMIT } from "@worldly/constants";

test("free daily Learn limit is 3", () => {
  assert.equal(FREE_DAILY_LEARN_SESSION_LIMIT, 3);
});

test("hasReachedDailyLimit is false below the cap and true at/above it", () => {
  assert.equal(hasReachedDailyLimit(0, 3), false);
  assert.equal(hasReachedDailyLimit(2, 3), false);
  assert.equal(hasReachedDailyLimit(3, 3), true);
  assert.equal(hasReachedDailyLimit(7, 3), true);
});

test("hasReachedDailyLimit defaults to the free limit and treats junk counts as 0", () => {
  assert.equal(hasReachedDailyLimit(FREE_DAILY_LEARN_SESSION_LIMIT), true);
  assert.equal(hasReachedDailyLimit(undefined), false);
  assert.equal(hasReachedDailyLimit(Number.NaN), false);
});

test("getSessionsRemaining never goes negative", () => {
  assert.equal(getSessionsRemaining(0, 3), 3);
  assert.equal(getSessionsRemaining(2, 3), 1);
  assert.equal(getSessionsRemaining(3, 3), 0);
  assert.equal(getSessionsRemaining(9, 3), 0);
});

test("isPremiumActive accepts active and trialing only", () => {
  const future = new Date("2030-01-01T00:00:00Z");
  const now = new Date("2026-09-23T12:00:00Z");
  assert.equal(isPremiumActive({ subscriptionStatus: "active", currentPeriodEnd: future }, now), true);
  assert.equal(isPremiumActive({ subscriptionStatus: "trialing", currentPeriodEnd: future }, now), true);
  for (const status of ["past_due", "canceled", "incomplete", "unpaid", null, undefined]) {
    assert.equal(
      isPremiumActive({ subscriptionStatus: status, currentPeriodEnd: future }, now),
      false,
      String(status)
    );
  }
});

test("isPremiumActive is false once the current period has ended", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  assert.equal(
    isPremiumActive({ subscriptionStatus: "active", currentPeriodEnd: "2026-09-23T11:59:59Z" }, now),
    false
  );
  assert.equal(
    isPremiumActive({ subscriptionStatus: "active", currentPeriodEnd: now }, now),
    false
  );
});

test("isPremiumActive ignores a missing period end", () => {
  assert.equal(isPremiumActive({ subscriptionStatus: "active", currentPeriodEnd: null }), true);
  assert.equal(isPremiumActive({ subscriptionStatus: "active" }), true);
  assert.equal(isPremiumActive(), false);
});

test("isValidTimeZone accepts IANA zones and rejects junk", () => {
  assert.equal(isValidTimeZone("America/Vancouver"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone(null), false);
  assert.equal(isValidTimeZone(42), false);
});

test("resolveTimeZone falls back to UTC", () => {
  assert.equal(DEFAULT_TIME_ZONE, "UTC");
  assert.equal(resolveTimeZone("Asia/Tokyo"), "Asia/Tokyo");
  assert.equal(resolveTimeZone(null), "UTC");
  assert.equal(resolveTimeZone("Mars/Olympus"), "UTC");
});

test("getLocalDateString formats YYYY-MM-DD in the given zone", () => {
  const instant = new Date("2026-09-23T12:00:00Z");
  assert.equal(getLocalDateString(instant, "UTC"), "2026-09-23");
  assert.match(getLocalDateString(instant, "America/Vancouver"), /^\d{4}-\d{2}-\d{2}$/);
});

test("getLocalDateString uses the local day, not the UTC day", () => {
  // 05:30 UTC is still the previous evening in Vancouver (UTC-7 in September).
  const earlyUtc = new Date("2026-09-23T05:30:00Z");
  assert.equal(getLocalDateString(earlyUtc, "UTC"), "2026-09-23");
  assert.equal(getLocalDateString(earlyUtc, "America/Vancouver"), "2026-09-22");
  // 20:00 UTC is already tomorrow in Tokyo (UTC+9).
  const lateUtc = new Date("2026-09-23T20:00:00Z");
  assert.equal(getLocalDateString(lateUtc, "Asia/Tokyo"), "2026-09-24");
});

test("local midnight rolls the date over for that zone", () => {
  // Vancouver midnight on Sep 24 is 07:00 UTC.
  assert.equal(getLocalDateString(new Date("2026-09-24T06:59:59Z"), "America/Vancouver"), "2026-09-23");
  assert.equal(getLocalDateString(new Date("2026-09-24T07:00:00Z"), "America/Vancouver"), "2026-09-24");
});

test("getLocalDateString falls back to UTC for a missing or invalid zone", () => {
  const earlyUtc = new Date("2026-09-23T05:30:00Z");
  assert.equal(getLocalDateString(earlyUtc, null), "2026-09-23");
  assert.equal(getLocalDateString(earlyUtc, undefined), "2026-09-23");
  assert.equal(getLocalDateString(earlyUtc, "Not/AZone"), "2026-09-23");
});
