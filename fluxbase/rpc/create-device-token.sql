-- @fluxbase:description Register a device token for GPS tracker authentication. The client generates the token locally (wayli_dt_ + 32 random bytes hex) and sends only its SHA-256 hash — the plaintext never leaves the device and is displayed once at creation. Scopes default to gps:write (point submission only). Returns the created row (id, label, created_at) so the caller can confirm registration.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "label": "text", "token_hash": "text" }
-- @fluxbase:allowed-tables device_tokens
-- @fluxbase:max-execution-time 10s

INSERT INTO device_tokens (user_id, label, token_hash, scopes)
VALUES (
    auth.uid(),
    COALESCE(NULLIF(btrim($label::text), ''), 'Device'),
    lower($token_hash::text),
    ARRAY['gps:write']::text[]
)
RETURNING id, label, scopes, created_at;
