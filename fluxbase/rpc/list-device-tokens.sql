-- @fluxbase:description List the caller's device tokens (label, created/last-used/revoked timestamps). Token hashes are never returned. RLS-scoped to the caller.
-- @fluxbase:require-role authenticated
-- @fluxbase:input {}
-- @fluxbase:allowed-tables device_tokens
-- @fluxbase:max-execution-time 10s

SELECT
    id,
    label,
    scopes,
    last_used_at,
    expires_at,
    revoked_at,
    created_at
FROM device_tokens
WHERE user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 100;
