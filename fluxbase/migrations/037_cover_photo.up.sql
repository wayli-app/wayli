-- 037: Cover photo column + public_profiles view update
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cover_photo_url text;

CREATE OR REPLACE VIEW public_profiles AS
SELECT id, username, full_name, avatar_url, cover_photo_url
FROM user_profiles
WHERE username IS NOT NULL;
