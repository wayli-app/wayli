ALTER TABLE user_profiles DROP COLUMN IF EXISTS cover_photo_url;
CREATE OR REPLACE VIEW public_profiles AS
SELECT id, username, full_name, avatar_url
FROM user_profiles
WHERE username IS NOT NULL;
