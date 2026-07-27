# Wayli

Privacy-first location tracking and trip analysis application. SvelteKit frontend with Fluxbase backend.

## Tech Stack

- **Frontend**: SvelteKit 2.16, Svelte 5, TypeScript 5.8 (strict), Tailwind CSS 4, Vite 6
- **Backend**: Fluxbase SDK, PostgreSQL with pgvector
- **Testing**: Vitest, Testing Library
- **Mapping**: Leaflet with MarkerCluster
- **Validation**: Zod

## Directory Structure

```
web/                      # Main SvelteKit application
├── src/
│   ├── lib/
│   │   ├── accessibility/ # Accessibility utilities
│   │   ├── architecture/  # Architecture documentation
│   │   ├── components/    # Reusable Svelte components
│   │   ├── core/          # Environment configuration (server/worker)
│   │   ├── i18n/          # Internationalization
│   │   ├── rules/         # Trip/transport detection rules
│   │   ├── schemas/       # Zod validation schemas
│   │   ├── services/      # Business logic (trips, profile, statistics, etc.)
│   │   ├── stores/        # Svelte reactive stores
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Utility functions
│   ├── routes/
│   │   ├── (user)/        # Protected user routes (dashboard, map, etc.)
│   │   └── auth/          # Auth routes (signin, signup, 2FA)
│   └── shared/            # Shared config and types
├── tests/                 # Unit, integration, accessibility tests
fluxbase/
├── chatbots/              # Chatbot definitions
├── functions/             # Edge functions (health, owntracks, trips-suggest-image)
├── jobs/                  # Background jobs (Deno): import, geocoding, trip detection
├── mcp-tools/             # MCP tool definitions
├── migrations/            # SQL migrations
└── rpc/                   # Remote procedure calls
deploy/                    # Docker Compose configs
charts/                    # Helm charts for Kubernetes
```

## Commands (run from /web)

**Package manager: `bun`** — use `bun` (not npm/yarn) for all installs, scripts, and test runs.

```bash
bun run dev           # Start dev server
bun run build         # Production build
bun run test          # Run all tests
bun run test:coverage # Tests with coverage
bun run lint          # Check formatting/linting
bun run check         # TypeScript + Svelte checks
bun run sync:all      # Sync all resources (functions, jobs, migrations, rpc, chatbots, mcp)
bun add <package>     # Install a dependency
bun install           # Restore dependencies from bun.lock
```

## Coding Conventions

### TypeScript

- Strict mode enabled
- Use Zod schemas for runtime validation (in `lib/schemas/`)
- Types in `lib/types/` - prefer interfaces over type aliases

### Svelte Components

- Components in `lib/components/` - PascalCase filenames
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Props via `$props()`, not `export let`

### Services

- Services in `lib/services/` - kebab-case filenames
- Export functions, not classes
- Use Fluxbase SDK for database queries (client-side with RLS)

### Styling

- Tailwind CSS utility classes
- Use `clsx()` or `tailwind-merge` for conditional classes
- Dark mode via Tailwind's `dark:` variant

### Testing

- Test files: `*.test.ts` or `*.spec.ts`
- Co-locate component tests in `tests/components/`
- Use Testing Library for component tests
- Target: 85%+ coverage

## Key Files

- `web/src/lib/fluxbase.ts` - Client-side Fluxbase database client
- `web/src/lib/config.ts` - Client-side runtime configuration
- `web/src/lib/core/config/` - Server/worker environment configuration
- `web/src/routes/(user)/dashboard/` - Main user dashboard
- `web/src/lib/services/trips.ts` - Core trip service
- `web/src/lib/rules/` - Trip detection algorithms

## Architecture Notes

- **Service pattern**: Business logic in services, not components
- **RLS**: Row-level security handles authorization - no server-side auth checks needed
- **Edge functions minimal**: Only 3 functions remain - prefer client SDK with RLS
- **Jobs**: Deno-based background processing for heavy tasks (geocoding, import, trip detection)

## Migration Conventions

- **Views must be DROP'd before CREATE**: `CREATE OR REPLACE VIEW` fails with SQLSTATE 42P16 when the new column list differs from the existing view. Always use `DROP VIEW IF EXISTS` followed by `CREATE VIEW` in migration up files. This is a PostgreSQL limitation, not a Fluxbase issue.
- **Order matters**: Views that depend on tables or other views must be created after their dependencies. Dropping in the correct order matters too.
- **`share_token` column**: was removed in migration 076. Do not reference it.
