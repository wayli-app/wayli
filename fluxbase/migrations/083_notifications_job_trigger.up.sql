-- 083_notifications_job_trigger.up.sql
--
-- DB trigger that creates a persistent notification whenever a job in
-- jobs.queue transitions to a terminal state (completed / failed / cancelled).
--
-- This complements the client-side writes in web/src/lib/stores/job-store.ts:
-- the client covers the common case (user has the app open), while this
-- trigger ALSO covers jobs that finish with no client watching — most
-- importantly the scheduled-* jobs from PR 5 (scheduled trip-suggestions),
-- which run as service_role with no user session attached.
--
-- CAVEAT: jobs.queue is a platform-managed table (Fluxbase platform schema).
-- A platform upgrade could drop user-attached triggers. If that happens,
-- notifications silently fall back to client-side only — no data loss, just
-- reduced coverage for unattended jobs. Re-running this migration restores it.
--
-- The function is SECURITY DEFINER so it can INSERT into public.notifications
-- regardless of the job's caller role (scheduled jobs run as service_role),
-- and maps created_by -> notifications.user_id.

CREATE OR REPLACE FUNCTION public.notify_job_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_type text;
    v_title text;
    v_body text;
    v_link text;
BEGIN
    -- Only act on a real transition INTO a terminal state.
    IF NEW.status NOT IN ('completed', 'failed', 'cancelled') THEN
        RETURN NEW;
    END IF;
    IF (OLD.status = NEW.status) THEN
        RETURN NEW;
    END IF;
    -- Skip if there's no owning user (can't address a notification).
    IF NEW.created_by IS NULL THEN
        RETURN NEW;
    END IF;

    v_type := 'job_' || NEW.status;

    -- Friendly job name (mirrors jobDisplayName in job-store.ts).
    v_title := CASE
        WHEN NEW.job_name LIKE 'data-import%' OR NEW.job_name LIKE 'data_import%' THEN 'Data import'
        WHEN NEW.job_name = 'data-export' THEN 'Data export'
        WHEN NEW.job_name IN ('reverse-geocoding', 'reverse-geocoding-missing') THEN 'Reverse geocoding'
        WHEN NEW.job_name IN ('trip-generation', 'trip-detection') THEN 'Trip generation'
        WHEN NEW.job_name LIKE 'detect-place-visits%' THEN 'Place visit detection'
        WHEN NEW.job_name LIKE 'detect-transport-mode%' THEN 'Transport mode detection'
        WHEN NEW.job_name LIKE 'refresh-daily-activity%' THEN 'Daily activity refresh'
        WHEN NEW.job_name LIKE 'polarsteps-import%' THEN 'Polarsteps import'
        WHEN NEW.job_name LIKE 'scheduled-trip-generation%' THEN 'Scheduled trip suggestions'
        ELSE REPLACE(REPLACE(NEW.job_name, '-', ' '), '_', ' ')
    END;

    v_title := v_title || ' ' || CASE NEW.status
        WHEN 'completed' THEN 'completed'
        WHEN 'failed' THEN 'failed'
        ELSE 'cancelled'
    END;

    v_body := COALESCE(NULLIF(NEW.error_message, ''), '');

    -- Deep-link completed exports so the user can download.
    v_link := CASE
        WHEN NEW.job_name = 'data-export' AND NEW.status = 'completed'
            THEN '/dashboard/import-export'
        ELSE NULL
    END;

    INSERT INTO public.notifications
        (user_id, type, title, body, link, related_job_id)
    VALUES
        (NEW.created_by, v_type, v_title, v_body, v_link, NEW.id)
    ON CONFLICT (user_id, related_job_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Attach AFTER UPDATE (we need OLD.status to detect the transition).
DROP TRIGGER IF EXISTS trg_notify_job_terminal ON jobs.queue;
CREATE TRIGGER trg_notify_job_terminal
    AFTER UPDATE ON jobs.queue
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_job_terminal();
