#!/bin/bash
# Apply database extensions via the Fluxbase SQL execute API.
#
# Usage: ./scripts/apply-extensions.sh <extensions.sql> [schema_dir]
#
# Reads the SQL file and sends each statement to Fluxbase's
# POST /api/v1/admin/sql/execute endpoint. This avoids needing psql or direct
# DB access — it goes through Fluxbase (the service-role token authenticates).
#
# Required env: FLUXBASE_SERVER (or FLUXBASE_BASE_URL), FLUXBASE_TOKEN (or FLUXBASE_SERVICE_ROLE_KEY)
set -euo pipefail

EXT_FILE="${1:-fluxbase/schema/extensions.sql}"
SERVER="${FLUXBASE_SERVER:-${FLUXBASE_BASE_URL:-http://fluxbase:8080}}"
TOKEN="${FLUXBASE_TOKEN:-${FLUXBASE_SERVICE_ROLE_KEY:-}}"

if [ -z "$TOKEN" ]; then
    echo "Warning: FLUXBASE_TOKEN/FLUXBASE_SERVICE_ROLE_KEY not set, skipping extensions"
    exit 0
fi

if [ ! -f "$EXT_FILE" ]; then
    echo "Warning: extensions file not found: $EXT_FILE"
    exit 0
fi

# Read the file and execute via the Fluxbase SQL API.
# The API accepts multiple semicolon-separated statements.
SQL=$(cat "$EXT_FILE")

RESPONSE=$(curl -sf -X POST "${SERVER}/api/v1/admin/sql/execute" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg q "$SQL" '{"query": $q}')" 2>&1) || {
    echo "Warning: failed to apply extensions via Fluxbase API (server may not be ready)"
    exit 0
}

echo "Extensions applied via Fluxbase API"
