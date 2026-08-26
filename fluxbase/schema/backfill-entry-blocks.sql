-- One-off backfill for the entry-blocks migration (blocks jsonb column).
--
-- Derives {"v":1,"blocks":[…]} for every entry that doesn't have blocks yet
-- (legacy body markdown + trip_media rows → text/photo blocks), then
-- realigns trip_media.sort_order with the order photos appear in blocks so
-- legacy cover-from-first-media fallbacks match the new visual order.
--
-- Idempotent: only touches entries where blocks IS NULL; safe to re-run.
--
-- Run against an existing environment once after the schema sync that adds
-- the blocks column:
--   docker exec -i fluxbase-postgres psql -U fluxbase -d fluxbase \
--     < fluxbase/schema/backfill-entry-blocks.sql
-- (or the kubectl/rails equivalent for k8s deployments — see schema/README.md)

BEGIN;

UPDATE trip_entries e
   SET blocks = wayli_entry_blocks_for_entry(e.id)
 WHERE e.blocks IS NULL;

WITH placed AS (
    SELECT photo.media_id,
           row_number() OVER (
               PARTITION BY e.id
               ORDER BY blk.ord, photo.ord
           ) - 1 AS new_sort
      FROM trip_entries e
      CROSS JOIN LATERAL jsonb_array_elements(e.blocks -> 'blocks')
          WITH ORDINALITY AS blk(value, ord)
      CROSS JOIN LATERAL jsonb_array_elements_text(blk.value -> 'ids')
          WITH ORDINALITY AS photo(media_id, ord)
     WHERE e.blocks IS NOT NULL
       AND blk.value ->> 't' = 'photos'
)
UPDATE trip_media m
   SET sort_order = placed.new_sort
  FROM placed
 WHERE m.id = placed.media_id::uuid
   AND m.sort_order IS DISTINCT FROM placed.new_sort;

COMMIT;
