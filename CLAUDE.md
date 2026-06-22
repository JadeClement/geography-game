# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run db:setup     # Create/migrate DB tables (run after schema changes)

npm run generate-countries   # Regenerate data/countries.json from source
npm run generate-globe-map   # Regenerate public globe map asset
```

There is no test suite. Type checking is also not configured — this is plain JSX, not TypeScript.

## Environment

Required env vars (`.env.local`):
- `DATABASE_URL` — PostgreSQL connection string
- `NEXT_PUBLIC_MAPBOX_TOKEN` — Mapbox GL token
- `AUTH_SECRET` — NextAuth secret

## Architecture

### Stack
Next.js 15 (App Router), React 19, PostgreSQL via raw `pg` (no ORM), NextAuth v5 (JWT sessions, credentials only), Mapbox GL, Tailwind CSS.

### Data flow overview
The entire game runs in a single route (`/`). `app/page.js` renders either `StartScreen` or `GeographyGame` depending on URL search params. Game state lives exclusively in `GeographyGame.jsx` (1600+ lines) — no global state management.

### Country data
Static country metadata (name, ISO3, capital, population, languages, neighbors, region, enabled flag) lives in `data/countries.json`. GeoJSON geometry is loaded at runtime from `public/` via `lib/countries.js`. The `iso3` code is used as the country ID throughout.

### Game modes and levels
- **Modes** (`lib/regions.js`): `countries`, `capitals`, `flags`
- **Levels** (`lib/levels.js`): `F1` (Find fill), `F2` (Find flash), `N1` (Name fill), `N2` (Name flash)
- **Game types** (`lib/gameTypes.js`): `test` or `learning`

The "find" levels ask users to click a country on the map; "name" levels ask users to type the country name. "Fill" means the map fills in as you go; "flash" means countries disappear.

### Mastery system
`lib/mastery.js` implements an EMA (exponential moving average) mastery score per country per user per mode per level. Key concepts:
- `masteryScore` (0–1) updated on each attempt via `computeMasteryUpdate()`
- `graduated` flag: set when mastery ≥ 0.9 and `fastStreak` ≥ 3 in Test mode
- Time decay applied to graduated countries via `getDecayAdjustedMastery()`
- Mastery "proves downward" within sections: F2 mastery counts toward F1, N2 toward N1 (`getMasteryProvingLevels`)

### Learning queue
`lib/learning.js` — weighted random sampling without replacement, weighting weaker countries higher. Used to build the country queue for learning sessions.

### Database schema
Managed via `scripts/setup-db.js` (idempotent, run with `npm run db:setup`). Tables:
- `users` — auth
- `game_scores` — best score per user/mode/region/level
- `country_stats` — per-country mastery data (EMA scores, streaks, attempt counts)
- `country_attempts` — raw attempt log

All DB access goes through `lib/db.js`. The user ID comes from `session.user.id` (NextAuth JWT token).

### API routes
All under `app/api/`:
- `auth/` — NextAuth handlers
- `mastery/` — GET/POST mastery stats
- `country-stats/` — GET weak countries for learning, POST record attempt
- `scores/` — GET/POST game scores

### Start screen navigation
The start screen is a multi-step wizard driven entirely by URL search params (`step`, `mode`, `region`, `type`, `level`). Navigation logic and param validation live in `lib/startNavigation.js`. `?play=1` triggers the game directly.

### Map rendering
Two map backends: `MapboxMap.jsx` (main) and `PacificMap.jsx` (Oceania region workaround for Pacific-centered view). `lib/geometry.js` handles GeoJSON building and map view calculations. Small countries get separate dot markers via `buildSmallCountriesGeoJSON`.

### Styling
Tailwind with a custom dark theme. CSS variables are defined in `app/globals.css`. Use `var(--color-*)` where Tailwind doesn't cover the theme. No CSS modules or separate CSS files for components.

### Auth
`auth.js` at the repo root configures NextAuth. Credentials only (email + password, bcrypt). JWT sessions — access `session.user.id` for the user ID in server code via `auth()`, in client components via `useSession()`.
