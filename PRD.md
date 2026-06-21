# PRD: Country Reference Panel

## Overview

Add an optional in-game **Country Reference Panel** for **Learning mode** — a toggleable panel users can open during a quiz to see factual details about the current country (capital, flag, region, population, languages, etc.). The panel is a **learning aid**, not an answer key: anything that would directly reveal the current round’s answer is hidden until the round enters **reveal mode**.

---

## Problem

Users learning geography often need contextual clues without being handed the answer. Today the game only shows what the mode requires (country name, capital, or flag). There is no way to see related facts — e.g. when guessing a capital, seeing region or population can reinforce memory — without spoiling the quiz.

---

## Goals

- Help users learn connections between country, capital, flag, region, population, and languages.
- Never show the field the user is currently being tested on (unless the round is in **reveal** state).
- Keep the map and main prompt usable while the panel is open (especially for Find-it modes).
- Let users control the panel **per round** and set a **default on/off** preference.
- Ship v1 in **Learning mode only**; expand to Test mode later if it works well.

## Non-goals (v1)

- Reference panel in **Test mode** (deferred).
- Browsing all countries in the region independent of the current round.
- User-configurable “which fields to hide.”
- Spaced-repetition or flashcard mode inside the panel.
- Offline Wikipedia integration.
- Showing reference info on the start screen or results page.
- Separate “continent” field (same as region — see Data model).

---

## Decisions (locked)

| Question | Decision |
|----------|----------|
| Continent vs region | **Same thing.** Display as **Region** only (Africa, Asia, Europe, …). No duplicate continent row. |
| Capitals Find-it | Header shows capital → panel **must not** show country name or capital. |
| Flags modes | Hide flag + country name. Hints: **capital, region, population, languages**. |
| Test mode | **Learning mode only** for v1. |
| Reveal mode | Unlock all hidden fields when reveal starts (user clicks after max wrong attempts). |
| Per-question control | User can **open/close panel each round** via header toggle. |
| Default preference | User can set **default on or off** for new rounds (persisted in `localStorage`). |

---

## Recommended approach

### 1. UI: Side panel, not a blocking modal

| Option | Verdict |
|--------|---------|
| Full-screen modal overlay | **Avoid** — blocks the map in Find-it modes. |
| Floating card on map | Already used for flags; too small for many fields. |
| **Slide-out side panel (desktop) / bottom sheet (mobile)** | **Recommended** — map stays visible; familiar “study notes” pattern. |

**Availability:** Panel UI and toggle appear **only in Learning mode** during an active game.

**Trigger:** A **“Reference”** button in the game header (Learning games only). Toggles panel open/closed for the **current round**.

**Default preference:** Setting stored in `localStorage` (key e.g. `geography.referencePanelDefaultOpen`). When a **new round starts**, panel open state resets to this default. Toggling during a round does not change the default.

**Where to set default:** Learning setup step (after session size) or a small control on the learning session screen — e.g. “Reference panel: On by default / Off by default”. v1 can also live in a gear on the start screen Learning path.

**Content:** Label/value rows for each visible field, plus flag image when shown.

```
┌─────────────────────────────────────────────┐
│ Menu  [Reference]   Flags · Asia · L1       │
├──────────────────────────┬──────────────────┤
│                          │ Reference    [×] │
│         MAP              │ Capital: Kabul   │
│                          │ Region:  Asia    │
│   [flag card]            │ Population: 41M  │
│                          │ Languages: …     │
└──────────────────────────┴──────────────────┘
```

On narrow screens, the panel becomes a bottom sheet (~40% height) so the map remains partially visible.

**Round lifecycle:**

1. New round starts → apply `referencePanelDefaultOpen` (open or closed).
2. User taps Reference → toggle open/closed for this round only.
3. Round ends → next round resets to default again.

### 2. Which country?

**v1: Always the current round’s `targetCountry`.**

- Simple mental model: “Help me with *this* question.”

**Future:** Optional “last clicked country” when exploring the map outside reveal mode.

### 3. Spoiler rules (core logic)

Centralize in `lib/referencePanel.js`:

```js
getReferenceVisibility({ mode, level, revealMode })
// → { country, capital, flag, region, population, languages }
// each: 'visible' | 'hidden'
// revealMode → all 'visible'
```

**Rule:** If a field would reveal the answer being tested, it is `hidden`. Otherwise `visible`.

| Mode | Level type | User is tested on | Hide in panel |
|------|------------|-------------------|---------------|
| Countries | Find it | Click country (prompt = name) | Country |
| Countries | Name it | Type country name | Country |
| Capitals | Find it | Click country (prompt = capital in header) | **Country, capital** |
| Capitals | Name it | Type capital | Capital |
| Flags | Find it | Click country (prompt = flag) | Flag, country |
| Flags | Name it | Type country name (prompt = flag) | Flag, country |

**Always visible (when not hidden by mode):** region, population, languages.

**Capitals Find-it example:** Header says “Paris” → panel may show region (Europe), population, languages, flag — **not** “France” or “Paris”.

**Flags example:** Flag shown on map → panel may show capital, region, population, languages — **not** flag image or country name.

**Reveal mode:** All fields visible immediately when reveal starts.

**Review rounds (Learning):** Same hide rules as the active level/mode.

### 4. Data model

**Today:** `countries.json` has `iso3`, `name`, `capital`, `enabled`, `region`. Runtime adds `iso2` from GeoJSON.

**New manifest fields (via `generate-countries.js`):**

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `population` | `number \| null` | dr5hn countries JSON | Display formatted (e.g. 41.2M). Omit row if null. |
| `languages` | `string[]` (max 2) | dr5hn or language dataset | Top 2 by speaker count or API order. Display as “Lang1, Lang2”. |

**Region:** Existing `region` id (`africa`, `asia`, …) → label via `REGIONS`. Label shown as **Region** (not “Continent”).

**Panel display fields (v1):**

| Field | Hide when |
|-------|-----------|
| Country | Testing country name (Countries/Flags name modes; Flags find) |
| Capital | Testing capital; **also hidden in Capitals find** |
| Flag | Testing flag (Flags modes) |
| Region | Never (answer is never region) |
| Population | Never |
| Languages | Never |

Extend `scripts/generate-countries.js` to merge `population` and top-2 `languages` from dr5hn countries JSON (same source as capitals). Preserve manual edits: merge script should update generated fields without wiping `enabled` / `region` overrides if we add a merge mode later; v1 can regenerate full file like today.

**Empty values:** Omit row or show “—”; never render hidden values in DOM.

### 5. Hidden field UX

**Omit hidden rows entirely.** Footnote when any field is hidden:

*“Some details hidden while you’re guessing.”*

On reveal, footnote removed and all rows shown.

### 6. Integration points

| File | Change |
|------|--------|
| `lib/referencePanel.js` | **New** — visibility rules + field formatters (population, languages) |
| `lib/referencePanelPrefs.js` | **New** — `localStorage` default open/closed |
| `lib/countries.js` | Pass through `population`, `languages` from manifest |
| `data/countries.json` | Add `population`, `languages` |
| `scripts/generate-countries.js` | Populate new fields from dr5hn |
| `components/CountryReferencePanel.jsx` | **New** — panel UI |
| `components/GeographyGame.jsx` | Learning-only toggle, per-round state, default on new round |
| `components/StartScreen.jsx` | Default on/off preference in Learning flow (optional v1 placement) |
| `app/globals.css` | Panel / sheet styles |

### 7. Accessibility

- Reference button (Learning only): `aria-expanded`, `aria-controls="country-reference-panel"`.
- Panel: `role="complementary"`, labelled “Country reference”.
- Esc closes panel for current round.
- Hidden fields omitted from DOM (not visually hidden text).

---

## Toggle behavior (detailed)

### Default preference

- **Key:** `geography.referencePanelDefaultOpen` (boolean, default `false`).
- **UI:** Toggle on Learning setup or session screen — “Reference panel on by default”.
- **Behavior:** Each `startRound()` sets `referencePanelOpen = defaultOpen`.

### Per-round toggle

- **UI:** Header “Reference” button (only when `gameType === LEARNING` and game active).
- **Behavior:** Flips `referencePanelOpen` for current round only.
- **Does not** write to `localStorage` unless user explicitly changes the default setting elsewhere.

### When panel is “off” for a round

- Panel not rendered / not visible.
- Reference button still visible so user can turn it on mid-round.

---

## Alternatives considered

### A. Hint ladder (progressive reveal)

Rejected for v1 — overlaps with existing reveal flow.

### B. Encyclopedia mode (browse region)

Deferred — different surface (“Study mode”).

### C. Test mode in v1

Deferred — validate in Learning first.

---

## Success metrics (post-launch)

- Panel opened in ≥15% of **learning** sessions.
- Users change default preference (indicates intentional use).
- No spike in first-try correct rate in Learning that suggests spoiling.

---

## Implementation phases

### Phase 1 — MVP (Learning mode only)

- [ ] Extend `generate-countries.js` + `countries.json` with `population` and `languages` (top 2).
- [ ] `lib/referencePanel.js` visibility rules (including Capitals find: hide country + capital).
- [ ] `lib/referencePanelPrefs.js` for default open preference.
- [ ] `CountryReferencePanel` component (side panel + mobile bottom sheet).
- [ ] `GeographyGame`: Learning-only Reference button; per-round open state; reset to default each round.
- [ ] Default on/off control in Learning setup flow.
- [ ] Reveal mode unlocks all fields.

### Phase 2 — Polish

- [ ] Keyboard shortcut (`?` or `i`) to toggle panel.
- [ ] Brief “full facts” view after correct answer (optional).
- [ ] Signed-in user preference sync (if accounts get settings later).

### Phase 3 — Expansion

- [ ] Enable in Test mode with same hide rules.
- [ ] Study/browse mode outside active rounds.
- [ ] More fields (currency, neighbors).

---

## Appendix: Visibility matrix

```
mode       level   hide in panel
──────────────────────────────────────────
countries  find    country
countries  name    country
capitals   find    country, capital
capitals   name    capital
flags      find    flag, country
flags      name    flag, country

always show (if panel open): region, population, languages
revealMode → show all fields

scope: Learning mode only (v1)
```

## Appendix: Example panel contents

**Capitals · Find it · Learning** (header prompt: “Ottawa”)

| Field | Shown? |
|-------|--------|
| Country | Hidden |
| Capital | Hidden |
| Flag | Visible |
| Region | North America |
| Population | 39.5M |
| Languages | English, French |

**Flags · Name it · Learning** (flag in header/card)

| Field | Shown? |
|-------|--------|
| Country | Hidden |
| Capital | Visible |
| Flag | Hidden |
| Region | Asia |
| Population | 17.5M |
| Languages | Khmer, … |
