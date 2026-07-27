# IDEAS.md — Worldly Feature Ideas

Grounded in what's actually in the codebase today — data the schema/logic already tracks but the UI never surfaces, and natural extensions of systems that already exist.

---

### 1 · Surface response-speed data that's already tracked but never shown anywhere

**What I noticed:** `country_stats` stores `response_time_ms_sum`, `response_time_count`, `speed_baseline_ms`, and `fast_streak` per country/mode/level (`scripts/setup-db.js`), and `lib/mastery.js` actively computes a personal speed baseline (`updateSpeedBaseline`) and fast/slow classification (`isFastResponse`) on every attempt — it's core to how graduation works. A repo-wide search confirms none of `responseTimeMsSum`, `speedBaselineMs`, `responseTimeCount`, or `fastStreak` is read by any component or page. This data is computed and persisted purely as graduation plumbing and never reaches the player.

**Why it fits Worldly specifically:** The app already leans into a "how well do you actually know this" narrative (mastery %, fast streaks, graduation) rather than a plain quiz score. Showing "your average time on capitals: 3.2s" or a small "⚡ fastest: Vatican City (0.8s)" badge on the Mastery Map, or a friend-vs-friend speed comparison on the Scoreboard (which already computes `mostActiveRegion` per friend from the same `country_stats` rows), would be a genuinely novel stat most geography apps don't have — because most don't track per-answer response time at all.

**What it would take:** A read-only aggregation endpoint (or extend `app/api/mastery/all/route.js`) to expose per-country/per-mode average response time; a small UI element in `MasteryPage.jsx` or `ScoreboardPage.jsx`. No schema changes — the data already exists.

**Size:** small–medium. **Priority:** medium (cheap to build, genuinely differentiated, reuses data no other geography app collects).

---

### 2 · A persistent "milestones" log instead of a one-shot celebration toast

**What I noticed:** `lib/milestones.js` implements a well-structured priority system (region mastered > personal best > perfect game > level-up > %Worldly boundary crossed), but it only ever surfaces as a single `CelebrationOverlay` toast at the end of one game (`GameCompleteModal.jsx`), gated by a ref so it fires once per game and is then gone forever. There's no page that lists the milestones a player has earned over time.

**Why it fits Worldly specifically:** The app already has a friends/leaderboard identity system with passport stamps — a persistent "your milestones" list (regions mastered, personal bests, %Worldly boundaries crossed, with dates) would reuse detection logic that already exists, give players something to look back on, and give friends something to compare beyond a single live percentage number.

**What it would take:** Persisting milestone events when `detectMilestone` fires (a new small table, or piggybacking on existing score/streak history) instead of only computing them transiently per session; a lightweight new page or section to list them.

**Size:** medium. **Priority:** low–medium (nice-to-have, not blocking, but cheap relative to the narrative payoff).

---

### 3 · Let a country's "Did you know?" highlight double as a discovery/trivia loop

**What I noticed:** `data/country-highlights.json` currently has highlight facts for only 19 of the 200 enabled countries (confirmed by diffing enabled ISO3s against the highlights file), and they only ever appear inside the Country Reference Panel during Learning-mode play (`lib/referencePanel.js`, `components/CountryReferencePanel.jsx`) or the Hints Panel. Discover mode (`GeographyGame.jsx`'s `startDiscoverGame` / `DiscoverMapLabels`) already has a no-score, click-to-learn interaction model with animated labels landing on the map — a natural home for these facts that isn't being used for them at all today.

**Why it fits Worldly specifically:** Discover mode is explicitly the low-stakes, curiosity-driven surface of the app (per the game-type framing in `lib/gameTypes.js` and the Discover-complete modal copy). Surfacing "Did you know?" highlights there — even just for the 19 countries that have them today — would make Discover feel like it's teaching something beyond names, and would create organic pressure to fill in highlight facts for the remaining 181 enabled countries over time.

**What it would take:** Thread `country.facts`/highlights into `DiscoverMapLabels`' landed-label state or a small popover on click; no schema change, since `buildCountryFacts` in `lib/countries.js` already merges highlights into each country object at load time.

**Size:** small. **Priority:** medium (very low engineering cost, directly extends an existing low-stakes surface).
