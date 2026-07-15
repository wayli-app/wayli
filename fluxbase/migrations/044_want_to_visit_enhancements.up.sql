ALTER TABLE want_to_visit_places ADD COLUMN IF NOT EXISTS rating integer DEFAULT 0;
ALTER TABLE want_to_visit_places ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE want_to_visit_places ADD COLUMN IF NOT EXISTS image_attribution jsonb;
