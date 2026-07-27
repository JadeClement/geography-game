// Lightweight, production-safe debug logging.
//
// Enable it by visiting any page with `?debug=1` (the flag is persisted to
// localStorage so it survives client-side navigation), or by running
// `localStorage.setItem("worldlyDebug", "1")` in the console. Disable with
// `localStorage.removeItem("worldlyDebug")`.
//
// This exists to diagnose the "starting a Learn game bounces me to the home
// screen" bug in production. Remove the call sites once the root cause is found.

let cachedEnabled = null;

export function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  if (cachedEnabled !== null) return cachedEnabled;

  let enabled = false;
  try {
    if (window.__WORLDLY_DEBUG === true) enabled = true;
    if (!enabled && window.localStorage.getItem("worldlyDebug") === "1") {
      enabled = true;
    }
    if (!enabled) {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("debug") === "1") {
        enabled = true;
        // Make it sticky so it survives the router.push to `/?play=1`.
        try {
          window.localStorage.setItem("worldlyDebug", "1");
        } catch {}
      }
    }
  } catch {}

  cachedEnabled = enabled;
  return enabled;
}

function stamp() {
  // High-resolution-ish timestamp to order events across renders/effects.
  const t = typeof performance !== "undefined" ? performance.now() : Date.now();
  return `+${t.toFixed(1)}ms`;
}

export function dbg(...args) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log("%c[worldly]", "color:#22d3ee;font-weight:bold", stamp(), ...args);
}

export function dbgTrace(label, extra) {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed("%c[worldly] TRACE", "color:#f59e0b;font-weight:bold", stamp(), label, extra ?? "");
  // eslint-disable-next-line no-console
  console.trace();
  // eslint-disable-next-line no-console
  console.groupEnd();
}
