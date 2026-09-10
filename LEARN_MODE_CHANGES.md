# Learn Mode question engine — change log

New mixed-question engine for **Learn mode only**. Test / Go! / Discover modes,
the graduation logic, and the existing Test-mode EMA formula are untouched. The
only shared code paths that changed are additive and gated so Test mode behaves
exactly as before (see "EMA plumbing" below).

> Status: the engine, UI components, EMA plumbing, DB table, API, results
> section, and automated checks are all implemented and tested. The final
> **wiring into `components/GeographyGame.jsx`'s Learn round loop** (swapping the
> classic Find/Name flow for the mixed engine) is intentionally left for you to
> review/apply — `GeographyGame.jsx` is the protected 1600-line file shared with
> Test mode, and the spec forbade touching the Test flow. The exact seams are
> listed under "Remaining integration" at the end.

---

## Files created

### Data / logic (`lib/`)
- `lib/comparison-clusters.js` *(earlier step)* — pre-computed population/area peer
  clusters (8 closest per country) + `BLOCKED_PAIRS`; `getPopulationPeers`,
  `getAreaPeers`, `isBlockedPair`.
- `lib/learn/questionTypes.js` *(earlier step)* — `QUESTION_TIERS`, the
  `QUESTION_TYPES` catalog (with `categories`/`requires`), `LEARN_EMA_MULTIPLIERS`,
  `resolveLearnEmaMultiplier`, `MASTERY_BANDS`, `getEligibleQuestionTypes`.
- `lib/learn/questionGenerator.js` *(earlier step)* — one generator per question
  type; returns a fully-specified question object or `null`; regional distractors;
  peer-based comparative opponents.
- `lib/learn/sessionSequencer.js` *(earlier step; arranger improved this step)* —
  `buildLearnSession(...)`: per-country type selection (tier-weighted),
  no-country-dropped fallback, bonus-comparative injection, and the ordering pass
  (opening / variety / comparative spacing).
- `lib/learn/emaIntegration.js` — maps a normalized answer event → round outcome →
  `LEARN_EMA_MULTIPLIERS` key → numeric multiplier; `buildLearnStatPayload` builds
  the `/api/country-stats` body (primary country only); `logLearnEmaUpdate` dev log.
- `lib/learn/factSelection.js` — `selectLearnFact(country, {wasCorrect, category,
  seenIndices})`: wrong→most-relevant fact (synthetic capital fact / geography
  anchor), correct→first unseen fact, else fallback.
- `lib/learn/factsClient.js` — `fetchSeenFacts` / `markFactSeen` (fail-soft wrappers
  around `/api/learn-facts`).
- `lib/learn/sessionSummary.js` — `buildLearnSessionSummary(...)` + `formatTypeBreakdown`
  + `LEARN_TYPE_LABELS` for the results screen.
- `lib/learnUi.js` — Tailwind class-name module for the Learn UI (parallel to
  `lib/ui.js`, so Test-mode styling is untouched).

### UI components (`components/learn/`)
- `LearnQuestionRenderer.jsx` — routes on `answerType`, normalizes every answer to
  the unified `onAnswer` event, self-contains `text_entry`, and exposes an
  `onMapClickReady(emit)` seam for the host-owned map.
- `MultipleChoiceQuestion.jsx` — 2×2 (mobile) / 1×4 (desktop) options, green/red
  feedback, 800 ms delay, flag/shape visuals, clue ladder.
- `YesNoQuestion.jsx` — Yes/No with the same feedback pattern.
- `BinaryChoiceQuestion.jsx` — two country cards; stat hidden before answer,
  revealed after; winner highlighted; 1200 ms delay.
- `ClueButton.jsx` — Tier 1/2 only; progressive clue reveal; signals `revealUsed`.
- `LearnFactModal.jsx` — mobile-only bottom sheet (~65dvh), slide-up, dismiss on
  tap/swipe-down/4 s timeout (timer starts after the slide-up).
- `LearnSessionSummary.jsx` — results-screen section: type breakdown, improved /
  dropped mastery deltas, and a "did you know" fact for the biggest drop.

### API / DB / scripts
- `app/api/learn-facts/route.js` — GET seen fact indices, POST mark-seen.
- `scripts/enrich-country-geodata.js` *(earlier step)* — one-off enrichment of
  `data/countries.json` with `area` + `landlocked` (source: mledoze/countries).
- `scripts/alias-loader.mjs` + `scripts/register-alias.mjs` — ESM loader so
  standalone scripts can resolve the `@/` alias and import `.json` (test-only).
- `scripts/test-learn-mode.js` — automated portion of the Step 9 checklist.

---

## Files modified

- `lib/mastery.js` *(earlier step)* — `computeMasteryUpdate` gained an optional
  `learnModeMultiplier` (default `1`) that scales the EMA delta. Test mode never
  passes it → unchanged. Graduation still only advances for `gameType === 'test'`.
- `lib/learn/sessionSequencer.js` — `arrangeQuestions` rewritten to a class-pressure
  interleave: never opens with Tier 1 free recall (prefers a comparative, else a
  Tier 2+ warm-up); keeps "no 3-in-a-row" (Rule 2) hard; and provably yields **zero**
  back-to-back comparatives whenever comparatives don't outnumber the non-comparative
  spacers (Rule 5), only allowing the theoretical-minimum forced adjacencies otherwise.
- `app/api/country-stats/route.js` — accepts + validates an optional
  `learnModeMultiplier` (finite, `0..1`); it is only applied when
  `gameType === 'learning'` (Test/Review always use the neutral `1.0`).
- `lib/db.js` — `recordCountryPerformance` forwards `learnModeMultiplier` to
  `computeMasteryUpdate`; added `getSeenFactIndices` / `recordFactSeen`.
- `scripts/setup-db.js` — added the idempotent `facts_seen` table + index.
- `components/GameCompleteModal.jsx` — added an optional `learnSummary` prop that
  renders `<LearnSessionSummary>` below the existing results, gated on `isLearning`.
- `package.json` — added `test:learn` script.
- `data/countries.json` *(earlier step)* — additively enriched with `area` +
  `landlocked` for all 200 enabled countries.

---

## EMA plumbing (how the multiplier flows)

`LearnQuestionRenderer.onAnswer` → `resolveLearnEma(event)` (in `emaIntegration.js`)
→ `buildLearnStatPayload` → `POST /api/country-stats { …, learnModeMultiplier }`
→ `recordCountryPerformance({ learnModeMultiplier })` → `computeMasteryUpdate`.

- Only the **primary `countryId`** is ever recorded — the Tier 3/4 comparison
  country's EMA is never touched.
- A wrong single-shot answer maps to `second_try_correct` (the small-penalty path);
  a clue/reveal maps to `needed_reveal`; correct maps to `first_try_correct`.

---

## Assumptions to verify

1. **`data/countries.json` shape**: generators read `iso3, name, capital,
   population, area, landlocked, languages[], neighbors[] (iso3), region, facts[]`.
   `area`/`landlocked` were added by the enrichment script — confirm you're happy
   with that source (mledoze/countries) and the Kosovo (`XKX`) override.
2. **`iso2` for flags** is resolved at render time from the runtime country object;
   the question objects carry only `iso3`. The UI components take a
   `resolveCountry(countryId) => { name, iso2, population, area, neighborCount }`
   prop — wire it from your loaded GeoJSON/country lookup during integration.
3. **`facts_seen`** identifies a fact by its **index** in the country's `facts[]`
   array; this assumes that array order is stable (it is in the committed data).
4. **Learn "level"** — the mixed engine records stats under the session's existing
   `mode` + `level`; nothing new was introduced there.

---

## Data-gated question types

All question types are implemented. `neighbor_*`, `language_family`, and
`area/landlocked` types return `null` for countries lacking the relevant field, and
the sequencer falls back — no country is ever dropped.

---

## Edge cases found (beyond the Step 9 checklist)

- **Single-type (band × category) combos** make some ordering rules mathematically
  impossible: e.g. `capitals` at mastery ≥ 0.90 exposes only `capital_free_recall`
  (Rule 2 can't hold), and any category at mastery < 0.30 is Tier 4-only where every
  question is "comparative" for Rule 5's purposes. These are catalog limitations, not
  bugs — documented in `sessionSequencer.js`. Adding more capital/flag question types
  removes them. Mixed-mastery weak-country pools (the norm for Learn) have ample
  variety and satisfy every rule.
- **`getEligibleQuestionTypes` safety fallback**: `flags` at mastery ≥ 0.90 would be
  empty (no Tier 1 flag type), so eligibility widens across tiers to guarantee a
  non-empty list. Verify the fallback behavior matches your intent for that corner.
- **Rule 5 vs Rule 2 priority**: when comparatives are the majority of a session,
  some back-to-back comparatives are unavoidable; the arranger holds them to the
  theoretical minimum (see the `test:learn` "Rule 5" test).
- **Guests / DB down**: `fetchSeenFacts` fails soft (facts still show, just
  un-personalized); the fact modal never blocks gameplay.

---

## Testing

- `npm run db:setup` — creates the new `facts_seen` table (idempotent).
- `npm run test:learn` — 10 automated checks (eligibility ladder, session opening /
  variety / tier-representation / comparative-spacing, brand-new & fully-mastered
  edge cases, and EMA weighting incl. "Test mode unaffected"). All pass.
- UI items in the Step 9 checklist (fact-modal gestures, desktop side panel,
  clue visibility, binary stat hidden-before/revealed-after) are manual and depend
  on the GeographyGame wiring below.

### Pre-existing note
The working tree has an unrelated in-progress build error
(`'discoverMapLabelText' is not exported from '@/lib/ui'`, from `DiscoverMapLabels.jsx`)
that predates and is independent of this feature; I did not touch it.

---

## Remaining integration (into `components/GeographyGame.jsx`)

The Learn engine is ready to drop in at these audited seams:

1. **Session build** — where Learn builds its country queue (`buildLearningCountries`
   / `startGame`), call `buildLearnSession({ countries, category: mode, allCountries,
   masteryStats })` and store `questions` + `sessionMeta`.
2. **Round render** — where the prompt renders (`renderGamePrompt`), for Learn use
   `<LearnQuestionRenderer question={current} onAnswer={handleLearnAnswer}
   resolveCountry={…} speedBaselineMs={…} onMapClickReady={…} />`.
3. **Answer handler** — `handleLearnAnswer(event)`: `const { payload, meta } =
   buildLearnStatPayload(event, { mode, level }); logLearnEmaUpdate(event, meta);`
   then POST `payload` (records primary country only).
4. **Post-answer fact** — mobile: render `<LearnFactModal>` between questions using
   `selectLearnFact` + `fetchSeenFacts`/`markFactSeen`; desktop: feed the same fact
   into the existing side panel. Skip on the final question → go to results.
5. **Results** — pass `learnSummary={buildLearnSessionSummary(...)}` to
   `<GameCompleteModal isLearning learnSummary={…} />`.

None of the above changes the Test/Go!/Discover code paths.

---

## EMA-Driven Tier Selection

Learn format selection is now per-country EMA (`MASTERY_BANDS`), not a regional
`workingTier`. Generators, tier assignments, EMA multipliers, Test / Go! /
Discover, and graduation are unchanged.

### Files changed

- `packages/core/learn/sessionSequencer.js` — live path uses
  `getTierForCountry` / `selectQuestionForCountry` from each country's mastery
  and attempt proxy; `firstExposure` flag; mastery>0.92 trivial skip for T3/T4
  only; easier-tier then Find/Name fallback. `challenge` argument ignored.
  Audit comment block at the top of the file.
- `packages/core/learn/questionTypes.js` — added `getPrimaryTierForMastery`,
  `getQuestionTypesForTier`, `getNextEasierTier`.
  `getEligibleQuestionTypesForChallenge` kept, marked deprecated.
- `packages/core/learn/challengeLevel.js` — module marked deprecated. Harden/ease
  functions remain for the unused API.
- `packages/core/learn/emaIntegration.js` — **unchanged**. Already reads
  `event.tier` from the question, not regional state.
- `apps/web/components/GeographyGame.jsx` — Learn session start no longer
  fetches challenge; answer handler no longer updates/saves challenge or
  rebuilds remaining questions mid-session. Passes `lastAttemptAt` on sampled
  countries. Test / Go! / Discover paths untouched.
- `apps/web/lib/countryStats.js` — `fetchLearnChallenge` / `saveLearnChallenge`
  marked deprecated; no longer called from the session builder.
- `apps/web/app/api/learn-challenge/route.js` — left in place, deprecated.
- `apps/web/lib/db.js` — `getLearnChallenge` / `upsertLearnChallenge` marked
  deprecated. `deleteUserPracticeData` still clears `learn_challenge` rows.
- `apps/web/scripts/setup-db.js` — `learn_challenge` table kept with a
  deprecation comment (column `working_tier` not dropped).
- `packages/constants/index.js` — `LEARN_CHALLENGE` marked deprecated.
- `apps/web/scripts/test-learn-mode.js` — session tests now assert per-country
  EMA tiers, first-exposure, and that `sessionMeta.workingTier` is absent.

### workingTier findings and what was done

| Location | Action |
|---|---|
| `learn_challenge.working_tier` (Postgres) | Left in place; stopped live reads/writes |
| `GET/POST /api/learn-challenge` | Left in place; deprecated; client no longer calls it |
| `GeographyGame` fetch/save/harden/mid-session rebuild | Removed from Learn start + answer |
| `sessionSequencer` `challenge` / `workingTier` | Ignored; tier from EMA |
| `savedLearnSession.challenge` | Still parsed for old snapshots; no longer written from live state |
| Mobile `session.tsx` | Already did not use workingTier |

### Database columns deprecated

- Table `learn_challenge`, column `working_tier` (plus `momentum`,
  `recent_outcomes`). Not dropped. No new columns. Tier is computed at runtime
  from `country_stats.mastery_score` via `MASTERY_BANDS`.

### Fallback when a type cannot generate

Same-tier types are shuffled and tried until one returns a question. Then easier
tiers (T1 → T2 → T3 → T4). Last resort is `blank_map_click` (countries),
`capital_free_recall` (capitals), or typed flag name (flags). Islands with no
neighbor data skip neighbor types and still get a valid question. Brazil's
special T3 comparative is still preferred when that country's primary tier is T3.

### Test / Go! / Discover

Unaffected. `computeMasteryUpdate` still defaults `learnModeMultiplier` to 1.
Go! still uses `buildGoQueue`. Discover is a separate path in `GeographyGame`.

### Mastery stat shape (needs human verification)

`GET /api/mastery` returns `mapStatsToMasteryEntries`:
`{ countryId, level, masteryScore, graduated, lastAttemptAt, lastOutcome }`.
It does **not** include `firstTryCorrect` / `secondTryCorrect` / `neededReveal`.
First-exposure therefore uses `lastAttemptAt == null` as “zero attempts”.
A country with mastery 0 after misses has `lastAttemptAt` set, so it is T4
but `firstExposure` is false. Confirm this matches production rows.

---

## Domain-Level Mastery Tracking

Learn EMA is now stored per **skill domain** (location, neighbors, capital, flag,
statistics, facts) instead of one score per country. Catalog tiers, generators,
multipliers, graduation, %Worldly, and the mastery map are unchanged.

### Files created

- `packages/core/learn/domainMastery.js` — `buildDomainMasteryMap`,
  `getDomainMastery` (falls back to `general`, then 0), `getOverallMastery`
  (weighted average; legacy-only `general` used as-is), `coerceDomainMasteryMap`.
- `apps/web/lib/learn/domainMastery.js` — re-export.

### Files modified

- `packages/core/learn/questionTypes.js` — `SKILL_DOMAINS`,
  `QUESTION_TYPE_TO_DOMAIN`, `getDomainForQuestionType`,
  `getEligibleTypesForCategory`. Unmapped types warn in development and use
  location.
- `packages/core/learn/sessionSequencer.js` — type pick uses domain EMA vs
  catalog tier; `question.skillDomain` / `domainMasteryScore` / `firstExposure`.
- `packages/core/learn/emaIntegration.js` — POST payload includes `questionType`
  (server resolves domain; client does not send `skillDomain`).
- `apps/web/lib/db.js` — audit comment; `recordCountryPerformance` writes
  `skill_domain` (Learn from questionType, Test stays `general`); SELECTs return
  `skillDomain`.
- `apps/web/app/api/country-stats/route.js` — passes `questionType` through;
  GET weak-country path ignores non-`general` rows.
- `apps/web/scripts/setup-db.js` — `skill_domain` column + unique indexes.
- `packages/core/mastery.js` — `mapStatToMasteryEntry` includes `skillDomain`.
- `packages/core/worldlyScore.js` — skips non-`general` rows so %Worldly /
  mastery map stay Test/legacy based.
- `apps/web/components/GeographyGame.jsx` — Learn sampling uses
  `getOverallMastery`; passes full mastery rows into the sequencer.
- `packages/core/package.json` — export `./learn/domainMastery`.
- `apps/web/scripts/test-learn-mode.js` — domain map + type-coverage tests.

### Column added

`country_stats.skill_domain TEXT NOT NULL DEFAULT 'general'`

The old unique `(user_id, country_id, mode, level)` was converted to a
**partial** unique `WHERE skill_domain = 'general'` so domain rows can coexist.
A second partial unique covers `(user_id, country_id, mode, level, skill_domain)
WHERE skill_domain <> 'general'`.

### QUESTION_TYPE_TO_DOMAIN (actual ids)

| Domain | Types |
|---|---|
| location | blank_map_click, borderless_map_click, shape_drop, binary_map_choice, shape_identification, shape_name_entry, free_name_entry |
| neighbors | neighbor_confirm, neighbor_free_recall, neighbor_recall_all, neighbor_select_all, neighbor_identification, brazil_non_neighbors |
| capital | capital_free_recall, capital_matching |
| flag | flag_identification |
| statistics | population_compare, area_compare, gdp_compare, population_rank, area_rank, gdp_rank |
| facts | landlocked_check, language_family, religion_majority, religion_pie |

Legacy aliases (find_it_fill, religion, flag_color, …) are in the map but are
not live `QUESTION_TYPES` ids.

### Legacy `general` rows

Existing rows default to `general`. `getDomainMastery` uses them when a domain
row is missing. `getOverallMastery` returns the general score when it is the
only row. Test mode still upserts `general` only. Learn inserts/updates domain
rows and does not rewrite general rows.

### Graduation / %Worldly / mastery map

Unchanged. Domain graduation and domain %Worldly are not implemented.
`buildLevelScoreMap` ignores `skill_domain <> 'general'`.

### Types found that were not in the spec map

Mapped explicitly: `borderless_map_click`, `shape_name_entry`, `gdp_rank`,
`religion_majority`, `religion_pie`. Spec-only names that do not exist in
`QUESTION_TYPES` (find_it_fill, name_it_blank, flag_color, …) are aliases only.

### Assumptions

- One question per sampled country (a country with strong location and weak
  statistics will usually get the weaker *matching* domain’s question, not both
  in one session). Domain-tier matching still prefers catalog types whose tier
  equals the domain’s `MASTERY_BANDS` primary tier, so a high location EMA
  still yields Tier 1 location formats when those types generate.
- Test writes remain `skill_domain = 'general'` so Test EMA is unchanged.
- Domain rows start at mastery 0 (not seeded from the general row).
- `questionType` on the Learn POST is required for correct domain writes;
  missing type falls back to location.
- `firstExposure` is per domain: score 0 with no domain row and no legacy
  `general` row. Country-level attempt counts are only the fallback when the
  country has no domain map at all.

---

## Domain-Weighted Worldly Score System

Supersedes the notes above that Test writes `general` only, that %Worldly
ignores domain rows, and that the mastery map is unchanged. Graduation
**logic** is still unchanged; only the user-facing name is “Located.”

### 1. Files created

- `packages/core/learn/masteryTiers.js` — `getMasteryTier`, `domainScoresFromStats`, `getWeakestDomain`.
- `apps/web/lib/masteryTiers.js` — web re-export of the core tier helpers.
- `apps/web/components/CountryMasteryModal.jsx` — country tap modal (existing `modalOverlay` / `modalCard` pattern) with curved per-domain percents and weakest-domain CTA.
- `apps/web/scripts/test-worldly-score.js` — curve, tiers, contribution rates, `byDomain`, weakest-domain checks.

(`packages/core/learn/domainMastery.js` and `apps/web/lib/learn/domainMastery.js` were created in the prior domain-tracking step and now consume `WORLDLY_DOMAIN_WEIGHTS`.)

### 2. Files modified (this system)

- `packages/constants/index.js` — `GAME_MODES.NEIGHBORS`, `WORLDLY_DOMAIN_WEIGHTS`, `LEARN_CONTRIBUTION_RATE`, `WORLDLY_CURVE_BREAKPOINTS`, `WORLDLY_DOMAIN_THRESHOLD`, `MASTERY_TIERS` / colors / labels, `SKILL_DOMAIN_LABELS`.
- `packages/core/learn/questionTypes.js` — `DOMAINS_WITH_TEST_MODE`, `inferDomainFromMode`, `resolveSkillDomain`, `getLearnContributionRate`; neighbors in the domain map.
- `packages/core/worldlyScore.js` — domain-weighted `computeWorldlyScore` / `FromMastery` / `BeforeAfter`; `applyWorldlyCurve`; legacy `categories` still from `general` rows + `LEVEL_WEIGHTS`.
- `packages/core/learn/questionGenerator.js` — Test `neighbor_recall_all` allows one neighbor and can disable clues.
- `packages/core/mastery.js` — `groupMasteryEntriesByMode` includes `neighbors`; mastery entries keep `skillDomain`.
- `packages/core/regions.js` — `getModeLabel("neighbors")`.
- `apps/web/lib/db.js` — dual-write (domain row + `general` row) in one transaction; Learn extra rate via `getLearnContributionRate`; domain resolved server-side from `questionType` or inferred `mode`.
- `apps/web/app/api/country-stats/route.js` — still does not accept client `skillDomain`; passes `questionType`.
- `apps/web/app/api/mastery/all/route.js` — returns `score`, `percent` (curved), `rawPercent`, `categories`, `byDomain`, `byDomainDisplay` alongside existing `mastery`.
- `apps/web/app/api/leaderboard/route.js` — already called `computeWorldlyScoreFromMastery`; now picks up the new formula with no response-shape change.
- `apps/web/lib/countryStats.js` — empty `neighbors` bucket; `fetchAllMasteryStats` forwards worldly fields from the API.
- `apps/web/lib/masteryMap.js` — teal tier colors, Neighbors tab, `paintMode` tiers vs domain intensity.
- `apps/web/components/MasteryMap.jsx` — country tap `onSelect`; tier vs score paint.
- `apps/web/components/MasteryPage.jsx` — tier legend (Spotted / Located / Worldly), Neighbors picker, skills breakdown, tap modal.
- `apps/web/lib/milestones.js` — `region-located` (📍) and `region-worldly` (🌍 “Truly Worldly!”).
- `apps/web/components/GameCompleteModal.jsx` — Located copy; region-worldly detection from post-game mastery.
- `apps/web/components/HowItWorksPage.jsx` — Located copy; %Worldly explained with domain weights + curve.
- `apps/web/components/StartScreen.jsx` — Neighbors mode; Test starts at N1 with no level / Discover / Learn for this mode.
- `apps/web/lib/startNavigation.js` — Neighbors LEVEL URLs redirect to choose-type.
- `apps/web/components/GeographyGame.jsx` — Test — Neighbors session (`neighbor_recall_all`, no clues, islands pre-credited, dual-write via existing stats POST).
- `apps/web/lib/gameModeIntro.js` / `gameTutorial.js` — Neighbors copy.
- `apps/web/components/ResultsPage.jsx` — Neighbors scores/mastery table.
- `apps/web/components/AppHeader.jsx` — % Worldly from API `percent` (curved); refetches on navigation.
- `apps/web/package.json` — `test:learn` includes `test-worldly-score.js`.
- `packages/core/package.json` / `packages/core/index.js` — export `./learn/masteryTiers`.

`app/api/scores/route.js` already accepts any `GAME_MODES` value (text field, no enum) so `mode = 'neighbors'` needed no schema change.

### 3. `WORLDLY_DOMAIN_WEIGHTS`

| Domain | Weight | Why |
|---|---|---|
| location | 0.35 | Spine of the game (find/name on the map). |
| neighbors | 0.25 | Next hardest free-recall skill. |
| capital | 0.15 | Classic Test mode, narrower than location. |
| flag | 0.10 | Classic Test mode, recognition-heavy. |
| statistics | 0.10 | Learn-only comparative/rank skill. |
| facts | 0.05 | Learn-only trivia; smallest mix. |

Weights sum to 1.0. Missing domains score 0. Average is over **all** countries, not only attempted ones.

### 4. `LEARN_CONTRIBUTION_RATE`

Applied **at write time**, Learn only, as an extra multiplier on the existing Learn EMA multiplier. Test writes stay 1.0×. The 0.8× is **not** applied again at score time (that would double-penalize).

| Domain | Rate | Logic |
|---|---|---|
| location, capital, flag, neighbors | 0.8 | These have a Test mode; Learn should not farm %Worldly as fast as Test. |
| statistics, facts | 1.0 | No Test mode; Learn is the only way they move. |

`DOMAINS_WITH_TEST_MODE` is `location`, `capital`, `flag`, `neighbors`.

### 5. `WORLDLY_CURVE_BREAKPOINTS`

Piecewise-linear display curve. `applyWorldlyCurve(0.75) === 80` exactly.

| Raw | Display | Milestone |
|---|---|---|
| 0 | 0 | Unseen |
| 0.25 | 20 | Getting started |
| 0.50 | 45 | Developing |
| 0.75 | 80 | Located / worldly-domain bar |
| 1.00 | 100 | Worldly |

Header / API `percent` is this curved value (clamped 0–100). `rawPercent` is the uncured 0–100 average.

### 6. Mastery tiers

| Tier | Threshold | Map color |
|---|---|---|
| NONE (Unseen) | no `country_stats` rows | dark (`#1a2740`) |
| SPOTTED | any data | dark teal (`#0f766e`) |
| LOCATED | a **`general` row with `graduated === true`** | medium teal (`#2dd4bf`) |
| WORLDLY | location, capital, and neighbors all ≥ 0.75 | bright teal (`#5eead4`) |

WORLDLY outranks LOCATED. Islands with 0 land neighbors waive the neighbors bar (treated as 1). All / Countries tabs paint tiers; Capitals / Flags / Neighbors tabs paint that domain’s intensity. Country tap modal shows curved percents; weakest domain is the CTA.

### 7. Graduation logic — internally unchanged

- `country_stats.graduated` column name unchanged.
- `isEffectivelyGraduated()` unchanged.
- `MASTERY_GRADUATION_THRESHOLD` unchanged.
- Condition still: Test mode only, mastery ≥ 0.9, `fast_streak` ≥ 3.
- User-facing copy: “Graduated” → “Located”, “Region Mastered!” → “Region Located!” (📍). Milestone id is `region-located`.
- Neighbors Test can set `graduated = true` on the **neighbors** domain row (and the dual-written `general` row) under the same Test rules.

### 8. Question types without a domain mapping

Every live `QUESTION_TYPES` id is in `QUESTION_TYPE_TO_DOMAIN`. Extra aliases (`find_it_fill`, `flag_color`, `religion`, `neighbor_yes_no`, …) map too. A runtime string that is still missing falls back to **location** and logs a dev-only warning.

### 9. Known limitations / follow-up

- Domain “graduation” as a user-facing concept beyond Located (per-domain Located chips) is not built; only `general` graduation drives the Located tier.
- No Test — Statistics or Test — Facts modes.
- Neighbors Test skips Discover, Learn, and the F1/F2/N2 level picker (free recall only; starts at N1).
- Mobile has `GAME_MODES.NEIGHBORS` in shared constants but no Neighbors Test UI of its own.
- Go! session building is unchanged; Go! answers dual-write location + general at Learn’s 0.8× rate as a side effect.
- Worldly region milestone headline is **“Truly Worldly!”** (id `region-worldly`), not “Region Worldly!”.

### 10. Assumptions needing human verification

- Islands (0 neighbors) counting as Worldly-eligible without a neighbors score, and as pre-credited correct in Neighbors Test.
- Dual-write using the **same** applied multiplier on the domain row and the `general` row (so Test location mastery still lives on `general`).
- Learn 0.8× only at write time, not in `computeWorldlyScore`.
- AppHeader % Worldly uses the API’s curved `percent` and refetches on route change; staying on the in-game header until Home still shows the pre-session value until that remount.
- Extra wrong guesses on `neighbor_recall_all` still fail the round even if every neighbor is later named (existing MultiTextEntry behavior).
- `db:setup` remains idempotent; `graduated` column was not renamed.

---

## Neighbors — Reverted to Learn Only

Test — Neighbors is removed. Neighbor knowledge stays a Learn skill domain
(`skill_domain = 'neighbors'`). Existing `country_stats` rows are untouched.

### Audit (before the revert)

**1. Every place `'neighbors'` was added as a playable mode value**

| File | Where |
|---|---|
| `packages/constants/index.js` | `GAME_MODES.NEIGHBORS = "neighbors"` |
| `packages/core/regions.js` | `getModeLabel` branch for `GAME_MODES.NEIGHBORS` |
| `packages/core/learn/questionTypes.js` | `DOMAINS_WITH_TEST_MODE` included `SKILL_DOMAINS.NEIGHBORS`; `inferDomainFromMode` mapped the game mode |
| `packages/core/mastery.js` | `groupMasteryEntriesByMode` `neighbors: []` bucket |
| `packages/core/worldlyScore.js` | `flattenMastery` added `mastery.neighbors` |
| `apps/web/lib/startNavigation.js` | `VALID_MODES` from `GAME_MODES`; LEVEL step redirected neighbors to choose-type |
| `apps/web/lib/masteryMap.js` | `MASTERY_MODES`, `DOMAIN_TAB_TO_DOMAIN`, `MODE_VISUALS` |
| `apps/web/lib/countryStats.js` | `EMPTY_MASTERY_BY_MODE.neighbors` |
| `apps/web/lib/gameModeIntro.js` | Welcome / goal copy |
| `apps/web/lib/gameTutorial.js` | `getModeGoalLabel` → `"neighbor set"` |
| `apps/web/components/StartScreen.jsx` | Explore card, Discover/Learn hidden, Test starts at N1 |
| `apps/web/components/MasteryPage.jsx` | Neighbors tab + map |
| `apps/web/components/GeographyGame.jsx` | `startNeighborsTestGame` + Test intercept |
| `apps/web/components/ResultsPage.jsx` | Best-scores / mastery tables |
| `apps/web/components/GameCompleteModal.jsx` | `MASTERED_NOUNS.neighbors` |
| `apps/web/app/api/scores/route.js` | `VALID_MODES = Object.values(GAME_MODES)` (no hardcoded list) |
| `apps/web/app/api/country-stats/route.js` | same allowlist |
| `apps/web/app/api/learn-challenge/route.js` | same allowlist |
| `apps/web/app/api/mastery/all/route.js` | empty fallback `{ neighbors: [] }` |

`lib/levels.js` and `scripts/setup-db.js` never registered a neighbors mode (`mode` is unconstrained TEXT).

**2. `game_scores` with `mode='neighbors'`:** COUNT = **0**. Not deleted.

Related (not deleted): `country_stats` has **28** rows with `mode='neighbors'` and **14** with `skill_domain='neighbors'`. **0** neighbors-domain rows have `graduated = true`.

**3. URL / start navigation:** `parseStartScreenSearchParams` accepted `mode=neighbors` via `GAME_MODES`. `normalizeStartScreenRoute` sent neighbors LEVEL URLs back to choose-type. After this revert, `mode=neighbors` is not in `VALID_MODES`, so it parses as `null` and choose-type without a mode redirects home. No crash.

**4. `DOMAINS_WITH_TEST_MODE`:** previously included `SKILL_DOMAINS.NEIGHBORS`. Removed.

**5. API allowlists:** scores, country-stats, and learn-challenge all used `Object.values(GAME_MODES)`, so `neighbors` was allowed. After removing `GAME_MODES.NEIGHBORS`, `POST /api/scores` with `mode='neighbors'` returns 400.

### Files changed in this revert

- `packages/constants/index.js` — removed `GAME_MODES.NEIGHBORS`; `LEARN_CONTRIBUTION_RATE.neighbors` is **1.0**.
- `packages/core/learn/questionTypes.js` — removed neighbors from `DOMAINS_WITH_TEST_MODE`. `SKILL_DOMAINS.NEIGHBORS` kept. `inferDomainFromMode("neighbors")` still maps leftover Test rows to the neighbors skill, not location.
- `packages/core/regions.js` — removed Neighbors label branch.
- `packages/core/worldlyScore.js` — still flattens leftover `mastery.neighbors` rows for % Worldly (string `"neighbors"`, not a game mode).
- `apps/web/lib/startNavigation.js` — removed neighbors LEVEL redirect.
- `apps/web/lib/masteryMap.js` — Neighbors tab visuals / `MASTERY_MODES` entry removed.
- `apps/web/lib/gameModeIntro.js` / `gameTutorial.js` — Test-Neighbors copy removed.
- `apps/web/components/StartScreen.jsx` — Explore is Countries / Capitals / Flags only.
- `apps/web/components/MasteryPage.jsx` — tabs are Countries / Capitals / Flags / All. Leftover `mode=neighbors` stats still feed country-tap domain scores.
- `apps/web/components/GeographyGame.jsx` — `startNeighborsTestGame` and Test intercept removed. Learn neighbor questions unchanged.
- `apps/web/components/ResultsPage.jsx` — Neighbors score/mastery tables removed.
- `apps/web/components/GameCompleteModal.jsx` — `MASTERED_NOUNS.neighbors` removed.
- `apps/web/components/HowItWorksPage.jsx` — neighbors listed as Learn-only (1.0×).
- `apps/web/scripts/test-worldly-score.js` — contribution-rate assertions updated.

### Confirmations

- `skill_domain='neighbors'` data in `country_stats` is untouched (no DELETE).
- `LEARN_CONTRIBUTION_RATE.neighbors` is **1.0** (`getLearnContributionRate` reads the hardcoded map, not `DOMAINS_WITH_TEST_MODE`).
- `game_scores` `mode='neighbors'` count: **0**.
- Domain weights unchanged (neighbors still 0.25 in `WORLDLY_DOMAIN_WEIGHTS`; the spec’s “0.20” was not the implemented value).

### Places the previous delivery notes did not list

`gameModeIntro.js`, `gameTutorial.js`, Results page tables, `GameCompleteModal` nouns, `startNavigation` LEVEL redirect, `masteryMap.js` tab palette, StartScreen Explore/home copy, `GeographyGame` Learn-engine hijack for Test, `generateNeighborRecallAll({ minNeighbors: 1, clueEligible: false })` Test options (generator itself kept for Learn).
