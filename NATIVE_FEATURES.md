# Native features (mobile)

Delivered on the current branch. Web cookie Auth.js paths are unchanged except the additive push/biometric endpoints and dual Bearer resolution on the routes that trigger push.

## 1. Implementation notes

### Haptics
| Already wired | Added / hardened |
|---------------|------------------|
| `lib/haptics/index.ts` + settings guard via `useSettingsStore.getState()` | Confirmed Zustand `getState()` (not hooks) |
| Correct / incorrect on answer confirm in session | Map tap light impact in `SessionMap` |
| | MC / YesNo / BinaryChoice light impact on tap |
| | Fact modal **swipe-dismiss only** (not auto/backdrop) |
| | Friend request success |
| | Streak milestone overlay celebration |

**Simulator:** haptic APIs are called and do not throw; there is no physical feedback. **Must retest on a physical device before App Store submission.**

### Sound
| Already wired | Added / hardened |
|---------------|------------------|
| Inline `expo-av` load-on-play in session | Extracted `lib/sound/index.ts` with preload on mount / unload on unmount |
| `correct.wav` / `incorrect.wav` under `assets/audio/` | Settings check in session handler (not inside manager) so mid-session enable still works after preload |
| | `playsInSilentModeIOS: false` — respects hardware mute |
| | Streaming pronunciation via `lib/audio/pronunciation.ts` from `EXPO_PUBLIC_API_URL/audio/...` (Joanna/Matthew folders match web) |

### Push notifications (device)
| Already wired | Added / hardened |
|---------------|------------------|
| `setup.ts` / `handlers.ts` | `push_token_registered` app_meta gate |
| Handlers deep-link by type | Register after first Go! completion path |
| Profile daily reminder toggle | `cancelStreakReminder` on disable |
| | `ensureStreakReminderScheduled` on app open + after settings hydrate |
| | `NotificationPermissionPrompt` after first Go! only |

### Push notifications (server)
| New | Detail |
|-----|--------|
| `apps/web/lib/push-notifications.js` | Expo HTTP push API, batch 100, never throws into API responses |
| Friend overtake | Fire-and-forget from `POST /api/country-stats` |
| Streak milestones | Fire-and-forget from `POST /api/streak` |
| Cron safety net | `GET /api/cron/streak-reminders` (9pm UTC intended) |
| DB columns on `push_tokens` | `last_overtake_notified_at`, `last_notified_streak`, `last_notified_worldly`, `streak_reminder_sent_at` |

**Deviation:** `country-stats` and `streak` also accept mobile Bearer sessions (`getMobileSession`) so Go! / Learn mobile traffic can trigger overtake + milestones. Cookie Auth.js for web is unchanged.

### Face ID / Touch ID
| Already wired | Added |
|---------------|-------|
| `NSFaceIDUsageDescription` in `app.json` | Post-login offer modal |
| `expo-local-authentication` dependency | `biometricEnabled` / `biometricPromptShown` in settings |
| | Login Face ID button after logout (uses biometric token) |
| | Settings toggle (authenticate to enable; clear token on disable) |
| | `POST /api/mobile/auth/biometric-refresh` — no password stored |
| | SecureStore key `worldly_biometric_token` survives logout |

**Password is never written to SecureStore** — only Bearer tokens (`worldly_token`, `worldly_biometric_token`).

### Home screen widget
**Deferred** (see §2). `lib/storage/widgetData.ts` writes a JSON snapshot (streak / due / % Worldly) after Go! completion and on authenticated app startup so a future native target can read it.

---

## 2. Widget library decision

Tried / considered:
- `@bam.tech/react-native-widget-extension` — not the package name in current registries; community equivalent is `react-native-widget-extension` (Swift UI, config plugin, **dev build required**).
- `expo-widgets` (SDK 57) — first-party, **not available in Expo Go**, needs a development / EAS build and App Group entitlements.

**Why deferred:** this branch stays on Expo Go–compatible managed workflow; the prompt forbids EAS Build / App Store submit. Auto-implementing a widget that cannot run without a native rebuild would be misleading.

**Follow-up:** add `expo-widgets` (or `react-native-widget-extension`) via config plugin, App Group `group.app.beworldly.app`, small (streak) + medium (streak / due / % Worldly) layouts in the dark palette (`#0B1A2C`, amber, teal), deep link `worldly://`, reload after `writeWidgetData`.

---

## 3. Deviations from the prompt

1. **Dual auth on push-trigger routes** — Bearer + cookie on `country-stats` and `streak` so mobile sessions can fire server push.
2. **Widget UI not shipped** — data writer only; documented above.
3. **Streak milestone haptic** — fires when local overlay shows after Go!; server also sends a push from `POST /api/streak`.
4. **Overtake title** — uses the prompt’s “Your streak is under attack 🔥” for both streak and % Worldly overtakes; body text distinguishes which metric.
5. **Logout + Face ID** — when `biometricEnabled` is true, logout skips `POST /api/mobile/auth/logout` so the server hash remains for `biometric-refresh`. Disabling Face ID in settings clears the biometric token and calls logout.
6. **Shared packages untouched** — biometric refresh called with `fetch` from mobile auth context (not added to `@worldly/api-client`).

---

## 4. Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `CRON_SECRET` | Railway / root `.env` | Bearer secret for `GET /api/cron/streak-reminders` |
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env.local` | API + pronunciation CDN base (e.g. `https://beworldly.app` or LAN IP) |
| Existing `DATABASE_URL`, `AUTH_SECRET`, etc. | unchanged | |

Added to `.env.example`. Run `node --env-file=.env apps/web/scripts/setup-db.js` after pull for new `push_tokens` columns.

### Railway cron setup

1. Set `CRON_SECRET` in Railway variables (long random string).
2. Cron job (or external scheduler):
   - **URL:** `https://beworldly.app/api/cron/streak-reminders`
   - **Schedule:** `0 21 * * *` (21:00 UTC)
   - **Header:** `Authorization: Bearer <CRON_SECRET>`
3. Local check:
   - Without secret → `401`
   - With secret → `{ "sent": N }`

---

## 5. Testing checklist

### Haptics
- [ ] 🟡 Correct answer fires success haptic
- [ ] 🟡 Wrong answer fires error haptic
- [ ] 🟡 Map tap fires light impact
- [ ] 🟡 Multiple choice tap fires light impact
- [ ] 🟡 Haptics disabled in settings → no haptics
- [ ] ✅ Haptics do not fire in web app (sanity — web unchanged for haptics)

### Sound
- [ ] 🟡 Correct sound plays on correct answer
- [ ] 🟡 Incorrect sound plays on wrong answer
- [ ] 🟡 Sound disabled in settings → silence
- [ ] 🟡 Hardware mute switch silences sound (iOS)
- [ ] 🟡 No delay on first answer (preloaded)
- [ ] 🟡 Pronunciation plays from network URL
- [ ] 🟡 Voice preference (Joanna/Matthew) respected

### Push notifications
- [ ] 🟡 Permission prompt after first Go! session only
- [ ] 🟡 Prompt does not reappear after “No thanks”
- [ ] 🟡 Token registered on first Go! completion
- [ ] 🟡 Token stored in `push_tokens`
- [ ] 🟡 Local streak reminder schedules at 8pm
- [ ] 🟡 Local reminder cancels when notifications disabled
- [ ] 🟡 Tap `streak_reminder` → home
- [ ] 🟡 Tap `friend_overtake` → friends
- [ ] 🟡 Tap `streak_milestone` → mastery
- [ ] ❌ Friend overtake end-to-end (needs two accounts + device tokens — not run here)
- [ ] ❌ Streak milestone push at 7 days (needs real Expo tokens)
- [ ] ✅ Cron endpoint returns 401 without secret (logic verified in code; run against live server to confirm)
- [ ] 🟡 Cron returns `{ sent: N }` with secret

### Face ID
- [ ] 🟡 Prompt after first login when hardware enrolled
- [ ] 🟡 Enabling stores biometric token
- [ ] 🟡 After logout, Face ID button on login
- [ ] 🟡 Face ID success issues new token
- [ ] 🟡 Failure / 401 falls back to email/password
- [ ] 🟡 Disabling clears biometric token
- [ ] ✅ Password never stored in SecureStore (code audit: only tokens)

### Widget
- [ ] ❌ Widget in iOS picker (deferred — needs native target)
- [ ] ❌ Small / medium layouts (deferred)
- [ ] 🟡 `writeWidgetData` updates after Go! / startup (AsyncStorage snapshot)
- [ ] ❌ Tap opens app (deferred)
- [ ] ❌ Stale data graceful UI (deferred)

**Legend:** ✅ verified in this pass · 🟡 simulator/code-path ready, needs device or live push · ❌ not working / deferred

---

## 6. Device testing before App Store

Must validate on a physical iPhone:
1. All haptics from the event map
2. Silent switch + sound
3. Push permission → Expo token → remote overtake/milestone
4. Face ID enroll / login / disable
5. (After widget native work) widget render + refresh
