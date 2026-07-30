ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS discoverable text DEFAULT 'everyone'
    CHECK (discoverable IN ('everyone', 'friends_of_friends', 'nobody'));
