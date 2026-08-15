-- @fluxbase:description Revoke a device token by id (sets revoked_at; rows are kept for audit and the token stops working immediately). Only the owner can revoke their own tokens — RLS enforces user_id = auth.uid().
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "id": "uuid" }
-- @fluxbase:allowed-tables device_tokens
-- @fluxbase:max-execution-time 10s

UPDATE device_tokens
SET revoked_at = now()
WHERE id = $id::uuid
  AND user_id = auth.uid()
  AND revoked_at IS NULL
RETURNING id, label, revoked_at;
