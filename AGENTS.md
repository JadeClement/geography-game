# AGENTS.md

## Cursor Cloud specific instructions

This is a single Next.js 15 (App Router, React 19) app — the "Worldly" geography game — backed by PostgreSQL and Auth.js (NextAuth v5). Standard commands live in `package.json` (`dev`, `build`, `start`, `db:setup`). Notes below are the non-obvious bits.

### Services and how to run them
- **Next.js dev server**: `npm run dev` (port 3000). This is the product.
- **PostgreSQL**: a local cluster is installed in the VM snapshot but is **not auto-started on boot**. Start it before running the app or DB scripts:
  - `sudo pg_ctlcluster 16 main start`
  - Local DB/user already created: database `geography`, user `postgres` / password `postgres` (connection string is in `.env`).

### Environment variables (`.env`)
- A gitignored `.env` already exists in the repo root with `DATABASE_URL` (local Postgres), a generated `AUTH_SECRET`, and `NEXT_PUBLIC_MAPBOX_TOKEN`.
- `NEXT_PUBLIC_MAPBOX_TOKEN` comes from the `NEXT_PUBLIC_MAPBOX_TOKEN` secret (injected as an env var). **It is required for any gameplay**: without it the home screen only shows "Add NEXT_PUBLIC_MAPBOX_TOKEN..." and never renders the region/mode picker. If the token is missing/stale, refresh the value in `.env` from `$NEXT_PUBLIC_MAPBOX_TOKEN` and restart `npm run dev` (it's a `NEXT_PUBLIC_` var, so it's baked into the client at server start — you must restart dev after changing it).
- To recreate `.env` if absent:
  ```
  printf 'NEXT_PUBLIC_MAPBOX_TOKEN=%s\nDATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/geography\nAUTH_SECRET=%s\n' "$NEXT_PUBLIC_MAPBOX_TOKEN" "$(openssl rand -base64 32)" > .env
  ```

### Database setup
- `npm run db:setup` creates/migrates the schema (idempotent: `CREATE TABLE IF NOT EXISTS` + `ALTER ... IF NOT EXISTS`).
- **Gotcha**: the standalone scripts (`scripts/*.js`) do NOT load `.env` themselves (no dotenv). The `db:setup` npm script will report "DATABASE_URL is not set" unless env is loaded. Run it as `node --env-file=.env scripts/setup-db.js` (the Next.js dev/build processes load `.env` automatically; only the standalone node scripts need `--env-file`).

### Lint / build
- There is **no lint script and no ESLint config** in this repo — `npm run lint` does not exist. Don't expect a lint step.
- `npm run build` produces a production build; `npm run dev` is the development server. Use `dev` for development.

### Quick verification
Core stack is testable without the browser via the API: register (`POST /api/auth/register`), log in (`/api/auth/csrf` + `POST /api/auth/callback/credentials`), then save/fetch scores (`/api/scores`). Gameplay (map + quiz rounds) requires the Mapbox token and persists per-attempt rows to `country_attempts` / `country_stats`.
