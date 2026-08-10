# Mobile build & monorepo migration notes

Delivered 2026-08-09 as part of the Turborepo + Expo migration.

## 1. Monorepo tree (3 levels)

```
worldly/
├── apps/
│   ├── web/                 # Next.js 15 web app (beworldly.app)
│   │   ├── app/
│   │   ├── components/
│   │   ├── data/
│   │   ├── lib/             # web-only + re-export wrappers
│   │   ├── public/
│   │   ├── scripts/
│   │   ├── auth.js
│   │   ├── middleware.js    # CORS for /api/*
│   │   └── package.json
│   └── mobile/              # Expo / React Native app
│       ├── app/             # expo-router screens
│       ├── components/
│       ├── lib/
│       ├── store/
│       ├── assets/
│       └── package.json
├── packages/
│   ├── constants/           # @worldly/constants
│   ├── core/                # @worldly/core
│   └── api-client/          # @worldly/api-client
├── package.json             # npm workspaces + turbo
├── turbo.json
├── .npmrc                   # legacy-peer-deps=true (Expo/RN peers)
├── MONOREPO_AUDIT.md
└── MOBILE_BUILD.md
```

## 2. Packages

### `@worldly/constants`
**Exports:** game types/modes/levels/regions, mastery thresholds & EMA deltas, Worldly weights/milestones, Learn `QUESTION_*` / `LEARN_EMA_MULTIPLIERS` / `MASTERY_BANDS` / `TYPE_*` / `LEARN_SESSION_WEIGHTS`, timings, ISO/name aliases, colors, `ISO2_OVERRIDES`, plus `data/countries.json`.

**Extracted from:** `apps/web/lib/mastery.js`, `worldlyScore.js`, `learn/questionTypes.js`, `gameTypes.js`, `levels.js`, `regions.js`, `countryStats.js` (`ROUND_OUTCOMES`), `constants.js`, `countryColors.js`, `flags.js`, `startNavigation.js` (`DEFAULT_LEARN_LEVEL`).

### `@worldly/core`
**Exports:** mastery math, worldly score, learning queues, capitals/spelling/validation/usernames, comparison clusters, country facts, flags, time, name utils, levels/regions/gameTypes/countryColors helpers, and all pure Learn engine modules under `learn/`.

**Extracted from:** matching files under `apps/web/lib/` and `apps/web/lib/learn/` (except `factsClient.js`).

### `@worldly/api-client`
**Exports:** `createWorldlyClient({ baseURL, getToken, onUnauthorized })` with mobile auth, mastery, scores, streak, facts, friends, profile, push registration.

**New package** (not extracted from web cookie clients).

## 3. Files that could NOT be cleanly extracted

| File | Why it stays in `apps/web/lib/` |
|------|----------------------------------|
| `db.js`, `auth-*`, `email.js`, `rate-limit.js`, `mobile-auth.js`, `verification.js`, `password-reset.js` | Node/`pg`/crypto/Resend |
| `hooks/*`, `sounds.js`, `pronunciation.js`, `*Prefs.js`, `viewport.js`, `ui.js`, `learnUi.js`, `mapboxGlobe.js`, `mapCountryClickExpand.js`, `pendingGuestGame.js` | Browser / React / Mapbox |
| `countries.js`, `geometry.js` (screen projection parts), `avatars.js` (canvas) | Mixed platform APIs |
| `countryStats.js` / `scores.js` / `learn/factsClient.js` fetch wrappers | Cookie + relative `/api` URLs (web) |
| `GeographyGame.jsx`, Mapbox/Pacific maps | Web UI orchestration |

Web modules that *were* extracted now **re-export** from `@worldly/core` / `@worldly/constants` so existing `@/lib/...` imports keep working.

## 4. Globe approach (home screen)

**Chosen: static image fallback** (`assets/icon.png` placeholder), not WebView.

**Why:** Loading the full Next.js home (`?minimal=1`) inside a WebView would pull Mapbox/Three and fight Expo performance/battery on first paint. A true globe can be swapped later (Three via expo-gl, or a branded static SVG). Documented as follow-up.

## 5. Map projection (game + mastery SVG)

**Chosen: equirectangular projection** (`lon/lat → x/y` linear mapping) over `react-native-svg` `Path`s built from the bundled GeoJSON.

**Notes:**
- Same approach for `SessionMap` and `MasteryMapSVG`.
- Full 14MB GeoJSON is bundled; first parse can be heavy on low-end devices.
- `shouldRasterizeIOS` / `renderToHardwareTextureAndroid` enabled on session map.
- Region filtering on the game map is currently soft (full world drawn) for reliability — tighten by ISO3/region join as a follow-up.
- **Performance:** not profiled on a physical iPhone 12 in this pass; treat &lt;55fps as a known risk when many polygons paint. Prefer simplifying geometries or tiling before ship.

## 6. API / DB changes (additive)

| Change | Detail |
|--------|--------|
| `users.mobile_token_hash` | SHA-256 of Bearer token |
| `users.mobile_token_expires_at` | 90-day expiry |
| `push_tokens` table | `(user_id, platform)` unique; ios/android |
| `POST /api/mobile/auth/login` | email/password → Bearer token |
| `POST /api/mobile/auth/logout` | clear mobile token |
| `POST /api/mobile/auth/refresh` | rotate token |
| `GET /api/mobile/auth/me` | current mobile user |
| `POST /api/mobile/push/register` | upsert Expo push token |
| `middleware.js` (web) | CORS on `/api/*` only; Auth.js cookies unchanged |

## 7. Web app files changed (beyond moves)

- `scripts/setup-db.js` — mobile token + push_tokens migrations
- New `lib/mobile-auth.js` + mobile API routes
- New root→`apps/web` `middleware.js` for CORS
- Extracted libs turned into re-export shims
- `next.config.mjs` — `transpilePackages` for `@worldly/*`
- `countryColors` regained `getActiveLandColor` after extraction
- Env: `apps/web/.env` symlink → repo root `.env`

Auth.js cookie sessions are untouched.

## 8. Known gaps vs web

- No Discover / Go! map parity (Pacific SVG, Mapbox globe, tutorials)
- Learn clue strings still empty (same as web)
- Fact modal exists on mobile; web between-question facts remain removed
- Friends: no head-to-head / passport stamps / unfriend UI
- Mastery share works via view-shot; map is simplified SVG not Mapbox
- Pronunciation audio not wired on mobile
- Offline Go! session building only partially wired (pending answer sync exists)
- No server-side push sending (FCM/APNs)
- Privacy URL / App Store rate link are placeholders
- Some friend/game component files are stubs for structure completeness

## 9. Simulator commands

```bash
# Web
cd /Users/jadeclement/Developer/geography
npm install
npm run db:setup
npm run dev:web

# Mobile
cd apps/mobile
npx expo start --ios
# or: npm run dev   (from repo root: npm run dev:mobile)
```

Ensure `apps/mobile/.env.local` has `EXPO_PUBLIC_API_URL=http://localhost:3000` (or your LAN IP for a physical device).

## 10. Assumptions needing human verification

1. **Railway/production `AUTH_URL`** remains `https://beworldly.app` and CORS allow-list is sufficient for Expo origins in the wild.
2. **Mobile Bearer tokens** (90-day, single hash per user) are acceptable vs refresh-token rotation / multi-device sessions.
3. **Bundling 14MB GeoJSON** in the app binary is acceptable for v1 (vs CDN/download-on-first-launch).
4. **Equirectangular SVG** map quality is acceptable until a native Mapbox/MapLibre port.
5. **Static home globe** placeholder is OK until a real globe asset is designed.
6. **npm `legacy-peer-deps`** is acceptable while Expo SDK 57 / RN 0.86 peer ranges settle.
7. Expo SDK created as **blank-typescript** (~57); shared packages remain plain `.js` as required.
8. `create-expo-app` may have left unused default assets; icons should be replaced before store submission.

## Checkpoint status (this pass)

| Checkpoint | Status |
|------------|--------|
| Phase 0 mobile auth + CORS + db:setup | Passed locally |
| Phase 1 turbo workspaces | Passed |
| Phase 2 web under `apps/web` | Passed (`npm run dev:web`, pages 200) |
| Phase 3 packages + `test:learn` (10/10) | Passed |
| Phase 4 Expo scaffold + core screens | Scaffolded; run `npx expo start --ios` to verify on device/simulator |
| Phase 5 full checklist | Partial — web + shared logic verified; full simulator QA remains for humans |
