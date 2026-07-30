-- 080_tracker_daily_activity_write_rls.up.sql
--
-- Allow authenticated users to INSERT/UPDATE their own daily-activity rows.
-- The refresh-daily-activity RPC (invoked by the on-demand job with the user's
-- session) needs write access to populate the cache.

CREATE POLICY "Users can write own daily activity"
    ON "public"."tracker_daily_activity" FOR INSERT TO "authenticated"
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily activity"
    ON "public"."tracker_daily_activity" FOR UPDATE TO "authenticated"
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can write own daily activity state"
    ON "public"."tracker_daily_activity_state" FOR INSERT TO "authenticated"
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily activity state"
    ON "public"."tracker_daily_activity_state" FOR UPDATE TO "authenticated"
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Grant the write operations.
GRANT INSERT, UPDATE ON "public"."tracker_daily_activity" TO "authenticated";
GRANT INSERT, UPDATE ON "public"."tracker_daily_activity_state" TO "authenticated";
