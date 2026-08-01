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
