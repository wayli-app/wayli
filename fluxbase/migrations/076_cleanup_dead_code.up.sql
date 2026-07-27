-- Clean up dead code: remove unused share_token column and landing_redirect_url setting.
ALTER TABLE trips DROP COLUMN IF EXISTS share_token;
DELETE FROM app.settings WHERE key = 'wayli.landing_redirect_url';
