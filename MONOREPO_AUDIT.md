# Worldly monorepo audit

Read-only audit of `/Users/jadeclement/Developer/geography` as of 2026-08-09.  
No code was changed except creation of this file.

**Product:** Worldly — a Next.js geography learning game (countries / capitals / flags) with Test, Learn, Discover, and Go! modes, Mapbox maps, PostgreSQL mastery tracking, Auth.js sessions, friends leaderboard, and email verification via Resend.

**Shape:** Single Next.js 15 App Router app (not a monorepo yet). There is no separate Express server, no mobile app, no push notifications, and no Prisma schema in use (`prisma/` is an empty directory).

**Asset note:** ~910 static MP3 pronunciation files live under `public/audio/`. Those are summarized by folder (count + naming convention) rather than listed one-by-one; every other non-excluded source/config file is listed in the tree below.

---

## 1. Full file tree

Excludes: `node_modules/`, `.git/`, `.next/`, `.expo/`, `*.log`, lock files (`package-lock.json`).

```
geography/
├── .claude/
│   └── settings.local.json          # Local Claude/Cursor agent settings (not app runtime)
├── .env                             # Local secrets (gitignored); see §3
├── .env.example                     # Documented env var template for developers
├── .gitignore                       # Ignores node_modules, .next, dist, .env, .DS_Store
├── AGENTS.md                        # Cursor Cloud / agent runbook (Postgres, env, build)
├── AUDIT.md                         # Older security/architecture audit notes (2026-06)
├── BUGS.md                          # Bug audit with DONE/open findings (2026-07)
├── CLAUDE.md                        # Architecture + commands for Claude Code
├── IDEAS.md                         # Product ideas backlog
├── IMPROVEMENTS.md                  # Product/UX improvement suggestions
├── LEARN_MODE_CHANGES.md            # Learn engine change log (partially stale vs current wiring)
├── MONOREPO_AUDIT.md                # This document
├── POLISH.md                        # Polish / dead-code / UX nits
├── PRD.md                           # Product requirements (reference panel, etc.)
├── auth.js                          # NextAuth v5 config: credentials provider, JWT session callbacks
├── jsconfig.json                    # Path alias @/* → ./*
├── next.config.mjs                  # Next config; long-cache header for GeoJSON
├── package.json                     # npm scripts and dependencies
├── postcss.config.mjs               # Tailwind v4 PostCSS plugin wiring
│
├── app/                             # Next.js App Router
│   ├── layout.js                    # Root layout: Averia Libre, theme FOUC script, providers
│   ├── page.js                      # `/` — Suspense + GeographyGame (start + play)
│   ├── globals.css                  # Tailwind v4 theme tokens + global styles
│   ├── __learn_check/               # Empty placeholder directory (no files)
│   ├── account/page.js              # `/account` → AccountPage
│   ├── settings/page.js             # `/settings` → SettingsPage
│   ├── mastery/page.js              # `/mastery` → MasteryPage
│   ├── scoreboard/page.js           # `/scoreboard` → ScoreboardPage (friends leaderboard)
│   ├── results/page.js              # `/results` → ResultsPage (personal bests)
│   ├── results/how-it-works/page.js # `/results/how-it-works` → HowItWorksPage
│   ├── forgot-password/page.js      # `/forgot-password` → ForgotPasswordPage
│   ├── reset-password/page.js       # `/reset-password` → ResetPasswordPage
│   ├── verify-email/page.js         # `/verify-email` — server-consumes token, then VerifyEmailPage
│   └── api/
│       ├── auth/[...nextauth]/route.js           # Auth.js GET/POST handlers
│       ├── auth/register/route.js                 # POST register + verification email
│       ├── auth/forgot-password/route.js          # POST request password reset
│       ├── auth/reset-password/route.js           # GET validate token; POST set password
│       ├── auth/verify-email/route.js             # POST verify with token
│       ├── auth/verify-email/resend/route.js      # POST resend verification (authed)
│       ├── auth/verification-status/route.js      # GET emailVerified for current user
│       ├── scores/route.js                        # GET/POST personal best scores
│       ├── mastery/route.js                       # GET mastery for one mode
│       ├── mastery/all/route.js                   # GET mastery for all modes
│       ├── country-stats/route.js                 # GET weak countries; POST attempt + EMA
│       ├── streak/route.js                        # GET/POST practice streak
│       ├── learn-facts/route.js                   # GET/POST seen Learn facts
│       ├── leaderboard/route.js                   # GET friends leaderboard + requests
│       └── users/
│           ├── friends/route.js                   # GET friends; POST friend request
│           ├── friend-requests/[requestId]/route.js # PATCH accept/decline
│           ├── search/route.js                    # GET username prefix search
│           ├── profile/route.js                   # GET/PATCH profile + avatar
│           ├── username/route.js                  # GET/PATCH username only
│           └── game-tour/route.js                # GET/POST first-time tour flag
│
├── components/
│   ├── GeographyGame.jsx            # ~3981 lines — root game shell (all modes)
│   ├── MapboxMap.jsx                # ~1729 lines — Mapbox GL country map
│   ├── PacificMap.jsx               # ~783 lines — SVG Pacific-centered Oceania map
│   ├── StartScreen.jsx              # Multi-step start wizard (URL search params)
│   ├── AppHeader.jsx                # Global nav, %Worldly, streak, auth menu
│   ├── ScoreboardPage.jsx           # Friends leaderboard + add-friends UI
│   ├── AccountPage.jsx              # Profile / avatar editor
│   ├── MasteryPage.jsx              # Mastery explorer host
│   ├── MasteryMap.jsx               # Mapbox mastery heat/tier map
│   ├── ResultsPage.jsx              # Personal bests + mastery grids
│   ├── HowItWorksPage.jsx           # Scoring / modes explanation
│   ├── GameCompleteModal.jsx        # End-of-game results, save, streak, learn summary
│   ├── GameTutorial.jsx             # Spotlight onboarding tutorial
│   ├── GameTutorialButton.jsx       # Opens tutorial from game chrome
│   ├── GameModeIntro.jsx            # First-time mode intro modal
│   ├── CountryLearnMorePanel.jsx    # Hints / reference / facts side panel
│   ├── MapCountryInfoPanels.jsx     # Desktop panel vs mobile sheet wrapper
│   ├── DiscoverMapLabels.jsx        # HTML overlay labels (discover + learn teach)
│   ├── DiscoverCountrySheet.jsx     # Mobile discover country details
│   ├── DiscoverCompleteModal.jsx    # Discover completion CTAs
│   ├── DiscoverTerritoryModal.jsx   # Note for overseas territories in Discover
│   ├── MapFeedback.jsx              # Floating correct/wrong toast over map
│   ├── FlagPrompt.jsx               # Flag image for quiz prompts
│   ├── RegionMapPicker.jsx          # Clickable region chooser on start
│   ├── CelebrationOverlay.jsx       # Confetti for %Worldly milestones
│   ├── IdlePromptModal.jsx          # “Still playing?” idle prompt
│   ├── AuthModal.jsx                # Sign-in / sign-up modal
│   ├── AuthProvider.jsx             # next-auth SessionProvider wrapper
│   ├── EmailVerificationBanner.jsx  # Unverified-email banner + resend
│   ├── VerifyEmailPage.jsx          # Verify status / resend UI
│   ├── ForgotPasswordPage.jsx       # Request reset email
│   ├── ResetPasswordPage.jsx        # Token password reset form
│   ├── SettingsPage.jsx             # Theme, volume, voice, prefs
│   ├── ThemeProvider.jsx            # Light/dark theme context
│   ├── ThemeToggle.jsx              # Theme toggle control
│   ├── SoundVolumeButton.jsx        # In-game mute toggle
│   ├── PronunciationButton.jsx      # Play country/capital pronunciation
│   ├── SpinningGlobe.jsx            # Canvas home globe (three.js + SVG texture)
│   ├── SpaceBackground.jsx          # Starfield behind start screen
│   ├── StartBackButton.jsx          # Wizard back control
│   ├── UserAvatar.jsx               # Color / flag / image avatar renderer
│   ├── AvatarCropModal.jsx          # Pan/zoom crop for uploaded avatars
│   ├── FriendAddedToast.jsx         # “X is now your friend” toast (UNUSED)
│   ├── learn/
│   │   ├── LearnRoundOverlay.jsx         # Learn question card + Continue footer
│   │   ├── LearnQuestionRenderer.jsx     # Routes answerType → question UI
│   │   ├── MultipleChoiceQuestion.jsx    # MCQ UI
│   │   ├── MultiSelectQuestion.jsx       # Multi-select UI
│   │   ├── MultiTextEntryQuestion.jsx    # Multi-blank text entry UI
│   │   ├── BinaryChoiceQuestion.jsx      # A/B compare cards
│   │   ├── YesNoQuestion.jsx             # Yes/No UI
│   │   ├── ClueButton.jsx                # Progressive clue reveal (needs clue strings)
│   │   ├── LearnFactModal.jsx            # Mobile fact sheet (UNUSED / orphaned)
│   │   └── LearnSessionSummary.jsx       # End-of-Learn type breakdown + deltas
│   └── ui/
│       ├── Input.jsx                # Shared labeled text input
│       ├── Checkbox.jsx             # Shared checkbox
│       ├── Dropdown.jsx             # Shared dropdown
│       └── ValidationMessage.jsx    # Form error / help text
│
├── data/
│   ├── countries.json               # 238 countries (200 enabled): metadata + facts
│   ├── country-highlights.json      # Extra “highlight” facts keyed by ISO3
│   └── capital-alternates.json      # Extra accepted capital spellings by ISO3
│
├── lib/
│   ├── db.js                        # pg Pool + all SQL helpers (users, mastery, friends…)
│   ├── mastery.js                   # EMA, graduation, decay, cascade math
│   ├── worldlyScore.js              # %Worldly score formulas
│   ├── learning.js                  # Weighted learning queues
│   ├── levels.js                    # F1/F2/N1/N2 definitions + proving cascade
│   ├── regions.js                   # Modes, regions, geojson builders
│   ├── gameTypes.js                 # test / learning / discover
│   ├── countries.js                 # Manifest + GeoJSON load/merge + answer helpers
│   ├── constants.js                 # Timings, ISO overrides, name normalization
│   ├── geometry.js                  # Bbox/centroid/small-country/map-view math
│   ├── countryColors.js             # Deterministic fills + feedback palette
│   ├── countryStats.js              # ROUND_OUTCOMES + client fetch/record wrappers
│   ├── scores.js                    # Score client fetch/save
│   ├── capitals.js                  # Capital normalize / accept / quiz helpers
│   ├── flags.js                     # ISO2 resolve + flagcdn URLs
│   ├── spelling.js                  # Levenshtein near-miss suggestions
│   ├── adjacentCountries.js         # Neighbor ISO3 → display names
│   ├── comparison-clusters.js       # Pop/area peer clusters for Learn compares
│   ├── countryFacts.js              # Partition/order facts for UI
│   ├── referencePanel.js            # Learn More field visibility/format
│   ├── referencePanelPrefs.js       # localStorage: panel default open
│   ├── startNavigation.js           # Start wizard URL parse/build/validate
│   ├── ui.js                        # ~1673 lines Tailwind class catalog
│   ├── learnUi.js                   # Learn-specific Tailwind class catalog
│   ├── cn.js                        # clsx + tailwind-merge helper
│   ├── theme.js                     # Theme storage key + light/dark enum
│   ├── time.js                      # formatElapsedTime
│   ├── viewport.js                  # matchMedia mobile check
│   ├── validation.js                # Email/password validation
│   ├── usernames.js                 # Username normalize/validate/derive
│   ├── auth-db.js                   # Auth token + verification DB helpers
│   ├── auth-tokens.js               # crypto token generate/hash
│   ├── auth-url.js                  # Resolve public app origin for emails
│   ├── email.js                     # Resend client + HTML email templates
│   ├── verification.js              # Issue/consume email verification
│   ├── password-reset.js            # Issue password-reset email
│   ├── rate-limit.js                # DB-backed rate limiting
│   ├── avatars.js                   # Avatar validate + canvas crop/resize
│   ├── sounds.js                    # Correct/incorrect chime playback
│   ├── soundPrefs.js                # localStorage volume/mute
│   ├── pronunciation.js             # MP3 URL + HTMLAudio playback
│   ├── pronunciationPrefs.js        # localStorage voice preference
│   ├── pronunciationVoices.js       # Voice catalog (Joanna/Matthew folders)
│   ├── pendingGuestGame.js          # sessionStorage guest rounds + post-login sync
│   ├── onboardingPrefs.js           # Local tour-completion flag
│   ├── countryClickExpandPrefs.js   # Pref for map click-expand animation
│   ├── mapCountryClickExpand.js     # Mapbox click-expand layer animation
│   ├── mapboxGlobe.js               # Globe horizon occlusion helper
│   ├── pacificMapStyles.js          # Pacific SVG fill/circle visibility
│   ├── pacificMapView.js            # Pacific SVG viewBox pan/zoom math
│   ├── globeProjection.js           # Pacific/globe SVG projection math
│   ├── discoverLabels.js            # Discover instruction/label copy
│   ├── discoverLabelLayout.js       # Label collision layout geometry
│   ├── discoverLabelScale.js        # Label/flag size vs zoom
│   ├── discoverLabelVisibility.js   # Label visibility / occlusion rules
│   ├── discoverTerritories.js       # Non-playable territory click notes
│   ├── masteryMap.js                # Mastery map tier aggregation visuals
│   ├── milestones.js                # Post-game celebration milestone picker
│   ├── homeGreeting.js              # Time-of-day home greeting variants
│   ├── gameModeIntro.js             # Mode intro copy
│   ├── gameTutorial.js              # Tour id / goal label helpers
│   ├── gameTutorialSteps.js         # Tutorial step definitions
│   ├── spaceStars.js                # Starfield layer config
│   ├── regionMapColors.js           # Region picker palette
│   ├── hooks/
│   │   ├── useCountryQueue.js       # Classic game target queue cursor
│   │   ├── useGameBoard.js          # Map board visual state reducer
│   │   ├── useGameTimer.js          # Elapsed timer
│   │   ├── useRoundScoring.js       # Right/wrong + incorrect targets
│   │   ├── useIdleDetection.js      # Idle pause / return-to-menu
│   │   ├── useMobileViewport.js     # Reactive mobile breakpoint
│   │   ├── useFocusTrap.js          # Modal focus trap
│   │   ├── useSoundPrefs.js         # React wrapper for sound prefs
│   │   ├── usePronunciationPrefs.js # React wrapper for voice prefs
│   │   ├── useSyncRef.js            # Keep a ref mirrored to a value
│   │   └── useUserProfile.js        # Fetch /api/users/profile
│   └── learn/
│       ├── questionTypes.js         # Tiers, types, EMA multipliers, mastery bands
│       ├── questionGenerator.js     # Per-type question object builders
│       ├── sessionSequencer.js      # buildLearnSession ordering rules
│       ├── emaIntegration.js        # Answer event → outcome → POST payload
│       ├── factSelection.js         # Pick post-answer fact
│       ├── factsClient.js           # /api/learn-facts client wrappers
│       ├── sessionSummary.js        # End-of-session summary builders
│       ├── continueNotes.js         # Curated post-answer teaching notes
│       ├── wrongReveal.js           # Wrong-answer copy + map paint specs
│       └── resolveGuessedCountry.js # Resolve typed guess inside region
│
├── prisma/                          # Empty directory — Prisma is NOT used
│
├── public/
│   ├── globe-map.svg                # ~304KB texture for SpinningGlobe
│   ├── data/
│   │   └── countries.geojson        # ~14MB country boundary FeatureCollection
│   ├── sounds/
│   │   ├── correct-chime.wav        # ~338KB correct SFX
│   │   └── incorrect-chime.wav      # ~145KB incorrect SFX
│   └── audio/
│       ├── pronunciation/           # 200 MP3s — country names, voice Joanna
│       ├── pronunciation2/          # 238 MP3s — country names, voice Matthew
│       ├── pronunciation-capitals/  # 236 MP3s — capitals, voice Joanna
│       └── pronunciation-capitals2/ # 236 MP3s — capitals, voice Matthew
│       # Naming: {iso3 lowercase}.mp3 (e. g. usa.mp3). Generated offline via AWS Polly.
│
└── scripts/
    ├── setup-db.js                  # Idempotent Postgres schema + migrations
    ├── generate-countries.js        # Rebuild data/countries.json from sources
    ├── enrich-country-languages.js  # Re-rank languages via CLDR
    ├── enrich-country-geodata.js    # Add area + landlocked (one-off)
    ├── generate-globe-map.js        # Rebuild public/globe-map.svg
    ├── generate-pronunciations.js   # AWS Polly country-name MP3s
    ├── generate-capital-pronunciations.js # AWS Polly capital MP3s
    ├── audit-capitals.js            # Report missing/contested capitals
    ├── test-learn-mode.js           # Node test suite for Learn engine
    ├── test-discover-label-visibility.js
    ├── test-mapbox-globe.js
    ├── test-visible-anchor.js
    ├── alias-loader.mjs             # ESM @/ alias + JSON import for Node tests
    ├── register-alias.mjs           # Registers alias-loader via --import
    ├── restcountries.json           # Stale API error payload (not active input)
    └── lib/
        └── rankedLanguages.js       # CLDR language ranking shared by generate scripts
```

---

## 2. Package manager and dependencies

| Item | Value |
|------|--------|
| Package manager | **npm** (`package-lock.json` present; no yarn.lock / pnpm-lock.yaml) |
| Node version requirement | **None specified** — no `engines` field in `package.json` |
| App name / version | `geography-game` `1.0.0` (private) |

### Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | Dev server (default port **3000**) |
| `build` | `next build` | Production build |
| `start` | `next start` | Production server |
| `generate-countries` | `node scripts/generate-countries.js` | Regenerate `data/countries.json` |
| `enrich-languages` | `node scripts/enrich-country-languages.js` | Re-rank languages |
| `generate-globe-map` | `node scripts/generate-globe-map.js` | Regenerate globe SVG |
| `generate-pronunciations` | `node --env-file=.env scripts/generate-pronunciations.js` | Polly country MP3s |
| `generate-capital-pronunciations` | `node --env-file=.env scripts/generate-capital-pronunciations.js` | Polly capital MP3s |
| `db:setup` | `node --env-file=.env scripts/setup-db.js` | Create/migrate DB tables |
| `test:learn` | `node --import ./scripts/register-alias.mjs --test scripts/test-learn-mode.js` | Learn engine unit tests |

No ESLint / lint script. No TypeScript.

### `dependencies`

| Package | Version | Used for |
|---------|---------|----------|
| `next` | `^15.1.0` | App Router framework, API routes, SSR pages |
| `react` / `react-dom` | `^19.0.0` | UI |
| `next-auth` | `^5.0.0-beta.31` | Auth.js v5 credentials + JWT sessions |
| `bcryptjs` | `^2.4.3` | Password hash/compare (register, login, reset) |
| `pg` | `^8.16.0` | PostgreSQL client / connection pool |
| `mapbox-gl` | `^3.9.4` | Interactive web map (`MapboxMap`, `MasteryMap`) |
| `three` | `^0.184.0` | Canvas spinning globe on home (`SpinningGlobe`) |
| `polygon-clipping` | `^0.15.7` | Union geometries when merging Somaliland into Somalia |
| `resend` | `^6.14.0` | Transactional email (verify / reset / password-changed) |
| `clsx` | `^2.1.1` | Conditional class names (`lib/cn.js`) |
| `tailwind-merge` | `^3.6.0` | Deduplicate Tailwind classes (`lib/cn.js`) |

### `devDependencies`

| Package | Version | Used for |
|---------|---------|----------|
| `tailwindcss` | `^4.3.1` | Utility CSS |
| `@tailwindcss/postcss` | `^4.3.1` | PostCSS integration for Tailwind v4 |
| `@aws-sdk/client-polly` | `^3.848.0` | Offline pronunciation MP3 generation only |

---

## 3. Environment variables

| Variable | File(s) that read it | Public / secret | Used for | Present where |
|----------|----------------------|-----------------|----------|---------------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | `GeographyGame.jsx`, `MapboxMap.jsx`, `MasteryMap.jsx` | **Public** (client-baked) | Mapbox GL access token; without it gameplay map never starts | `.env`, `.env.example` |
| `DATABASE_URL` | `lib/db.js`, `scripts/setup-db.js` (via pool) | **Secret** | PostgreSQL connection string | `.env`, `.env.example` (comments mention Railway Postgres) |
| `AUTH_SECRET` | Auth.js (framework auto-read; not referenced as `process.env.AUTH_SECRET` in app source) | **Secret** | Signs JWT session cookies | `.env`, `.env.example` |
| `AUTH_URL` | `lib/auth-url.js` | Public origin URL (not a credential) | Absolute base for verify/reset email links; **required in production** | `.env`, `.env.example` |
| `VERCEL_URL` | `lib/auth-url.js` | Platform-injected hostname | Dev/fallback base URL when `AUTH_URL` unset | Hosting platform only (not in local `.env`) |
| `NODE_ENV` | `lib/db.js`, `lib/auth-url.js`, `lib/learn/emaIntegration.js` | Framework | Pool caching, prod AUTH_URL guard, suppress learn-ema debug logs | Runtime |
| `RESEND_API_KEY` | `lib/email.js` | **Secret** | Resend API; missing → sends fail soft (`{ sent: false }`) | `.env`, `.env.example` |
| `EMAIL_FROM` | `lib/email.js` | Config | From address; default `Worldly <onboarding@resend.dev>` | `.env`, `.env.example` |
| `AWS_ACCESS_KEY_ID` | Polly generate scripts | **Secret** | Offline audio generation | `.env`, `.env.example` |
| `AWS_SECRET_ACCESS_KEY` | Polly generate scripts | **Secret** | Offline audio generation | `.env`, `.env.example` |
| `AWS_REGION` | Polly generate scripts | Config | Default `us-east-1` | `.env`, `.env.example` |
| `POLLY_VOICE` | Polly scripts | Config | Voice name (default Joanna) | `.env` (optional / commented in example) |
| `POLLY_ENGINE` | Polly scripts | Config | `neural` / standard | Commented in `.env` / example |
| `POLLY_OUTPUT_DIR` | Polly scripts | Config | Output folder under `public/audio/` | Commented in example |

**Notes**
- `.env` exists and is gitignored; `.env.local` does not exist.
- Key names currently in `.env`: `NEXT_PUBLIC_MAPBOX_TOKEN`, `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `AWS_*`, `POLLY_VOICE`, `AUTH_URL` (values omitted from this audit).
- No Railway/Vercel config files in-repo; hosting is env-driven. Docs refer to Railway Postgres and a `VERCEL_URL` fallback.

---

## 4. Web app structure

### Framework and routing

- **Next.js App Router** (no `pages/` directory).
- Path alias: `@/*` → `./*` via `jsconfig.json` (not `tsconfig`; project is JSX/JS).
- No `middleware.js`. Auth enforced per API route via `await auth()`.

| Route | Renders | Data needs |
|-------|---------|------------|
| `/` | `GeographyGame` (start screen or play via `?play=1` + mode/region/type/level params) | Mapbox token, GeoJSON fetch, optional session for Learn gate / stats |
| `/account` | `AccountPage` | Session + `GET/PATCH /api/users/profile` |
| `/settings` | `SettingsPage` | localStorage prefs; optional session |
| `/mastery` | `MasteryPage` + `MasteryMap` | Session + `GET /api/mastery/all` + GeoJSON |
| `/scoreboard` | `ScoreboardPage` | Session + leaderboard/friends APIs |
| `/results` | `ResultsPage` | Session + scores + mastery |
| `/results/how-it-works` | `HowItWorksPage` | Mostly static |
| `/forgot-password` | `ForgotPasswordPage` | Public |
| `/reset-password?token=` | `ResetPasswordPage` | Token validation API |
| `/verify-email?token=` | Server verifies token, then `VerifyEmailPage` | Token + optional session for resend |

Start wizard navigation is entirely URL-driven (`lib/startNavigation.js`: `step`, `mode`, `region`, `type`, `level`, `play`).

### Authentication (end to end)

| Concern | Implementation |
|---------|----------------|
| Library | **Auth.js / next-auth v5** (`auth.js`) |
| Provider | Credentials only (email + password) — no OAuth |
| Password storage | bcrypt hashes in `users.password` |
| Token format | **JWT session strategy** (`session: { strategy: "jwt" }`) |
| Client storage | Auth.js **HTTP-only session cookie** (not localStorage; not a Bearer token the app manages manually) |
| Sent to API | Cookie automatically on same-origin `fetch` |
| Server validation | Route handlers call `const session = await auth()` and check `session.user.id` |
| Session payload | JWT carries `id`, `username`, `emailVerified`, `avatarType`, `avatarColor`, `avatarFlag`; mirrored onto `session.user` |
| Client access | `SessionProvider` (`AuthProvider`) + `useSession()` / `signIn` / `signOut` / `update` |
| Persistence | Cookie-based JWT; `update({...})` can refresh username/avatar/`emailVerified` without re-login |
| Rate limit | Failed logins: 10 / 15 min per email key and per IP (`rate_limit_events`) |
| Email verification | Tokens in `auth_tokens` (hashed); links use `AUTH_URL` |
| Custom pages | `pages.signIn: "/"` |

**Mobile implication:** cookie-based same-origin sessions do not transfer cleanly to a native app without either a WebView cookie jar or a new token (Bearer/refresh) auth path.

### State management

- **No Redux / Zustand / global game store.**
- React Context only for: **theme** (`ThemeProvider`) and **auth session** (`AuthProvider` / NextAuth).
- Almost all game state lives in **`GeographyGame.jsx`** plus hooks:
  - `useCountryQueue`, `useGameBoard`, `useGameTimer`, `useRoundScoring`, `useIdleDetection`, sound/pronunciation prefs hooks.
- Preferences in **localStorage** / guest buffers in **sessionStorage** (`pendingGuestGame`, sound, theme, tour, etc.).

### Data fetching

- Pattern: imperative **`fetch`** in components / thin wrappers — **no SWR, React Query, or axios**.
- Client wrappers:
  - `lib/countryStats.js` → `/api/country-stats`, `/api/mastery`, `/api/mastery/all`
  - `lib/scores.js` → `/api/scores`
  - `lib/learn/factsClient.js` → `/api/learn-facts`
  - `lib/hooks/useUserProfile.js` → `/api/users/profile`
- Many components also call `fetch` directly (auth pages, scoreboard, streak, game-tour).

### Component structure

See tree in §1. Complexity highlights:

| Component | Size | Notes |
|-----------|------|-------|
| `GeographyGame.jsx` | ~3981 lines | **Large** — owns Test/Learn/Discover/Go orchestration; strongest candidate to split for mobile/shared core |
| `MapboxMap.jsx` | ~1729 | **Large** — Mapbox-specific; needs native map equivalent |
| `PacificMap.jsx` | ~783 | **Large** — Oceania SVG workaround |
| `ScoreboardPage.jsx` | ~645 | Friends UI + API orchestration |
| `DiscoverMapLabels.jsx` | ~561 | Label layout UI |
| `GameTutorial.jsx` | ~530 | Spotlight tutorial |
| Learn question components | small–medium | Mostly presentational; logic already in `lib/learn/` |
| `LearnFactModal.jsx` / `FriendAddedToast.jsx` | small | **Orphaned / unused** |

Business logic still embedded in UI that should ideally stay extracted (or further extracted) before mobile:

- Session start / round advance / learn continue-reveal in `GeographyGame`
- Friend request orchestration in `ScoreboardPage`
- Score save + milestone detection partially in `GameCompleteModal`

### Path aliases

| Alias | Maps to | Configured in |
|-------|---------|---------------|
| `@/*` | `./*` (repo root) | `jsconfig.json` `compilerOptions.paths` |

Standalone Node scripts resolve `@/` via `scripts/alias-loader.mjs` + `register-alias.mjs`.

---

## 5. Backend structure

### Server setup

| Concern | Reality |
|---------|---------|
| Entry | Next.js — `npm run dev` / `npm run start` |
| Framework | **Next.js App Router route handlers** — **not Express** |
| Port | Default **3000** (Next); not hardcoded in app code |
| Middleware | None |
| Process | Single Node process serves pages + `/api/*` |

### Every API endpoint

#### Auth

| Method + path | Auth? | Body / query | Response (summary) | Tables |
|---------------|-------|--------------|--------------------|--------|
| `GET/POST /api/auth/*` | Auth.js | Auth.js protocol | Session/CSRF/callback cookies | `users`, `rate_limit_events` |
| `POST /api/auth/register` | No | `{ name, username, email, password }` | Generic success message; 409 username; 429; 503 | `users`, `auth_tokens`, `rate_limit_events` |
| `POST /api/auth/forgot-password` | No | `{ email }` | Always generic success if OK | `users`, `auth_tokens`, `rate_limit_events` |
| `GET /api/auth/reset-password?token=` | No | token | `{ valid: true\|false }` | `auth_tokens`, `users` |
| `POST /api/auth/reset-password` | No | `{ token, password, confirmPassword }` | `{ message }` | `users`, `auth_tokens` |
| `POST /api/auth/verify-email` | No | `{ token }` | `{ message }` / error | `auth_tokens`, `users` |
| `POST /api/auth/verify-email/resend` | **Yes** | (empty) | `{ message }` / already verified / 429 | `users`, `auth_tokens`, `rate_limit_events` |
| `GET /api/auth/verification-status` | **Yes** | — | `{ emailVerified: boolean }` | `users` |

#### Game / mastery

| Method + path | Auth? | Body / query | Response (summary) | Tables |
|---------------|-------|--------------|--------------------|--------|
| `GET /api/scores` | **Yes** | — | `{ scores: [...] }` | `game_scores` |
| `POST /api/scores` | **Yes** | `{ mode, region, score, level? }` | PB or not-PB payload | `game_scores` |
| `GET /api/mastery?mode=` | **Yes** | `mode` | `{ mastery: [{ countryId, level, masteryScore, graduated }] }` | `country_stats` |
| `GET /api/mastery/all` | **Yes** | — | `{ mastery: { countries, capitals, flags } }` | `country_stats` |
| `GET /api/country-stats?mode=&level=&region=` | **Yes** | all required | `{ weakCount, stats }` cascaded weak pool | `country_stats` |
| `POST /api/country-stats` | **Yes** | `{ countryId, mode, level, outcome, responseTimeMs?, gameType, learnModeMultiplier? }` | `{ stat: { …mastery fields, previousMasteryScore, previousGraduated } }` | `country_attempts`, `country_stats`, `practice_sessions` |
| `GET /api/streak` | **Yes** | — | `{ currentStreak, longestStreak }` | `practice_sessions` |
| `POST /api/streak` | **Yes** | — | `{ recorded, currentStreak, longestStreak }` | `practice_sessions` |
| `GET /api/learn-facts?countryIds=` | Soft | CSV ISO3s | `{ seen: { FRA: [0,2], … } }`; unauth → `{ seen: {} }` | `facts_seen` |
| `POST /api/learn-facts` | **Yes** | `{ countryId, factIndex }` | `{ ok: true }` | `facts_seen` |

#### Users / friends / leaderboard

| Method + path | Auth? | Body / query | Response (summary) | Tables |
|---------------|-------|--------------|--------------------|--------|
| `GET /api/leaderboard` | **Yes** | — | `{ leaderboard, pendingRequests, outgoingRequests, outgoingRequestUserIds }` | `users`, `user_friends`, `friend_requests`, `country_stats`, `practice_sessions` |
| `GET /api/users/friends` | **Yes** | — | `{ friends: [...] }` | `user_friends`, `users` |
| `POST /api/users/friends` | **Yes** | `{ friendId }` | `{ target, created, status: "pending" }` | `friend_requests`, `users`, `user_friends` |
| `PATCH /api/users/friend-requests/:requestId` | **Yes** | `{ action: "accept"\|"decline" }` | friend object or `{ declined: true }` | `friend_requests`, `user_friends`, `users` |
| `GET /api/users/search?q=` | **Yes** | username prefix | `{ users: [...] }` max 20 | `users` |
| `GET /api/users/profile` | **Yes** | — | `{ user: { id, name, username, email, avatar } }` | `users` |
| `PATCH /api/users/profile` | **Yes** | `{ username?, avatar? }` | updated `{ user }` | `users` |
| `GET/PATCH /api/users/username` | **Yes** | `{ username }` on PATCH | username subset of profile | `users` |
| `GET/POST /api/users/game-tour` | **Yes** | — | `{ completed }` | `users` |

Leaderboard row fields: `id`, `name`, `username`, `isYou`, `worldly` (%), `streak`, `sessionsWeek`, `sessionsAll`, `region`.

### Database

**Connection** (`lib/db.js`):
- `pg.Pool` from `DATABASE_URL`
- Local (`localhost` / `127.0.0.1`): `ssl: false`
- Non-local: no explicit `ssl` option (relies on URL / pg defaults — Railway typically needs SSL via URL params)
- Dev: pool cached on `globalThis` to survive HMR

**Migrations:** idempotent SQL in `scripts/setup-db.js` (`CREATE TABLE IF NOT EXISTS` + `ALTER … IF NOT EXISTS`). No Prisma Migrate / Knex / Flyway.

#### Schema

```sql
-- users
id TEXT PRIMARY KEY
name TEXT NOT NULL
username TEXT UNIQUE          -- also unique index users_username_idx
email TEXT UNIQUE NOT NULL
password TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
email_verified_at TIMESTAMPTZ
avatar_type TEXT NOT NULL DEFAULT 'color'
avatar_color TEXT
avatar_flag TEXT
avatar_image TEXT             -- may store data URL / image payload
game_tour_completed_at TIMESTAMPTZ

-- game_scores
id TEXT PK
user_id TEXT FK → users CASCADE
mode TEXT NOT NULL
region TEXT NOT NULL
level TEXT NOT NULL DEFAULT 'F1'
score INT NOT NULL
updated_at, created_at TIMESTAMPTZ
UNIQUE (user_id, mode, region, level)
INDEX game_scores_user_id_idx (user_id)

-- country_stats
id TEXT PK
user_id TEXT FK
country_id TEXT
mode TEXT
level TEXT
first_try_correct INT DEFAULT 0
second_try_correct INT DEFAULT 0
needed_reveal INT DEFAULT 0
response_time_ms_sum BIGINT DEFAULT 0
response_time_count INT DEFAULT 0
mastery_score REAL DEFAULT 0
fast_streak INT DEFAULT 0
speed_baseline_ms INT
graduated BOOLEAN DEFAULT false
last_attempt_at TIMESTAMPTZ
updated_at, created_at TIMESTAMPTZ
UNIQUE (user_id, country_id, mode, level)
INDEX country_stats_user_lookup_idx (user_id, mode, level)

-- country_attempts
id TEXT PK
user_id TEXT FK
country_id, mode, level, game_type, outcome TEXT
response_time_ms INT
created_at TIMESTAMPTZ
INDEX country_attempts_user_lookup_idx (user_id, country_id, mode, level, created_at DESC)

-- facts_seen
id TEXT PK
user_id TEXT FK
country_id TEXT
fact_index INT
seen_at TIMESTAMPTZ
UNIQUE (user_id, country_id, fact_index)
INDEX facts_seen_user_country_idx (user_id, country_id)

-- practice_sessions
id TEXT PK
user_id TEXT FK
practiced_at DATE DEFAULT CURRENT_DATE
created_at TIMESTAMPTZ
UNIQUE (user_id, practiced_at)
INDEX practice_sessions_user_lookup_idx (user_id, practiced_at DESC)

-- auth_tokens
id TEXT PK
user_id TEXT FK
token_hash TEXT
type TEXT
expires_at TIMESTAMPTZ
used_at TIMESTAMPTZ
created_at TIMESTAMPTZ
INDEX auth_tokens_lookup_idx (token_hash, type)
INDEX auth_tokens_user_type_idx (user_id, type, created_at DESC)

-- rate_limit_events
id TEXT PK
key TEXT
created_at TIMESTAMPTZ
INDEX rate_limit_events_key_idx (key, created_at DESC)

-- user_friends
id TEXT PK
user_id TEXT FK
friend_id TEXT FK
created_at TIMESTAMPTZ
UNIQUE (user_id, friend_id)
CHECK (user_id <> friend_id)
INDEXES on user_id, friend_id

-- friend_requests
id TEXT PK
from_user_id TEXT FK
to_user_id TEXT FK
status TEXT DEFAULT 'pending' CHECK IN ('pending','accepted','declined')
created_at, responded_at TIMESTAMPTZ
UNIQUE (from_user_id, to_user_id)
Partial indexes on pending to_user_id / from_user_id
```

Decline cooldown for friend requests: **7 days** (`FRIEND_REQUEST_DECLINE_COOLDOWN_DAYS` in `lib/db.js`).

### Authentication middleware

- No global middleware.
- Protected routes: anything that does `auth()` and returns 401 without `session.user.id`.
- Public: register, forgot/reset password, verify-email POST, Auth.js handlers, and soft-public `GET /api/learn-facts`.

### Email

| Item | Detail |
|------|--------|
| Service | **Resend** (`lib/email.js`) |
| Templates | Inline HTML builders in `lib/email.js` (not separate template files) |
| Triggers | Register → verification; resend verification; forgot-password → reset; successful reset → password-changed notice |

### Push notifications

**None.** No FCM/APNs, no device token table, no push endpoints.

---

## 6. Shared logic candidates

Classification of every `lib/` module for monorepo extraction.

### Safe to extract → shared packages

#### `@worldly/types` (enums / ID catalogs)

| Source | Exports |
|--------|---------|
| `gameTypes.js` | `GAME_TYPES` |
| `levels.js` | `GAME_LEVELS`, `LEVEL_CODES`, `LEVEL_SECTIONS` (structure) |
| `regions.js` | `GAME_MODES`, `REGIONS` (ids/labels) |
| `countryStats.js` | `ROUND_OUTCOMES` |
| `mastery.js` | `GAME_TYPE_FOR_STATS` |
| `learn/questionTypes.js` | `QUESTION_TIERS`, question type ids / `QUESTION_TYPES` catalog |
| `startNavigation.js` | `START_STEPS` |
| `theme.js` | `THEMES` |
| `avatars.js` | `AVATAR_TYPES`, `AVATAR_COLORS` |
| `pronunciationVoices.js` | voice ids / kind enums |
| `referencePanel.js` | `REFERENCE_FIELD_IDS` |
| `scores.js` | `LEVELS` / `DEFAULT_LEVEL` constants portion |

#### `@worldly/constants`

| Source | Exports |
|--------|---------|
| `constants.js` | timings (`MAX_ATTEMPTS`, delays, idle ms), `GEOJSON_PATH`, `GEOJSON_ISO_OVERRIDES`, `NAME_ALIASES` |
| `mastery.js` | graduation/reentry thresholds, half-life, min weight |
| `worldlyScore.js` | `WORLDLY_WEIGHTS`, `LEVEL_WEIGHTS`, `WORLDLY_MILESTONES` |
| `learn/questionTypes.js` | `LEARN_EMA_MULTIPLIERS`, `MASTERY_BANDS` |
| `countryColors.js` | feedback/land hex colors |
| `flags.js` | `ISO2_OVERRIDES` |
| `levels.js` | flash durations |
| `discoverTerritories.js` | territory notes data |
| `spaceStars.js` | `SPACE_STAR_LAYERS` |
| `pronunciationVoices.js` | folder mappings |
| `startNavigation.js` | `DEFAULT_LEARN_LEVEL` |
| Static JSON (as data packages) | `data/countries.json`, `capital-alternates.json`, `country-highlights.json` |

#### `@worldly/core` (pure algorithms)

| Source | Key exports |
|--------|-------------|
| `mastery.js` | `computeMasteryUpdate`, `isFastResponse`, `updateSpeedBaseline`, `deriveMasteryFromAggregates`, `getDecayAdjustedMastery`, `isEffectivelyGraduated`, `getLearningWeight`, `isEligibleForLearning`, cascade helpers |
| `worldlyScore.js` | `buildLevelScoreMap`, `cascadedLevelScore`, `computeCountryScore`, `computeCategoryAverage`, `computeWorldlyScore`, `computeWorldlyScoreFromMastery`, milestone helpers |
| `learning.js` | `weightedSampleWithoutReplacement`, `buildLearningQueue`, `buildFullRegionLearningQueue` |
| `learn/questionTypes.js` | `resolveLearnEmaMultiplier`, `getMasteryBand`, `getEligibleQuestionTypes` |
| `learn/questionGenerator.js` | all `generate*` + `generateQuestion` + `indexCountries` |
| `learn/sessionSequencer.js` | `buildLearnSession` |
| `learn/emaIntegration.js` | `outcomeFromEvent`, `resolveLearnEma`, `buildLearnStatPayload` (logger is optional) |
| `learn/factSelection.js` | `selectLearnFact` |
| `learn/sessionSummary.js` | `buildLearnSessionSummary`, `formatTypeBreakdown` |
| `learn/continueNotes.js` | `resolveContinueNote`, `applyContinueNote` |
| `learn/wrongReveal.js` | `buildLearnWrongReveal`, neighbor helpers |
| `learn/resolveGuessedCountry.js` | `resolveGuessedCountryInRegion` |
| `capitals.js` | capital answer helpers |
| `spelling.js` | Levenshtein / suggestions |
| `validation.js` / `usernames.js` | validators |
| `levels.js` | `getMasteryProvingLevels`, predicates/labels |
| `regions.js` | region filter helpers (if JSON injected) |
| `comparison-clusters.js` | peer getters |
| `countryFacts.js` | partition/getters |
| `referencePanel.js` | visibility/format (non-DOM) |
| `flags.js` | `resolveIso2`, `getFlagUrl` |
| `constants.js` | `normalizeName`, `displayName`, `resolveIso3` |
| `countryColors.js` | color functions |
| `adjacentCountries.js` | `getAdjacentCountryNames` |
| `discoverLabel*.js` (layout/scale/visibility), `discoverLabels.js`, `globeProjection.js`, `pacificMapView.js`, `pacificMapStyles.js` | pure geometry/copy |
| `milestones.js`, `gameModeIntro.js`, `gameTutorial*.js`, `masteryMap.js` | pure builders |
| `time.js` | `formatElapsedTime` |
| `cn.js` | class merger (if sharing Tailwind class catalogs is desired) |

#### `@worldly/api-client`

| Source | Functions |
|--------|-----------|
| `countryStats.js` | `recordCountryStat`, `fetchMasteryStats`, `fetchAllMasteryStats`, `fetchWeakCountryStats` |
| `scores.js` | `saveScore`, `fetchScores` |
| `learn/factsClient.js` | `fetchSeenFacts`, `markFactSeen` |
| New wrappers needed | friends, leaderboard, streak, profile, auth register/login for mobile Bearer flow |

**Caveat:** current clients assume cookie auth + relative URLs. Mobile client needs absolute API base URL + Authorization header (or cookie bridge).

### Web-only (stay in web app or reimplement)

All of `lib/hooks/*`, `learnUi.js`, `ui.js`, `sounds.js`, `soundPrefs.js`, `pronunciation.js` (+ prefs), `viewport.js`, `mapCountryClickExpand.js`, `mapboxGlobe.js`, `pendingGuestGame.js`, `onboardingPrefs.js`, `countryClickExpandPrefs.js`, `referencePanelPrefs.js`, and React components under `components/`.

### API-only (stay on server)

`db.js`, `auth-db.js`, `auth-tokens.js`, `auth-url.js`, `email.js`, `verification.js`, `password-reset.js`, `rate-limit.js`.

### Needs splitting

| File | Split |
|------|-------|
| `countries.js` | Pure: shuffle/pick/answer/feature helpers → core; `loadCountriesGeoJSON` (`fetch`) → web/api-client |
| `geometry.js` | Pure geo math → core; screen-projection helpers needing Mapbox `project` → web |
| `avatars.js` | Validate/normalize/hash → core; canvas crop/load → web |
| `homeGreeting.js` | Pure greeting builders → core; `localStorage` variant index → web |
| `countryStats.js` / `scores.js` | Constants → types; fetch wrappers → api-client |

---

## 7. Learn mode implementation

### Files by concern

| Concern | Files |
|---------|-------|
| Question type system | `lib/learn/questionTypes.js`, `lib/learn/questionGenerator.js`, UI under `components/learn/*`, `LearnQuestionRenderer.jsx` |
| Session sequencer | `lib/learn/sessionSequencer.js` (`buildLearnSession`); queue source `lib/learning.js` (`buildFullRegionLearningQueue`) |
| EMA multipliers | `LEARN_EMA_MULTIPLIERS` + `resolveLearnEmaMultiplier` in `questionTypes.js`; wiring in `emaIntegration.js`; applied server-side in `mastery.computeMasteryUpdate` via `learnModeMultiplier` |
| Post-answer fact modal | `LearnFactModal.jsx` (**orphaned**), `factSelection.js`, `factsClient.js`, API `/api/learn-facts`, table `facts_seen` |
| Wrong/continue teaching | `wrongReveal.js`, `continueNotes.js`, host logic in `GeographyGame` |
| End summary | `sessionSummary.js`, `LearnSessionSummary.jsx` inside `GameCompleteModal` |

### End-to-end generation flow (current code)

1. User starts Learn (auth gated on start screen).
2. `GeographyGame` builds a mastery-weighted full-region country queue via `buildFullRegionLearningQueue`.
3. `buildLearnSession({ countries, category: mode, allCountries, masteryStats })` picks a type per country using mastery bands + generators, then arranges (warm-up, variety, comparative spacing).
4. Stats are recorded under session `mode` + **`DEFAULT_LEARN_LEVEL` = F1**.
5. UI: `LearnRoundOverlay` → `LearnQuestionRenderer` → typed question component / map click seam.
6. `handleLearnAnswer` → `buildLearnStatPayload` → `recordCountryStat` (or guest buffer) → `POST /api/country-stats` with `gameType: "learning"` + multiplier.
7. Wrong answers await Continue with map paints / notes; correct may auto-advance or await Continue for teaching cases.
8. Completion builds `learnSummary` for `GameCompleteModal`.

### Question types (all generators exist)

| Tier | IDs | Status |
|------|-----|--------|
| 1 | `blank_map_click`, `free_name_entry`, `capital_free_recall`, `neighbor_recall_all` | **Working** (return question or `null` if data missing) |
| 2 | `neighbor_free_recall`, `flag_identification`, `capital_matching`, `neighbor_confirm`, `neighbor_select_all` | **Working** |
| 3 | `population_compare`, `area_compare`, `neighbor_identification`, `brazil_non_neighbors` | **Working** (`brazil_non_neighbors` only for BRA) |
| 4 | `binary_map_choice`, `landlocked_check`, `language_family` | **Working** |

UI answer types wired: `map_click`, `text_entry`, `multi_text_entry`, `multiple_choice`, `multi_select`, `yes_no`, `binary_choice`.

### Mastery → tier ladder (clue/content ladder for *difficulty*, not the UI clue button)

| Mastery | Eligible tiers |
|---------|----------------|
| 0.00–0.30 | Tier 4 |
| 0.30–0.50 | Tier 3+4 |
| 0.50–0.70 | Tier 2+3 |
| 0.70–0.90 | Tier 1+2 |
| ≥ 0.90 | Tier 1 (fallback widens for flags — no Tier 1 flag type) |

### Clue ladder (UI)

- Generators set `clueEligible: true` for Tier 1/2.
- `ClueButton` reveals progressive `clues: string[]`.
- **No generator or host supplies non-empty `clues` arrays** → button always returns `null`.
- `MapClickPrompt` does not wire `onReveal` → even with clues, map-click would not set `revealUsed`.

### Known incomplete pieces

1. **Between-question fact modal removed** — comment in `GeographyGame` (~1717); `LearnFactModal` unused; `markFactSeen` never called from app code; `fetchSeenFacts` still prefetched but write path incomplete.
2. **Clue content pipeline stubbed** (UI ready, no strings).
3. **`LEARN_MODE_CHANGES.md` is stale** — it says GeographyGame wiring is remaining; wiring for session/renderer/answer/summary **is present**; fact modal / clue content still open.
4. `getLearningWeight` zeros on raw `stat.graduated`, while eligibility uses `isEffectivelyGraduated` (decay re-entry inconsistency for weights).
5. Flags at high mastery rely on tier fallback; single-type bands can violate variety rules (documented in sequencer).

---

## 8. Mastery system

| Concern | File(s) |
|---------|---------|
| EMA calculation | `lib/mastery.js` → `computeMasteryUpdate` (server via `lib/db.recordCountryPerformance`) |
| Graduation | same file — only when `gameType === "test"`, mastery ≥ **0.9**, `fastStreak` ≥ **3** |
| Decay / `isEffectivelyGraduated` | `getDecayAdjustedMastery` (half-life **30 days**), re-entry if decayed mastery **< 0.75** |
| % Worldly | `lib/worldlyScore.js` |
| DB storage | `country_stats` (+ raw log `country_attempts`) |
| Cascade across levels | `getMasteryProvingLevels` in `levels.js`: **F2 proves F1**, **N2 proves N1**; `getCascadedMastery` / `cascadedLevelScore` |

### EMA formulas (summary)

- Seed from aggregates if `masteryScore` is 0 but history exists:  
  `clamp(firstTryRate * (1 - revealRate * 0.5), 0, 0.85)`
- First-try correct fast: `mastery += mult * 0.2 * (1 - mastery)`; slow: `* 0.08`; updates baseline EMA (blend 0.15, default baseline 5000 ms)
- Fast window: `responseTimeMs ≤ clamp(baseline * 1.2, 3000, 8000)`
- Second-try: `mastery -= mult * 0.15`
- Reveal: `mastery -= mult * 0.35`
- Learn passes `learnModeMultiplier` (0.1–1.0 by tier); Test uses default `1`

### % Worldly

- Mode weights: countries **0.5**, capitals **0.35**, flags **0.15**
- Level weights: F1 **0.15**, F2 **0.25**, N1 **0.25**, N2 **0.35**
- Average over **full enabled world** country list (missing → 0)
- `percent = round(score * 1000) / 10`
- Milestones: 25, 50, 75, 90, 100

### Gaps / TODOs

- No `TODO` comments in mastery code.
- Documented product gaps: mastery map “mastered” signal semantics (`BUGS.md` #4 marked DONE — verify product intent still matches), decay messaging in UI (`IMPROVEMENTS.md`), Learn weight vs effective graduation inconsistency noted above.

---

## 9. Friends and leaderboard

**Status: implemented** (request/accept flow), with small gaps.

| Layer | What exists |
|-------|-------------|
| DB | `user_friends`, `friend_requests` |
| API | `/api/leaderboard`, `/api/users/friends`, `/api/users/friend-requests/[id]`, `/api/users/search` |
| UI | `/scoreboard` → `ScoreboardPage` (tabs: week / all-time / %Worldly; add friends; accept/decline) |
| Scoring | `%Worldly` via `computeWorldlyScoreFromMastery` + streak/session aggregates |

**Missing / incomplete**
- **No unfriend / remove friend endpoint** anywhere.
- `FriendAddedToast.jsx` exists but is **never mounted** (`POLISH.md`).
- No push/email notification when a request is received.

---

## 10. Map and geography data

| Item | Detail |
|------|--------|
| GeoJSON path | `public/data/countries.geojson` (~**14 MB**) |
| Metadata | `data/countries.json` (~188 KB, 238 countries / 200 enabled) |
| Load | Client `fetch("/data/countries.geojson")` in `lib/countries.js` (`GEOJSON_PATH`); promise-cached; 10s timeout; merged with manifest; long-cache header in `next.config.mjs` |
| Web renderer | **mapbox-gl** (`MapboxMap`, `MasteryMap`); Oceania uses custom SVG **`PacificMap`** |
| Click detection | Mapbox `queryRenderedFeatures` on fill + small-country circle layers; Pacific uses SVG pointer handlers |
| Highlight / fill | Feature-state driven from `useGameBoard` props: wrong, filled, showColor, highlightKind, target outline; level-specific paint (Find fill progressive colors, Name fill green, flash levels, Learn teach paints) |
| Small countries | Circles when polygon screen size &lt; `MIN_CLICK_TARGET_PX` (40) |
| Flags | Remote CDN `https://flagcdn.com/w{width}/{iso2}.png` — not bundled |

---

## 11. Audio and sound

| Item | Detail |
|------|--------|
| SFX files | `public/sounds/correct-chime.wav`, `incorrect-chime.wav` |
| Playback | `lib/sounds.js` — cached `HTMLAudioElement`, volume from `soundPrefs` |
| Pronunciation files | `public/audio/{pronunciation\|pronunciation2\|pronunciation-capitals\|pronunciation-capitals2}/{iso3}.mp3` |
| Playback | `lib/pronunciation.js` → `new Audio(url)` |
| Generation | **AWS Polly** offline scripts (`@aws-sdk/client-polly`) — Joanna + Matthew |
| ElevenLabs | **Not present / not integrated** |
| UI | `PronunciationButton`, Settings voice preview, Discover autoplay paths in game |

---

## 12. Deployment and hosting

| Item | Finding |
|------|---------|
| In-repo deploy configs | **None** — no `Dockerfile`, `railway.toml`, `vercel.json`, `Procfile`, `fly.toml` |
| Backend | Same Next.js process as frontend (API routes) |
| Database | External PostgreSQL; `.env.example` / docs mention **Railway Postgres** |
| Web hosting | Env-driven Next deploy; `VERCEL_URL` fallback in `auth-url.js` suggests Vercel is/was considered; not locked in-repo |
| Required build commands | Preserve `next build` / `next start`; run `db:setup` after schema changes; Mapbox token must be present at **build/start** for `NEXT_PUBLIC_*` |
| Domain | Product branding is “Worldly”; user/target domain **beworldly.app** is **not hardcoded** in source. Production must set `AUTH_URL=https://beworldly.app` (or actual canonical origin) for email links |
| DNS | Not defined in this repo |

---

## 13. Known issues and TODOs

### Explicit `TODO` / `FIXME` / `HACK` comments

**None found** in application source (`*.js` / `*.jsx` / `*.mjs`) outside docs. The codebase does not use those markers.

### Documented / code-evident issues (importance for mobile)

| Issue | Where | Importance before mobile |
|-------|-------|--------------------------|
| Cookie/JWT Auth.js sessions are web-centric | `auth.js`, all APIs | **Critical** — mobile needs token strategy |
| No CORS / Bearer auth design | API routes | **Critical** |
| No push infrastructure | — | **High** if mobile wants reminders/friend requests |
| Learn fact modal orphaned; `markFactSeen` unused | `LearnFactModal.jsx`, `factsClient.js`, `GeographyGame` | Medium — product incomplete, not a blocker for Test mode |
| Clue ladder has no clue strings | `ClueButton`, generators | Medium for Learn parity |
| No unfriend endpoint | friends APIs | Medium for social parity |
| `FriendAddedToast` unused | `components/FriendAddedToast.jsx` | Low |
| Discover labels `aria-hidden` (SR) | `BUGS.md` #6 open | Medium a11y |
| Mobile tutorial copy dead (`titleMobile`/`bodyMobile`) | `BUGS.md` #9 open | Low–medium |
| Reference panel open state doesn’t reset each round | `BUGS.md` #11 open | Low |
| `LEARN_MODE_CHANGES.md` stale vs current wiring | docs | Low (docs debt) |
| `getLearningWeight` vs `isEffectivelyGraduated` inconsistency | `mastery.js` | Medium correctness |
| Empty `prisma/` directory | repo | Low confusion |
| `scripts/restcountries.json` stale error payload | scripts | Low |
| GeoJSON ~14MB on first load | `public/data` | **High** for mobile bandwidth — needs packaging/CDN strategy |
| Mapbox + Pacific SVG are web-specific | map components | **Critical** for mobile map rewrite |
| Avatar images may be large data URLs in DB | `users.avatar_image` | Medium for mobile API payloads |
| Rate-limit table growth / JWT `update()` trust | older audits / `POLISH.md` | Medium security hygiene |
| Non-local DB SSL not explicitly configured in Pool | `lib/db.js` | Medium ops (usually OK if URL includes SSL) |

---

## 14. What the mobile app can reuse

### Move to shared packages with zero / minimal changes

- **`@worldly/core`:** `mastery.js`, `worldlyScore.js`, `learning.js`, almost all of `lib/learn/*` (except `factsClient.js`), `capitals.js`, `spelling.js`, `validation.js`, `usernames.js`, `levels.js`, `gameTypes.js`, `comparison-clusters.js`, `countryFacts.js`, pure parts of `constants.js` / `flags.js` / `countryColors.js` / discover label math / pacific view math.
- **`@worldly/constants` + data:** thresholds, multipliers, `data/countries.json` (+ highlights / capital-alternates).
- **`@worldly/types`:** mode/level/outcome/question-type catalogs (as JS consts today; TS types can be layered later).

### Split before extraction

- `countries.js` (fetch vs pure)
- `geometry.js` (geo vs screen projection)
- `avatars.js` (validate vs canvas)
- `homeGreeting.js` (storage)
- `countryStats.js` / `scores.js` / `factsClient.js` (rewrite against absolute base URL + auth header)

### Must stay web / rebuild for mobile

- All React components, especially `GeographyGame`, `MapboxMap`, `PacificMap`, `MasteryMap`, Discover overlays
- Mapbox GL / three.js globe / Tailwind class catalogs (`ui.js`, `learnUi.js`)
- Auth cookie session UI (`AuthModal`, NextAuth `SessionProvider`)
- HTMLAudio SFX/pronunciation wrappers (reuse file assets + URLs; replace player)
- localStorage/sessionStorage pref modules

### API changes needed for a proper mobile client

| Need | Current gap |
|------|-------------|
| Auth | Cookie JWT only — need mobile login returning **Bearer/refresh tokens** (or documented cookie WebView approach) |
| CORS | No CORS headers configured — required if mobile hits API from another origin |
| Absolute URLs | Clients use relative `/api/...` |
| Push token registration | Missing entirely |
| Unfriend | Missing |
| Compact mastery payloads | `/api/mastery/all` may be heavy; consider pagination / deltas |
| Offline GeoJSON | 14MB asset not designed for app binary or first-launch cellular |
| Fact seen writes | Endpoint exists; client never calls `markFactSeen` |
| Guest sync | `pendingGuestGame` is web sessionStorage-specific |

### Data the mobile app needs that is not (or poorly) exposed

| Data | Notes |
|------|-------|
| Country metadata + facts | Available as static JSON (good to ship in app) — not via API |
| GeoJSON boundaries | Static file only; no tiled/vector alternative in-repo |
| Pronunciation audio | Static public files; need CDN or app-bundled subset |
| Flag images | External flagcdn dependency |
| Device push prefs / tokens | No table/API |
| Explicit “me vs friend” privacy controls / block list | No API |
| Learn clue content | Not stored anywhere yet |
| Versioned content manifest | No API for “content pack version” / differential updates |

---

## Appendix — Quick architecture facts

- Single route game shell: `app/page.js` → `GeographyGame`.
- Modes: `countries` / `capitals` / `flags`. Levels: `F1` / `F2` / `N1` / `N2`. Types: `test` / `learning` / `discover` (+ Go! flow in game shell).
- Learn records under **F1** regardless of classic level picker (`DEFAULT_LEARN_LEVEL`).
- Friends leaderboard is real; push notifications and native auth are not.
- ElevenLabs is not used; Polly is offline-only.
- This audit’s only authored artifact is `MONOREPO_AUDIT.md`.
