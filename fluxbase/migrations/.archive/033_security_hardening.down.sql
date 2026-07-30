DROP TRIGGER IF EXISTS trigger_prevent_role_escalation ON user_profiles;
DROP FUNCTION IF EXISTS prevent_role_escalation();
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_username_format_check;
