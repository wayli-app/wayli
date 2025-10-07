-- Add onboarding tracking fields to user_profiles table
-- All user-related data consolidated in one table for better performance and maintainability

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_dismissed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS home_address_skipped BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP WITH TIME ZONE;

-- Add helpful comments for documentation
COMMENT ON COLUMN user_profiles.onboarding_completed IS
  'Whether user has completed initial onboarding flow';

COMMENT ON COLUMN user_profiles.onboarding_dismissed IS
  'Whether user has permanently dismissed onboarding prompts';

COMMENT ON COLUMN user_profiles.first_login_at IS
  'Timestamp of first successful login after registration';

COMMENT ON COLUMN user_profiles.home_address_skipped IS
  'Whether user explicitly skipped home address setup during onboarding';
