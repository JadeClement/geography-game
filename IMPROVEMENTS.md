# IMPROVEMENTS.md — Geography Game Brainstorm

Read-only review, 2026-06-25. No code was changed. Suggestions are grouped by category, highest-impact first within each section.

---

## Gameplay and Retention

### 1. "Close to graduating" signal is invisible
**What prompted it:** Graduation requires `mastery >= 0.9` AND `fastStreak >= 3` in Test mode (`lib/mastery.js`). Both thresholds are fully opaque to the player. Someone answering everything correctly and quickly could be one round away from graduating a country with no idea.
**Why it helps:** A subtle completion-screen callout ("3 countries close to graduating in Europe") gives players a satisfying near-miss feeling and a concrete reason to run another Test session rather than switching away.
**Effort:** Medium
**Judgment needed** — how strongly should the system nudge toward Test mode?

---

### 2. After a missed-days gap, mastery decay is silent
**What prompted it:** `getDecayAdjustedMastery` applies a 30-day exponential half-life and `isEffectivelyGraduated` re-activates countries that fall below the reentry threshold. A user returning after a month could find graduated countries silently re-queued. The Go! session looks identical whether or not countries lapsed.
**Why it helps:** Surfacing "5 countries refreshed due to inactivity" on the Go! completion screen makes the spaced-repetition model legible and credible — users understand why they're seeing old material again rather than feeling like the game forgot their progress.
**Effort:** Medium
**Judgment needed** — how much should the system explain itself? Brand tone should stay matter-of-fact, not apologetic.

---

### 3. World Test pre-credited countries are invisible to the player
**What prompted it:** `buildWorldTestCountries` pre-credits graduated countries and passes `preCreditedCountryIds` to `startGame`. The progress bar starts partially filled and the score is inflated by pre-credited countries. There is no on-screen explanation.
**Why it helps:** A new-to-World-Test user who sees a progress bar already 40% full will be confused. One sentence — "40 already mastered · 157 to go" — before the game starts turns confusion into satisfaction.
**Effort:** Small
**Agent-safe once copy is approved**

---

### 4. No feedback on Go! when there's nothing due
**What prompted it:** `startGoSession` silently falls back to 10 random countries when `weakCount === 0` (user has no weak countries, or is signed out). There is no explanation.
**Why it helps:** "Nothing weak right now — here are 10 to keep sharp" turns a potentially confusing experience (why did I get easy countries I've seen a hundred times?) into a clear one, and signals healthy progress.
**Effort:** Small
**Agent-safe once copy is approved**

---

### 5. Streak shown in header but not surfaced on completion when it doesn't increment
**What prompted it:** `GameCompleteModal` shows a streak message only if the streak just went up. If a user plays their second session of the day (no increment), no streak is shown despite the current streak being meaningful.
**Why it helps:** Showing "Day 5 — keep it up!" even on non-increment days provides positive reinforcement without requiring behavior change from the player.
**Effort:** Small
**Judgment needed** — tone question: how insistent should streak messaging be?

---

### 6. Individual country graduation is never acknowledged during play
**What prompted it:** `detectMilestone` in `GeographyGame` checks region-level milestones only. Country graduation — the atomic unit of mastery — currently produces zero in-game feedback.
**Why it helps:** A brief visual distinction on the map fill (a momentary glow, a subtle "✓ Graduated" flash on the answer) at the round it graduates would make the EMA system feel alive rather than purely mathematical and invisible.
**Effort:** Medium
**Judgment needed** — risk of over-notifying in a 50-country test session; a "batch" callout at the end may be preferable.

---

## Onboarding and First-Run Experience

### 7. Learn mode dead-ends with no forward path for new users
**What prompted it:** In `app/api/country-stats/route.js`, a country only enters the learning pool if `hasEverStruggled` — requiring at least one Test miss. A first-time user who navigates Explore → Countries → Asia → Learn → Level 1 hits "Play Test mode first to build your learning list" with no button to get there.
**Why it helps:** "Go to Test mode for Asia" as a direct button on the locked Learn screen removes the dead-end feeling and teaches new users the Test-then-Learn flow without requiring them to navigate backward.
**Effort:** Small
**Agent-safe**

---

### 8. Signed-out users see "Sign in / Create account" before "Play again" on the completion screen
**What prompted it:** `GameCompleteModal` places the auth CTA above "Play again" for signed-out users.
**Why it helps:** Players who get the itch to continue but are interrupted by a signup push often abandon. Placing "Play again" first (with the auth nudge below it) would likely improve both immediate retention and eventual signup conversion.
**Effort:** Small
**Judgment needed** — product tradeoff between conversion and retention.

---

### 9. Signed-out user gets no explanation of what Go! is actually doing
**What prompted it:** For a brand-new signed-out user, `startGoSession` silently picks 10 random countries from the world pool. The home screen copy says "Do 10 today" but does not explain that sign-in unlocks a personalised queue.
**Why it helps:** "Start with 10 random countries. Sign in to get a smart daily review" sets expectations and adds genuine motivation to register — the value proposition is concrete and immediate.
**Effort:** Small
**Judgment needed** — brand tone balance; shouldn't feel like a paywall.

---

## Content and Variety

### 10. "Czech Republic" shown as canonical name; "Czechia" is an alias
**What prompted it:** `data/countries.json` stores `"name": "Czech Republic"` with `"Czechia"` as an alias in `lib/spelling.js`. The Czech government and the UN have preferred "Czechia" in international usage since 2016.
**Why it helps:** Displaying the outdated name as the prompt is a minor credibility issue. Swapping the canonical name and alias would be a one-line data change.
**Effort:** Small (data edit)
**Judgment needed** — editorial call; both names are in common use.

---

### 11. Diacritic stripping absent from name normalization
**What prompted it:** `normalizeName` in `lib/spelling.js` lowercases but does not strip diacritics. Aliases cover common cases (São Tomé, etc.) but any enabled country with unaliased diacritics in its canonical name would silently reject otherwise-correct typed answers.
**Why it helps:** Adding `.normalize('NFD').replace(/\p{Diacritic}/gu, '')` to `normalizeName` makes diacritic-free typing work universally, reducing the alias maintenance burden.
**Effort:** Small
**Agent-safe**

---

### 12. Countries with missing or contested capital data should be audited
**What prompted it:** `GeographyGame.jsx` guards against empty capital strings (`!targetCountry.capital?.trim()`), implying some capitals may be absent. The capitals mode would show a blank prompt for any enabled country missing this field.
**Why it helps:** A one-pass audit of all enabled countries in `data/countries.json` for missing or contested capitals prevents silent blank-prompt bugs in Capitals mode.
**Effort:** Small (data audit)
**Agent-safe** (data verification)

---

### 13. Country facts are uniform across all countries — no standout or surprising entries
**What prompted it:** Every country in `data/countries.json` has exactly 4 facts in the same 4 categories (history, politics, society, geography). The structure is consistent, but the uniformity makes the Reference panel feel like a form rather than a discovery.
**Why it helps:** Adding a small number of distinctive "did you know" facts — world records, cultural quirks, geographic superlatives — would give the Reference panel replay value and transform it from a study aid into something occasionally surprising.
**Effort:** Large (content at scale, likely AI-assisted)
**Judgment needed** — tone and fact selection criteria.

---

## Accessibility and Inclusivity

### 14. Color-only distinction for correct vs. wrong countries on the map
**What prompted it:** Wrong countries flash red and correct ones fill green via `countryColorMap`. There is no pattern, icon, or non-color signal to differentiate them.
**Why it helps:** Players with deuteranopia or protanopia cannot distinguish red and green fills. A subtle border variation or pattern on wrong-fill countries would make the distinction accessible without changing the design for color-normal users.
**Effort:** Medium
**Judgment needed** — design decision; needs visual prototyping.

---

### 15. Profile dropdown has no keyboard close path and no ARIA menu structure
**What prompted it:** `AppHeader`'s profile dropdown has neither an Escape keydown handler nor `role="menu"` / `role="menuitem"` on its children.
**Why it helps:** Standard accessible dropdown behavior — Escape closes the menu and returns focus to the trigger. `role="menu"` lets screen readers identify and navigate the items correctly.
**Effort:** Small
**Agent-safe**

---

### 16. `CelebrationOverlay` is dismissible by click only — no keyboard path
**What prompted it:** `CelebrationOverlay` uses `role="alertdialog"` and `onClick={handleDismiss}` but has no `onKeyDown` handler for Escape.
**Why it helps:** Per ARIA spec, `alertdialog` implies keyboard-dismissible behavior. A keyboard user cannot dismiss the overlay.
**Effort:** Small
**Agent-safe**

---

### 17. Pronunciation audio fails silently with no visual error state
**What prompted it:** `playPronunciation` swallows errors with `.catch(() => {})`. If an audio file is missing, nothing happens. The `PronunciationButton` has no loading or error state.
**Why it helps:** A user who clicks the speaker icon and hears nothing cannot tell whether it failed or is muted. A brief visual indicator (icon graying out, or an error strikethrough) prevents repeated futile clicks and builds trust in the feature.
**Effort:** Small
**Agent-safe**

---

## UI Polish and Consistency

### 18. "Practice again" copy mismatches Go!'s framing
**What prompted it:** `GameCompleteModal` renders "Practice again" for all `isLearning` sessions, including Go!. But Go! is positioned as a quick daily habit, not deliberate practice.
**Why it helps:** "Go again" or "Do 10 more" after a Go! session would reinforce Go!'s identity as a lightweight daily loop, not conflate it with the Learning mode that requires intentional setup.
**Effort:** Small
**Judgment needed** — copy decision.

---

### 19. `startNavigation.js` parses `level` as a Number but GAME_LEVELS are strings
**What prompted it:** `parseStartScreenSearchParams` runs `Number(levelRaw)` on the `level` URL param, but all level values are string codes ("F1", "F2", "N1", "N2"). `Number("F1")` is `NaN`, which `Number.isFinite` catches and converts to `null`, silently redirecting any deep-linked learning session URL to the home screen.
**Why it helps:** A bookmarked or shared learning URL with `?level=F1` redirects to home with no error. The parser should accept both numeric legacy values and current string codes.
**Effort:** Small
**Agent-safe** (but worth careful testing against existing URLs)

---

## Performance

### 20. Mastery page makes 3 separate API calls (one per mode) — no combined endpoint
**What prompted it:** `MasteryPage` and `ResultsPage` each call `fetchMasteryStats` three times (once per mode), plus `fetchScores`. All go to separate `/api/mastery?mode=…` queries.
**Why it helps:** A single `/api/mastery/all` endpoint returning all modes in one query would cut DB round-trips by two-thirds and improve page load as user count grows.
**Effort:** Medium
**Agent-safe** (additive endpoint, existing callers unchanged)

---

### 21. GeoJSON served from `public/` with default zero-cache headers
**What prompted it:** `loadCountriesGeoJSON` fetches the GeoJSON from `public/` via `fetch`. Next.js serves `public/` files with `Cache-Control: public, max-age=0, must-revalidate` by default, so every hard refresh re-downloads what is likely a multi-MB file.
**Why it helps:** Adding a long `max-age` (or content-addressed path) for the GeoJSON in `next.config.mjs` headers config would let browsers cache it across sessions — the main cold-start latency improvement on mobile.
**Effort:** Small
**Agent-safe**

---

### 22. `loadCountriesGeoJSON` result is not cached at the module level
**What prompted it:** `loadCountriesGeoJSON` is called in a `useEffect` in `GeographyGame`. If the component remounts (auth state change, etc.) the fetch fires again. There is no module-level singleton cache.
**Why it helps:** A `let cachedGeoJSON = null` singleton in `lib/countries.js` prevents redundant fetches on re-mounts, keeping the map data available instantly for the common "sign in while on the game screen" flow.
**Effort:** Small
**Agent-safe**

---

### 23. `country_attempts` has no retention policy — grows unboundedly
**What prompted it:** Every round inserts a row into `country_attempts`. The mastery system reads only `country_stats` (aggregates), not `country_attempts`. The attempts table is effectively a raw audit log with no documented archiving strategy.
**Why it helps:** At current scale this is fine, but a documented retention policy (or a purge job after N months) would prevent operational surprises as active users accumulate years of data.
**Effort:** Small (policy/documentation decision first, then a cron job)
**Judgment needed** — how long should raw attempt logs be kept?
