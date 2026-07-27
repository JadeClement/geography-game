# BUGS.md — Worldly Codebase Audit (Bugs)

Audited: 2026-07-12. Read-only review — no code was changed. Overall the app is in good shape: most issues from the previous AUDIT.md pass (host-header injection, email enumeration, unrate-limited registration, XSS in emails, TLS verification, rate-limit table growth, the `answerInput`/`spellingSuggestion` shadowing bugs, the unbounded promise array) have already been fixed and were re-verified intact here. The findings below are new — one privacy-shaped gap in the friends system, a scope leak in the recently-added Country Reference Panel, a real correctness gap in the Mastery Map display, two accessibility gaps that make whole interactions unusable non-visually, and a handful of smaller silently-broken flows and dead data.

---
DONE
### 1 · Adding a "friend" requires no consent, sends no notification, and can never be undone

**Files:** `lib/db.js` (`addUserFriend` ~181-207, `getFriendsForUser` ~161-171), `scripts/setup-db.js` (`user_friends` table, ~102-112), `app/api/users/friends/route.js`, `app/api/users/search/route.js`, `app/api/leaderboard/route.js`, `components/ScoreboardPage.jsx` (`AddFriendsModal`)

**Issue:** `user_friends` is a directed edge (`user_id`, `friend_id`) with no companion "request/accept" table. Any signed-in user can search any other user by username prefix (`app/api/users/search/route.js`, min 2 characters, no relationship check) and unilaterally add them via `POST /api/users/friends`. The other party is never notified, has no way to see who added them, and cannot decline. `getFriendsForUser` only returns rows where `user_id = $1` ("people I added"), so this is a one-way surveillance edge, not a mutual friendship — the added user typically never even knows a relationship was created. Once added, the adder's leaderboard (`app/api/leaderboard/route.js`) permanently surfaces the target's %Worldly score, current streak, session counts, and most-active region. There is no unfriend/remove endpoint anywhere in the codebase (confirmed via repo-wide search) — the relationship, once created, cannot be undone by either party. The UI copy actively implies mutuality/consent ("**{name} is now your friend!**" / "and your competition:)" in `components/FriendAddedToast.jsx`), which will surprise a user who is added by a stranger who merely guessed or discovered their username.

**What happens vs. should happen:** Anyone with an account can silently and permanently start tracking another user's mastery stats by username. A real "friend" feature should require mutual consent (request/accept) or at minimum notify the target and let them block/remove the relationship.

**Severity:** major (privacy). **Risk:** needs human judgment — this is a product/UX decision (request-accept flow vs. an explicit "follow" model with notification + block), not a one-line patch. **Size:** medium–large.

---

DONE

### 2 · Country Reference Panel is fully usable in Test mode, contradicting its own v1 spec

**Files:** `components/GeographyGame.jsx` (keydown handler ~614-650, `startGame` ~938, `MapCountryInfoPanels` render ~2145-2160), `components/MapCountryInfoPanels.jsx` (renders unconditionally on `country`, no `gameType` check), `components/SettingsPage.jsx` (~155-158, labels the default-open setting "Learning")

**Issue:** The panel's own PRD is explicit that this is a Learning-mode-only v1 feature ("Ship v1 in Learning mode only," "Panel UI and toggle appear only in Learning mode," Test mode listed as an explicit non-goal). None of the actual trigger paths enforce that:
- `MapCountryInfoPanels` renders whenever `targetCountry` exists, with no `isLearningGame` guard, so the Reference/Hints side panels (desktop) and tab bar (mobile) are fully visible and usable during scored Test games.
- The `Cmd/Ctrl+I` shortcut works whenever a round is active, regardless of game type.
- `startGame` calls `setReferencePanelOpen(getReferencePanelDefaultOpen())` on every game start, including Test — so a user who enabled "Reference panel on by default" (a setting explicitly labeled for Learning in `SettingsPage.jsx`) gets it auto-opened during scored Test rounds too, handing them region/population/language hints mid-test.

**What happens vs. should happen:** Test mode is supposed to be an honest, unaided measurement (it's what builds the learning queue and the graduation streak). Right now a Test player can open — or have auto-opened — a panel of hints for the current country. Should be gated behind `isLearningGame` in all three places.

**Severity:** major (undermines Test-mode integrity; violates the shipped spec). **Risk:** safe for an autonomous agent — it's a straightforward `isLearningGame` guard added to three existing call sites. **Size:** small.

---
DONE
### 3 · No rate limiting or brute-force protection on the sign-in (credentials) endpoint

**Files:** `auth.js` (`authorize` callback, ~lines 14-40)

**Issue:** `authorize()` calls `getUserByEmail` + `bcrypt.compare` with no per-email, per-IP, or global throttle. Registration and forgot-password both have rate limiting via `lib/rate-limit.js`, but the actual login endpoint — the one that guesses passwords — was never covered. There's no `middleware.js` or other global limiter in the repo. bcrypt(12) costs ~150-250ms per guess, which slows but doesn't stop scripted credential stuffing against known/enumerated emails.

**What happens vs. should happen:** Unlimited password guesses per account are currently possible. NextAuth v5's `authorize(credentials, request)` receives the request object, so the existing `isRateLimited`/`recordRateLimitEvent` helpers can be reused with an email+IP key, returning `null` (invalid credentials) when the limit is hit.

**Severity:** major. **Risk:** safe for an autonomous agent (reuses an existing, already-proven pattern) — but worth a human sanity check on the threshold so real users aren't locked out by typos. **Size:** medium.

---

DONE 

### 4 · Mastery Map can show a country as fully "mastered" from its weakest level alone

**Files:** `lib/masteryMap.js` (`buildModeMasteryMap`, ~54-70; `isMastered`, ~72-75), consumed by `components/MasteryPage.jsx` (~125-201)

**Issue:** `buildModeMasteryMap` collapses a country's four per-level mastery rows (F1/F2/N1/N2) into one entry via `Math.max(score)` / OR'd `graduated`, discarding which level it came from entirely. `isMastered()` then checks only that collapsed value against the 0.9 threshold. Since Find-It Level 1 ("map fills in as you go") carries only 15% weight in the documented %Worldly formula (`lib/worldlyScore.js` `LEVEL_WEIGHTS`, confirmed matching `components/HowItWorksPage.jsx`'s displayed breakdown), a country graduated *only* at F1 — never touched at F2, N1, or N2 — lights up as fully mastered on the Mastery Map, counts toward the progress ring percentage, and counts toward Gold tier in the combined "All" view.

**What happens vs. should happen:** This directly contradicts both the page's own framing ("Reaching 100% means you've mastered every place, in every mode, at every level" in `HowItWorksPage.jsx`) and the %Worldly score, which correctly blends all four level weights (`worldlyScore.js` `computeCountryScore`). The Mastery Map can show a materially rosier picture than the %Worldly headline number for the exact same underlying data, undermining trust in both numbers.

**Severity:** major (correctness/trust). **Risk:** needs human judgment — deciding whether "mastered" on this view should require the full weighted composite ≥ 0.9 (consistent with %Worldly) or the product intentionally wants a more lenient "have you graduated at all" signal here. **Size:** medium.

---
DONE
### 5 · Desktop Flags quiz has no accessible equivalent of the flag prompt

**Files:** `components/GeographyGame.jsx` (desktop floating flag card ~2140-2144, vs. the mobile inline prompt ~1880-1886 which correctly threads `alt={flagPromptAlt}`)

**Issue:** The mobile flag prompt correctly passes the previously-fixed dynamic `alt` text. The separate desktop floating flag card renders `<FlagPrompt iso2={targetCountry.iso2} size="card" />` with no `alt` prop (defaulting to `alt=""`) inside a `<div aria-hidden="true">`. For Find-It Flags on desktop, the header prompt renders nothing until a wrong click sets `flagsClickHeader` — so before any wrong guess, a screen-reader user has no indication a flag is even being shown, let alone which one. For Name-It Flags on desktop, the header only ever shows the answer input; the flag itself lives solely in the aria-hidden card.

**What happens vs. should happen:** The earlier alt-text fix was applied to the mobile render site but not the desktop one, which has no accessible fallback at all. A core game mode (Flags) is effectively unplayable non-visually on desktop.

**Severity:** major. **Risk:** needs human judgment (best place to surface an accessible label — visually-hidden text tied to the header vs. giving the card itself real alt text). **Size:** medium.

---

### 6 · Discover mode's revealed content is entirely hidden from screen readers

**Files:** `components/DiscoverMapLabels.jsx` (~line 165, `aria-hidden="true"` on the whole label layer)

**Issue:** Discover mode's entire premise is "tap a country to see its name/capital/flag" (`lib/discoverLabels.js`). Both the flying-in animation and the permanently-settled labels (name/capital text, or flag) live inside a container marked `aria-hidden="true"`. The only text exposed to assistive tech is the static instruction ("Tap a country to see its name") — the actual per-click revealed content is never announced, and there's no other `aria-live` region carrying it.

**What happens vs. should happen:** For a screen-reader user, Discover mode's core interaction produces no perceivable result at all — the one mode explicitly designed as a no-pressure learning surface is the one that's entirely non-functional non-visually.

**Severity:** major. **Risk:** needs human judgment (adding a live region without disrupting the label animation's timing/rhythm). **Size:** medium.

---
DONE
### 7 · "Resend verification email" gives no feedback on success, failure, or rate-limit

**Files:** `components/VerifyEmailPage.jsx` (~lines 81-101)

**Issue:** The resend button's `onClick` handler does `.then((data) => setSuccess(data.message || data.error))`, but in the `if (error)` render branch (the one actually shown when verification fails) the `success` state is never read in JSX — the assignment has no visible effect. There is also no `.catch()`, so a network failure produces silent nothing too.

**What happens vs. should happen:** Whether the resend call succeeds, hits the 401 "not signed in" case, or hits the 429 rate limit, the user clicks the button and nothing visibly changes. They should see a status line confirming the email was sent, was rate-limited, or failed.

**Severity:** major (silently broken account-recovery path). **Risk:** safe for an autonomous agent. **Size:** small.

---

DONE
### 8 · Account page flashes "sign in" to already-signed-in users and has no sign-in path when actually signed out

**Files:** `components/AccountPage.jsx` (~lines 51-53, 252-265)

**Issue:** `signedIn` is derived as `status === "authenticated"` with no separate handling of `status === "loading"`. Every comparable gated page (`ResultsPage.jsx:293`, `ScoreboardPage.jsx:414`, `MasteryPage.jsx:235`) explicitly checks the loading status first and shows a neutral "Loading…" state. `AccountPage` skips that check, so a signed-in user briefly sees "Sign in to manage your profile" on every page load before the real UI swaps in. Separately, unlike those other three pages, the signed-out branch here has no `AuthModal` and no "Sign in / Create account" button at all — a genuinely signed-out visitor lands on a dead end with only a "Play now!" link back to the game.

**What happens vs. should happen:** Should mirror the loading-state pattern already used elsewhere in the app, and should offer an actual way to sign in.

**Severity:** major. **Risk:** safe for an autonomous agent (the fix pattern already exists in three sibling components to copy from). **Size:** small.

---

### 9 · Mobile-specific tutorial copy is dead code — mobile players never see it

**Files:** `lib/gameTutorialSteps.js` (`mapStep` function ~31-38, `titleMobile`/`bodyMobile` fields at ~88-89, 106-107, 127-128, 186, 196; `getGameTutorialSteps` ~219-235), `components/GameTutorial.jsx` (~456-459, 518-521)

**Issue:** `mapStep()` is the only function that resolves `isMobile ? titleMobile : title`, but nothing calls it — `getGameTutorialSteps` returns the raw step objects straight from `buildSharedSteps`, and `GameTutorial.jsx` only ever reads `step.title`/`step.body`. Every step that defines mobile-specific copy (goal, map, controls, score) silently falls back to desktop copy on mobile. Most notably, the Name-It "goal" step's desktop copy says the highlighted country appears "on the map," while the intended mobile copy says "below the header" — describing a different on-screen location than what mobile actually shows.

**What happens vs. should happen:** Mobile players get tutorial text that references desktop-only UI layout.

**Severity:** minor. **Risk:** safe for an autonomous agent. **Size:** small.

---

DONE
### 10 · Bhutan's country-highlight fact is dead data due to a wrong ISO3 key

**Files:** `data/country-highlights.json:6`, `lib/countries.js` (`buildCountryFacts`, ~67-74)

**Issue:** `buildCountryFacts` looks up `countryHighlights.highlights?.[iso3]` using each country's real ISO3 code. Bhutan's real code is `BTN` (used consistently everywhere else, including `data/countries.json`), but `country-highlights.json` keys Bhutan's highlight ("Bhutan is one of the only countries in the world that absorbs more CO₂ than it emits.") under `"BHU"` — a code that matches no country in the manifest. This was the only mismatched key found across both `country-highlights.json` and `capital-alternates.json`.

**What happens vs. should happen:** This fact can never surface in the Country Reference Panel or Hints Panel for Bhutan. Should be keyed `"BTN"`.

**Severity:** minor. **Risk:** safe for an autonomous agent (one-line JSON key rename). **Size:** small.

---

### 11 · Reference/Hints panel open state doesn't reset to default each round, as the panel's own spec requires

**Files:** `components/GeographyGame.jsx` (`startRound` ~807-840 vs. `startGame` ~938)

**Issue:** The panel's spec says each new round should reset `referencePanelOpen` to the user's stored default, and that a mid-session toggle only affects the current round. The reset (`setReferencePanelOpen(getReferencePanelDefaultOpen())`) only happens once, in `startGame` (session start). `startRound`, which runs before every subsequent question, resets `answerText`, `spellingSuggestionText`, `flagsClickHeader`, and show-color state — but never touches `referencePanelOpen`/`hintsPanelOpen`.

**What happens vs. should happen:** Once a user opens or closes the panel mid-session, that state persists across every following round instead of resetting to the stored default each round as designed.

**Severity:** minor (behavioral deviation from spec, not a spoiler — visibility rules still recompute correctly). **Risk:** safe for an autonomous agent. **Size:** small.

---

DONE

### 12 · Database/hosting internals leaked in a client-facing error message, in every environment

**Files:** `app/api/auth/register/route.js` (~lines 100-107)

**Issue:** When the DB is unreachable (`ENOTFOUND`/`ECONNREFUSED`), the route returns: *"Cannot reach the database. For local development, use your Postgres public URL in .env (not postgres.railway.internal)."* — verbatim, to any anonymous client, in production as well as locally. It reveals the hosting provider (Railway), its internal hostname convention, and env-var naming, and it reads like an internal dev note rather than product copy.

**What happens vs. should happen:** Should log the detailed message server-side (already done via `console.error`) and return a generic, on-brand message to the client regardless of environment.

**Severity:** minor (info disclosure + tone, not independently exploitable). **Risk:** safe for an autonomous agent. **Size:** small.

---

## Verified fixed since the last audit (not re-reported)

Host-header injection guard in `lib/auth-url.js` (AUTH_URL required in production); generic success message + rate limiting on `app/api/auth/register/route.js` and forgot-password; `escapeHtml()` in `lib/email.js`; `rejectUnauthorized` removed from `lib/db.js`; `rate_limit_events` pruning in `lib/rate-limit.js`; the `answerInput`/`spellingSuggestion` state-shadowing bugs in `GeographyGame.jsx`; `pendingStatPromisesRef` now cleared after each game; Learning-mode/World-Test silent failures now surface a message; `mode`/`countryId`/`score` validation on `country-stats` and `scores` POST routes; flag `alt` text now describes the prompt on mobile (see #5 above for the remaining desktop gap); map feedback now has `aria-live`; focus trap now applied to all game dialogs.
