-- Per-user data sampling configuration for the nightly sampling job.
-- Opt-in: row only exists when user explicitly enables sampling.
CREATE TABLE IF NOT EXISTS user_data_sampling (
    user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled        BOOLEAN NOT NULL DEFAULT false,
    min_distance_m INTEGER NOT NULL DEFAULT 25
        CHECK (min_distance_m >= 0 AND min_distance_m <= 5000),
    min_time_s     INTEGER NOT NULL DEFAULT 60
        CHECK (min_time_s >= 0 AND min_time_s <= 3600),
    last_run_at    TIMESTAMPTZ,
    last_deleted   INTEGER DEFAULT 0,
    updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_data_sampling ENABLE ROW LEVEL SECURITY;

-- Users can read and write their own row only
CREATE POLICY user_data_sampling_select ON user_data_sampling FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_data_sampling_upsert ON user_data_sampling FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_data_sampling_update ON user_data_sampling FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY user_data_sampling_delete ON user_data_sampling FOR DELETE USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON user_data_sampling TO authenticated;
