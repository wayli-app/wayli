-- 032: Landing page redirect URL setting
-- More flexible than the username-based redirect: admin can set any URL/path.
INSERT INTO app.settings (key, value, is_public)
VALUES ('wayli.landing_redirect_url', '{"value": null}'::jsonb, true)
ON CONFLICT DO NOTHING;
