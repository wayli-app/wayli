-- Change can_see_* functions to check user_connections (accepted friends)
-- instead of trip_shares (per-user sharing). This makes the "friends"
-- permission pill mean "all my accepted friends" instead of "users I
-- manually added to trip_shares for this trip".
--
-- trip_shares table is kept for plan collaborators / per-user sharing.
-- The visibility functions now use the friends graph (user_connections).

CREATE OR REPLACE FUNCTION public.can_see_costs(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR (costs_visible_to = 'public' AND visibility = 'public')
        OR (costs_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
        OR (costs_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(
                SELECT 1 FROM user_connections
                WHERE status = 'accepted'
                  AND ((user_id = auth.uid() AND friend_id = (SELECT user_id FROM trips WHERE id = trip_uuid))
                    OR (friend_id = auth.uid() AND user_id = (SELECT user_id FROM trips WHERE id = trip_uuid)))
            ))
    ));
$$;

CREATE OR REPLACE FUNCTION public.can_see_gps(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR (gps_visible_to = 'public' AND visibility = 'public')
        OR (gps_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
        OR (gps_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(
                SELECT 1 FROM user_connections
                WHERE status = 'accepted'
                  AND ((user_id = auth.uid() AND friend_id = (SELECT user_id FROM trips WHERE id = trip_uuid))
                    OR (friend_id = auth.uid() AND user_id = (SELECT user_id FROM trips WHERE id = trip_uuid)))
            ))
    ));
$$;

CREATE OR REPLACE FUNCTION public.can_comment(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR (comments_allowed = 'public' AND visibility = 'public')
        OR (comments_allowed IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
        OR (comments_allowed IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(
                SELECT 1 FROM user_connections
                WHERE status = 'accepted'
                  AND ((user_id = auth.uid() AND friend_id = (SELECT user_id FROM trips WHERE id = trip_uuid))
                    OR (friend_id = auth.uid() AND user_id = (SELECT user_id FROM trips WHERE id = trip_uuid)))
            ))
    ));
$$;

CREATE OR REPLACE FUNCTION public.can_see_plan(trip_uuid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
    SELECT EXISTS(SELECT 1 FROM trips WHERE id = trip_uuid AND (
        user_id = auth.uid()
        OR (plan_visible_to = 'public' AND visibility = 'public')
        OR (plan_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(SELECT 1 FROM trip_shares WHERE trip_id = trip_uuid AND shared_with_user_id = auth.uid()))
        OR (plan_visible_to IN ('friends', 'public') AND auth.uid() IS NOT NULL
            AND EXISTS(
                SELECT 1 FROM user_connections
                WHERE status = 'accepted'
                  AND ((user_id = auth.uid() AND friend_id = (SELECT user_id FROM trips WHERE id = trip_uuid))
                    OR (friend_id = auth.uid() AND user_id = (SELECT user_id FROM trips WHERE id = trip_uuid)))
            ))
    ));
$$;
