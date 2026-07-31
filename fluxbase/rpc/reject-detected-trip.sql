-- @fluxbase:description Reject an auto-detected trip by flipping its status pending -> rejected. Simple status flip with no side effects (matches the UI's rejectSuggestedTrips). Owner-scoped via RLS; an unknown/foreign id rejects nothing (returns no rows). Use for "reject the Berlin suggestion", "that's not a trip". Returns the rejected title so the caller can confirm.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "id": "uuid" }
-- @fluxbase:allowed-tables trips
-- @fluxbase:max-execution-time 15s

UPDATE trips
SET status = 'rejected', updated_at = NOW()
WHERE id = $id::uuid
  AND user_id = auth.uid()
  AND status = 'pending'
RETURNING id, title, status;
