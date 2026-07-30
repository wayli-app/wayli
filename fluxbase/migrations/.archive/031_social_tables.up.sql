-- 031: Social — comments, likes, reader role
-- Adds commenting + likes on trips/entries, and the 'reader' role.

-- ============================================================
-- 1. Add 'reader' to the role CHECK constraint
-- ============================================================
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
    CHECK (role IN ('user', 'admin', 'moderator', 'reader'));

-- ============================================================
-- 2. Update handle_new_user to support reader role hint
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role text;
    station_name text;
    airport_name text;
    at_train_station boolean := false;
    at_airport boolean := false;
    on_highway boolean := false;
BEGIN
    -- Determine user role:
    --   First user ever -> admin
    --   Signup metadata with role='reader' -> reader
    --   Otherwise -> user
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM user_profiles LIMIT 1) THEN 'admin'
        WHEN new.raw_user_meta_data->>'role' = 'reader' THEN 'reader'
        ELSE 'user'
    END INTO user_role;

    -- Create the user profile
    INSERT INTO user_profiles (id, role)
    VALUES (new.id, user_role)
    ON CONFLICT (id) DO NOTHING;

    -- Create default preferences
    INSERT INTO user_preferences (id)
    VALUES (new.id)
    ON CONFLICT (id) DO NOTHING;

    -- Sync the role to auth.users for JWT claims
    UPDATE auth.users SET role = user_role WHERE id = new.id;

    RETURN new;

EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't block user creation
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$;

-- ============================================================
-- 3. Trip comments table
-- ============================================================
CREATE TABLE IF NOT EXISTS trip_comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    entry_id    uuid REFERENCES trip_entries(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    body        text NOT NULL,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_trip_comments_trip_id ON trip_comments(trip_id);
CREATE INDEX idx_trip_comments_user_id ON trip_comments(user_id);

COMMENT ON TABLE trip_comments IS 'Comments on trips (and optionally entries). Any authenticated user can comment on public trips.';

-- ============================================================
-- 4. Trip likes table
-- ============================================================
CREATE TABLE IF NOT EXISTS trip_likes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    created_at  timestamptz DEFAULT now(),
    UNIQUE(trip_id, user_id)
);

CREATE INDEX idx_trip_likes_trip_id ON trip_likes(trip_id);
CREATE INDEX idx_trip_likes_user_id ON trip_likes(user_id);

COMMENT ON TABLE trip_likes IS 'Likes on trips. One per user per trip (UNIQUE constraint).';

-- ============================================================
-- 5. RLS on trip_comments
-- ============================================================
ALTER TABLE trip_comments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read comments on public trips
CREATE POLICY trip_comments_read_public ON trip_comments
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1 FROM trips
        WHERE trips.id = trip_comments.trip_id
        AND trips.visibility = 'public'
    ));

-- Owner can read comments on their own (private) trips
CREATE POLICY trip_comments_owner_read ON trip_comments
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM trips
        WHERE trips.id = trip_comments.trip_id
        AND trips.user_id = auth.uid()
    ));

-- Any authenticated user can INSERT their own comment (on public trips only)
CREATE POLICY trip_comments_insert ON trip_comments
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM trips
            WHERE trips.id = trip_comments.trip_id
            AND trips.visibility = 'public'
        )
    );

-- Commenter can delete their own comment
CREATE POLICY trip_comments_delete_own ON trip_comments
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Trip owner can delete any comment on their trip
CREATE POLICY trip_comments_delete_owner ON trip_comments
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM trips
        WHERE trips.id = trip_comments.trip_id
        AND trips.user_id = auth.uid()
    ));

GRANT SELECT, INSERT, DELETE ON trip_comments TO authenticated;
GRANT SELECT ON trip_comments TO anon;

-- ============================================================
-- 6. RLS on trip_likes
-- ============================================================
ALTER TABLE trip_likes ENABLE ROW LEVEL SECURITY;

-- Any authenticated + anon can read likes on public trips
CREATE POLICY trip_likes_read_public ON trip_likes
    FOR SELECT TO anon, authenticated
    USING (EXISTS (
        SELECT 1 FROM trips
        WHERE trips.id = trip_likes.trip_id
        AND trips.visibility = 'public'
    ));

-- Owner can read likes on their own trips
CREATE POLICY trip_likes_owner_read ON trip_likes
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM trips
        WHERE trips.id = trip_likes.trip_id
        AND trips.user_id = auth.uid()
    ));

-- Any authenticated user can like a public trip
CREATE POLICY trip_likes_insert ON trip_likes
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM trips
            WHERE trips.id = trip_likes.trip_id
            AND trips.visibility = 'public'
        )
    );

-- Users can unlike their own likes
CREATE POLICY trip_likes_delete_own ON trip_likes
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON trip_likes TO authenticated;
GRANT SELECT ON trip_likes TO anon;

-- ============================================================
-- 7. Add comment_count + like_count to public_profiles view
-- (so profile pages show engagement)
-- ============================================================
-- Skipped for now — can be added as an aggregate later if needed.
