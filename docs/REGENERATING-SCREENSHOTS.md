# Regenerating screenshots

The screenshots in `docs/images/` are produced by two scripts under `web/scripts/`:

- `seed-screenshots.ts` — populates a running Wayli instance with **deterministic, synthetic** demo data (no real location data).
- `capture-screenshots.ts` — logs in as the demo user and captures named screenshots with Playwright.

They are designed to be run together against a local development stack.

## Prerequisites

1. **A running Wayli stack** — Fluxbase + Postgres + the web app. The fastest path is the devcontainer or:

   ```bash
   cd web
   bun install
   bun run dev:all   # syncs Fluxbase resources and starts the app on :4000
   ```

   The web app must be reachable at `http://localhost:4000` (override with `WAYLI_BASE_URL`).

2. **`web/.env`** with `FLUXBASE_PUBLIC_BASE_URL`, `PUBLIC_FLUXBASE_ANON_KEY`, and `FLUXBASE_SERVICE_ROLE_KEY` (copy from `web/.env.example`). The seeder uses the service-role key to bypass RLS for direct inserts.

3. **Playwright's Chromium** (only needed for capture):

   ```bash
   cd web
   bunx playwright install chromium
   ```

4. **Signup enabled** in Fluxbase auth settings (so the seeder can create the demo user). If signup is disabled, create the user manually first via the admin UI; the seeder will then detect it by email and reuse it.

## Running

From `web/`:

```bash
# Seed synthetic data, then capture screenshots:
bun run screenshots

# Or run each step separately:
bun run screenshots:seed       # create/refresh demo user + data
bun run screenshots:capture    # log in and capture to docs/images/
```

Output lands in `docs/images/` as JPEGs. The three core screenshots (`screenshot-trips.jpg`, `screenshot-statistics.jpg`, `screenshot-want-to-visit.jpg`) intentionally keep their existing names so the README and the marketing site keep working; additional shots (feed, planner, public profile, mobile, dark-mode landing) are added alongside.

## Configuration

All settings are optional environment variables (defaults shown):

| Variable | Default | Purpose |
| --- | --- | --- |
| `WAYLI_BASE_URL` | `http://localhost:4000` | Web app URL for capture |
| `WAYLI_SEED_EMAIL` | `screenshots-demo@wayli.app` | Demo user email |
| `WAYLI_SEED_PASSWORD` | `wayli-screenshots-demo!` | Demo user password |
| `WAYLI_SEED_USERNAME` | `wayli-demo` | Demo user's public profile handle (`/u/<username>`) |
| `WAYLI_SCREENSHOTS_DIR` | `../docs/images` | Where JPEGs are written (relative to `web/`) |

## Using the screenshots in the marketing site

The screenshots are committed here and copied into the separate `wayli-website` repo (sibling under the same parent directory):

```bash
cp docs/images/*.jpg ../wayli-website/static/screenshots/
```

## Notes

- The data is **fully synthetic and deterministic** (seeded PRNG), so every run produces identical output — safe to regenerate at any time and free of any real location history.
- The seeder is **idempotent**: it wipes the demo user's rows before inserting, so re-running won't duplicate data.
- Capture is local/manual by design; it is not wired into CI because it requires a running backend with seeded data.
