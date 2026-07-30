ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cover_focal_x real DEFAULT 0.5;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cover_focal_y real DEFAULT 0.5;

CREATE OR REPLACE VIEW public_profiles AS
SELECT id, username, full_name, avatar_url, cover_photo_url, cover_focal_x, cover_focal_y
FROM user_profiles
WHERE username IS NOT NULL;
