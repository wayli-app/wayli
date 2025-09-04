-- Final Setup Migration
-- This migration handles final setup tasks like admin user promotion

-- Ensure the first user is an admin
-- This migration checks if there's only one user and makes them admin if they aren't already
DO $$
DECLARE
    user_count INTEGER;
    first_user_id UUID;
    first_user_role TEXT;
BEGIN
    -- Count total users
    SELECT COUNT(*) INTO user_count FROM auth.users;

    -- If there's only one user, ensure they're an admin
    IF user_count = 1 THEN
        -- Get the first user's ID
        SELECT id INTO first_user_id FROM auth.users LIMIT 1;

        -- Check their current role
        SELECT role INTO first_user_role FROM public.user_profiles WHERE id = first_user_id;

        -- If they're not an admin, make them one
        IF first_user_role != 'admin' THEN
            -- Update user profile
            UPDATE public.user_profiles
            SET role = 'admin', updated_at = NOW()
            WHERE id = first_user_id;

            -- Update user metadata
            UPDATE auth.users
            SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', 'admin')
            WHERE id = first_user_id;

            -- Log the change
            INSERT INTO public.audit_logs (
                event_type,
                description,
                severity,
                user_id,
                metadata,
                timestamp,
                created_at,
                updated_at
            ) VALUES (
                'user_role_updated',
                'First user automatically promoted to admin',
                'medium',
                first_user_id,
                jsonb_build_object('old_role', first_user_role, 'new_role', 'admin'),
                NOW(),
                NOW(),
                NOW()
            );

            RAISE NOTICE 'First user % promoted to admin', first_user_id;
        ELSE
            RAISE NOTICE 'First user % is already admin', first_user_id;
        END IF;
    ELSIF user_count = 0 THEN
        RAISE NOTICE 'No users found, skipping admin promotion';
    ELSE
        RAISE NOTICE 'Multiple users found (% users), not modifying roles', user_count;
    END IF;
END $$;
