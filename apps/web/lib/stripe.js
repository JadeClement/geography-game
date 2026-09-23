import Stripe from "stripe";

// Server-only. Reads STRIPE_SECRET_KEY lazily so builds without Stripe env
// vars still succeed; routes surface a 500 if it's missing at request time.
const globalForStripe = globalThis;

export function getStripe() {
  if (globalForStripe.stripeClient) return globalForStripe.stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  globalForStripe.stripeClient = new Stripe(key);
  return globalForStripe.stripeClient;
}

/**
 * Current period end as a Date. Newer Stripe API versions moved
 * `current_period_end` from the subscription onto each subscription item.
 */
export function getSubscriptionPeriodEnd(subscription) {
  const seconds =
    subscription?.current_period_end ??
    subscription?.items?.data?.[0]?.current_period_end ??
    null;
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}

/** Same-origin relative path only (`/…`, not `//host`), else `/`. */
export function sanitizeReturnPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }
  return path.slice(0, 512);
}
