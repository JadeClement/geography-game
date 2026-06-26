# AUDIT.md — Geography Game Codebase Audit

Audited: 2026-06-25. Read-only review — no code was changed.

---

## Security

### S1 · Host-header injection in password-reset and verification email URLs
**Files:** `lib/auth-url.js`
**Issue:** `getAppBaseUrl` derives the reset/verify URL base from the `x-forwarded-host` and `x-forwarded-proto` request headers. If the proxy layer does not strip or lock these headers, a malicious client can forge them so the reset link in the victim's email points at an attacker-controlled domain — the token arrives in their inbox pointing at `https://evil.example/reset-password?token=...`.
**Fix:** Add `AUTH_URL` to required env vars and document it. In `getAppBaseUrl`, use `AUTH_URL` unconditionally in production and only fall back to header-derived logic in development. Log a warning if `AUTH_URL` is absent in production.
**Risk:** Needs human judgment/testing · **Size:** Small

---

### S2 · Email enumeration via registration endpoint
**Files:** `app/api/auth/register/route.js`
**Issue:** A `409 Conflict` response with `"An account with this email already exists."` leaks that an email is registered. Combined with no rate limiting (see S3), an attacker can trivially enumerate your user base.
**Fix:** Return the same generic response regardless of whether the account exists, matching the pattern already used in `forgot-password/route.js` with its `SUCCESS_MESSAGE` constant. Perform the bcrypt hash regardless of result to prevent timing-based enumeration too.
**Risk:** Needs human judgment/testing · **Size:** Small

---

### S3 · Registration endpoint has no rate limiting
**Files:** `app/api/auth/register/route.js`
**Issue:** No rate limiting on account creation. An attacker can spam registrations to fill the `users` table or automate email enumeration (see S2).
**Fix:** Use the existing `isRateLimited` helper from `lib/rate-limit.js` with the same `{ max: 5, windowMs: 15 * 60 * 1000 }` pattern already used in `forgot-password/route.js`. Check it before the `getUserByEmail` lookup.
**Risk:** Needs human judgment/testing · **Size:** Small

---

### S4 · Unsanitized user `name` interpolated into HTML email templates
**Files:** `lib/email.js` (lines around `Hi ${name},`)
**Issue:** The user's registration name is interpolated directly into HTML email templates without HTML-entity escaping. A name like `<script>alert(1)</script>` is sent as raw HTML to the recipient's email client, enabling stored XSS via email.
**Fix:** Add a small `escapeHtml` helper and use it on `name` before interpolation:
```js
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
```
**Risk:** Safe for autonomous agent · **Size:** Small

---

### S5 · `rejectUnauthorized: false` disables TLS certificate verification for all non-localhost DB connections
**Files:** `lib/db.js` lines 18–23
**Issue:** Every non-localhost database connection (Railway, Vercel, etc.) skips certificate verification, making it vulnerable to MITM attacks.
**Fix:** Remove the `ssl` override — Railway and Vercel Postgres use well-known CAs that Node trusts by default. If a self-signed cert is required, provide the CA certificate via env var rather than disabling verification wholesale.
**Risk:** Needs human judgment/testing · **Size:** Small

---

### S6 · Score POST accepts arbitrary strings for `mode` and `region`
**Files:** `app/api/scores/route.js`
**Issue:** `level` is validated via `isValidLevel` but `mode` and `region` accept any string. Parameterized queries prevent SQL injection, but junk values land in the `game_scores` table unchecked.
**Fix:** Import `GAME_MODES` and `REGIONS` and add allowlist checks alongside the existing `level` validation. Return 400 for unknown values.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### S7 · `country-stats` POST does not validate `mode` or `countryId`
**Files:** `app/api/country-stats/route.js`
**Issue:** Same pattern as S6 — any authenticated user can write stats for fabricated country IDs or mode strings.
**Fix:** Validate `mode` against `GAME_MODES`, and validate `countryId` against the set of enabled ISO3 codes from `data/countries.json`. Return 400 for unknown values.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### S8 · No upper bound on `score` value in scores POST
**Files:** `app/api/scores/route.js`
**Issue:** `score >= 0` is the only check. A user can submit `score: 9999999`, inflating their leaderboard entry arbitrarily.
**Fix:** Cap at a reasonable max (e.g. 260, safely above the 196-country world mode). Add `Number.isInteger(score)` to catch floats.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### S9 · `rate_limit_events` table grows unboundedly — no pruning
**Files:** `lib/rate-limit.js`, `scripts/setup-db.js`
**Issue:** Every forgot-password and resend-verification request appends a row. There is no DELETE, TTL, or cleanup. Over time this makes rate-limit queries slower and storage grows forever.
**Fix:** At the start of each `isRateLimited` check, add: `DELETE FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '24 hours'`. Alternatively, schedule this as a cron job.
**Risk:** Needs human judgment/testing · **Size:** Medium

---

## Bugs

### B1 · `answerInput` state variable shadows the `answerInput` CSS class import
**Files:** `components/GeographyGame.jsx`
**Issue:** `answerInput` is imported as a CSS class string from `@/lib/ui`, then immediately shadowed by `const [answerInput, setAnswerInput] = useState("")`. Wherever `className={answerInput}` is used below the state declaration, it receives `""` (the empty state value) instead of the CSS class string — the text input loses its styles.
**Fix:** Rename the state variable to `answerText` / `setAnswerText` and update all references. The CSS import `answerInput` is the correct value for the className.
**Risk:** Safe for autonomous agent · **Size:** Medium

---

### B2 · `spellingSuggestion` state variable shadows the `spellingSuggestion` CSS class import
**Files:** `components/GeographyGame.jsx`
**Issue:** Same pattern as B1. `spellingSuggestion` is imported as a CSS class string from `@/lib/ui`, then shadowed by `const [spellingSuggestion, setSpellingSuggestion] = useState(null)`. The paragraph element that displays the spelling hint renders `null` or the suggestion text string as its `className` instead of the CSS class string.
**Fix:** Rename the state to `spellingSuggestionText` / `setSpellingSuggestionText` and update all references.
**Risk:** Safe for autonomous agent · **Size:** Medium

---

### B3 · `pendingStatPromisesRef` grows unboundedly across a session
**Files:** `components/GeographyGame.jsx`
**Issue:** `pendingStatPromisesRef.current.push(promise)` is called every round but the array is never pruned after `Promise.allSettled` resolves at game end. It is only reset when a new game starts. A 196-country World Test accumulates 196 settled promises in memory until the next game.
**Fix:** After `Promise.allSettled(pending)` resolves, clear `pendingStatPromisesRef.current = []`.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### B4 · `handleSessionStart` for Learning mode fails silently with no user feedback
**Files:** `components/GeographyGame.jsx`
**Issue:** If `buildLearningCountries` returns `null` (API error or zero weak countries), `handleSessionStart` does `if (!learning) return` with no error message. The user clicks "Start" and nothing happens — no feedback.
**Fix:** After `if (!learning) return`, display a user-visible error. Distinguish between "no eligible countries" (tell them to play test mode first) vs a thrown API error (generic retry message).
**Risk:** Safe for autonomous agent · **Size:** Small

---

### B5 · `buildWorldTestCountries` mastery API failure is silent to the user
**Files:** `components/GeographyGame.jsx`
**Issue:** If `fetchMasteryStats` throws, the catch logs to console and silently falls back to the full unweighted world pool. The user starts a longer-than-expected game with no explanation.
**Fix:** Set a transient error state (e.g. `masteryLoadError`) and show a brief message before/during the game: "Couldn't load mastery data — playing the full World Test."
**Risk:** Needs human judgment/testing · **Size:** Small

---

## Error Handling

### E1 · `loadCountriesGeoJSON` has no timeout — app hangs if static assets are slow
**Files:** `lib/countries.js`
**Issue:** The GeoJSON fetch has no `AbortController` / timeout. If the static asset server hangs, the app stays on the loading spinner indefinitely.
**Fix:** Add `signal: AbortSignal.timeout(10000)` to the fetch options and catch the resulting `AbortError` to surface a timeout-specific error via the existing `setLoadError` path.
**Risk:** Safe for autonomous agent · **Size:** Small

---

## Performance

### P1 · Pronunciation audio cache is an unbounded module-level `Map`
**Files:** `lib/pronunciation.js`
**Issue:** `pronunciationCache` is a module singleton that adds `Audio` objects but never evicts them. For 196 countries × multiple voices × multiple types, this can hold hundreds of `Audio` instances permanently, retaining underlying buffers on low-memory mobile devices.
**Fix:** Either remove the in-memory cache (the browser's HTTP cache handles the actual audio buffer), or cap the `Map` at ~50 entries with a simple LRU eviction.
**Risk:** Needs human judgment/testing · **Size:** Small

---

### P2 · `filledCountryIds.includes()` is O(n) on every click in Discover mode
**Files:** `lib/hooks/useGameBoard.js`, `components/GeographyGame.jsx`
**Issue:** `!filledCountryIds.includes(clicked.id)` performs a linear scan on every country click. By the end of a 196-country Discover session this is a 196-element scan per click.
**Fix:** Derive a `Set` via `useMemo(() => new Set(filledCountryIds), [filledCountryIds])` and use `.has()` for O(1) lookups.
**Risk:** Safe for autonomous agent · **Size:** Small

---

## Accessibility

### A1 · Flag images use `alt=""` when they are the game prompt — screen readers get nothing
**Files:** `components/FlagPrompt.jsx`
**Issue:** `alt=""` is correct for decorative images, but in Flags mode the flag is the entire game prompt. A screen reader user gets no information about what country they are being asked to identify.
**Fix:** Accept an `alt` prop in `FlagPrompt`. When the flag is the prompt (pre-reveal), use `alt="Flag — identify this country"`. After correct answer or in reveal mode, use `alt={countryName}`. Keep `alt=""` in the reference panel where it is decorative.
**Risk:** Needs human judgment/testing · **Size:** Medium

---

### A2 · Map feedback messages are not announced to screen readers
**Files:** `components/MapFeedback.jsx`
**Issue:** "Correct!", "Try again.", "Oops!" appear visually but have no `aria-live` region. The mobile header feedback has `role="status" aria-live="polite"` but the desktop map overlay does not.
**Fix:** Add `role="status" aria-live="polite"` to the feedback container in `MapFeedback`. Use `aria-live="assertive"` for the reveal/incorrect message.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### A3 · Modals do not trap focus — keyboard users tab behind the overlay
**Files:** `components/GeographyGame.jsx` (game modals), `components/AuthModal.jsx`
**Issue:** Modals use `role="dialog" aria-modal="true"` but do not programmatically trap focus. A keyboard user tabbing through the page will cycle into elements behind the overlay.
**Fix:** Add a `useFocusTrap` hook that captures `Tab`/`Shift+Tab` and constrains focus to the focusable children of the dialog. Apply to all dialog components.
**Risk:** Needs human judgment/testing · **Size:** Medium

---

### A4 · Sound toggle button does not convey muted state to assistive technology
**Files:** `components/SoundVolumeButton.jsx`
**Issue:** The mute/unmute state is visual-only. Screen reader users cannot confirm whether sounds are muted without pressing the button and listening for a result.
**Fix:** Add `aria-pressed={isMuted}` to the button element, and update `aria-label` dynamically: `"Mute sounds"` when unmuted, `"Unmute sounds"` when muted.
**Risk:** Safe for autonomous agent · **Size:** Small

---

## Dead Code / Tech Debt

### D1 · `getCountryPronunciationUrl` is deprecated but still exported — no internal callers remain
**Files:** `lib/pronunciation.js`
**Issue:** The export carries a `@deprecated` JSDoc comment. No file in the project imports it.
**Fix:** Remove the export entirely.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### D2 · Deprecated constants still exported from `lib/globeProjection.js`
**Files:** `lib/globeProjection.js`
**Issue:** Two constants are marked `@deprecated` with no internal callers.
**Fix:** Confirm with grep (`grep -r "globeProjection" --include="*.js" --include="*.jsx" .`) then remove them.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### D3 · Bulk state setters in `useGameBoard` are exported but never used
**Files:** `lib/hooks/useGameBoard.js`
**Issue:** `setWrongCountryIds`, `setRoundWrongCountryIds`, and `setFilledCountryIds` are returned from the hook but `GeographyGame` only uses the `add*` and `clear*` variants.
**Fix:** Remove the three bulk setters from the hook's return value and their `useCallback` definitions.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### D4 · `remaining` callback in `useCountryQueue` is exported but never used
**Files:** `lib/hooks/useCountryQueue.js`
**Issue:** The `remaining` callback is returned from the hook but never destructured or called by `GeographyGame`.
**Fix:** Remove it from the hook's return value.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### D5 · `beginSession` in `GeographyGame` is a one-liner wrapper with no added logic
**Files:** `components/GeographyGame.jsx`
**Issue:** `const beginSession = useCallback((config) => { startGame(config); }, [startGame])` exists only to wrap `startGame`. It adds an extra indirection with no benefit.
**Fix:** Replace the one `beginSession(config)` call site with `startGame(config)` directly and remove the `beginSession` definition.
**Risk:** Safe for autonomous agent · **Size:** Small

---

### D6 · Hardcoded date in DB migration auto-verifies all pre-existing accounts
**Files:** `scripts/setup-db.js`
**Issue:** A migration contains `WHERE ... AND created_at < '2025-06-22'` — a hardcoded date that permanently marks all accounts created before that date as email-verified. If this date is correct and intentional, it is fine. If it was a one-time fix that has since been superseded, it silently auto-verifies new accounts whose `created_at` falls before the cutoff.
**Fix:** Confirm the intent. If it was a one-time migration, move it to a separate migration file that documents why it exists and will not be re-run inadvertently.
**Risk:** Needs human judgment/testing · **Size:** Small

---

### D7 · `next-auth` beta dependency
**Files:** `package.json`
**Issue:** The app depends on `next-auth@^5.0.0-beta.25`. NextAuth v5 stable has since shipped.
**Fix:** Upgrade to the latest stable `next-auth@^5.x.x` and verify auth flows still work after upgrade.
**Risk:** Needs human judgment/testing · **Size:** Medium
