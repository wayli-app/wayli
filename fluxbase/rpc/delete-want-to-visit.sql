-- @fluxbase:description Remove a place from the user's want-to-visit (wishlist) by id. Returns the deleted title so the caller can confirm. RLS owner-only DELETE ensures a user can only remove their own entries; an unknown/foreign id deletes nothing (returns no rows).
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "id": "uuid" }
-- @fluxbase:allowed-tables want_to_visit_places
-- @fluxbase:max-execution-time 15s

DELETE FROM want_to_visit_places
WHERE id = $id::uuid
  AND user_id = auth.uid()
RETURNING id, title;
