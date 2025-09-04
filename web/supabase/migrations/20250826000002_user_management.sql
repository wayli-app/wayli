-- User Management Migration
-- This migration creates user-related tables and authentication functions

SET search_path TO public, gis;

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light',
    language TEXT DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT true,
    timezone TEXT DEFAULT 'UTC+00:00 (London, Dublin)',
    pexels_api_key TEXT,
    trip_exclusions JSONB DEFAULT '[]', -- Array of trip exclusion objects
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    avatar_url TEXT,
    home_address JSONB, -- Store geocoded location data
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret TEXT,
    two_factor_recovery_codes TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add role constraint if it doesn't exist
DO $$
BEGIN
    SET search_path = public, gis;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_role_check'
        AND conrelid = 'public.user_profiles'::regclass
    ) THEN
        ALTER TABLE public.user_profiles
        ADD CONSTRAINT user_profiles_role_check
        CHECK (role IN ('user', 'admin', 'moderator'));
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN public.user_profiles.two_factor_secret IS 'TOTP secret for 2FA authentication';
COMMENT ON COLUMN public.user_profiles.two_factor_recovery_codes IS 'Array of recovery codes for 2FA backup';

-- Create want_to_visit_places table
CREATE TABLE IF NOT EXISTS public.want_to_visit_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    coordinates TEXT NOT NULL, -- Store as "lat, lng" string
    description TEXT,
    address TEXT,
    location TEXT, -- City, Country
    marker_type TEXT DEFAULT 'default',
    marker_color TEXT DEFAULT '#3B82F6',
    labels TEXT[] DEFAULT '{}',
    favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for user management tables
CREATE INDEX IF NOT EXISTS idx_user_preferences_id ON public.user_preferences(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON public.user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_user_id ON public.want_to_visit_places(user_id);
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_type ON public.want_to_visit_places(type);
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_favorite ON public.want_to_visit_places(favorite);
CREATE INDEX IF NOT EXISTS idx_want_to_visit_places_created_at ON public.want_to_visit_places(created_at);

-- Function to handle new user creation and assign admin role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_count INTEGER;
    user_role TEXT;
    updated_metadata JSONB;
    first_name TEXT;
    last_name TEXT;
    full_name TEXT;
BEGIN
    -- Count existing users
    SELECT COUNT(*) INTO user_count FROM auth.users;

    -- Set role based on user count
    IF user_count = 1 THEN
        user_role := 'admin';
    ELSE
        user_role := 'user';
    END IF;

    -- Extract name information from user metadata
    first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
    full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

    -- Build full name if not provided
    IF full_name = '' AND (first_name != '' OR last_name != '') THEN
        IF first_name != '' AND last_name != '' THEN
            full_name := first_name || ' ' || last_name;
        ELSIF first_name != '' THEN
            full_name := first_name;
        ELSIF last_name != '' THEN
            full_name := last_name;
        END IF;
    END IF;

    -- Clean up names (remove extra spaces, etc.)
    first_name := TRIM(first_name);
    last_name := TRIM(last_name);
    full_name := TRIM(full_name);

    -- Update user metadata with role and cleaned names
    updated_metadata := NEW.raw_user_meta_data;
    updated_metadata := updated_metadata || jsonb_build_object(
        'role', user_role,
        'first_name', first_name,
        'last_name', last_name,
        'full_name', full_name
    );

    -- Update the user's metadata
    UPDATE auth.users
    SET raw_user_meta_data = updated_metadata
    WHERE id = NEW.id;

    -- Insert into user_profiles table
    INSERT INTO public.user_profiles (
        id,
        first_name,
        last_name,
        full_name,
        role,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        first_name,
        last_name,
        full_name,
        user_role,
        NOW(),
        NOW()
    );

    -- Insert into user_preferences table
    INSERT INTO public.user_preferences (
        id,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        NOW(),
        NOW()
    );

    RETURN NEW;
END;
$$;

-- Create trigger for new user registration
DO $$
BEGIN
    SET search_path = public, gis;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

-- Function to update user_profiles updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Create trigger to update user_profiles updated_at timestamp
DO $$
BEGIN
    SET search_path = public, gis;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_profiles_updated_at') THEN
        CREATE TRIGGER update_user_profiles_updated_at
            BEFORE UPDATE ON public.user_profiles
            FOR EACH ROW EXECUTE FUNCTION public.update_user_profiles_updated_at();
    END IF;
END $$;

-- Function to update want_to_visit_places updated_at timestamp
CREATE OR REPLACE FUNCTION update_want_to_visit_places_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Create trigger to update want_to_visit_places updated_at timestamp
DO $$
BEGIN
    SET search_path = public, gis;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_want_to_visit_places_updated_at') THEN
        CREATE TRIGGER trigger_update_want_to_visit_places_updated_at
            BEFORE UPDATE ON public.want_to_visit_places
            FOR EACH ROW
            EXECUTE FUNCTION update_want_to_visit_places_updated_at();
    END IF;
END $$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.user_profiles
    WHERE id = user_uuid;

    RETURN user_role = 'admin';
END;
$$;

-- Function to get server settings
CREATE OR REPLACE FUNCTION get_server_settings()
RETURNS TABLE (
    server_name TEXT,
    admin_email TEXT,
    allow_registration BOOLEAN,
    require_email_verification BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ss.server_name,
        ss.admin_email,
        ss.allow_registration,
        ss.require_email_verification
    FROM public.server_settings ss
    LIMIT 1;
END;
$$;

-- Grant access to authenticated users
GRANT SELECT ON public.server_settings TO authenticated;
GRANT EXECUTE ON FUNCTION get_server_settings() TO authenticated;
