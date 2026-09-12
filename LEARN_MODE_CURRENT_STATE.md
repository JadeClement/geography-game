# Learn Mode — Current State

Audited directly from source on 2026-09-12. This is a monorepo: `apps/web` (Next.js 15 App Router, the "web" workspace), `apps/mobile` (Expo/React Native — not audited here except where it touches shared packages), `packages/core` (`@worldly/core`, pure algorithm code), `packages/constants` (`@worldly/constants`, shared enums/thresholds/static data), `packages/api-client`. Every file under `apps/web/lib/*.js` that is Learn-relevant (`mastery.js`, `worldlyScore.js`, `learning.js`, `levels.js`, `masteryTiers.js`, `lib/learn/domainMastery.js`) is a one-line re-export shim (`export * from "@worldly/core/..."`) — the real implementation lives in `packages/core`. This doc cites the canonical `packages/core` file for logic and the `apps/web` file only for DB/API/UI.

No file named `apps/web/lib/learn/emaIntegration.js`, `apps/web/lib/learn/sessionSequencer.js`, `apps/web/lib/learn/questionGenerator.js`, `apps/web/lib/learn/factSelection.js`, `apps/web/lib/learn/sessionSummary.js`, `apps/web/lib/learn/continueNotes.js`, `apps/web/lib/learn/wrongReveal.js`, or `apps/web/lib/learn/resolveGuessedCountry.js` exists — these all live only at `packages/core/learn/*.js`. `apps/web/lib/learn/domainMastery.js` and `apps/web/lib/masteryTiers.js` DO exist, as re-export shims. `apps/web/lib/learn/recencySuppression.js` does not exist as a web-lib file; it lives at `packages/core/learn/recencySuppression.js`.

---

## Section 1 — Database schema

All schema is defined in `apps/web/scripts/setup-db.js` (raw `pg`, no ORM; the `/prisma` directory at the repo root exists but is empty — no Prisma schema file). Reproduced from the live `CREATE TABLE` / `ALTER TABLE` statements.

### `country_stats` (the mastery table)

```sql
CREATE TABLE country_stats (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_id            TEXT NOT NULL,        -- ISO3
  mode                  TEXT NOT NULL,        -- 'countries' | 'capitals' | 'flags'
  level                 TEXT NOT NULL,        -- 'F1' | 'F2' | 'N1' | 'N2'
  first_try_correct     INT NOT NULL DEFAULT 0,
  second_try_correct    INT NOT NULL DEFAULT 0,
  needed_reveal         INT NOT NULL DEFAULT 0,
  incorrect             INT NOT NULL DEFAULT 0,
  response_time_ms_sum  BIGINT NOT NULL DEFAULT 0,
  response_time_count   INT NOT NULL DEFAULT 0,
  mastery_score         REAL NOT NULL DEFAULT 0,     -- EMA, 0–1
  fast_streak           INT NOT NULL DEFAULT 0,
  speed_baseline_ms     INT,
  graduated             BOOLEAN NOT NULL DEFAULT false,   -- Test-mode graduation only
  last_attempt_at       TIMESTAMPTZ,
  last_outcome          TEXT,                  -- one of the 4 ROUND_OUTCOMES values
  last_correct_at       TIMESTAMPTZ,            -- added later (see migration below)
  last_correct_session  INTEGER,                -- added later (see migration below)
  skill_domain          TEXT NOT NULL DEFAULT 'general',  -- added later
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Unique-key history (all present in the live schema, applied as sequential `ALTER`s):
- Original: `UNIQUE (user_id, country_id, mode, level)`.
- That constraint was dropped (`DROP CONSTRAINT IF EXISTS country_stats_user_id_country_id_mode_level_key`) and replaced with two **partial** unique indexes so a country can have both one legacy "general" row and one row per skill domain:
  ```sql
  CREATE UNIQUE INDEX country_stats_general_unique_idx
    ON country_stats (user_id, country_id, mode, level)
    WHERE skill_domain = 'general';
  CREATE UNIQUE INDEX country_stats_domain_unique_idx
    ON country_stats (user_id, country_id, mode, level, skill_domain)
    WHERE skill_domain <> 'general';
  ```
- Indexes: `country_stats_user_lookup_idx (user_id, mode, level)`, `country_stats_domain_lookup_idx (user_id, mode, level, skill_domain)`, `country_stats_recency_idx (user_id, mode, level, last_correct_session) WHERE last_correct_session IS NOT NULL`.

Every column exists in the live schema (all via `IF NOT EXISTS` migrations, so nothing here is "planned but not added").

`skill_domain` values actually written: `location`, `neighbors`, `capital`, `flag`, `statistics`, `facts`, or the legacy default `general`. See Section 3.

### `country_attempts` (raw attempt log)

```sql
CREATE TABLE country_attempts (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_id         TEXT NOT NULL,
  mode               TEXT NOT NULL,
  level              TEXT NOT NULL,
  game_type          TEXT NOT NULL,      -- 'test' | 'learning' | 'review'
  outcome            TEXT NOT NULL,
  response_time_ms   INT,
  question_tier      TEXT,               -- added later: 'tier_1'..'tier_4', Learn only
  predicted_success  REAL,               -- added later: 0–1, Learn only
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

One row is inserted per answer, in every game type (Test and Learn). `question_tier` / `predicted_success` are only populated for Learn answers (Test never sends them, so they are `NULL` on Test rows).

### `learn_challenge` — **deprecated, schema-only**

```sql
CREATE TABLE learn_challenge (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode             TEXT NOT NULL,
  region           TEXT NOT NULL,
  working_tier     SMALLINT NOT NULL DEFAULT 4,
  momentum         SMALLINT NOT NULL DEFAULT 0,
  recent_outcomes  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode, region)
);
```
The `CREATE TABLE` is annotated in the schema file itself: *"deprecated — superseded by per-country EMA tier selection... application code no longer reads or writes this table on the live path."* Confirmed by grep: the only code that reads/writes it is `GET`/`POST /api/learn-challenge` (also self-labeled deprecated) and `deleteUserPracticeData`, which still deletes a user's rows on data reset. **No component in `apps/web/components` ever calls the client wrappers (`fetchLearnChallenge`, `saveLearnChallenge` in `apps/web/lib/countryStats.js`) that would reach this table** — confirmed via repo-wide grep of `apps/web/components/GeographyGame.jsx` and every file in `apps/web/components/learn/`: zero matches for `fetchLearnChallenge`, `saveLearnChallenge`, `updateChallengeLevel`, or `learn-challenge`.

### `facts_seen` (Learn fact rotation)

```sql
CREATE TABLE facts_seen (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_id  TEXT NOT NULL,
  fact_index  INT NOT NULL,     -- index into that country's facts[] array in the manifest
  seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, country_id, fact_index)
);
```
Exists and is fully wired on the **read** side; the **write** side (the only function that inserts into it, `markFactSeen` in `apps/web/lib/learn/factsClient.js` → `POST /api/learn-facts`) has zero call sites anywhere in `apps/web/components`. See Section 11 — in practice this table is never populated by real users today.

### `practice_sessions` (daily streak log — not Learn-specific)

```sql
CREATE TABLE practice_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practiced_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, practiced_at)
);
```
One row per calendar day (upsert via `ON CONFLICT DO NOTHING`), used only for the day-streak (`getStreakForUser`), not the Learn session counter below.

### `users` columns relevant to Learn

```sql
ALTER TABLE users ADD COLUMN total_sessions INTEGER NOT NULL DEFAULT 0;
```
Comment in the migration: *"Global session counter on users. Increments every time any session completes regardless of mode or region."* This is **not** Learn-specific — it increments on Test, Learn, and Discover session completion alike (see Section 7 and Section 12 for exactly where). No other Learn-specific column exists on `users` (no per-mode/region counters, no "learn streak").

### Other tables touched incidentally (not Learn-specific, listed for completeness since Learn mode reads/writes them)
- `game_scores` — Test-mode-only best score per (user, mode, region, level); Learn mode never writes here (see Section 12).
- `friend_requests`, `user_friends`, `push_tokens` — unrelated to Learn's algorithm; `push_tokens` is written to by push-notification code triggered from the same `POST /api/country-stats` handler that Learn answers hit (fire-and-forget, not part of the mastery pipeline).

---

## Section 2 — Outcome values

Defined once, in `packages/constants/index.js`:

```js
export const ROUND_OUTCOMES = {
  FIRST_TRY_CORRECT: "first_try_correct",
  SECOND_TRY_CORRECT: "second_try_correct",
  NEEDED_REVEAL: "needed_reveal",
  INCORRECT: "incorrect",
};
```

Four **distinct** values — `incorrect` and `needed_reveal` are not collapsed into each other anywhere. Column comment in `apps/web/lib/db.js`: *"A miss without reveal is stored as `incorrect`."*

How each is produced, per `packages/core/learn/emaIntegration.js` `outcomeFromEvent({ correct, revealUsed, priorMiss })`:

```js
export function outcomeFromEvent({ correct, revealUsed, priorMiss } = {}) {
  if (revealUsed) return ROUND_OUTCOMES.NEEDED_REVEAL;
  if (correct && priorMiss) return ROUND_OUTCOMES.SECOND_TRY_CORRECT;
  if (correct) return ROUND_OUTCOMES.FIRST_TRY_CORRECT;
  return ROUND_OUTCOMES.INCORRECT;
}
```

- `first_try_correct`: the answer event has `correct: true`, `priorMiss` falsy, and `revealUsed` falsy. This is the only outcome that can advance `fast_streak` and lead to graduation (Test mode only, see Section 5).
- `second_try_correct`: `correct: true` AND `priorMiss: true` (the learner got it right after an earlier miss on the same question) AND no reveal was used.
- `needed_reveal`: `revealUsed` is truthy, regardless of `correct`/`priorMiss`. In the live UI, `revealUsed` is set by `MultiTextEntryQuestion`'s "Give up" button (the only reveal path actually wired to a UI control today — see Section 15 on the clue ladder).
- `incorrect`: a complete miss — wrong, and no reveal was used. This is a genuinely new 4th value (older code, per comments in `packages/core/mastery.js`, used to fold this case into `second_try_correct`'s penalty branch; it is now its own tracked column/outcome, with its own EMA penalty branch that happens to use the same numeric penalty as `second_try_correct` — see Section 6).

`hasEverStruggled()` (`packages/core/mastery.js`) — used to decide Learn eligibility — checks `secondTryCorrect > 0 || neededReveal > 0 || incorrect > 0`, so all three "not a clean first try" outcomes count as struggling.

---

## Section 3 — Skill domains

Implemented, live, and dual-written on every answer (Test and Learn alike).

### Domains (`packages/core/learn/questionTypes.js`)

```js
export const SKILL_DOMAINS = {
  LOCATION: "location",
  NEIGHBORS: "neighbors",
  CAPITAL: "capital",
  FLAG: "flag",
  STATISTICS: "statistics",
  FACTS: "facts",
};
export const DEFAULT_SKILL_DOMAIN = SKILL_DOMAINS.LOCATION;
export const DOMAINS_WITH_TEST_MODE = [LOCATION, CAPITAL, FLAG];
```

Plus the legacy value `"general"` used for the pre-domain rows written by Test mode and for the dual-write "general" mirror row (below). There is **no** finer sub-domain grouping (no `location_cued` / `location_pure` etc.) anywhere in the codebase — grep for those exact strings returns nothing. The live system is the coarse 6-domain set above (7 counting `general`).

### `QUESTION_TYPE_TO_DOMAIN` — full map (`packages/core/learn/questionTypes.js`)

```js
export const QUESTION_TYPE_TO_DOMAIN = {
  // location
  blank_map_click: LOCATION, borderless_map_click: LOCATION, shape_drop: LOCATION,
  binary_map_choice: LOCATION, shape_identification: LOCATION, shape_name_entry: LOCATION,
  free_name_entry: LOCATION,
  // legacy aliases (not live QUESTION_TYPES ids, kept for old data): find_it_fill,
  // find_it_blank, borderless_map, shape_name, name_it_fill, name_it_blank → LOCATION

  // neighbors
  neighbor_confirm: NEIGHBORS, neighbor_free_recall: NEIGHBORS, neighbor_recall_all: NEIGHBORS,
  neighbor_select_all: NEIGHBORS, neighbor_identification: NEIGHBORS, brazil_non_neighbors: NEIGHBORS,
  neighbor_yes_no: NEIGHBORS, // legacy alias, not a live id

  // capital
  capital_free_recall: CAPITAL, capital_matching: CAPITAL, country_from_capital: CAPITAL,

  // flag
  flag_identification: FLAG, country_from_flag: FLAG, flag_free_recall: FLAG,
  flag_color: FLAG, // legacy alias, not a live id

  // statistics
  population_compare: STATISTICS, area_compare: STATISTICS, gdp_compare: STATISTICS,
  population_rank: STATISTICS, area_rank: STATISTICS, gdp_rank: STATISTICS,
  neighbor_count_compare: STATISTICS, // legacy alias, not a live id

  // facts
  landlocked_check: FACTS, language_family: FACTS, religion_majority: FACTS,
  religion_pie: FACTS, region_grouping: FACTS, region_identification: FACTS,
  religion: FACTS, // several legacy aliases, not live ids
};
```
Every one of the 29 live `QUESTION_TYPES` ids (Section 4) has an entry. An unmapped id falls back to `DEFAULT_SKILL_DOMAIN` ("location") and logs a `console.warn` in non-production only (`getDomainForQuestionType`).

`inferDomainFromMode(mode)`: `capitals` → `capital`, `flags` → `flag`, the literal string `"neighbors"` (a leftover Test-mode "mode" value, not a `GAME_MODES` constant) → `neighbors`, everything else (including `"countries"`) → `location`. Used when a stat row has no `questionType` context (Test mode, or the dual-write "general" row).

### Are domain rows actually written? Yes — confirmed in `apps/web/lib/db.js` `recordCountryPerformance`:

```js
const skillDomain = resolveSkillDomain({ questionType, mode });   // server-resolved, never trusts a client skillDomain field
const isLearn = gameType === "learning";
const contributionRate = isLearn ? getLearnContributionRate(skillDomain) : 1;
const appliedMultiplier = learnModeMultiplier * contributionRate;   // (clamped/defaulted)

const domainStat = await upsertStatRow(statId, skillDomain, appliedMultiplier);
const generalStat = skillDomain === "general"
  ? domainStat
  : await upsertStatRow(randomUUID(), "general", appliedMultiplier);   // dual write
```
Every answer writes **two** rows when the resolved domain isn't already `general`: one at the specific domain (`location`/`neighbors`/`capital`/`flag`/`statistics`/`facts`) and one mirrored at `general` (both get the same `appliedMultiplier`). Test-mode answers resolve to `general`/`location`/`capital`/`flag` via `inferDomainFromMode(mode)` since they never send a `questionType`, so a Test answer in Countries mode still writes to `general` only once (domain resolves to `location`, but then the code's `skillDomain === "general"` check — wait: `resolveSkillDomain` for Test mode with no `questionType` returns `inferDomainFromMode(mode)`, e.g. `location` for Countries — so Test-mode Countries answers ALSO dual-write a `location` domain row plus a `general` row. This is confirmed by `HowItWorksPage.jsx` copy: *"domains that also have a Test mode (location, capital, flag)"* — implying Test mode's three modes each populate one of the three "has-a-Test-mode" domains, at `LEARN_CONTRIBUTION_RATE` 1.0 (Test is not scaled by the Learn 0.8x rate — that rate only applies `if (isLearn)`).

`LEARN_CONTRIBUTION_RATE` (`packages/constants/index.js`):
```js
export const LEARN_CONTRIBUTION_RATE = {
  location: 0.8, neighbors: 1, capital: 0.8, flag: 0.8, statistics: 1, facts: 1,
};
```
Comment: *"Neighbors, comparisons, and facts have no Test, so Learn is the only way they move (1.0x)."* This rate multiplies `learnModeMultiplier` only when `gameType === "learning"`.

---

## Section 4 — Question types

29 ids, defined in `packages/constants/index.js` `QUESTION_TYPES`, all with a **fully implemented, non-stubbed generator** in `packages/core/learn/questionGenerator.js` (`QUESTION_GENERATORS` dispatch table has exactly 29 entries, one per id — verified by counting both objects). Every generator can return `null` for a specific country when it can't build a valid question (documented per-type below); the sequencer treats `null` as "try the next candidate type," never as "drop the country."

For each: id / tier / domain / eligible categories (`categories` field on the type) / what it asks / answer format / generator completeness.

| id | tier | domain | categories | asks | answerType | notes / null conditions |
|---|---|---|---|---|---|---|
| `blank_map_click` | tier_3 | location | countries | "Find X on the map." | `map_click` | Always buildable; also the universal fallback question (see Section 8.6). |
| `borderless_map_click` | tier_1 | location | countries | "Where is X?" (no borders shown) | `map_click` | Scored by distance, not click-inside (Section 10.7). Always buildable. |
| `shape_drop` | tier_1 | location | countries | Drag country's outline onto a borderless map | `shape_drop` | `null` if `isShapeEligible` fails (area < 1000 km²: "specks and city-states don't make a readable isolated silhouette"). |
| `free_name_entry` | tier_2 | location | countries | "What country is highlighted?" | `text_entry` | Always buildable. |
| `capital_free_recall` | tier_2 | capital | capitals | "What is the capital of X?" | `text_entry` | `null` if no capital string. |
| `flag_free_recall` | tier_2 | flag | countries, capitals, flags | "Which country has this flag? Type its name." | `text_entry` | Always buildable. |
| `shape_name_entry` | tier_1 | location | countries | "What country is this shape?" (isolated outline, no map context) | `text_entry` | `null` if not shape-eligible (area < 1000 km²). |
| `neighbor_recall_all` | tier_1 | neighbors | countries (`requires: ["neighbors"]`) | "Name every country that borders X." | `multi_text_entry` | `null` if fewer than `minNeighbors` (default 2; Learn requires ≥2, comment notes Test-Neighbors allows 1) real neighbors resolve in the manifest. |
| `neighbor_free_recall` | tier_2 | neighbors | countries (`requires: ["neighbors"]`) | "Name a country that borders X." (any one neighbor accepted) | `text_entry` | `null` if zero resolvable neighbors. |
| `shape_identification` | tier_2 | location | countries | "Which shape is X?" — 4-option outline picker | `multiple_choice` | `null` if not shape-eligible or fewer than 1 same-region shape-eligible distractor exists. |
| `flag_identification` | tier_3 | flag | flags | "Which flag belongs to X?" — 4-option flag picker | `multiple_choice` | `null` if no same-region distractor country exists. |
| `country_from_flag` | tier_3 | flag | countries, capitals, flags | "Which country has this flag?" — 4-option country-name picker | `multiple_choice` | `null` if fewer than 3 distractors available (same-region first, other-region fill). |
| `capital_matching` | tier_3 | capital | capitals | "What is the capital of X?" — 4-option capital-name picker | `multiple_choice` | `null` if no capital, or no same-region distractor with a capital. |
| `country_from_capital` | tier_4 | capital | countries, capitals, flags | "Which country has the capital {name}?" — 4-option country picker | `multiple_choice` | `null` if no capital, or fewer than 3 distractors with capitals. |
| `neighbor_confirm` | tier_3 | neighbors | countries (`requires: ["neighbors"]`) | "Does X share a border with Y?" (coin-flip true/false pairing) | `yes_no` | `null` if X has zero neighbors (island — "trivial no"), or (on the false branch) no same-region non-neighbor exists. |
| `neighbor_select_all` | tier_2 | neighbors | countries (`requires: ["neighbors"]`) | "Which countries border X?" — select every correct one from a padded 9-option grid | `multi_select` | `null` if fewer than 2 real neighbors, or zero distractors can be found (nearest same-region non-borders by land-hop distance). |
| `population_compare` | tier_3 | statistics | countries, capitals, flags | "Which country has the larger population?" | `binary_choice` | `null` if no numeric population, or no in-ratio-band peer (see comparison-clusters below). |
| `area_compare` | tier_3 | statistics | " | "Which country is larger in land area?" | `binary_choice` | Same null conditions, on `area`. |
| `gdp_compare` | tier_3 | statistics | " | "Which country has the larger GDP?" | `binary_choice` | Same, on `gdp`. Vatican is the only enabled country with no GDP figure (per `comparison-clusters.js` audit comment) so it never gets this type. |
| `population_rank` | tier_3 | statistics | " | "Rank these countries from most to least populous." | `drag_to_rank` | `null` unless ≥4 same-region countries with a positive value exist and a spaced 5-set (or 4 if the region is smaller) with no duplicate values and no blocked pair can be built. |
| `area_rank` | tier_3 | statistics | " | Same, on `area`, "largest to smallest." | `drag_to_rank` | Same construction rules. |
| `gdp_rank` | tier_2 | statistics | " | Same, on `gdp`. | `drag_to_rank` | Same construction rules. |
| `neighbor_identification` | tier_3 | neighbors | countries (`requires: ["neighbors"]`) | "Which country borders X?" — 4-option picker | `multiple_choice` | `null` if zero resolvable neighbors. |
| `binary_map_choice` | tier_4 | location | countries | "Which country is highlighted on the map?" — pick between 2 named options | `binary_choice` | `null` if no same-region distractor exists. |
| `landlocked_check` | tier_4 | facts | countries, capitals, flags | "Is X landlocked?" | `yes_no` | `null` if `landlocked` isn't a boolean in the manifest, if the country is Palestine (`PSE`, contested coastline — explicitly skipped), or if it's an island with 0 neighbors and `landlocked === false` (trivial). |
| `language_family` | tier_2 | facts | " (`requires: ["languages"]`) | "Which language is most commonly spoken in X?" | `multiple_choice` | East Timor (`TLS`) is a special case accepting any of 5 named languages. Otherwise `null` if no languages listed or zero distractor languages found in-region. |
| `religion_majority` | tier_2 | facts | " (`requires: ["religions"]`) | "What is the most common religion in X?" | `multiple_choice` | Accepts 2 answers when the top two are within 20 points and the second is ≥40%. `null` if no non-"Other" majority religion, or zero distractors. |
| `religion_pie` | tier_1 | facts | " (`requires: ["religions"]`) | "Match the religious makeup of X." — drag pie slice boundaries | `drag_pie` | `null` unless 2–4 religions each ≥8% share exist and their total is ≥50%. |
| `brazil_non_neighbors` | tier_2 | neighbors | countries | "Which South American countries do NOT border Brazil?" | `multi_select` | Generates **only** for Brazil (`cid(country) !== "BRA"` → `null`); `null` if fewer than 2 other South American countries. |

All 29 IDs are used as `emaMultiplierKey`/`tier` inputs to `resolveLearnEmaMultiplier` in Section 6.

---

## Section 5 — MASTERY_BANDS

```js
export const MASTERY_BANDS = [
  { id: "new",         min: 0.0, tiers: [QUESTION_TIERS.TIER_4] },
  { id: "developing",  min: 0.3, tiers: [QUESTION_TIERS.TIER_3, QUESTION_TIERS.TIER_4] },
  { id: "proficient",  min: 0.5, tiers: [QUESTION_TIERS.TIER_2, QUESTION_TIERS.TIER_3] },
  { id: "advanced",    min: 0.7, tiers: [QUESTION_TIERS.TIER_1, QUESTION_TIERS.TIER_2] },
  { id: "mastered",    min: 0.9, tiers: [QUESTION_TIERS.TIER_1] },
];
```

Boundary comparison in `getMasteryBand` (`packages/core/learn/questionTypes.js`):
```js
let band = MASTERY_BANDS[0];
for (const candidate of MASTERY_BANDS) {
  if (score >= candidate.min) band = candidate;
}
```
Comparisons are **`>=` (greater-or-equal)**, and bands are scanned in ascending `min` order, always taking the *last* (highest) band whose `min` the score clears. So a score of exactly `0.3` lands in `developing`, exactly `0.9` lands in `mastered`. The "primary" (harder) tier for a mastery score is `band.tiers[0]` (`getPrimaryTierForMastery`) — e.g. `developing` → `tier_3`, `advanced` → `tier_1`.

`TRIVIAL_MASTERY = 0.92` is a separate constant used only inside `selectQuestionForCountry`'s trivial-skip rule (Section 8.5) — not a `MASTERY_BANDS` entry.

---

## Section 6 — EMA multipliers

```js
export const LEARN_EMA_MULTIPLIERS = {
  tier_1_correct_fast: 1.0,
  tier_1_correct_slow: 1.0,
  tier_1_wrong:        1.0,
  tier_1_reveal:       1.0,
  tier_2_correct_fast: 0.6,
  tier_2_correct_slow: 0.6,
  tier_2_wrong:        0.5,
  tier_3_correct:      0.3,
  tier_3_wrong:        0.2,
  tier_4_correct:      0.15,
  tier_4_wrong:        0.1,
};
```
Note there is no `tier_2_reveal` key — `resolveLearnEmaMultiplier`/`resolveMultiplierKey` map a Tier 2 reveal to `tier_2_wrong` (comment in `emaIntegration.js`: *"no separate tier_2_reveal key in the table"*). Tiers 3 and 4 don't distinguish fast/slow or reveal at all — only `_correct` / `_wrong`.

Key resolution (`packages/core/learn/questionTypes.js` `resolveLearnEmaMultiplier(tier, outcome, { fast })`, mirrored exactly in `emaIntegration.js` `resolveMultiplierKey` so the logged key and applied multiplier never diverge):
```js
switch (tier) {
  case TIER_1:
    if (isCorrect) return fast ? m.tier_1_correct_fast : m.tier_1_correct_slow;
    if (isReveal)  return m.tier_1_reveal;
    return m.tier_1_wrong;
  case TIER_2:
    if (isCorrect) return fast ? m.tier_2_correct_fast : m.tier_2_correct_slow;
    return m.tier_2_wrong;
  case TIER_3:
    return isCorrect ? m.tier_3_correct : m.tier_3_wrong;
  case TIER_4:
    return isCorrect ? m.tier_4_correct : m.tier_4_wrong;
  default:
    return 1.0;
}
```
`isCorrect` here means `outcome === ROUND_OUTCOMES.FIRST_TRY_CORRECT` specifically — `second_try_correct` and `incorrect` both fall into the "wrong" branch of their tier (same multiplier value as a clean miss).

### How `learnModeMultiplier` reaches the EMA formula

`computeMasteryUpdate(stat, { outcome, responseTimeMs, gameType, learnModeMultiplier = 1 })` in `packages/core/mastery.js`:
```js
const emaMultiplier = Number.isFinite(learnModeMultiplier) && learnModeMultiplier >= 0
  ? learnModeMultiplier : 1;   // non-finite/negative → neutral 1.0 (Test-equivalent)

if (outcome === FIRST_TRY_CORRECT) {
  mastery += emaMultiplier * MASTERY_EMA_FAST(0.2 or SLOW 0.08) * (1 - mastery);
} else if (outcome === SECOND_TRY_CORRECT) {
  mastery = max(0, mastery - emaMultiplier * MASTERY_PENALTY_SECOND(0.15));
} else if (outcome === INCORRECT) {
  mastery = max(0, mastery - emaMultiplier * MASTERY_PENALTY_SECOND(0.15));  // same constant as second_try_correct
} else if (outcome === NEEDED_REVEAL) {
  mastery = max(0, mastery - emaMultiplier * MASTERY_PENALTY_REVEAL(0.35));
}
mastery = clamp(mastery, 0, 1);
```
So `learnModeMultiplier` (the resolved `LEARN_EMA_MULTIPLIERS` value, itself then further scaled by `LEARN_CONTRIBUTION_RATE` for the domain — see `apps/web/lib/db.js`) uniformly scales *both* the gain-toward-1 term on a correct answer and the flat penalty on a miss/reveal. Test mode never sends `learnModeMultiplier`, so it defaults to `1` and behaves exactly as before (`packages/core/learn/questionTypes.js` test: *"Test-mode EMA (no multiplier) equals Tier 1 Learn multiplier (1.0)"*).

`fastStreak` and `graduated` are **only** ever advanced/reset by the raw `outcome`, gated on `gameType === GAME_TYPE_FOR_STATS.TEST` — Learn-mode answers (`gameType: "learning"`) never set `graduated = true` and never build `fast_streak`, regardless of tier or multiplier. (`GAME_TYPE_FOR_STATS = { TEST: "test", LEARNING: "learning", REVIEW: "review" }`.)

### Partial credit for set-answer question types

`emaIntegration.js` `NEIGHBOR_SET_QUESTION_TYPES = new Set(["neighbor_recall_all", "neighbor_select_all", "brazil_non_neighbors"])`. For these, `neighborSetCredit({ correctIds, selectedIds, extraCount })` computes `hits/total`, then shrinks it by `total/(total+extras)` if the learner over-selected (e.g. 4/6 hits with 0 extras → 2/3 credit; 6/6 hits with 2 extras → 6/8 credit). If the credit is a genuine partial (`0 < credit < 1`) and the raw event wasn't already `correct`, `buildLearnStatPayload` **rewrites the event as a synthetic slow-first-try correct** (`correct:true, revealUsed:false, priorMiss:false, fast:false`) before resolving the EMA key, then multiplies the resolved multiplier by `setCredit`. Comment: *"Partial set credit is a slow first-try so fast-streak does not advance"* (moot for Learn since Learn already never advances fast-streak, but the payload sets `responseTimeMs: null` for these).

### Distance-based partial penalty for map-guess misses

For a wrong, non-revealed answer carrying a finite `distanceKm` (borderless map click / shape drop misses), the multiplier is instead scaled by `distancePenaltyScale(distanceKm) = 1 - exp(-km/400)` (`packages/core/learn/mapGuess.js`) — a 20 km miss scales to ≈0.05× the tier's wrong-multiplier, a 3,000 km miss scales to ≈1×.

### Ranking questions write one payload per country

`buildLearnStatPayloads(event, session)`: if the event carries `countryUpdates` (only `RankQuestion`/`drag_to_rank` populates this), it emits one full `buildLearnStatPayload` call per listed country (each with its own `correct` flag from `update.correct`), instead of a single payload for the primary `countryId`. `distanceKm` is explicitly stripped (`undefined`) on these per-country payloads.

---

## Section 7 — Session building (country selection)

Implemented across `packages/core/learning.js` (sampling/pool math) and `apps/web/components/GeographyGame.jsx` `buildLearnEngineData` (orchestration, ~lines 1951–2053).

### 7.1 — The pool

**All countries in the chosen region** (`filterCountriesByRegion(allCountries, region)`), *not* only ones previously missed and *not* only "weak" ones by any hard cutoff — every region country enters the weighting pool, including ones with zero attempts (mastery treated as 0). This is a deliberate change from the old (pre-domain) Learn implementation, which required `hasEverStruggled()` to even be eligible; the live `buildFullRegionLearningQueue` takes the full region roster.

### 7.2 — Exact sampling weight formula

`getSamplingWeight(stat, currentSessionNumber, now)` in `packages/core/learn/recencySuppression.js`:
```js
const baseWeight = Math.pow(1 - masteryScore, 2) + 0.05;
const modifier = getRecencyModifier(stat, currentSessionNumber, now);
if (modifier === 0) return 0;      // graduated-territory exclusion
return baseWeight * modifier;
```
`getRecencyModifier` — full hybrid session+time suppression, thresholds by mastery band:
```js
const SUPPRESSION_THRESHOLDS = [
  { maxMastery: 0.30, sessions: 0,        hours: 0   },
  { maxMastery: 0.50, sessions: 1,        hours: 8   },
  { maxMastery: 0.65, sessions: 2,        hours: 16  },
  { maxMastery: 0.75, sessions: 3,        hours: 24  },
  { maxMastery: 0.85, sessions: 5,        hours: 48  },
  { maxMastery: 0.90, sessions: 8,        hours: 96  },
  { maxMastery: Infinity, sessions: Infinity, hours: Infinity },   // mastery ≥ 0.90 → excluded entirely (returns 0)
];
```
Logic (exact):
1. If `lastOutcome` is `null`/`needed_reveal`/`incorrect` → return `1.0` (no suppression; a miss/reveal means the country should come back soon).
2. If `lastCorrectAt` or `lastCorrectSession` is missing → return `1.0`.
3. Look up the mastery band's `{sessions, hours}` thresholds.
4. If both threshold values are `0` (the `< 0.30` band) → return `1.0` (no suppression floor for very weak countries).
5. If the band's thresholds are `Infinity` (mastery ≥ 0.90) → return `0` (excluded from the pool — this is the "graduated territory" the sampling weight comment refers to; note this is a *decayless* 0.90 raw-mastery cutoff on the domain-specific EMA, unrelated to the separate Test-mode `graduated` boolean / `isEffectivelyGraduated` decay system in `packages/core/mastery.js`).
6. Otherwise compute `sessionsSince = max(0, currentSessionNumber - lastCorrectSession)` and `hoursSince = (now - lastCorrectAt) / 3.6e6`. If **either** `sessionsSince >= thresholds.sessions` or `hoursSince >= thresholds.hours` has cleared → return `1.0` (either condition clearing lifts suppression).
7. Otherwise both are still active: `progress = min(sessionsSince/thresholds.sessions, hoursSince/thresholds.hours)` (the more-suppressed, i.e. smaller-progress, dimension binds). Then:
   - `second_try_correct` (weak correct): `0.50 + 0.50 * progress` (ranges 0.50 → 1.0).
   - `first_try_correct` (strong correct): `0.05 + 0.95 * progress` (ranges 0.05 → 1.0).

### 7.3 — Recency suppression is fully implemented (not a stub)

Confirmed above, plus 22 dedicated unit tests in `apps/web/scripts/test-recency.js` (e.g. *"first-try at one Learn half-life has recency 0.5"*, *"getSamplingWeight returns 0 for mastery 0.92 with a recent correct"*). Note this table-driven session+time hybrid model is **separate from and in addition to** an older exponential half-life recency multiplier (`getRecencyMultiplier` in `packages/core/mastery.js`, `hours/(hours+halfLifeHours)`) which still exists and is used specifically by the Go! session builder (`GO_RECENCY_HALF_LIFE_HOURS = 8`) and by `pickRecencyWeightedIds` — Learn sessions use `getSamplingWeight`/`getRecencyModifier` exclusively, not `getRecencyMultiplier`.

### 7.4 — Session counter (`total_sessions`) exists and is Learn-relevant but not Learn-exclusive

`users.total_sessions` (Section 1) is read via `getUserTotalSessions` and incremented via `incrementSessionCount` (`apps/web/lib/db.js`), exposed through `GET`/`POST /api/streak`. `GeographyGame.jsx` maintains `currentSessionNumberRef`, refreshed:
- On mount, via `GET /api/streak` (whenever `signedIn` becomes true).
- At the start of every Learn session, via `buildLearnEngineData`'s `fetchMasteryStats` call (`GET /api/mastery` also returns `totalSessions`).
- On session completion, via `markSessionComplete()` → `completeSession()` → `POST /api/streak`, which **unconditionally** increments `total_sessions` (not gated on whether a new calendar day was recorded). `markSessionComplete` itself is idempotent per game instance (`sessionCountedRef` guard) and is called from **three** places: Test-mode `finishGame` (line ~1385), Learn-mode `finishLearnGame` (line ~2056), and Discover-mode completion (line ~4062). So `total_sessions` — and therefore the `currentSessionNumber` fed into `getSamplingWeight`/`getRecencyModifier` — is a global counter across all three game types, not a Learn-only session count.

### 7.5 — Session size

```js
export const DEFAULT_LEARN_SESSION_SIZE = 20;
export const MIN_LEARN_SESSION_SIZE = 5;
export const MAX_LEARN_SESSION_SIZE = 100;
```
User-adjustable, persisted client-side only (`apps/web/lib/learnSessionSize.js`, `localStorage` key `worldly:learnSessionSize`, clamped to `[5, 100]` on read and write, dispatches a same-tab custom event `geography:learn-session-size-change` plus listens to the cross-tab `storage` event so other open tabs update). No server-side record of the user's preferred size. `buildLearnEngineData` calls `clampLearnSessionSize(learningSessionSize ?? getLearnSessionSize())`.

### 7.6 — Fewer eligible countries than the session size

`buildSampledPool(stats, sessionSize, currentSessionNumber, now)` in `packages/core/learning.js`:
1. Weight every stat via `getSamplingWeight`.
2. `eligible = weighted.filter(w => w.weight > 0)`.
3. `count = min(requested, eligible.length)` — weighted-sample that many without replacement.
4. **Backfill**: if the weighted sample came up short of the originally requested count (it can't, by construction, unless `eligible.length < requested` — this is the actual shortfall path), pull additional countries from the remaining eligible pool (weight > 0, not already sampled), **sorted by oldest `lastAttemptAt` first** (nulls sort first, i.e. never-attempted countries backfill before recently-attempted ones), until either the requested count is reached or eligible countries run out.
5. If the whole region is smaller than the session size (or heavily graduated), the returned queue is simply shorter than requested — there's no error, no padding with duplicates, no fallback to a different region.

### 7.7 — Implementing functions/files
- `packages/core/learn/recencySuppression.js`: `getRecencyModifier`, `getSamplingWeight`, `SUPPRESSION_THRESHOLDS`.
- `packages/core/learning.js`: `buildSampledPool`, `buildFullRegionLearningQueue` (the one actually called for Learn — takes `regionCountryIds` + `masteryById` + `recencyById` maps and returns an ordered `string[]` of country ids), `buildLearningQueue` (older, unused-by-web signature that still exists and is exported but per the sessionSequencer audit comment is not called by `GeographyGame`), `weightedSampleWithoutReplacement`.
- `apps/web/components/GeographyGame.jsx` `buildLearnEngineData` (~1951–2053): fetches mastery once (`GET /api/mastery?mode=`, single call, not per-question), builds `masteryById`/`recencyById` maps via `buildDomainMasteryMap`/`getOverallMastery` (domain-aware — see Section 8.1), calls `buildFullRegionLearningQueue`, then `buildLearnSession` (Section 8/9) to turn the sampled ids into ordered questions.

---

## Section 8 — Question format selection per country

**Per-country, per-domain EMA tier selection** — the regional `workingTier`/challenge-level system exists in code (`packages/core/learn/challengeLevel.js`, `GET`/`POST /api/learn-challenge`) but is fully disconnected from the live path (Section 15).

### 8.1 — What's read

`selectQuestionForCountry` (`packages/core/learn/sessionSequencer.js`) reads a **per-domain EMA score**, not a single overall mastery number and not `workingTier`. For each of the up-to-29 eligible question types for the category (`getEligibleTypesForCategory(category)` — every `QUESTION_TYPES` entry whose `categories` includes the played mode, no mastery filtering at this step), it:
1. Resolves the type's domain (`getDomainForQuestionType(type.id)`).
2. Looks up that domain's score for this country via `getDomainMastery(domainMap, countryId, domain, fallback=overallMastery)` — a **missing domain row is treated as unseen (0), not as the country's overall/other-domain average**, except when the country has *no* domain rows at all, in which case the passed-in fallback (the country's overall mastery, computed once per Learn session via `getOverallMastery`) is used.
3. Maps that domain score to a tier via `getTierFromScore` → `getPrimaryTierForMastery` → `MASTERY_BANDS` (Section 5), with one override: `getTierForCountry(masteryScore, attemptCount)` forces `TIER_4` when `masteryScore === 0` regardless of the mastery-band math (belt-and-suspenders for brand-new countries).
4. Scores every candidate type by `computeTypePriority(domainScore) = max(0.1, min(1, (1 - |domainScore-0.5|*2) + (1-domainScore)*0.3))` — a priority curve peaking at domain score 0.5 with an extra boost for weaker domains.
5. Splits candidates into `matching` (the type's fixed catalog tier equals the domain's computed tier) and `fallbacks` (it doesn't), sorts `matching` by priority (+ small random jitter) and `fallbacks` by `catalogFallbackRank` (prefers a catalog tier *harder* than the domain's true tier over one *easier*, then by priority).
6. Filters out **trivial** candidates via `isTrivialDomainCandidate(domainScore, catalogTier, alternativesRemain)`: `domainScore > TRIVIAL_MASTERY (0.92)` AND the catalog tier is comparative (Tier 3/4) AND at least one alternative candidate remains — i.e. don't hand a near-perfect domain an easy comparative question if something harder is available.
7. Brazil gets an 85% chance to have `brazil_non_neighbors` bumped to the front of its candidate pool.
8. Walks the ordered pool calling each type's generator until one returns non-null; on success, attaches `predictedSuccess` (Section 8.6-adjacent, actually computed here) and decorates the question with `firstExposure`, `countryMastery` (the domain score used), `skillDomain`, `domainMasteryScore`.
9. If **every** candidate generator returned `null`, falls back to `buildFallbackQuestion(record, category)` — a guaranteed-buildable Tier 1 `blank_map_click`, upgraded to `capital_free_recall` (Tier 2) if the category is `capitals` and a capital exists, or `flag_free_recall` (Tier 2) if the category is `flags`.

### 8.2 — `workingTier` (deprecated system, still present in code)

Values 1 (hardest) – 4 (easiest); default 4, min 1, max 4 (`LEARN_CHALLENGE` in `packages/constants`). Stored per `(user_id, mode, region)` in `learn_challenge`. Harden/ease logic (`updateChallengeLevel` in `packages/core/learn/challengeLevel.js`): over a rolling window of the last 10 outcomes (`OUTCOME_WINDOW: 10`, needs ≥3 to evaluate), computed at-or-harder-than-working-tier accuracy `>= 0.85` (`HARDEN_ACCURACY`) with reveal rate `< 0.2` bumps momentum `+1`; accuracy `<= 0.55` (`EASE_ACCURACY`) or reveal rate `>= 0.35` bumps momentum `-1`; momentum reaching `±2` (`MOMENTUM_BUMP`) moves `workingTier` one step and resets momentum to 0. **This entire mechanism is unreachable from the live UI** — verified by grep, zero references to `fetchLearnChallenge`, `saveLearnChallenge`, `updateChallengeLevel`, or `/api/learn-challenge` anywhere under `apps/web/components/`.

### 8.3 — Per-domain EMA (the live mechanism) — see 8.1 above for the full walkthrough. Domain score → tier mapping is exactly `MASTERY_BANDS` (Section 5); question types are ranked by `computeTypePriority` and by whether their fixed catalog tier matches the domain's computed tier.

### 8.4 — Undiscovered-domain seed: **not the literal value 0.30 described in some historical notes** — confirmed by reading the live code: a domain with no row and no `general` fallback simply reads as raw score `0` via `getDomainMastery`'s default `fallback` parameter *unless* the caller explicitly passes a nonzero fallback. `buildLearnEngineData` passes `getOverallMastery(domainMap, country.id)` as the per-country mastery it hands to `buildLearnSession`, and `selectQuestionForCountry` passes that same overall value as the `fallback` for `getDomainMastery` when a country has **zero** domain rows at all — meaning a genuinely first-ever-seen country's every domain resolves to `0` (correctly landing every type at Tier 4), while a country the user has *some* history with, but not yet in a *specific* domain, has that specific domain still return `0` (not the overall average) because `getDomainMastery` only substitutes the fallback when `countryDomains.size === 0`. `isDomainFirstExposure` is the actual "unseen" flag used for the `firstExposure` decoration — it fires when the domain score is 0 AND neither a same-domain nor a `general` row exists for that country, AND (the country has *other* domain rows OR its attempt count is 0). There is no separate hardcoded "0.30 seed" constant anywhere in `packages/constants` or `packages/core` — a repo-wide search for `0.3` near "domain"/"seed"/"undiscovered" returns nothing matching that description; the only literal `0.30` in the mastery-adjacent code is `SUPPRESSION_THRESHOLDS[0].maxMastery` (Section 7.2), an unrelated recency-suppression band boundary.

### 8.5 — Trivial-skip rule

`isTrivialDomainCandidate(domainScore, catalogTier, alternativesRemain)`:
```js
if (domainScore <= TRIVIAL_MASTERY (0.92)) return false;
if (!isComparativeTier(catalogTier))         return false;  // only Tier 3/4 are ever "trivial-skipped"
if (!alternativesRemain)                     return false;  // never skip the last remaining candidate
return true;
```
Applied as a filter over the fully-ordered `matching + fallbacks` list; if filtering would leave zero candidates, the unfiltered list is used instead (a country is never left with no candidates because of this rule). A separate, related "trivial" concept — `LEARN_PREDICTED_SUCCESS.TRIVIAL_THRESHOLD = 0.92`, `TRIVIAL_REJECT_AT_WORKING_TIER = 3` in `packages/core/learn/predictedSuccess.js` (`isTrivialPrediction`) — exists but is only consumed by `pickByPredictedSuccess`, a function with **no call sites** in `sessionSequencer.js` or `GeographyGame.jsx` (grep confirms `pickByPredictedSuccess` is exported but never imported anywhere in `apps/web`). `predictedSuccess` itself IS computed and attached to every question (`attachPredictedSuccess` in the sequencer) and IS sent to the server (`question.predictedSuccess` → `country_attempts.predicted_success`), but only as **telemetry** — it does not gate which question is chosen in the live path.

### 8.6 — Fallback chain when generators return null

Within `selectQuestionForCountry`: try every non-trivial candidate type in priority order → if all fail, try the trivial ones that were filtered out → if the whole `matching + fallbacks` pool is empty or every generator failed, call `buildFallbackQuestion` (Section 8.1 point 9), which is unconditionally buildable (`blank_map_click` needs only `cid(country)`, always present). A country is therefore **never dropped** from a session.

### 8.7 — Implementing functions/files
`packages/core/learn/sessionSequencer.js` (`selectQuestionForCountry`, `getTierForCountry`, `buildFallbackQuestion`, `attachPredictedSuccess`), `packages/core/learn/questionTypes.js` (`getMasteryBand`, `getPrimaryTierForMastery`, `getEligibleTypesForCategory`), `packages/core/learn/domainMastery.js` (`getDomainMastery`, `getOverallMastery`, `coerceDomainMasteryMap`), `packages/core/learn/predictedSuccess.js` (`predictedSuccess`, unused-in-practice `pickByPredictedSuccess`), `packages/core/learn/challengeLevel.js` (deprecated `workingTier` machinery), `packages/core/learn/questionGenerator.js` (the 29 generators).

---

## Section 9 — Session ordering

Implemented in `packages/core/learn/sessionSequencer.js` `arrangeQuestions` + `ensureWarmOpen` + `placeBonusesNearSlots`, called from `buildLearnSession`. Constants:
```js
const TRIVIAL_MASTERY = 0.92;
const MAX_CONSECUTIVE_SAME_TYPE = 2;   // declared but its only use is `void MAX_CONSECUTIVE_SAME_TYPE;` — see note below
const MIN_SESSION_FOR_TIER_RULES = 10;
const BONUS_COMPARATIVE_COUNT = 2;
const BONUS_SLOT_A = 3;
const BONUS_SLOT_B = 7;
```

- **Warm-up rule**: `ensureWarmOpen(questions)` — if `questions[0]`'s tier isn't comparative (Tier 3/4), it swaps in the first comparative-tier question found later in the list to lead. `arrangeQuestions` itself also biases the very first pick toward a comparative type when one exists (`if (result.length === 0) { if (compTypes.length > 0) chosenType = pickLargest(compTypes) ... }`), and if none exist, prefers a non-Tier-1 type over Tier 1 for the opener. Net effect: **the first question is Tier 3/4 when any exist in the session at all; only an all-Tier-1/2 session opens on something other than a pure free-recall Tier 1.**
- **Consecutive-type limit**: `arrangeQuestions`'s bucket-draw loop explicitly forbids `type === prev1 && type === prev2` (i.e. **the same type three times in a row is disallowed**; two in a row is allowed). The module-level constant `MAX_CONSECUTIVE_SAME_TYPE = 2` is declared but the line `void MAX_CONSECUTIVE_SAME_TYPE;` at the bottom of the file marks it as intentionally unused by name — the actual limit (allow 2, block 3) is hardcoded inline in the loop condition rather than reading that constant.
- **Tier-breadth rule**: after all questions are generated, if the session has ≥10 questions (`MIN_SESSION_FOR_TIER_RULES`) and only one distinct tier is present, `buildBonusQuestions` injects up to 2 (`BONUS_COMPARATIVE_COUNT`) extra Tier 3 comparative questions (population/area/GDP compare, in that fallback order) for other countries from whichever region was most represented in the sample, then `placeBonusesNearSlots` splices them in near index 3 and index 7 (`BONUS_SLOT_A`/`BONUS_SLOT_B`, clamped to the list length) and re-runs `ensureWarmOpen`.
- **Comparative-spacing rule**: within the main `arrangeQuestions` draw loop, once a comparative-tier question has just been placed (`prevIsComparative`), the next pick is forced to a non-comparative type if any remain (`chosenType = pickLargest(nonCompTypes.length > 0 ? nonCompTypes : compTypes)`) — this directly prevents two Tier 3/4 questions back to back whenever a non-comparative alternative exists.
- Otherwise, type selection alternates by "bucket size" (`pickLargest`, remaining-count + small random jitter) balancing between the comparative and non-comparative classes roughly by how many of each remain (`classRemaining(true) >= classRemaining(false)` check), so a session naturally interleaves rather than exhausting one type before starting the next.

No rule caps the total *tier* mix beyond the ≥2-distinct-tiers-for-10+-question-sessions floor above; there's no cap like "no more than X Tier-1 questions."

---

## Section 10 — Answer handling

### 10.1 — How the outcome is determined
Every answer UI component (`MultipleChoiceQuestion`, `MultiSelectQuestion`, `YesNoQuestion`, `BinaryChoiceQuestion`, `TextEntryQuestion`/`MultiTextEntryQuestion`, `MapClickPrompt`, `ShapeDropQuestion`, `RankQuestion`, `ReligionPieQuestion`) computes its own `correct` boolean locally, then calls the shared `emit`/`onEmit` closure defined in `LearnQuestionRenderer` (`apps/web/components/learn/LearnQuestionRenderer.jsx`), which normalizes every answer into one event shape:
```js
{
  questionId, countryId, correct, fast, timedOut, revealUsed, priorMiss,
  questionType, tier, predictedSuccess, responseTimeMs, selectedValue,
  wrongValues, correctAnswer, distanceKm, inside, countryUpdates,
}
```
`fast` is computed here via `isFastResponse(responseTimeMs, speedBaselineMs)` — but `GeographyGame.jsx` always passes `speedBaselineMs={null}` to `LearnRoundOverlay` (confirmed in the JSX at the render call site), so `fast` uses the module default baseline (5000ms) rather than any personal per-user baseline for Learn questions (the personal `speed_baseline_ms` column IS maintained per-country by `updateSpeedBaseline`/`computeMasteryUpdate`, but that per-country value is never plumbed back into the Learn UI's `fast` calculation).

`handleLearnAnswer` in `GeographyGame.jsx` (~2385–2780) receives this event, then calls `outcomeFromEvent`-equivalent logic indirectly via `buildLearnStatPayloads` (Section 2/6).

### 10.2 — `learnModeMultiplier` resolution
`buildLearnStatPayloads(event, { mode, level, currentSessionNumber })` → `buildLearnStatPayload` → `resolveLearnEma(event)` → `{ outcome, multiplierKey, multiplier }` (Section 6). The final `applied` multiplier additionally folds in:
- Neighbor-set partial credit (`applied = multiplier * setCredit`) when applicable, or
- Map-guess distance penalty scaling (`applied = multiplier * distancePenaltyScale(distanceKm)`) for a wrong, non-revealed map answer with a finite `distanceKm`.

### 10.3 — POST payload to `/api/country-stats`
```js
{
  countryId, mode, level, gameType: "learning", outcome,
  responseTimeMs,            // null for partial-set-credit or reveal
  learnModeMultiplier: applied,   // 0..1, clamped server-side too
  questionTier: event.tier,       // "tier_1".."tier_4"
  questionType: event.type,
  predictedSuccess,               // 0..1 or null
  currentSessionNumber,           // from currentSessionNumberRef.current
}
```
If the active session's `gameType` is `TEST` (a defensive branch inside `handleLearnAnswer` — see note below), the payload is rewritten to `{ ...payload, gameType: GAME_TYPE_FOR_STATS.TEST, learnModeMultiplier: 1 }` before sending, forcing the neutral multiplier. **Open question / uncertainty**: I traced every `startLearnEngineGame(...)` call site in `GeographyGame.jsx` and all of them pass `gameType: GAME_TYPES.LEARNING` (the default) or omit it (same default) — I could not find a call site that starts the mixed-question Learn engine with `gameType: GAME_TYPES.TEST`. Classic Test-mode sessions (World Test, region Test, Discover→"Ready to test yourself?") all go through the separate, older `startGame` function (map-fill/flash Test engine), not `startLearnEngineGame`. So the `GAME_TYPES.TEST` branches inside `handleLearnAnswer` (and inside `finishLearnGame`) appear to be defensive/dead code for the current UI, but I did not exhaustively trace every code path that sets `session.gameType`, so I'm flagging this rather than asserting it's unreachable.

Server-side (`app/api/country-stats/route.js` `POST`): validates `countryId`/`mode`/`level`/`outcome`/`gameType` against allow-lists, validates `learnModeMultiplier` is a finite number in `[0, 1]` (only actually applied — vs. forced to `1` — when `gameType === "learning"`), validates `questionTier` starts with `"tier_"`, clamps `predictedSuccess` to `[0,1]`, then calls `recordCountryPerformance`.

### 10.4 — Server-side EMA update (`apps/web/lib/db.js` `recordCountryPerformance`)
- Whitelists `outcome` against the 4 real column names (`first_try_correct`/`second_try_correct`/`needed_reveal`/`incorrect`) before interpolating it as a SQL column identifier.
- Resolves `skillDomain` server-side via `resolveSkillDomain({ questionType, mode })` — **never trusts a client-supplied domain field**.
- `appliedMultiplier = learnModeMultiplier * (isLearn ? getLearnContributionRate(skillDomain) : 1)`.
- Inserts one `country_attempts` row (with `question_tier`, `predicted_success`).
- Dual-writes `country_stats`: one row at the resolved domain, one mirrored at `general` (skipped as a duplicate write when the domain already *is* `general`) — both via the same `upsertStatRow` helper, both computed through `computeMasteryUpdate` with the same `appliedMultiplier`, columns updated: the outcome counter column (+1), `response_time_ms_sum`/`response_time_count` (if a response time was tracked — not tracked for `needed_reveal`), `mastery_score`, `fast_streak`, `speed_baseline_ms`, `graduated`, `last_attempt_at`, `last_outcome`, `last_correct_at`, `last_correct_session`, `updated_at`.
- Returns `{ ...generalStat, domainStat, skillDomain }` to the client (so the client's `learnMasteryAfterRef` tracks the *general*-row mastery, not the domain-specific one — used for the EMA badge and session summary deltas).

### 10.5 — `last_correct_at` / `last_correct_session` / `last_outcome`
Written on **every** upsert (Test and Learn alike), inside the same `INSERT ... ON CONFLICT` statement:
```sql
last_outcome = $10   -- always set to the raw outcome string
last_correct_at = CASE WHEN $10 IN ('first_try_correct','second_try_correct') THEN NOW() ELSE country_stats.last_correct_at END
last_correct_session = CASE WHEN $10 IN ('first_try_correct','second_try_correct') THEN $12::integer ELSE country_stats.last_correct_session END
```
So `last_correct_at`/`last_correct_session` update on either correct outcome (first- or second-try) and are left untouched (not nulled) on a miss/reveal — only `last_outcome` changes to reflect the miss. `$12` is the `currentSessionNumber` sent in the request (or `NULL` if not a valid non-negative integer).

### 10.6 — Clue/reveal system: **`clueEligible` flag is fully plumbed through the data model, but no clue text is ever generated or supplied, so the visible clue ladder never renders in production.**
- Every question object carries `clueEligible: isClueEligible(type.tier)` where `CLUE_ELIGIBLE_TIERS = new Set([TIER_1, TIER_2])` (`packages/core/learn/questionGenerator.js`) — Tier 3/4 questions are never clue-eligible.
- `ClueButton` (`apps/web/components/learn/ClueButton.jsx`) accepts a `clues: string[]` prop and explicitly renders `null` whenever `!question.clueEligible || clues.length === 0`.
- Every answer-format component that supports clues (`MultipleChoiceQuestion`, `MultiSelectQuestion`, `YesNoQuestion`, `TextEntryQuestion`, `MapClickPrompt`, `ShapeDropQuestion`, `ReligionPieQuestion`) accepts `clues = []` as a prop default and passes it straight to `ClueButton`.
- `LearnQuestionRenderer` accepts `clues = []` as a prop default.
- `LearnRoundOverlay` forwards arbitrary props (`{...rendererProps}`) to `LearnQuestionRenderer`, so a `clues` prop *could* flow through if supplied.
- **`GeographyGame.jsx` never passes a `clues` prop to `<LearnRoundOverlay>`** (confirmed by reading the full JSX call site) and there is no function anywhere in `packages/core` or `apps/web` that generates clue text strings (no `buildClue`, `getClueText`, `generateClue`, etc. — confirmed by repo-wide grep). Therefore `clues` is always `[]` in the live app, `ClueButton` never renders, and a user can never trigger `onReveal` through this path — meaning `revealUsed: true` (and the `tier_1_reveal`/`tier_2_wrong`-via-reveal EMA path) can never fire from the clue system as shipped.
- **A separate, genuinely working reveal path exists** for exactly one component: `MultiTextEntryQuestion` (the `neighbor_recall_all` type) has its own "Give up" button that sets `revealed: true` and emits `{ correct: false, revealUsed: true, found: foundIds }` — this is the only reachable way `revealUsed` becomes `true` in the current UI that I found.
- `apps/web/scripts/test-learn-mode.js` only asserts the `clueEligible` flag's value on questions (`assert.equal(question.clueEligible, true)`), never any actual clue text — and its file header explicitly lists "clue visibility" as a manual (untested) UI concern, consistent with this being a known-incomplete area rather than a regression I'm inferring.

### 10.7 — Wrong-answer teaching (continue notes + wrong reveal)
Two independent systems, both fully implemented:
- **`continueNotes.js`** (`packages/core/learn/continueNotes.js`): a small hardcoded lookup of country/type-specific teaching asides (Caspian Sea "landlocked" clarification for `KAZ`/`AZE`/`TKM`; South Africa's three capitals note; Vatican/San Marino enclave note; China having the most land neighbors). `applyContinueNote(question)` attaches `question.continueNote` when a rule matches, and every generator's output is piped through it (`generateQuestion` calls `applyContinueNote` on the result). Shown above the Continue button on both correct and incorrect answers when present.
- **`wrongReveal.js`** (`packages/core/learn/wrongReveal.js`): `buildLearnWrongReveal(question, allCountriesById, { selectedValue })` produces the post-miss message and/or map paint instructions, branching per question shape: neighbor questions get a full "X borders A, B, and C" message plus `neighborReveal` (paint found/missed/wrong-guess borders — `classifyNeighborTeachPaint` splits selections into green/orange/red); `area_compare` misses get both countries painted (winner green, loser red) via `areaCompareReveal`; `landlocked_check` misses get the country shown via `landlockedReveal`; several UI shapes (borderless map/shape-drop, ranking, pie, population/GDP compare, "highlighted" map prompts, boolean answers, flag/shape multiple-choice, typed text-entry) are explicitly given `message: null` because the answer format already shows the correct answer in-place (no redundant toast); `capital_matching`/`country_from_capital`/`country_from_flag` misses get a specific "{capital} is the capital of {country}." / "That's the flag of {country}." message; everything else falls back to a generic "That's {correctLabel}." or "Not quite."

---

## Section 11 — Facts system

**Partial, not complete.** Three distinct pieces exist; only two of the three are wired end to end, and the third (the actual "post-answer fact modal" implied by the component name) is orphaned.

- **`LearnFactModal` is orphaned.** `apps/web/components/learn/LearnFactModal.jsx` is a fully-built bottom-sheet component (flag, country name, fact text, category chip, dismiss handling) — but a repo-wide grep for `LearnFactModal` finds only its own definition. It is never imported by `GeographyGame.jsx` or any other component. It never renders.
- **`markFactSeen` is never called.** `apps/web/lib/learn/factsClient.js` exports `markFactSeen(countryId, factIndex)` (a thin `POST /api/learn-facts` wrapper), but grep across `apps/web/components` and `apps/web/lib` finds zero call sites for it. Consequently the `facts_seen` table (Section 1) is never written to by real gameplay — the write path (`recordFactSeen` in `apps/web/lib/db.js`, exercised via the API route) is otherwise correctly implemented and would work if called.
- **`fetchSeenFacts` result IS used**, but only at session-completion time, not post-answer. `GeographyGame.jsx`'s `startLearnEngineGame` calls `fetchSeenFacts(learn.queueIds)` once when a Learn session starts and merges the result into `learnSeenFactsRef.current`. That ref is later passed as `seenByCountry` into `buildLearnSessionSummary` (`packages/core/learn/sessionSummary.js`) when the session ends, which uses it to call `selectLearnFact(country, { wasCorrect: false, category, seenIndices })` for exactly one country — the one with the single biggest mastery drop this session (`biggestDropFact`). Since nothing ever writes to `facts_seen`, `seenIndices` is in practice always empty for every user, so the "have I seen this fact before" branch of `selectLearnFact` (Section 11's priority-2 rule below) never actually has anything to avoid repeating — it degrades to "the first fact" every time in practice, though the code path itself is correct if writes ever start happening.
- **The fact that *does* reach the player** is rendered by `LearnSessionSummary.jsx` (a "Did you know · {country}" section at the bottom of the Learn results screen, showing the flag + fact text for the single biggest-mastery-drop country of the session) — this is a session-end summary feature, not a per-answer modal, and it does not use `LearnFactModal` at all; it renders its own inline markup.

`selectLearnFact(country, { wasCorrect, category, seenIndices })` (`packages/core/learn/factSelection.js`) priority, as implemented (used only via the summary path above):
1. Wrong answer, `capitals` category, has a capital → synthetic fact `"The capital of {name} is {capital}."` (`index: null`, `synthetic: true` — explicitly never recorded to `facts_seen`).
2. Wrong answer, `countries` category → the first fact whose `category === "geography"`, if one exists.
3. Correct answer → the first fact index **not** in `seenIndices`; if all seen, falls through to the first fact as "a gentle repeat."
4. Fallback → `facts[0]` if any facts exist at all, else `null`.

---

## Section 12 — Session completion

`finishLearnGame` (`apps/web/components/GeographyGame.jsx`, ~2055–2108):
1. `markSessionComplete()` — idempotent per-instance call to `POST /api/streak`, incrementing the global `users.total_sessions` counter (Section 7.4; not Learn-exclusive).
2. If this was a genuine Learn session (`gameType === LEARNING`, has `mode`/`region`), clears the resumable local-storage snapshot (`clearSavedLearnSession`).
3. Stops the game timer, flips `gameActive`/`gameComplete`, calls `finishGameBoard()`, clears any pending advance timer.
4. Waits for all in-flight `pendingStatPromisesRef` (the `POST /api/country-stats` calls already in flight for answered questions) to settle via `Promise.allSettled` before building results, so the summary reflects final server-confirmed mastery.
5. Builds the results payload:
   - If `activeSession.gameType !== TEST` (true for Learn), calls `buildLearnSessionSummary({ answers, masteryBefore: learnMasteryBeforeRef, masteryAfter: learnMasteryAfterRef, resolveCountry, category, seenByCountry: learnSeenFactsRef })` (Section 8 of `sessionSummary.js`) and stores it as `learnSummary` state — this feeds `LearnSessionSummary.jsx`'s type-breakdown chips, improved/needs-work delta lists, and the biggest-drop fact (Section 11).
   - Otherwise (`gameType === TEST`), sets `learnSummary` to `null`.
   - Calls `buildMilestoneStats()` (shared with Test/Discover; not Learn-specific milestone logic beyond what's already generic in the app).
6. **`game_scores` is never written for Learn sessions.** `saveScore`/the `game_scores` upsert path is exclusive to the classic Test-mode `startGame` flow (confirmed by reading `GAME_TYPES.TEST`-gated logic elsewhere in the file) — Learn sessions have no "personal best" concept and don't populate the Scoreboard's per-mode/region scores.
7. **Streak**: `markSessionComplete`'s `POST /api/streak` call also runs `recordPracticeSession` (daily upsert) and returns the current streak values in the same response, which `GeographyGame.jsx` compares against the previously-shown value (via `localStorage` key `worldly:lastStreakSeen`, read/compared elsewhere in the completion flow) to decide whether to show a "🔥 N day streak!" message. So yes — streak is recorded and can be surfaced, on Learn session completion exactly as on Test/Discover completion, because both routes go through the shared `completeSession()`/`POST /api/streak` call.

What the results screen shows for Learn specifically (via `LearnSessionSummary.jsx`, appended below the shared score/accuracy header that every game type shows): a "This session" chip row of grouped question-type counts (`formatTypeBreakdown`, several comparative types collapse into one "N comparisons" label — see the `LEARN_TYPE_LABELS` map in `sessionSummary.js`), a collapsible "Improved" list (countries with a positive `general`-row mastery delta this session, sorted descending), a collapsible "Needs work" list (negative deltas, sorted most-negative first), and the single biggest-drop "Did you know" fact section (Section 11) when applicable. Deltas are computed on the `general`-row mastery (`learnMasteryBeforeRef`/`learnMasteryAfterRef`, populated from each answer's returned general-row `stat.masteryScore`/`stat.previousMasteryScore`), not on the domain-specific score.

---

## Section 13 — % Worldly

**Domain-weighted score is live**; the old countries/capitals/flags-only formula still exists in parallel as a secondary "categories" breakdown, not as the headline number.

### Formula (`packages/core/worldlyScore.js` `computeWorldlyScore(maps, countryIds, stats)`)
```js
export const WORLDLY_DOMAIN_WEIGHTS = {
  location: 0.35, neighbors: 0.25, capital: 0.15, flag: 0.10, statistics: 0.10, facts: 0.05,
};
```
For each country in the full world roster (`countryIds`, always the complete enabled-country list — the denominator is the whole world, not just attempted countries): `domainScoresFromStats(rowsForThatCountry)` (`packages/core/learn/masteryTiers.js`) computes the best score per domain, **filling a domain from the matching `general`-mode row when no explicit domain row exists** (`inferDomainFromMode(stat.mode)` — e.g. a Test-mode `capitals` `general` row fills the `capital` domain if there's no dedicated `capital` domain row). `computeCountryDomainScore(domainScores)` is the weight-normalized blend of the 6 domains for that country. The raw score is the **average of `computeCountryDomainScore` across every country in the world roster** (countries with zero data contribute a domain score of 0 across the board, i.e. a true fraction of the whole world). This raw score (0–1) is then run through the display curve.

### Legacy `categories` breakdown — still computed, shown alongside, not part of the headline math
```js
export const WORLDLY_WEIGHTS = { countries: 0.5, capitals: 0.35, flags: 0.15 };
```
`computeWorldlyScore` also returns `categories: { countries, capitals, flags }` via the old `LEVEL_WEIGHTS`-blended, `skillDomain === "general"`-only calculation (`buildLevelScoreMap` explicitly ignores any row where `skillDomain !== "general"` — comment: *"Domain-level Learn rows are ignored so the legacy countries/capitals/flags header breakdown stays Test/general-based."*). This `categories` object and the `WORLDLY_WEIGHTS` 50/35/15 split are **not** used to compute `percent`/`score`; they're a separate, Test-only-informed number returned in parallel for whatever UI still displays the old countries/capitals/flags split.

### Piecewise display curve — implemented, exact breakpoints
```js
export const WORLDLY_CURVE_BREAKPOINTS = [
  { raw: 0,    display: 0,   label: "Unseen" },
  { raw: 0.25, display: 20,  label: "Getting started" },
  { raw: 0.5,  display: 45,  label: "Developing" },
  { raw: 0.75, display: 80,  label: "Located" },
  { raw: 1,    display: 100, label: "Worldly" },
];
```
`applyWorldlyCurve(rawScore)` linearly interpolates between the two bracketing breakpoints (clamps input to `[0,1]` first). Verified exactly by test: `applyWorldlyCurve(0.75) === 80` exactly (`apps/web/scripts/test-worldly-score.js`). So the displayed `%Worldly` is **not** a linear `rawScore*100` — it's compressed below raw 0.75 (a raw 0.5 → displayed 45, not 50) and stretched above it (raw 0.75→1.0 spans display 80→100, a steeper slope than raw 0→0.25's slope of 0→20).

`WORLDLY_MILESTONES = [25, 50, 75, 90, 100]` — unchanged, still used by `getCrossedWorldlyMilestone(beforePercent, afterPercent)` for the celebration-overlay milestone check, operating on the **displayed** (curved) percent, not raw.

### API surface
`GET /api/mastery/all` (`apps/web/app/api/mastery/all/route.js`) returns:
```js
{ mastery, totalSessions, score, percent, rawPercent, categories, byDomain, byDomainDisplay }
```
where `score` is the raw 0–1 domain-weighted score, `percent` is the curved 0–100 display value, `rawPercent` is the *uncurved* `score*100` rounded to 1 decimal (kept for comparison/debugging), `categories` is the legacy countries/capitals/flags breakdown, `byDomain` is the raw 0–1 score per domain, `byDomainDisplay` is each domain's score independently run through the same curve. `GET /api/mastery?mode=` (single-mode variant) does **not** compute or return any Worldly score — it only returns the raw `mastery` array + `totalSessions` for one mode, used by session-building code, not by the score header.

`computeWorldlyBeforeAfter({ mastery, countryIds, mode, level, statRecords })` (used for the celebration-overlay before/after crossing check) resolves the *played* domain via `inferDomainFromMode(mode)` and reconstructs a "before" score by reverting only that domain's delta for the countries touched this session — same technique as the old countries/capitals/flags version, just domain-based now.

---

## Section 14 — Mastery tiers

**The three/four-tier system (Unseen / Spotted / Located / Worldly) is implemented and live**, replacing a purely binary graduated/not-graduated signal for map display purposes — though the underlying `country_stats.graduated` boolean column and Test-mode graduation logic (Section 6) still exist unchanged and still drive Test-mode pool exclusion / EMA "reset on miss" behavior; the tier system is a *display/read* layer built on top, not a replacement for the write-side graduation flag.

```js
export const MASTERY_TIERS = { NONE: "none", SPOTTED: "spotted", LOCATED: "located", WORLDLY: "worldly" };
export const MASTERY_TIER_LABELS = { none: "Unseen", spotted: "Spotted", located: "Located", worldly: "Worldly" };
export const WORLDLY_DOMAIN_THRESHOLD = 0.75;
```

`getMasteryTier({ stats, neighborCount })` (`packages/core/learn/masteryTiers.js`):
```js
if (rows.length === 0) return NONE;
const { location, capital, neighbors } = domainScoresFromStats(rows);
const neighborsScore = neighborCount === 0 ? 1 : neighbors;   // islands waive the neighbors bar entirely
if (location >= 0.75 && capital >= 0.75 && neighborsScore >= 0.75) return WORLDLY;
if (rows.some(row => domainOf(row) === "general" && row.graduated)) return LOCATED;
return SPOTTED;
```
So, exactly:
- **NONE** ("Unseen"): zero `country_stats` rows at all for that country.
- **SPOTTED**: at least one row exists, but the country hasn't reached Test-mode `general`-row graduation and doesn't clear the Worldly bar.
- **LOCATED**: the legacy Test-mode `general` row has `graduated = true` (unchanged binary flag from Section 6), but location/capital/neighbors aren't all ≥0.75.
- **WORLDLY**: `location`, `capital`, and `neighbors` domain scores are **all** ≥ `WORLDLY_DOMAIN_THRESHOLD` (0.75) — for a country with zero land neighbors, the neighbors requirement is waived (treated as a perfect 1.0) rather than being an impossible bar. This checks `>=`, not `>`.

Tier rank helper `masteryTierRank(tier)` maps `none→0, spotted→1, located→2, worldly→3` for sort/compare use. `getWeakestDomain(domainScores)` returns the lowest-scoring of the 6 domains for a country (used, presumably, for weak-domain call-outs — I did not trace a specific UI consumer of this function within the files read for this doc, so I can't confirm where/if it's currently surfaced).

---

## Section 15 — Known gaps and incomplete pieces

1. **Clue ladder (`ClueButton`) never renders in production.** *Exists*: `clueEligible` flag on every question, `LEARN_EMA_MULTIPLIERS` reveal keys, `ClueButton` component, `clues` prop threaded through every answer-format component and `LearnQuestionRenderer`. *Missing*: any function that generates actual clue text, and the `clues` prop is never populated by `GeographyGame.jsx` when rendering `LearnRoundOverlay`. **Confidence: high** (confirmed by reading the full render call site and grepping for any clue-content generator across both `packages/core` and `apps/web`; also corroborated by the test suite's own comment flagging "clue visibility" as untested/manual).
2. **`LearnFactModal` is a fully-built, completely orphaned component.** *Exists*: full UI (flag, name, fact text, category badge, dismiss). *Missing*: any import/render call anywhere. **Confidence: high** (repo-wide grep finds only the component's own file).
3. **`markFactSeen` (the write half of the facts_seen system) is never called.** *Exists*: `POST /api/learn-facts` route, `recordFactSeen` DB function, `facts_seen` table with a unique index, and the client wrapper `markFactSeen` itself. *Missing*: any call site for that client wrapper. Practical effect: the "don't repeat a fact you've already seen" logic in `selectLearnFact` is live code that never has anything to avoid repeating, because nothing is ever recorded as seen. **Confidence: high** (grep across all of `apps/web`).
4. **`workingTier`/challenge-level adaptive difficulty is fully deprecated but its schema, API route, and DB functions remain live and reachable by direct API call.** *Exists*: `learn_challenge` table, `GET`/`POST /api/learn-challenge`, `getLearnChallenge`/`upsertLearnChallenge` in `db.js`, the full harden/ease algorithm in `challengeLevel.js`, client wrappers `fetchLearnChallenge`/`saveLearnChallenge`. *Missing*: any call from `GeographyGame.jsx` or any Learn component — the live sequencer uses per-country/per-domain EMA tier selection instead (Section 8). The table is still cleaned up on account data reset (`deleteUserPracticeData`), and the saved-session snapshot shape (`savedLearnSession.js`) still carries an inert `challenge` field through resume state, even though nothing populates or reads it meaningfully anymore. **Confidence: high** — this is also self-documented as deprecated in code comments at every layer (schema, route, lib, sequencer's own audit header).
5. **`pickByPredictedSuccess` (predicted-success-based trivial rejection / flow-targeting selection) is implemented but has no caller.** *Exists*: the function itself, `LEARN_PREDICTED_SUCCESS` constants (flow target 0.72, trivial threshold 0.92). *Missing*: any invocation in `sessionSequencer.js` or elsewhere — `predictedSuccess` is computed and attached to every question and sent to the server as telemetry (`country_attempts.predicted_success`), but it does not currently influence which question or type gets chosen. **Confidence: high** (grep confirms zero call sites for `pickByPredictedSuccess`).
6. **`buildLearningQueue`/`getLearningWeight` (the older, non-domain-aware sampling path in `packages/core/learning.js` / `mastery.js`) appear to be superseded by `buildFullRegionLearningQueue`/`getSamplingWeight` for the live Learn flow**, per the sessionSequencer file's own audit note ("Live Learn path does NOT call `buildLearningQueue`"), though `getLearningWeight` is still exported and I did not verify every remaining caller across the whole mobile app (`apps/mobile`) is out of scope for this audit. **Confidence: medium** (based on the sequencer's own documentation comment plus my own grep of `apps/web`, not an exhaustive trace of `apps/mobile`).
7. **The `GAME_TYPES.TEST` branches inside `handleLearnAnswer`/`finishLearnGame`** (forcing `learnModeMultiplier: 1` and skipping the Learn summary) may be defensive/dead code for the current web UI — I could not find a call site that starts `startLearnEngineGame` with `gameType: TEST`; classic Test mode uses a separate `startGame` engine entirely. **Confidence: medium** — I did not trace every possible path that could set `session.gameType` to `TEST` before reaching the Learn engine (e.g., a resumed saved session's stored `gameType`, or an `apps/mobile` code path), so I'm not asserting this is fully unreachable, only that I could not find a reachable path in `apps/web`.
8. **`getWeakestDomain`** is implemented but I did not find or trace a UI consumer of it within the files read for this document. **Confidence: low** — this is very possibly used somewhere in `apps/web/components` outside the Learn-specific file list this document was scoped to (e.g. a mastery/profile page), not necessarily a real gap.
9. **Per-user personal speed baseline is not used for the Learn `fast` calculation.** `GeographyGame.jsx` passes `speedBaselineMs={null}` into the Learn round overlay unconditionally, so `isFastResponse` always uses the module default (5000ms window) rather than each country's stored `speed_baseline_ms`. The column itself is still correctly maintained by `computeMasteryUpdate`. **Confidence: high** (read directly at the JSX call site).

---

## Section 16 — File map

### Core algorithm (`packages/core/`, re-exported wholesale via `packages/core/index.js`; `packages/constants/index.js` is the source of most literal constants)

| File | Role |
|---|---|
| `packages/constants/index.js` | All shared enums/thresholds/static catalogs: `GAME_TYPES`, `GAME_MODES`, `GAME_LEVELS`, `ROUND_OUTCOMES`, mastery thresholds, `WORLDLY_WEIGHTS`/`WORLDLY_DOMAIN_WEIGHTS`/`WORLDLY_CURVE_BREAKPOINTS`, `MASTERY_TIERS`, `SKILL_DOMAIN_LABELS`, `QUESTION_TIERS`, `LEARN_EMA_MULTIPLIERS`, the full `QUESTION_TYPES` catalog, `MASTERY_BANDS`, `LEARN_CHALLENGE`, `LEARN_PREDICTED_SUCCESS`, color/geometry constants, `packages/constants/data/countries.json` (the country manifest). |
| `packages/core/mastery.js` | `computeMasteryUpdate` (the EMA formula), `getDecayAdjustedMastery`/`isEffectivelyGraduated` (Test-mode decay), `getRecencyMultiplier` (older Go-half-life recency, not used by Learn), `getLearningWeight` (delegates to `getSamplingWeight`), `mapStatToMasteryEntry`/`groupMasteryEntriesByMode`. |
| `packages/core/worldlyScore.js` | `computeWorldlyScore` (domain-weighted, curved), `applyWorldlyCurve`, `computeWorldlyBeforeAfter`, legacy `categories` calculation. |
| `packages/core/learning.js` | `buildSampledPool`, `buildFullRegionLearningQueue` (live Learn session pool builder), `buildGoQueue` (Go!, not Learn), `weightedSampleWithoutReplacement`, `pickRecencyWeightedIds`. |
| `packages/core/levels.js` | `GAME_LEVELS`/level helpers, `getMasteryProvingLevels`. |
| `packages/core/learn/questionTypes.js` | `SKILL_DOMAINS`, `QUESTION_TYPE_TO_DOMAIN`, `resolveLearnEmaMultiplier`, `getMasteryBand`/`getPrimaryTierForMastery`/`getEligibleQuestionTypes`, `inferDomainFromMode`. |
| `packages/core/learn/questionGenerator.js` | All 29 question-type generators + `QUESTION_GENERATORS` dispatch + `generateQuestion`. |
| `packages/core/learn/sessionSequencer.js` | `selectQuestionForCountry` (per-domain EMA type selection), `buildLearnSession` (sampling → questions → ordering), `arrangeQuestions`/`ensureWarmOpen`/`placeBonusesNearSlots` (Section 9), embedded audit-trail comment documenting the whole pipeline. |
| `packages/core/learn/emaIntegration.js` | `outcomeFromEvent`, `resolveLearnEma`, `buildLearnStatPayload(s)`, `neighborSetCredit`, `logLearnEmaUpdate`. |
| `packages/core/learn/domainMastery.js` | `buildDomainMasteryMap`, `getDomainMastery`, `getOverallMastery`, `coerceDomainMasteryMap`. |
| `packages/core/learn/masteryTiers.js` | `getMasteryTier` (NONE/SPOTTED/LOCATED/WORLDLY), `domainScoresFromStats`, `getWeakestDomain`. |
| `packages/core/learn/factSelection.js` | `selectLearnFact` (post-answer fact priority rules). |
| `packages/core/learn/sessionSummary.js` | `buildLearnSessionSummary`, `formatTypeBreakdown`, `LEARN_TYPE_LABELS`. |
| `packages/core/learn/continueNotes.js` | Hardcoded teaching asides (`applyContinueNote`). |
| `packages/core/learn/wrongReveal.js` | `buildLearnWrongReveal`, neighbor teach-paint classification. |
| `packages/core/learn/resolveGuessedCountry.js` | Typed-answer → country resolution (exact/normalized match, no fuzzy spelling). |
| `packages/core/learn/recencySuppression.js` | `getRecencyModifier`, `getSamplingWeight`, `SUPPRESSION_THRESHOLDS` (Section 7.2) — includes an extensive pre-implementation audit comment. |
| `packages/core/learn/predictedSuccess.js` | `predictedSuccess` heuristic, fame/household/coastal country lists, `pickByPredictedSuccess` (unused). |
| `packages/core/learn/challengeLevel.js` | Deprecated `workingTier` harden/ease machinery. |
| `packages/core/learn/mapGuess.js` | `evaluateGeoGuess`/`evaluateShapeDrop`, `distancePenaltyScale`, map-click feedback copy. |
| `packages/core/learn/religionPie.js` | Religion pie-chart slice building/scoring/nudging math. |
| `packages/core/learn/coastlines.js` | `COUNTRY_COASTS` data + "not landlocked" teaching subtitle. |
| `packages/core/comparison-clusters.js` | Population/area/GDP peer clusters for Tier 3 comparative questions (module-load-time precomputation, ratio-band matching, blocked-pairs support). |
| `packages/core/geo/silhouette.js`, `packages/core/geo/distance.js` | Country-outline SVG fitting; haversine/point-in-polygon/border-distance math used by map-click and shape-drop scoring. |

### Database and API (`apps/web/lib/db.js`, `apps/web/app/api/*`)

| File | Role |
|---|---|
| `apps/web/lib/db.js` | All raw-`pg` queries; `recordCountryPerformance` (the dual-domain-write EMA upsert), `getCountryStatsForUser(s)`, `getUserTotalSessions`/`incrementSessionCount`, `getSeenFactIndices`/`recordFactSeen`, `getLearnChallenge`/`upsertLearnChallenge` (deprecated), `deleteUserPracticeData`. Carries its own audit-header comment documenting the domain-mastery schema/write-path. |
| `apps/web/lib/mastery.js`, `worldlyScore.js`, `learning.js`, `levels.js`, `masteryTiers.js`, `lib/learn/domainMastery.js` | All one-line `export * from "@worldly/core/..."` shims. |
| `apps/web/lib/countryStats.js` | Client fetch wrappers: `recordCountryStat`, `fetchMasteryStats`, `completeSession`, `fetchAllMasteryStats`, `fetchWeakCountryStats`, deprecated `fetchLearnChallenge`/`saveLearnChallenge`. |
| `apps/web/lib/learn/factsClient.js` | `fetchSeenFacts` (used), `markFactSeen` (defined, never called). |
| `apps/web/lib/learnSessionSize.js` | Client-only (`localStorage`) Learn session-size preference (Section 7.5). |
| `apps/web/lib/savedLearnSession.js` | Client-only (`localStorage`) resume/snapshot system for an in-progress Learn session (30-day max age), including an inert `challenge` field. |
| `apps/web/lib/learnUi.js` | Tailwind class-name constants for Learn UI (styling only, no logic). |
| `apps/web/lib/learn/rankList.js` | Small drag-list reordering helpers (`reorder`, `slotIndexFromY`, `slotsWithPlaceholder`) for `RankQuestion`. |
| `apps/web/lib/referencePanel.js` | `formatGdp`/`formatPopulation` display helpers, imported by `BinaryChoiceQuestion`/`RankQuestion`. |
| `apps/web/app/api/country-stats/route.js` | GET (weak-country list for old-style Learn eligibility, domain-filtered to `general`) / POST (records one answer — Section 10). |
| `apps/web/app/api/mastery/route.js` | Single-mode mastery + `totalSessions` (used for session building). |
| `apps/web/app/api/mastery/all/route.js` | All-mode mastery + the full %Worldly payload (Section 13). |
| `apps/web/app/api/learn-facts/route.js` | GET seen-fact indices / POST mark-one-seen (Section 11). |
| `apps/web/app/api/learn-challenge/route.js` | Deprecated GET/POST for `workingTier` (Section 15). |
| `apps/web/scripts/setup-db.js` | Full schema (Section 1). |
| `apps/web/scripts/test-learn-mode.js`, `test-recency.js`, `test-worldly-score.js`, `test-saved-learn-session.js` | Node `--test` suites; extensively cross-verified against this document's claims throughout. |

### UI components (`apps/web/components/learn/*`, plus `GeographyGame.jsx`)

| File | Role |
|---|---|
| `LearnRoundOverlay.jsx` | Hosts one question over the map/game stage; top-pinned vs. centered layout; Continue/Try-again footer chrome; renders `LearnQuestionRenderer`. |
| `LearnQuestionRenderer.jsx` | Dispatches a question to the right answer-format component by `answerType`; normalizes every answer into one event shape; contains the inline `TextEntryQuestion` and `MapClickPrompt` components. |
| `MultipleChoiceQuestion.jsx` | `multiple_choice` — flag/shape/plain-text option grids. |
| `MultiSelectQuestion.jsx` | `multi_select` — exact-set toggle-and-submit, partial mastery credit server-side. |
| `MultiTextEntryQuestion.jsx` | `multi_text_entry` — free-type-every-neighbor with a genuine "Give up" reveal. |
| `BinaryChoiceQuestion.jsx` | `binary_choice` — two-card comparisons and map-recognition A/B. |
| `YesNoQuestion.jsx` | `yes_no` — neighbor-confirm / landlocked-check. |
| `ShapeDropQuestion.jsx` | `shape_drop` — drag-silhouette-onto-map, portaled ghost + distance-reveal overlay. |
| `RankQuestion.jsx` | `drag_to_rank` — 5-item drag/tap/keyboard reorder. |
| `ReligionPieQuestion.jsx` | `drag_pie` — drag pie-slice boundaries. |
| `ClueButton.jsx` | Renders nothing in practice (Section 10.6/15). |
| `CountrySilhouette.jsx` | Shared SVG silhouette renderer used by several question types. |
| `LearnFactModal.jsx` | Fully built, never rendered (Section 11/15). |
| `LearnSessionSummary.jsx` | Post-session results panel (type breakdown, improved/needs-work, biggest-drop fact). |

### Game orchestration (`apps/web/components/GeographyGame.jsx`, ~5,123 lines total; approximate line ranges as of this read)

| Range | Function | Role |
|---|---|---|
| ~1951–2053 | `buildLearnEngineData` | Fetches mastery once, builds domain/recency maps, samples the region queue, calls `buildLearnSession` (Section 7). |
| ~2055–2108 | `finishLearnGame` | Session completion (Section 12). |
| ~2114–2384 | `clearLearnContinueState`, `showLearnNeighborMapReveal`, `advanceLearnAfterAnswer`, `handleLearnContinue`, `handleLearnTryAgain`, `handleLearnSelectFeedback` | Continue/retry/feedback state machine around one question. |
| ~2385–2780 | `handleLearnAnswer` | Central answer handler — builds payloads, records stats, drives per-question-type feedback UI (Section 10). |
| ~2773–2985 | `applyLearnGeoGuess`, `handleLearnMapClick`, `handleLearnShapeDrop` | Map-click/shape-drop scoring integration. |
| ~2986–3130 | `startLearnEngineGame` | Initializes/resumes a Learn session's full local state (Section 8/12 integration point). |
| ~3195–3289 (inside `handleSessionStart`) | Resume-from-saved-session vs. fresh-session branching, and the Test-mode / World-Test / Discover branches that do **not** use the Learn engine. |
| ~3473+ | `startLearningAgain` and various "play again" flows. |
| ~4795–4855 | JSX render site for `<LearnRoundOverlay>` — confirms no `clues` prop is passed (Section 10.6/15). |
