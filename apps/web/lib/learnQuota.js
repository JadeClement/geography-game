import { FREE_DAILY_LEARN_SESSION_LIMIT } from "@worldly/constants";
import { getUserBillingState, setUserTimezone } from "@/lib/db";
import { getLocalDateString, isPremiumActive, isValidTimeZone } from "@/lib/subscription";

/**
 * Server-side: refresh the user's stored timezone (when the client sent a valid
 * one) and resolve their billing state + today's local date.
 *
 * Trust boundary: the timezone is client-reported, so a user could spoof it to
 * shift their local day and get extra free sessions. Accepted tradeoff for a
 * soft usage cap on a solo app — deliberately no geo-IP or heavier checks.
 */
export async function loadLearnQuotaContext(userId, reportedTimeZone, now = new Date()) {
  if (isValidTimeZone(reportedTimeZone)) {
    await setUserTimezone(userId, reportedTimeZone);
  }
  const billing = await getUserBillingState(userId);
  const timeZone = isValidTimeZone(reportedTimeZone)
    ? reportedTimeZone
    : billing?.timezone ?? null; // getLocalDateString falls back to UTC
  const isPremium = isPremiumActive(
    {
      subscriptionStatus: billing?.subscriptionStatus ?? null,
      currentPeriodEnd: billing?.subscriptionCurrentPeriodEnd ?? null,
    },
    now
  );
  return {
    billing,
    isPremium,
    localDate: getLocalDateString(now, timeZone),
    cap: FREE_DAILY_LEARN_SESSION_LIMIT,
  };
}
