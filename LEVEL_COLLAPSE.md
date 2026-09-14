# Collapse `level` out of `country_stats`

One stored EMA per `(user_id, country_id, mode, skill_domain)`. Level is no
longer part of the row key. On Test, it scales **first-try gain only**.
Penalties are identical at every level.

> Status: code + migration script are in the repo. The data migration must run
> (and the unique index must be rebuilt) **before** this upsert goes live.
> `npm run db:setup` in `apps/web` runs the collapse. Dry-run first:
> `npm run db:collapse-levels -- --dry-run`.

---

## Files created

- `packages/core/learn/collapseLevelRows.js` — pure merge planner (`mergeStatGroup`,
  `planCollapse`).
- `apps/web/scripts/collapse-country-stats-levels.js` — backup, merge, index
  rebuild, `--dry-run`, `--rollback <backup_table>`.
- `apps/web/scripts/test-collapse-level-rows.js` — 4-row merge, idempotent plan,
  dry-run writes nothing, backup precedes deletes.
- `LEVEL_COLLAPSE.md` — this file.

## Files modified

- `packages/constants/index.js` — `LEVEL_GAIN_MULTIPLIERS`.
- `packages/core/mastery.js` — split `gainMultiplier` / `penaltyMultiplier`;
  `getLevelGainMultiplier` (Test-only).
- `packages/core/learn/masteryTiers.js` — `domainScoresFromStats` no longer maxes
  across levels; `general` → `inferDomainFromMode` fallback kept.
- `packages/core/learn/domainMastery.js` — single-row-per-cell `.set` documented;
  agrees with the display path.
- `packages/core/worldlyScore.js` — `buildLevelScoreMap` projects the one general
  score into all four `LEVEL_WEIGHTS` slots; `computeWorldlyBeforeAfter` no longer
  assumes a per-level max.
- `packages/core/package.json` — export `./learn/collapseLevelRows`.
- `apps/web/lib/db.js` — upsert on `(user_id, country_id, mode, skill_domain)`;
  `level` overwritten as last-played; Test gain = learnFactor × level weight;
  `getCountryStatsForUser` no longer filters by level.
- `apps/web/app/api/country-stats/route.js` — Go eligibility uses the cell;
  proving helpers kept as identity (`provingStats = []`).
- `apps/web/scripts/setup-db.js` — fresh installs skip the old level unique;
  collapse + new unique run at the end of `db:setup`.
- `apps/web/components/GeographyGame.jsx` — World Test skips on `graduated`
  alone; Go / Learn no longer filter mastery rows by level.
- `apps/web/components/ResultsPage.jsx` — mastery grid is one **Mastery** column.
- `apps/web/lib/masteryMap.js` — comment only (projection lives in core).
- `apps/mobile/app/game/session.tsx` — stop filtering to F1; use
  `buildDomainMasteryMap` / `getOverallMastery` like web.
- `apps/web/scripts/test-learn-mode.js`, `test-worldly-score.js` — gain / penalty
  / N1 regression / display-path agreement.
- `apps/web/package.json` — `db:collapse-levels`, collapse tests on `test:learn`.

---

## Weights (write)

```
LEVEL_GAIN_MULTIPLIERS = { F1: 0.5, F2: 0.8, N1: 1.0, N2: 1.2 }
```

Unknown or missing level → `1.0`. **Test only.** Learn still posts `level: F1`
but does not receive this factor (its difficulty signal remains
`LEARN_EMA_MULTIPLIERS`, 1.0 down to 0.15).

### Gain vs penalty

```
learnFactor         = learnModeMultiplier × contributionRate
gainMultiplier      = learnFactor × (Test ? LEVEL_GAIN_MULTIPLIERS[level] : 1)
penaltyMultiplier   = learnFactor
```

N2 1.2 speeds first-try gains; an N2 miss is the same size as an F1 miss.
Test at N1 is bit-identical to the old formula (`gain = 1`).

`learnModeMultiplier` on `computeMasteryUpdate` still scales both branches when
gain/penalty are omitted (existing Learn tests).

---

## Row counts (live dry-run, 2026-09-14)

| | |
|---|---|
| Rows today | **781** |
| After collapse | **552** |
| Groups merged | 150 |
| Rows deleted | **229** |

Size distribution: 402 groups of 1, 71 of 2, 79 of 3, **0 of 4+**.
Two users (`jadecathclement` 769→540, `jade_clement` 12→12). Zero `graduated`
rows. `general` and `location` stay separate cells (dual-write unchanged).

Post-migration `mastery_score` is the **max** of the group (never lowers anyone
on deploy day). Those values were earned under the old flat-multiplier rules and
will re-converge toward the new equilibria as users play. Expected, not a bug.

---

## Unique index

The two partial uniques

- `(user_id, country_id, mode, level) WHERE skill_domain = 'general'`
- `(user_id, country_id, mode, level, skill_domain) WHERE skill_domain <> 'general'`

collapse to one non-partial unique:

```
country_stats_cell_unique_idx ON (user_id, country_id, mode, skill_domain)
```

`general` is just a `skill_domain` value. Lookups drop `level`.

---

## Deploy sequence

Do **not** ship the new `ON CONFLICT (user_id, country_id, mode, skill_domain)`
while duplicate level-rows still exist.

1. Dry-run: `cd apps/web && npm run db:collapse-levels -- --dry-run`
2. Apply (backup + merge + new unique): `npm run db:collapse-levels`
   or `npm run db:setup` (calls the same collapse).
3. Confirm `country_stats_cell_unique_idx` exists and the old partials are gone.
4. Deploy this app code.

`level` stays `NOT NULL`; every answer overwrites it with the session level
(informational last-played). `country_attempts.level` is unchanged (attempt log).
`game_scores` is unchanged (still per-level high scores).

---

## Rollback

1. Revert the app deploy (old upsert keys on level).
2. Restore rows **and** the old uniques:

```
cd apps/web
npm run db:collapse-levels -- --rollback country_stats_backup_<timestamp>
```

The backup is `CREATE TABLE … AS TABLE country_stats` taken **before** deletes.
Rollback drops the cell unique, recreates the two partials, then replaces
`country_stats` from the backup. Restoring while the new unique still exists
would fail (duplicate level-rows).

---

## Equilibrium ceiling (Test, fast first-try 0.20 / miss 0.15)

`m* = 1 − (0.15 × (1−p)) / (0.20 × w × p)`

| accuracy p | F1 (0.5) | F2 (0.8) | N1 (1.0) | N2 (1.2) |
|---|---:|---:|---:|---:|
| 70% | 0.357 | 0.598 | 0.679 | 0.732 |
| 80% | 0.625 | 0.766 | 0.812 | 0.844 |
| 90% | 0.833 | 0.896 | 0.917 | 0.931 |
| 95% | 0.921 | 0.951 | 0.961 | 0.967 |

Graduation at 0.90 is reachable at N1 with ~90% accuracy under this model;
F1’s ceiling at 90% is 0.833, so Locate is not an F1 grind. (Step 4 makes that
a hard rule.)

---

## Learn vs Test scale (to reconcile later)

Learn Tier 1 still gains at **1.0**. F1 Test gains at **0.5**. An easy typed
Learn question can move the cell more than a Find-it-1 Test click. That’s
arguable (free recall on a map is harder than multiple choice) but the two
systems are **not on a common scale**. Revisit when `LEARN_EMA_MULTIPLIERS`
are retuned. Do not silently multiply Learn by F1’s 0.5 — Learn always posts F1,
which would halve every Learn gain overnight.

---

## Read-side behaviour

- Display and Learn sampling now read the same cell (`domainScoresFromStats`
  and `buildDomainMasteryMap` agree).
- Proving cascade helpers (`getCascadedMastery`, `buildCascadedStat`,
  `cascadedLevelScore`) stay; callers pass empty proving stats. F2-proves-F1 is
  inherent (one EMA).
- Go: a miss at any level can enter the pool; skip if the cell is graduated.
- World Test: skip on `graduated` alone (`level` is last-played, not identity).
- Legacy `LEVEL_WEIGHTS` category header (mobile mastery bars): the one general
  score is copied into F1/F2/N1/N2 so `computeCountryScore` equals the cell
  (weights still 0.15/0.25/0.25/0.35). Formula untouched; feed is the projection.
- Results mastery table: one Mastery column (not four identical percents).
  Last-played is not shown on region averages (it’s per-country, not per-region).

`applyWorldlyCurve`, recency suppression, and Learn tier/question selection are
untouched.

---

## Step 0 leftovers this pass did not anticipate

- Upsert never wrote `level` on `DO UPDATE` (it was the conflict key). It must
  now, or last-played freezes at the first attempt.
- `getCountryStatsForUser({ level })` had no callers but would have reintroduced
  a predicate; the option is gone.
- Fresh `CREATE TABLE` still had `UNIQUE (user_id, country_id, mode, level)`.
  Removed so new environments don’t start from the old key.
- Mobile Learn built `masteryById` by last-write on F1 rows only, including
  colliding `general` / `location` / `facts` scores. Collapse without switching
  it to `buildDomainMasteryMap` would have treated last-played ≠ F1 as unseen
  **and** still overwritten domains.
- Rollback has to restore the **old uniques before** inserting the backup.
- Live data has no 4-row groups; the test fixture still covers that case.

---

## Graduation floor (separate, later commit)

Test-only Locate requires N1+ and `fast_streak ≥ 3`. Isolated so the floor can
move to N2 without reverting the collapse.
