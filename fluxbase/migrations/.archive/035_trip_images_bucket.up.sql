-- 035: Create trip-images storage bucket
-- Public-read bucket for trip cover images, photos, and avatars.
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES ('trip-images', 'trip-images', true, now(), now())
ON CONFLICT (name) DO NOTHING;
