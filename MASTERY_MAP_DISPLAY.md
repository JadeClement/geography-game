# Mastery map: one uncurved score at every scope

The mastery map panel, the header `% Worldly`, and `GET /api/mastery/all`
now show a single quantity — the per-country, per-domain EMA — as
`round(raw × 100)` at world (ring), region (list), and country (paint /
tooltip) scope. The display curve is gone. The ring is a domain average,
not a located-country count. The glow bar is a 0–100 legend for that
same scale.

> Status: implemented and covered by `apps/web/scripts/test-worldly-score.js`.
> Approach for the curve: **`applyWorldlyCurve` is the identity `raw × 100`**
> (not deleted), so a differently-shaped curve can slot back in later.
> `WORLDLY_CURVE_BREAKPOINTS` remains in `packages/constants/index.js` but
> is unused.

---

## Files modified

### Score / API
- `packages/core/worldlyScore.js` — `applyWorldlyCurve` is identity;
  new `displayPercent` (`round(raw × 100)`); `percent` is that whole
  number; `rawPercent` and `byDomainDisplay` removed from the return
  object; `computeWorldlyBeforeAfter` rounds both sides with
  `displayPercent`.
- `packages/constants/index.js` — comment on `WORLDLY_CURVE_BREAKPOINTS`
  (kept, unused).
- `apps/web/app/api/mastery/all/route.js` — stopped returning
  `rawPercent` / `byDomainDisplay`.
- `apps/web/lib/countryStats.js` — `fetchAllMasteryStats` no longer
  forwards those fields.

### Mastery map
- `apps/web/lib/masteryMap.js` — `tabAverageRaw` / `tabDisplayPercent`,
  `countryStartedForTab` / `countStartedForTab`; region helpers round
  uncurved percents and include `count` for the weighted-average check.
- `apps/web/components/MasteryPage.jsx` — ring is the domain average
  (All = Worldly composite); coverage line `{n} of 200 started`; glow
  legend `0%`–`100%` on every tab; region list on every tab; tooltip
  shows the active-tab percent.
- `apps/web/components/CountryMasteryModal.jsx` — country-level percents
  use `displayPercent`.
- `apps/web/components/HowItWorksPage.jsx` — Worldly-score copy no
  longer describes the 0.75 → 80 curve.
- `apps/mobile/components/mastery/WorldlyRing.tsx` — whole-number
  percent (was one decimal of the curved value).

### Tests
- `apps/web/scripts/test-worldly-score.js` — identity curve, uncurved
  percent at world/region/country, ring = country-count-weighted
  average of region rows, unseen = 0 / not-started, coverage counts,
  header = All-tab ring, milestone upward-crossing.

---

## API field changes

`GET /api/mastery/all` (and `fetchAllMasteryStats`):

| Field | Before | After |
|---|---|---|
| `score` | raw 0–1 composite | unchanged |
| `percent` | curved 0–100, 1 decimal | uncurved whole number, `round(score × 100)` |
| `rawPercent` | uncurved 1 decimal | **removed** |
| `byDomain` | raw 0–1 per domain | unchanged |
| `byDomainDisplay` | each domain run through the curve | **removed** |
| `categories` | legacy countries/capitals/flags 0–1 | unchanged |

Empty / missing-table fallback on the same route dropped those two
fields as well.

### Consumers of the removed / changed fields

**`percent` (now uncurved; was curved)** — still the right field, new
meaning:
- `apps/web/components/AppHeader.jsx` — header `% Worldly`
  (`Math.round(masteryData.percent)`; already a whole number).
- `apps/web/app/api/leaderboard/route.js` — friend leaderboard
  `worldly` column (`Math.round(percent)`).
- `apps/web/lib/push-notifications.js` — overtake / score push copy.
- `apps/web/components/HowItWorksPage.jsx` — signed-in Worldly callout
  (recomputes locally via `computeWorldlyScoreFromMastery`).
- `apps/web/components/GameCompleteModal.jsx` — milestone crossing via
  `computeWorldlyBeforeAfter` → `after.percent`.
- Mobile does **not** read API `percent`. It refetches `mastery` and
  recomputes with `computeWorldlyScoreFromMastery`:
  - `apps/mobile/app/(tabs)/index.tsx` home `%`
  - `apps/mobile/app/(tabs)/mastery.tsx` `WorldlyRing`
  - `apps/mobile/app/_layout.tsx` widget `worldlyPercent`
  - `apps/mobile/app/game/session.tsx` post-game percent
- `packages/api-client/index.js` `getAllMastery()` is an untyped pass-
  through of the JSON body; no field names to update.

**`rawPercent`** — no remaining runtime consumers (debug/compare only
on the old payload). Removed.

**`byDomainDisplay`** — `MasteryPage` All-tab “Skills” list. Removed
with that list (region scores replace it). No mobile consumer.

---

## Panel behaviour

| Tab | Ring | Label | Coverage |
|---|---|---|---|
| All | composite domain-weighted average (`percent`) | `WORLDLY` | any-domain row |
| Countries | location average | `COUNTRIES` | location (or `general` countries) row |
| Capitals | capital average | `CAPITALS` | capital row |
| Flags | flag average | `FLAGS` | flag row |

Denominator is always the 200-country world. Unseen countries count as
0 and as not-started.

The ring is the country-count-weighted average of the region rows, not
the mean of the region percentages. On this account the Countries ring
(12%) matches `(16·54 + 2·48 + 32·46 + 0·24 + 2·16 + 0·12) / 200`.

Glow bar: heading `{tab} GLOW`, endpoints `0%` / `100%`, linear
gradient from the dim land colour to the tab accent. No Learning /
Located wording on this panel. Share image now stamps `{pct}% {label}`
instead of `{located} / 200 located`.

---

## Live users — before / after

Only two accounts have `country_stats` rows. Numbers are decay-adjusted
EMA, denominator 200. “Before” is the old curve then `round` to a whole
percent (what the UI showed). “After” is `round(raw × 100)`.

### `jadecathclement` (jade clement)

| Scope | Raw | Before (curved) | After (uncurved) |
|---|---|---|---|
| Header / All ring (Worldly) | 5.03% | **4%** | **5%** |
| Countries (location) | 12.30% | **10%** | **12%** |
| Capitals | 3.21% | 3% | 3% |
| Flags | 0.26% | 0% | 0% |
| Coverage (All / Countries) | — | 0 / 200 located | **150 of 200 started** |

Countries-tab regions (the list that used to disagree with the 0% ring):

| Region | Before | After |
|---|---|---|
| Africa | 13% | 16% |
| Asia | 2% | 2% |
| Europe | 27% | 32% |
| North America | 0% | 0% |
| Oceania | 2% | 2% |
| South America | 0% | 0% |

Your expected 4.4% → 4% / 12.5% → 13% was the right *shape* of the old
curve; the live EMA is a bit higher than that sketch (5.03% Worldly,
12.30% location), so the displayed header goes 4 → 5 and Countries 10 → 12.

All-tab ring is 5%, identical to the header.

### `jade_clement` (Jade Clement, utoronto)

| Scope | Raw | Before | After |
|---|---|---|---|
| Header / All ring | 0.006% | **0%** | **0%** |
| Countries / Capitals / Flags | ~0 / 0 / 0 | 0% | 0% |
| Coverage (All) | — | 0 / 200 located | **6 of 200 started** |

Everyone else in `users` has zero `country_stats` rows, so they stay at
0% / 0 started.

---

## Milestone behaviour change

`WORLDLY_MILESTONES` is still `[25, 50, 75, 90, 100]`. Crossing is still
once, on an upward crossing, now against the **uncurved** displayed
percent.

Previously 25% displayed at raw ~0.30 (curve between 0.25→20 and
0.5→45). It now fires at raw 0.25. Same for the other thresholds: they
arrive at a lower raw score than before. `computeWorldlyBeforeAfter`
rounds both before and after, so the toast matches the header digit.

---

## Paint vs legend (not changed)

The glow **bar** is linear 0–100. Map **paint** is not:

- **Countries / Capitals / Flags** (`paintMode: "score"`): fill opacity
  interpolates `0 → 0`, `0.2 → 0.22`, `0.6 → 0.55`, `1 → 0.95`. A
  country at 12% is dimmer than 12% of the legend bar. The outline
  glow only appears at score ≥ 0.85.
- **All** (`paintMode: "tiers"`): fill **colour** is still discrete
  spotted / located / worldly from `getMasteryTier` (map decoration,
  left alone). Opacity is even more front-loaded (`0.003 → 0.28`) so
  the first Learn tick is visible. Outline only for worldly (tier 3).

So shade is not a reliable readout of the percent on any tab, and All
uses a different hue language than the 0–100 bar. Left as-is per
“report, don’t retune the ramp” — say if you want paint linearized to
match.

---

## What else was reading the curve or the located count

| Surface | What it did | What I did |
|---|---|---|
| Header `% Worldly` | `percent` (curved) | Follows new `percent` |
| Leaderboard | `Math.round(percent)` | Follows new `percent` (jade 4 → 5) |
| Push notifications | `Math.round(percent)` | Follows new `percent` |
| How It Works | copy described 0.75 → 80; live % from `percent` | Copy updated; live % uncurved |
| Share image | `{located} / 200 located` | `{pct}% {label}` |
| Country modal | curved domain % | uncurved |
| Results page mastery table | `regionDomainDisplayPcts` (curved) | uncurved (same helper) |
| Mobile home / mastery / widget / session | local `computeWorldlyScoreFromMastery().percent` | automatically uncurved |
| Mobile `WorldlyRing` | one decimal of curved % | whole number |
| Game-complete Worldly toast | curved before/after | uncurved whole percents |
| `MASTERY_TIERS` / `getMasteryTier` | All-tab **counts** + map colour + game-complete “region is worldly” | Counts removed from this panel only. Map colour and `GameCompleteModal` region-worldly flags untouched. `countLocatedForTab` / `countTierLabel` still exist, unused by the panel. |
| All-tab Skills list | `byDomainDisplay` for all 6 domains | Removed. Neighbors / statistics / facts no longer have a panel number; they still feed the All composite. Location / capital / flag world averages are the other tabs’ rings. |

Docs that still describe the old curve (not edited): `LEARN_MODE_CHANGES.md`,
`LEARN_MODE_CURRENT_STATE.md`.

Out of scope, untouched: level-collapse, `LEVEL_GAIN_MULTIPLIERS`,
graduation floor, `WORLDLY_DOMAIN_WEIGHTS`, EMA / recency / Learn
selection.
