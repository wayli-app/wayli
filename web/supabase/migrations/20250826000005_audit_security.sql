-- Audit and Security Migration
-- This migration creates audit logging and security monitoring systems

-- Create audit_logs table for security monitoring
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'audit_logs_severity_check'
        AND conrelid = 'public.audit_logs'::regclass
    ) THEN
        ALTER TABLE public.audit_logs
        ADD CONSTRAINT audit_logs_severity_check
        CHECK (severity IN ('low', 'medium', 'high', 'critical'));
    END IF;
END $$;

-- Create indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON public.audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON public.audit_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON public.audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type_timestamp ON public.audit_logs(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_timestamp ON public.audit_logs(severity, timestamp DESC);

-- Function to automatically clean up old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    SET search_path = public;
    DELETE FROM public.audit_logs
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get audit statistics
CREATE OR REPLACE FUNCTION get_audit_statistics(
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    total_events BIGINT,
    events_by_type JSONB,
    events_by_severity JSONB,
    events_by_user JSONB
) AS $$
BEGIN
    SET search_path = public;
    RETURN QUERY
    WITH stats AS (
        SELECT
            COUNT(*) as total_events,
            jsonb_object_agg(event_type, count) as events_by_type,
            jsonb_object_agg(severity, count) as events_by_severity,
            jsonb_object_agg(user_id::text, count) as events_by_user
        FROM (
            SELECT
                event_type,
                severity,
                user_id,
                COUNT(*) as count
            FROM public.audit_logs
            WHERE (start_date IS NULL OR timestamp >= start_date)
              AND (end_date IS NULL OR timestamp <= end_date)
            GROUP BY event_type, severity, user_id
        ) grouped_stats
    )
    SELECT
        COALESCE(stats.total_events, 0),
        COALESCE(stats.events_by_type, '{}'::jsonb),
        COALESCE(stats.events_by_severity, '{}'::jsonb),
        COALESCE(stats.events_by_user, '{}'::jsonb)
    FROM stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update audit_logs updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_audit_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    SET search_path = public;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update audit_logs updated_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_audit_logs_updated_at') THEN
        CREATE TRIGGER update_audit_logs_updated_at
            BEFORE UPDATE ON public.audit_logs
            FOR EACH ROW EXECUTE FUNCTION public.update_audit_logs_updated_at();
    END IF;
END $$;

-- Create a view for recent security events
CREATE OR REPLACE VIEW public.recent_security_events AS
SELECT
    al.id,
    al.user_id,
    al.event_type,
    al.severity,
    al.description,
    al.ip_address,
    al.timestamp,
    up.full_name as user_name,
    au.email as user_email
FROM public.audit_logs al
LEFT JOIN public.user_profiles up ON al.user_id = up.id
LEFT JOIN auth.users au ON al.user_id = au.id
WHERE al.severity IN ('high', 'critical')
  AND al.timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY al.timestamp DESC;

-- Create a function to log audit events from triggers
CREATE OR REPLACE FUNCTION log_audit_event(
    p_event_type TEXT,
    p_description TEXT,
    p_severity TEXT DEFAULT 'low',
    p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
    SET search_path = public;
    INSERT INTO public.audit_logs (
        user_id,
        event_type,
        severity,
        description,
        metadata,
        timestamp
    ) VALUES (
        auth.uid(),
        p_event_type,
        p_severity,
        p_description,
        p_metadata,
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for user role changes
CREATE OR REPLACE FUNCTION audit_user_role_change()
RETURNS TRIGGER AS $$
BEGIN
    SET search_path = public;
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        PERFORM log_audit_event(
            'user_role_change',
            format('User role changed from %s to %s', OLD.role, NEW.role),
            'high',
            jsonb_build_object(
                'user_id', NEW.id,
                'old_role', OLD.role,
                'new_role', NEW.role
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user role change auditing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_user_role_change_trigger') THEN
        CREATE TRIGGER audit_user_role_change_trigger
            AFTER UPDATE ON public.user_profiles
            FOR EACH ROW EXECUTE FUNCTION audit_user_role_change();
    END IF;
END $$;

-- Function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(
    p_user_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_events BIGINT,
    events_by_type JSONB,
    events_by_severity JSONB,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    SET search_path = public;
    RETURN QUERY
    SELECT
        COUNT(*) as total_events,
        jsonb_object_agg(event_type, count) as events_by_type,
        jsonb_object_agg(severity, count) as events_by_severity,
        MAX(timestamp) as last_activity
    FROM (
        SELECT
            event_type,
            severity,
            COUNT(*) as count
        FROM public.audit_logs
        WHERE user_id = p_user_id
          AND timestamp >= NOW() - INTERVAL '1 day' * p_days
        GROUP BY event_type, severity
    ) user_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON public.recent_security_events TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT INSERT ON public.audit_logs TO service_role;
GRANT UPDATE ON public.audit_logs TO service_role;
GRANT DELETE ON public.audit_logs TO service_role;
