# Learn paywall + Stripe subscription — change log

Learn mode now requires an account, free accounts get **3 Learn sessions per
local calendar day**, and a single-tier Stripe subscription removes the cap
(status `active` or `trialing`). `apps/web` only — `apps/mobile` is untouched.
Test, Go!, and Discover are unchanged (see "Test / Go! / Discover" below).

> Status: schema, pure helpers + unit tests, DB layer, quota/start routes,
> Stripe checkout/portal/webhook, upgrade modal, and the Learn-entry badge are
> all implemented. Verified: unit tests (13/13), migration run twice against a
> scratch Postgres (idempotent), the quota/billing SQL exercised against that
> DB (including 10 parallel starts → exactly 3 allowed), and the webhook's
> signature rejection/acceptance with a generated test header. `next build`
> passes. That needed `"react-dom": "19.2.3"` pinned in the root `package.json`
> (next to the existing `react` pin) so `react-dom` installs at the root, where
> `next` is. **Not verified in a browser**: the UI wiring compiles but hasn't
> been clicked through, and checkout hasn't been run end to end against Stripe.

---

## Files created

### Shared packages
- `packages/core/subscription/dailyLimit.js` — pure, dependency-free:
  `hasReachedDailyLimit(sessionCount, limit)`, `getSessionsRemaining`,
  `isPremiumActive({ subscriptionStatus, currentPeriodEnd }, now)`,
  `getLocalDateString(date, timeZone)` (plain `Intl`, `en-CA` → `YYYY-MM-DD`),
  `isValidTimeZone`, `resolveTimeZone`, `DEFAULT_TIME_ZONE = "UTC"`. Carries the
  client-reported-timezone trust-boundary comment.

### Web lib
- `apps/web/lib/subscription.js` — one-line re-export shim (same pattern as
  `lib/mastery.js` etc.).
- `apps/web/lib/learnQuota.js` — server helper `loadLearnQuotaContext(userId,
  reportedTimeZone)`: stores a valid reported zone, loads billing state, and
  returns `{ billing, isPremium, localDate, cap }`. Shared by both
  learn-sessions routes.
- `apps/web/lib/stripe.js` — server-only lazy `getStripe()`,
  `getSubscriptionPeriodEnd(subscription)`, `sanitizeReturnPath(path)`.
- `apps/web/lib/billingClient.js` — client wrappers: `getClientTimeZone`,
  `fetchLearnQuota`, `claimLearnSessionStart`, `startCheckout`,
  `openBillingPortal`.

### API routes
- `apps/web/app/api/learn-sessions/quota/route.js` — `GET`, read-only badge data.
- `apps/web/app/api/learn-sessions/start/route.js` — `POST`, the single source
  of truth for allowed / not-allowed.
- `apps/web/app/api/billing/checkout/route.js` — `POST`, creates Checkout Session.
- `apps/web/app/api/billing/portal/route.js` — `POST`, creates Billing Portal session.
- `apps/web/app/api/webhooks/stripe/route.js` — `POST`, signature-verified webhook.

### UI
- `apps/web/components/UpgradeModal.jsx` — "You've used today's free Learn
  sessions" with **Upgrade** (→ Checkout) and **Maybe later**.

### Tests
- `apps/web/scripts/test-daily-limit.js` — 13 `node --test` cases: cap
  boundaries, remaining-count floor, premium statuses, period-end expiry,
  missing period end, timezone validation/fallback, local-vs-UTC day, local
  midnight rollover.

---

## Files modified

- `packages/constants/index.js` — `FREE_DAILY_LEARN_SESSION_LIMIT = 3`,
  `PREMIUM_SUBSCRIPTION_STATUSES = ["active", "trialing"]`.
- `packages/core/package.json`, `packages/core/index.js` — export
  `./subscription/dailyLimit`.
- `apps/web/scripts/setup-db.js` — schema below (idempotent, appended to `SCHEMA`).
- `apps/web/lib/db.js` — appended: `getUserBillingState`, `setUserTimezone`,
  `claimStripeCustomerId`, `syncUserSubscription`, `getOrCreateDailyUsage`,
  `incrementDailyUsage`. No existing function changed.
- `apps/web/auth.js` — `authorize` stores a valid `credentials.timezone` on
  successful login (failure to write never blocks login).
- `apps/web/components/AuthModal.jsx` — passes `timezone` into
  `signIn("credentials", …)`.
- `apps/web/components/StartScreen.jsx` — Learn entry step (`CHOOSE_TYPE`):
  quota badge ("2 free Learn sessions left today · Upgrade for unlimited"),
  **Manage subscription** link for premium users, and handling of the new
  `reason: "quota"` / `reason: "auth"` start results.
- `apps/web/components/GeographyGame.jsx` — seams only (see below).
- `apps/web/package.json` — `stripe` dependency; scripts `test:subscription`
  (also added to `test`), `stripe:listen`, `stripe:trigger-update`.
- `package-lock.json` — `stripe` install.

### `GeographyGame.jsx` — exact seams touched
1. Imports: `UpgradeModal`, `claimLearnSessionStart`.
2. State: `upgradeModal` (`{ open, cap }`).
3. New `claimFreshLearnSession` callback, defined immediately above
   `startLearnEngineGame`.
4. `handleSessionStart` → `GAME_TYPES.LEARNING` branch → **fresh** path only:
   `claimFreshLearnSession()` runs before `buildLearnEngineData(config)`.
5. `startLearningAgain` (Learn "Play again"): same call before
   `buildLearnEngineData`.
6. `<UpgradeModal>` rendered once at the end of the root `<div>`, so it works
   from both the start screen and the results screen.

`startLearnEngineGame` itself is **not** modified. The spec said to call the
start route "in `startLearnEngineGame` … BEFORE `buildLearnEngineData`", but
`startLearnEngineGame` is synchronous and receives the already-built session
(`buildLearnEngineData` runs in its callers), so the check lives at the two
call sites that build fresh sessions. That meets the spec's intent: nothing
is built unless the server says yes.

---

## Schema added (`apps/web/scripts/setup-db.js`)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_idx
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS daily_learn_usage (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date    DATE NOT NULL,   -- the user's LOCAL calendar date, not UTC
  session_count INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date)
);
```

The partial unique index on `stripe_customer_id` goes beyond the spec. The
webhook finds users by customer id, so there must be one user per customer.

Run `npm run db:setup` to apply.

---

## Enforcement flow, end to end

### Timezone
- **Login:** `AuthModal` sends `Intl.DateTimeFormat().resolvedOptions().timeZone`
  as a `timezone` field in the credentials sign-in, and `authorize` stores it
  on `users.timezone` if it's a valid IANA zone.
- **Learn session start:** the `POST /api/learn-sessions/start` body sends
  `{ timezone }`, which overwrites the stored value.
- **Quota badge:** `GET /api/learn-sessions/quota?timezone=…` also refreshes
  it. This goes beyond the spec, which only asked for login and session start.
  Sessions are JWT-based, so a user who signed in before this shipped never
  goes through login again. Without this, their badge would count by the UTC
  day until they start their first session.
- **Server:** "today" is `getLocalDateString(now, tz)`, falling back to `'UTC'`
  when `users.timezone` is `NULL`. Invalid zones are ignored, never stored.
- **Trust boundary** (commented in `dailyLimit.js` and `learnQuota.js`): the
  zone is client-reported and spoofable. That's accepted for a soft cap, and
  there's no geo-IP check.

### Starting a Learn session
1. StartScreen → **Learn**. A signed-out user gets `AuthModal` ("Please sign in
   to use Learn."). This gate already existed in `StartScreen.jsx` and is kept
   as is. After sign-in, the Learn start continues automatically.
2. `handleSessionStart` (LEARNING):
   - **Resume** of a saved local snapshot: not counted and not checked. It was
     counted when it first started.
   - **Fresh:** `claimFreshLearnSession()` → `POST /api/learn-sessions/start`.
3. `POST /api/learn-sessions/start`:
   1. No session → `401`. The client maps this to `reason: "auth"`, and
      StartScreen reopens `AuthModal`. This is the server-side half of "no guest
      Learn".
   2. Stores `body.timezone` if valid.
   3. `isPremiumActive` → `incrementDailyUsage` (telemetry only, uncapped) →
      `{ allowed: true, isPremium: true, cap: null, sessionsRemaining: null }`.
   4. Otherwise: compute the local date, then `getOrCreateDailyUsage`. If
      `session_count >= 3`, return `{ allowed: false, cap, sessionsUsedToday }`.
      Otherwise run `incrementDailyUsage(…, { maxCount: cap })` and return
      `{ allowed: true, sessionsUsedToday, cap, sessionsRemaining }`.
   - The increment is a single conditional upsert
     (`ON CONFLICT … DO UPDATE … WHERE session_count < cap`). Two concurrent
     starts can't both take the last slot, and the loser gets `allowed: false`.
4. `allowed: false` → `GeographyGame` opens `UpgradeModal` and returns
   `{ ok: false, reason: "quota" }`. StartScreen shows no error text and sets
   its badge to 0 left. Nothing is built.
5. `allowed: true` → `buildLearnEngineData` → `startLearnEngineGame`, exactly as
   before.

### Quota badge
`StartScreen` fetches `GET /api/learn-sessions/quota` once each time the Learn
entry step (`CHOOSE_TYPE`) is shown while signed in. It re-fetches only if you
leave that step and come back, never on every render. The response is:
- Free user: `{ sessionsUsedToday, cap: 3, isPremium: false, sessionsRemaining }`.
- Premium user: `{ sessionsUsedToday, cap: null, isPremium: true, sessionsRemaining: null }`.
  `null` means unlimited.

The route never increments. It may insert a `session_count = 0` row for today
through `getOrCreateDailyUsage`, which is harmless.

### Stripe
- **Checkout** (`POST /api/billing/checkout`, auth required):
  - Returns `409` if the user is already premium.
  - Creates the Stripe customer if missing, with idempotency key
    `worldly-customer-<userId>`. It's stored via `claimStripeCustomerId`, which
    only writes when the column is still `NULL`, so a double-click can't attach
    two customers.
  - Creates a `mode: 'subscription'` session for `STRIPE_PRICE_ID` with
    `client_reference_id = userId` and `subscription_data.metadata.userId`.
  - Success and cancel URLs are `<AUTH_URL or request origin><returnPath>?billing=success|cancel`.
    `returnPath` is the page the user clicked from (same-origin paths only).
  - Returns `{ url }`, and the client sets `window.location.href = url`.
- **Portal** (`POST /api/billing/portal`, auth required): creates a Billing
  Portal session for `stripe_customer_id` and returns `{ url }`. Returns `404`
  if the user has no customer.
- **Webhook** (`POST /api/webhooks/stripe`, no auth):
  - Reads the raw body with `request.text()` and runs
    `stripe.webhooks.constructEvent(raw, stripe-signature, STRIPE_WEBHOOK_SECRET)`
    before doing anything else. A missing or bad signature returns `400`.
  - `checkout.session.completed`: stores `stripe_subscription_id`, falling back
    to `client_reference_id` for the user when needed.
  - `customer.subscription.updated`: syncs `subscription_status` and
    `subscription_current_period_end`.
  - `customer.subscription.deleted`: sets `subscription_status = 'canceled'`.
  - `customer.subscription.created`: also handled, with the same sync. **This
    goes beyond the spec, and it's needed.** A subscription created through
    Checkout is often `active` from the start. Stripe then sends `created`,
    and there may be no `updated` event until the first renewal. Without this
    handler, a user could pay and still be capped.
  - Other event types → `200 { received: true }`.
  - **Idempotency:**
    - Every handled event re-retrieves the subscription from Stripe and writes
      its current state through `syncUserSubscription`, a single `UPDATE` keyed
      on customer id and subscription id. Replays, duplicates, and out-of-order
      deliveries all end up with the same row.
    - A late event for an *older* subscription can't overwrite a newer one. The
      write only applies when the row has no subscription yet, already holds
      this subscription, or this subscription is `active`/`trialing`.
  - A DB or Stripe error returns `500`, so Stripe retries.
  - `current_period_end` is read from the subscription or, on newer Stripe API
    versions (`stripe@22`), from `items.data[0]`.

---

## Test / Go! / Discover — not touched

- `startGame`, `startGoSession`, `startDiscoverGame`, `buildWorldTestCountries`,
  and every Test/Go/Discover branch of `handleSessionStart` are byte-for-byte
  unchanged. The new checks sit only inside the `GAME_TYPES.LEARNING` branch
  (fresh path) and in `startLearningAgain`, which already returns early for
  Go!.
- **Go! nuance:** Go! sessions use `gameType: GAME_TYPES.LEARNING`, but they
  start through `handleSessionStart`'s `config.go` branch, which returns before
  the Learn branch, and through `startGame`, not the Learn engine. Go! is
  therefore not counted or gated.
- Guest behavior for Test, Go!, and Discover (including `pendingGuestGame`
  syncing) is unchanged. `/api/country-stats`, `/api/mastery`, `/api/streak`,
  and `/api/scores` are unchanged.
- **Unrelated working-tree edits:** `GeographyGame.jsx` also contains
  uncommitted edits that were already there and aren't part of this change
  (`correctStatRecordedRef`, `reserveGiveUp`).

---

## Testing

```bash
cd apps/web
npm run test:subscription          # pure helper unit tests
npm run db:setup                   # apply schema
npm run stripe:listen              # stripe listen --forward-to localhost:3000/api/webhooks/stripe
npm run stripe:trigger-update      # stripe trigger customer.subscription.updated
```

Put the `whsec_…` secret that `stripe listen` prints into
`STRIPE_WEBHOOK_SECRET` for local runs. The `stripe:*` scripts need the Stripe
CLI installed.

**Caveat on `stripe trigger`:** the triggered event is for a new fixture
customer that isn't linked to any Worldly user. It checks signature handling
and the `200` response, but `syncUserSubscription` will match no row. To test
the full flow, click **Upgrade**, pay with card `4242 4242 4242 4242`, and
confirm `users.subscription_status = 'active'` and that the badge is replaced
by **Manage subscription**.

---

## Assumptions / decisions to verify

1. **A session that crosses local midnight is a non-issue.** The quota is
   charged once, when a fresh session starts, against the local date at that
   moment. Answers, completion, and resuming never touch `daily_learn_usage`. A
   session started at 23:55 on the 23rd counts for the 23rd and finishes
   normally after midnight.
2. **Resuming a saved Learn session costs nothing.** Only fresh sessions are
   counted. "Start over" on a saved session counts as fresh.
3. **Quota is charged before the session is built**, as the spec requires. If
   `buildLearnEngineData` then fails or returns no eligible countries, that
   start has still used a slot. This is rare, since every region has countries,
   but it's possible on a mastery-load error.
4. **Returning from Checkout may still show the free badge** if the user lands
   back before the webhook is processed (usually within seconds). Reloading the
   Learn step fixes it. There's no polling or success-page sync.
5. `past_due`, `incomplete`, `unpaid`, and similar statuses are stored as Stripe
   reports them and count as **not** premium. Only `active` and `trialing`
   unlock. A renewal whose webhook is delayed past `current_period_end`
   briefly counts as free until the `updated` event arrives.
6. **"Reset practice data" (`deleteUserPracticeData`) does not clear
   `daily_learn_usage`.** Otherwise a reset would refund the day's sessions.
   Account deletion clears it through `ON DELETE CASCADE`.
7. **Billing routes are web-session only** (`auth()`). The learn-sessions
   routes also accept the mobile bearer session, for consistency with the
   other routes. `apps/mobile` doesn't call them, so mobile Learn is not capped
   by this change.
8. `?billing=success|cancel` is only a marker. The start-screen URL normalizer
   may strip it, and nothing reads it yet.
9. No annual pricing, tiers, trials, or coupons. `trialing` is accepted only
   because the spec lists it as a premium status.
