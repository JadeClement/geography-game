# POLISH.md — Worldly Codebase Audit (Polish)

Audited: 2026-07-12. Read-only review — no code was changed. Nothing here is broken; these are small rough edges — a couple of dead-end interactions, one copy inconsistency, a couple of built-but-unwired components — that would make an attentive user feel the app is slightly unfinished in places, in an otherwise warm and well-crafted UI.

---

### 1 · Forgot-password form can't be corrected and resubmitted after success

**File:** `components/ForgotPasswordPage.jsx` (line ~87: `disabled={loading || Boolean(success)}`)

**What feels off:** Once the generic "we've sent a reset link" message appears, the submit button is disabled for the rest of the page's life. If the user mistyped their email, there's no way to fix it and resubmit without a hard refresh.

**Suggested fix:** Clear `success` when the email input changes (or add a "try a different email" link) instead of disabling permanently.

**Risk:** safe for an autonomous agent. **Size:** small.

---

### 2 · `FriendAddedToast` was built but is never shown

**File:** `components/FriendAddedToast.jsx` (entire file)

**What feels off:** This toast has genuinely on-brand, playful copy ("**{name}** is now your friend! (and your competition:)") but a repo-wide search shows it's never imported anywhere — not in `ScoreboardPage.jsx`, not in `AppHeader.jsx`. The only feedback today after adding a friend is the inline "Added" button state inside `AddFriendsModal` (`ScoreboardPage.jsx` ~313-324), which vanishes the moment the modal closes. The more delightful confirmation this component was clearly built for never ships.

**Suggested fix:** Wire it into `ScoreboardPage`'s add-friend success path, or remove the file if it's intentionally deprecated. (Worth doing alongside item 1 in BUGS.md, since a real toast is also a natural place to eventually add a "request sent" framing instead of "is now your friend.")

**Risk:** safe for an autonomous agent. **Size:** small.

---

### 3 · Scoreboard back-link copy breaks the pattern used everywhere else

**File:** `components/ScoreboardPage.jsx:406`

**What feels off:** Every comparable page — `AccountPage.jsx`, `SettingsPage.jsx`, `ResultsPage.jsx`, `MasteryPage.jsx` — uses "Play now!" for the link back to the game, all sharing the same underlying style constant. `ScoreboardPage` alone says "← Back to game," despite reusing the identical style (`scoreboardBack = resultsBack` in `lib/ui.js:969`). Small copy drift that stands out once you notice the pattern.

**Suggested fix:** Change to "Play now!" to match.

**Risk:** safe for an autonomous agent. **Size:** small.

---

### 4 · Unexplained jargon term on the scoring explainer page

**File:** `components/HowItWorksPage.jsx:318`

**What feels off:** The EMA section's chip row lists six values. Five of them ("Fast correct," "Slow correct," "Second try," "Revealed," "Mastered at") are each explained in the surrounding prose. The sixth, "History cap" (0.85), appears only as a bare chip with no explanation anywhere on the page — the one raw internal term on an otherwise unusually warm, well-written page.

**Suggested fix:** Either add a sentence explaining what the history cap does (it limits how much mastery can be inferred from pre-EMA aggregate history alone), or drop the chip if it's not meant to be user-facing.

**Risk:** needs human judgment (requires deciding the right level of detail for end users). **Size:** small.

---

### 5 · "Add friend" button is under the common mobile touch-target size

**File:** `lib/ui.js:1093-1103` (`sbResultAddBtn`), used in `components/ScoreboardPage.jsx:313-324`

**What feels off:** `px-3 py-1.5 text-[0.82rem]` yields a control roughly 30px tall, noticeably smaller than the 44px (`max-md:h-11`/`w-11`) treatment given to icon buttons elsewhere on mobile (modal close, profile button, avatar). This is the primary tap target inside a modal opened specifically to add friends on a phone.

**Suggested fix:** Add `max-md:py-2.5` or `min-h-11` on mobile to match the rest of the app's touch-target sizing.

**Risk:** safe for an autonomous agent. **Size:** small.

---

### 6 · Idle-return timeout is 30x the idle-prompt delay — worth a sanity check

**File:** `lib/constants.js:7-9`

**What feels off:** `IDLE_PROMPT_MS` (when the "Are you still there?" modal appears and pauses the timer) is 2 minutes. `IDLE_RETURN_MS` (how long after that before the game auto-returns to the menu) is 60 minutes — `60 * 60 * 1000`, sitting right next to a `2 * 60 * 1000` definition. The order-of-magnitude jump reads like a copy-paste of the `* 60 * 1000` pattern with an extra `* 60` left in, though a generous grace period for a backgrounded tab could also be intentional.

**Suggested fix:** Confirm intent with product; if it's a typo, it likely should be closer to 1-5 minutes.

**Risk:** needs human judgment (behavior change). **Size:** small.

---

### 7 · `useUserProfile`'s two fetch paths diverge in unmount safety

**File:** `lib/hooks/useUserProfile.js` (`refresh`, ~12-33, vs. the mount effect, ~35-57)

**What feels off:** Both independently fetch `/api/users/profile` and set the same state, but only the mount effect guards against a post-unmount `setState` via a `cancelled` flag. `refresh()` — called from `components/AccountPage.jsx` after profile mutations — has no such guard. Impact is low in React 19 (a late `setState` after unmount is a silent no-op), but it's a duplicated implementation that dropped the safety pattern used one function up.

**Suggested fix:** Have the mount effect call `refresh()` (with the cancellation check moved inside `refresh` itself) instead of re-implementing the fetch separately.

**Risk:** safe for an autonomous agent. **Size:** small.

---

### 8 · Session `update()` accepts client-supplied claims with no server re-validation

**Files:** `auth.js` (`jwt` callback, `trigger === "update"` branch, ~lines 57-73), called from `components/AccountPage.jsx` (`syncSessionAvatar`) and `components/VerifyEmailPage.jsx`

**What feels off:** `useSession().update(...)` is a client-side call, and the `jwt` callback merges whatever `emailVerified`/`username`/`avatarType`/`avatarColor`/`avatarFlag` the client passes straight into the JWT with no DB check. Every server route that matters re-queries the DB directly rather than trusting these session fields, so this isn't currently exploitable for anything beyond cosmetic session state (e.g. a user could forge their own session's display name via devtools) — but it's a latent footgun if a future route ever authorizes off one of these claims.

**Suggested fix:** Either validate the updated fields against the DB before merging, or restrict `update()` to a narrower allow-list of keys.

**Risk:** needs human judgment (low current impact, possible deliberate simplicity tradeoff). **Size:** medium if addressed properly.

---

### 9 · Mobile reference/hints bottom sheet is taller than its own spec

**File:** `lib/ui.js` (`mapInfoMobileSheet`, ~line 704: `max-h-[min(52vh,26rem)]`)

**What feels off:** The Country Reference Panel's spec calls for a mobile bottom sheet at "~40% height" so the map stays partially visible underneath. The actual cap is `52vh` (up to 26rem) — noticeably taller, though since it's a max-height rather than a fixed height, real-world usage varies with content.

**Suggested fix:** Lower the cap toward ~40vh to keep more of the map visible per the original intent.

**Risk:** safe for an autonomous agent. **Size:** small.

---

### 10 · Dead rate-limit bookkeeping on the verify-email resend route

**File:** `app/api/auth/verify-email/resend/route.js:66`

**What feels off:** `recordRateLimitEvent(`verify-resend:${userId}`)` writes a row to `rate_limit_events`, but nothing ever calls `isRateLimited`/`countRateLimitEvents` with that key — the route's actual throttling happens entirely through `auth_tokens` timestamps. The write is vestigial: it costs a DB write per resend and could mislead a future reader into thinking it's load-bearing.

**Suggested fix:** Remove the unused call (and import) — or wire it into a real `isRateLimited` check if IP-based limiting on top of the token-based throttle was the original intent.

**Risk:** safe for an autonomous agent. **Size:** small.
