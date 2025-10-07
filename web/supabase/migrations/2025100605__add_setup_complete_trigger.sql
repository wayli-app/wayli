-- Trigger to mark setup as complete when the first user is created

CREATE OR REPLACE FUNCTION mark_setup_complete()
RETURNS TRIGGER AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- When a user profile is created, check if this is the first user
  -- Count excluding the current row being inserted (check for other existing rows)
  SELECT COUNT(*) INTO user_count FROM public.user_profiles WHERE id != NEW.id;

  -- If no other users exist, this is the first user - mark setup as complete
  IF user_count = 0 THEN
    UPDATE public.server_settings
    SET is_setup_complete = true, updated_at = NOW()
    WHERE is_setup_complete = false;

    RAISE NOTICE 'Initial setup marked as complete after first user creation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on user_profiles table
DROP TRIGGER IF EXISTS trigger_mark_setup_complete ON user_profiles;

CREATE TRIGGER trigger_mark_setup_complete
AFTER INSERT ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION mark_setup_complete();

COMMENT ON FUNCTION mark_setup_complete() IS 'Automatically marks setup as complete when the first user profile is created';
