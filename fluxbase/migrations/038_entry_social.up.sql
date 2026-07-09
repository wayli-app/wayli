-- 038: Add entry_id to trip_likes + entry-level comment/like support
-- Moves social engagement from trip-level to entry-level (Polarsteps-style).

ALTER TABLE trip_likes ADD COLUMN IF NOT EXISTS entry_id uuid REFERENCES trip_entries(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_trip_likes_entry_id ON trip_likes(entry_id);

-- Drop the old unique constraint (trip_id, user_id) — now uniqueness is per (entry_id, user_id)
ALTER TABLE trip_likes DROP CONSTRAINT IF EXISTS trip_likes_trip_id_user_id_key;
ALTER TABLE trip_likes ADD CONSTRAINT trip_likes_entry_user_unique UNIQUE (entry_id, user_id);

-- Update RLS on trip_likes: allow when the parent trip (via the entry) is public
-- or when the entry_id is null (trip-level like, backward compat)
DROP POLICY IF EXISTS trip_likes_read_public ON trip_likes;
CREATE POLICY trip_likes_read_public ON trip_likes
    FOR SELECT TO anon, authenticated
    USING (
        entry_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM trip_entries te
            JOIN trips t ON t.id = te.trip_id
            WHERE te.id = trip_likes.entry_id AND t.visibility = 'public'
        )
    );

DROP POLICY IF EXISTS trip_likes_owner_read ON trip_likes;
CREATE POLICY trip_likes_owner_read ON trip_likes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM trip_entries te
            JOIN trips t ON t.id = te.trip_id
            WHERE te.id = trip_likes.entry_id AND t.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS trip_likes_insert ON trip_likes;
CREATE POLICY trip_likes_insert ON trip_likes
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND entry_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM trip_entries te
            JOIN trips t ON t.id = te.trip_id
            WHERE te.id = trip_likes.entry_id AND t.visibility = 'public'
        )
    );

-- Update trip_comments: make entry_id NOT NULL for new comments (keep nullable for backward compat)
-- The RLS already cascades from trips → visibility = 'public'. Add entry-level cascade too.
DROP POLICY IF EXISTS trip_comments_read_public ON trip_comments;
CREATE POLICY trip_comments_read_public ON trip_comments
    FOR SELECT TO anon, authenticated
    USING (
        entry_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM trip_entries te
            JOIN trips t ON t.id = te.trip_id
            WHERE te.id = trip_comments.entry_id AND t.visibility = 'public'
        )
    );

DROP POLICY IF EXISTS trip_comments_owner_read ON trip_comments;
CREATE POLICY trip_comments_owner_read ON trip_comments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM trip_entries te
            JOIN trips t ON t.id = te.trip_id
            WHERE te.id = trip_comments.entry_id AND t.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS trip_comments_insert ON trip_comments;
CREATE POLICY trip_comments_insert ON trip_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND entry_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM trip_entries te
            JOIN trips t ON t.id = te.trip_id
            WHERE te.id = trip_comments.entry_id AND t.visibility = 'public'
        )
    );

DROP POLICY IF EXISTS trip_comments_delete_owner ON trip_comments;
CREATE POLICY trip_comments_delete_owner ON trip_comments
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM trip_entries te
            JOIN trips t ON t.id = te.trip_id
            WHERE te.id = trip_comments.entry_id AND t.user_id = auth.uid()
        )
    );

-- Add index on entry_id for comments (already exists on trip_id and user_id)
CREATE INDEX IF NOT EXISTS idx_trip_comments_entry_id ON trip_comments(entry_id);
