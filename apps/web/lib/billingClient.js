// Client wrappers for the Learn quota + Stripe billing routes.

export function getClientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function currentReturnPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

/** Today's Learn quota, or `null` when signed out / unavailable. */
export async function fetchLearnQuota() {
  const params = new URLSearchParams();
  const timeZone = getClientTimeZone();
  if (timeZone) params.set("timezone", timeZone);
  const response = await fetch(`/api/learn-sessions/quota?${params}`);
  if (!response.ok) return null;
  return response.json();
}

/** Learn+ subscription summary for Settings, or `null` when unavailable. */
export async function fetchBillingStatus() {
  const response = await fetch("/api/billing/status");
  if (!response.ok) return null;
  return response.json();
}

/**
 * Asks the server to count a new Learn session. Resolves to the server's
 * decision (`{ allowed, cap, sessionsUsedToday, ... }`) or
 * `{ allowed: false, unauthorized: true }` when signed out.
 */
export async function claimLearnSessionStart() {
  const response = await fetch("/api/learn-sessions/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone: getClientTimeZone() }),
  });
  if (response.status === 401) {
    return { allowed: false, unauthorized: true };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Could not start learning session.");
  }
  return data;
}

async function redirectToBillingUrl(endpoint, fallbackError) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnPath: currentReturnPath() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url) {
    throw new Error(data.error || fallbackError);
  }
  window.location.href = data.url;
}

/** Redirects to Stripe Checkout for the Learn subscription. */
export function startCheckout() {
  return redirectToBillingUrl("/api/billing/checkout", "Could not start checkout.");
}

/** Redirects to the Stripe Billing Portal. */
export function openBillingPortal() {
  return redirectToBillingUrl("/api/billing/portal", "Could not open billing portal.");
}
