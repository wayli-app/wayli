-- Ensure public_profiles view exists with all required columns
-- This is needed for production instances that may not have migration 037/040 applied
CREATE OR REPLACE VIEW public_profiles AS
SELECT
    id,
    username,
    full_name,
    avatar_url,
    cover_photo_url,
    cover_focal_x,
    cover_focal_y
FROM user_profiles
WHERE username IS NOT NULL;

-- Ensure the username column has a unique constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_username_key'
    ) THEN
        ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_username_key UNIQUE (username);
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Constraint already exists
END $$;
