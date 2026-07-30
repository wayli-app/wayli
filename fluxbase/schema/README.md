# Wayli Declarative Database Schema

This directory is the **single source of truth** for Wayli's application database
schema (the `public` schema). It replaces the previous imperative migration
files, which have been removed from the tree (they remain available in Git
history if ever needed).

## Files

| File | Purpose |
|------|---------|
| [`public.sql`](public.sql) | Desired-state schema for the `public` schema: tables, views, indexes, constraints, functions, triggers, RLS policies, and grants. Managed declaratively via `fluxbase schema sync`. |
| [`extensions.sql`](extensions.sql) | PostGIS extensions Wayli needs but Fluxbase's bootstrap doesn't enable. pgschema can't manage extensions, so they live here and are applied separately. |
| [`.generate-filter.py`](.generate-filter.py) | The script used to produce `public.sql` from a live `pgschema dump` (filtering out extension-owned objects). Re-run it when regenerating the baseline. |

## How it works

Wayli uses Fluxbase's **declarative app-schema** feature (opt-in). On startup and
via `fluxbase schema sync`, Fluxbase compares `public.sql` against the live
database and applies the diff — reconciling drift automatically.

- **Source of truth:** `public.sql`. What's in this file is what's deployed.
- **No version numbers, no up/down files.** Edit the file; the diff is computed.
- **Destructive changes** (DROP) are blocked by default; review carefully before
  enabling `allow_destructive`.
- **Synced, not mounted:** like all Wayli Fluxbase resources, the schema reaches
  the server via `fluxbase schema sync` (CLI) — the Fluxbase container is immutable.

## Making a schema change

1. Edit `public.sql` (e.g. add a column to a `CREATE TABLE`).
2. Run `bun run sync:schema` (dev) — it stores + applies the change.
3. Verify with `fluxbase schema validate --namespace wayli` (CI uses
   `--fail-on-drift`).

For one-off data migrations that aren't expressible declaratively, add a small
imperative migration alongside (e.g. via the Fluxbase migrations API) — but the
*structure* always lives here.

## Regenerating the baseline

`public.sql` was produced from a live database dump so the initial sync was a
zero-diff no-op. To regenerate (e.g. after a large refactor):

```bash
# Dump from a running environment, then filter to Wayli-owned objects only
docker exec -e PGPASSWORD="$DBPASS" fluxbase \
  pgschema dump --host fluxbase-postgres --port 5432 --user fluxbase --db fluxbase --schema public \
  > /tmp/public_raw.sql
python3 fluxbase/schema/.generate-filter.py /tmp/public_raw.sql > fluxbase/schema/public.sql
```

The filter strips PostGIS/pgvector/timescaledb extension objects (those are owned
by their extensions, not Wayli) and normalizes a few pgschema-dump quirks
(empty `search_path`, quoted `ST_*` calls, unqualified `vector`/`geography` types).

## What's NOT in public.sql

- **Extension objects** (`spatial_ref_sys`, `geometry_columns`, PostGIS functions):
  owned by their extensions, created via `extensions.sql` / the extension itself.
- **Fluxbase-owned schemas** (`auth`, `storage`, `platform`, `app`): managed by
  Fluxbase's own internal declarative schema, never by Wayli.
- **Cross-schema dependencies:** `public.sql` references `auth.users` (e.g. FKs,
  `auth.uid()`, `auth.jwt()`). It is **not standalone** — it can only be applied
  after Fluxbase has bootstrapped its own schemas. A fresh deploy goes through
  Fluxbase, which creates `auth`/`storage`/`platform` first.

## Supported change types (verified)

Wayli's schema uses pgvector/PostGIS operators, so every apply runs through
Fluxbase's **direct-apply fallback** path (pgschema's plan-based path can't
validate extension operators in its temp schema). The fallback's capabilities
were verified against the devcontainer:

| Change type | Works? | Notes |
|---|---|---|
| New table / view / index / trigger | ✅ | `CREATE IF NOT EXISTS` |
| Add column to existing table | ✅ | `ALTER TABLE ADD COLUMN` via ensureMissingColumns |
| Function body change | ✅ | `CREATE OR REPLACE FUNCTION` |
| View definition change | ✅ | `CREATE OR REPLACE VIEW` |
| Policy change (USING/WITH CHECK) | ✅ | DROP IF EXISTS + CREATE |
| Standalone `ALTER TABLE ADD CONSTRAINT` | ✅ | DROP IF EXISTS + ADD |
| **Inline constraint change** (in `CREATE TABLE`) | ❌ | `CREATE TABLE IF NOT EXISTS` is a no-op when the table exists |
| **Column type change** | ❌ | Fallback only adds columns, never alters types |
| **Index operator/method change** | ❌ | `CREATE INDEX IF NOT EXISTS` won't replace an existing index |
| Drop column / table | ❌ | Destructive; blocked by default and not handled by fallback |
| `fluxbase schema validate` (drift check) | ❌ | Uses plan path; errors on extension operators |

For change types marked ❌, apply the change via a one-off SQL migration
(`docker exec fluxbase-postgres psql ...`) **and** update `public.sql` to match,
so the two stay in sync. Track these limitations in the Fluxbase issues below.

## Known limitations (Fluxbase follow-ups)

These gaps are in Fluxbase's declarative app-schema fallback, not in `public.sql`:
- Inline `CREATE TABLE` constraint/column-type/index changes don't propagate
  (the fallback only handles existence + missing columns).
- `fluxbase schema validate` and `plan` fail for schemas using extension operators.
- `fluxbase schema sync` reports `Applied 0 change(s)` even when the fallback
  makes changes (misleading feedback).

