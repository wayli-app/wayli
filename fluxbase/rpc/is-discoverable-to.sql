-- @fluxbase:description Check whether a user is visible to the current caller given their discoverability setting (everyone / friends_of_friends / nobody). Used by the community travelers directory to filter who appears.
-- @fluxbase:require-role authenticated
-- @fluxbase:input { "target_user": "uuid" }
-- @fluxbase:max-execution-time 5s

SELECT is_discoverable_to($target_user::uuid) AS visible;
