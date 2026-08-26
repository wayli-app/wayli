#!/bin/bash
# Dev container post-create: install bun, install web deps, sync Fluxbase resources.
set -e

if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"

cd /workspace/web
bun install

if [ -z "${FLUXBASE_SERVER:-}" ] || [ -z "${FLUXBASE_TOKEN:-}" ]; then
    echo ""
    echo "========================================================================="
    echo "ERROR: Fluxbase CLI credentials are missing (FLUXBASE_SERVER/FLUXBASE_TOKEN)."
    echo ""
    echo "This usually means .devcontainer/.env was generated with empty"
    echo "FLUXBASE_ANON_KEY/FLUXBASE_SERVICE_ROLE_KEY, so 'bun run sync:all' would"
    echo "fail with: no profile specified and no current profile set"
    echo ""
    echo "Fix:"
    echo "  1. Regenerate the keys: ./deploy/docker-compose/generate-keys.sh"
    echo "     (or fill FLUXBASE_ANON_KEY/FLUXBASE_SERVICE_ROLE_KEY in"
    echo "      .devcontainer/.env, signed with FLUXBASE_AUTH_JWT_SECRET)"
    echo "  2. Rebuild the container: 'Dev Containers: Rebuild Container'"
    echo "  3. Re-run: cd /workspace/web && bun run sync:all"
    echo "========================================================================="
    exit 1
fi

bun run sync:all \
    || (echo "Retrying sync in 5s..." && sleep 5 && bun run sync:all) \
    || echo "Fluxbase sync skipped (service may not be ready)"
