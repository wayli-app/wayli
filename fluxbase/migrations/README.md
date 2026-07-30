# Wayli Database Migrations (Archived)

> ⚠️ **This directory is no longer the source of truth.** Wayli's database schema is
> now managed **declaratively** from [`../schema/public.sql`](../schema/README.md).

## What happened

Wayli migrated from 80 imperative `.up.sql`/`.down.sql` migration files to a
single declarative desired-state schema file (`../schema/public.sql`), using
Fluxbase's declarative app-schema feature. See
[`../schema/README.md`](../schema/README.md) for the new workflow.

## What's in `.archive/`

The original 80 migrations (158 SQL files + helper shell scripts) are preserved
here as **read-only history**. They are no longer synced or applied —
`sync:migrations` was removed from `sync:all` and `startup.sh` now runs
`fluxbase schema sync` instead.

These files exist only to document how the schema evolved over time. Do not edit
them expecting changes to take effect; edit `../schema/public.sql` instead.
