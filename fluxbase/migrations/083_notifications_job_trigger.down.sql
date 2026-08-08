-- 083_notifications_job_trigger.down.sql
-- Reverts 083_notifications_job_trigger.up.sql.

DROP TRIGGER IF EXISTS trg_notify_job_terminal ON jobs.queue;
DROP FUNCTION IF EXISTS public.notify_job_terminal();
