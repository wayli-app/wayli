#!/usr/bin/env python3
"""
Filter a pgschema dump of the `public` schema down to Wayli-owned objects only.

The raw pgschema dump includes objects provided by PostgreSQL extensions (postgis,
timescaledb, pgcrypto, vector, etc.) — e.g. spatial_ref_sys, geometry_columns, and
hundreds of _postgis_*/crypt/create_hypertable functions. Those are owned by their
extensions and must NOT be managed declaratively (pgschema would try to ALTER/DROP
them, and they can't always be re-created standalone — causing "zero-length
delimited identifier" and similar errors during plan validation).

This script parses the dump's `-- Name: <name>; Type: <TYPE>;` headers and keeps
only blocks belonging to Wayli objects (tables/views/functions in the keep-set,
plus their associated indexes/constraints/policies/triggers/comments/grants).

The keep-set is the authoritative list of standalone (non-extension) objects in the
live `public` schema, captured via pg_depend (extension membership) at dump time.
"""
import re
import sys

# --- Keep-set: standalone objects (NOT owned by any extension) in public schema ---
# Tables (relkind r/p), Views (v/m) — derived from the live DB via pg_depend.
KEEP_TABLES = {
    "country_name_aliases", "place_visits", "place_visits_state", "poi_embeddings",
    "tracker_daily_activity", "tracker_daily_activity_state", "tracker_data",
    "transport_mode_state", "trip_collaborators", "trip_comments", "trip_embeddings",
    "trip_entries", "trip_gps_tracks", "trip_likes", "trip_media", "trip_plan_items",
    "trip_shares", "trips", "user_connections", "user_data_sampling",
    "user_preference_vectors", "user_preferences", "user_profiles", "want_to_visit_places",
}
KEEP_VIEWS = {
    "my_place_visits", "my_poi_summary", "my_tracker_data", "my_trip_entries",
    "my_trips", "public_profiles", "public_trip_entries", "public_trip_media",
    "visible_plan_items",
}
# All relations (tables + views) — used to associate dependent objects.
KEEP_RELATIONS = KEEP_TABLES | KEEP_VIEWS

# Wayli-owned functions (name only; the dump may include overloaded signatures).
# Derived from pg_proc joined to pg_depend, excluding extension-owned.
KEEP_FUNCTION_NAMES = {
    "calculate_distances_batch_v2", "calculate_mode_aware_speed", "calculate_stable_speed",
    "can_comment", "can_see_costs", "can_see_gps", "can_see_plan", "can_see_trip",
    "disable_tracker_data_trigger", "enable_tracker_data_trigger",
    "find_similar_users_by_preference", "full_country", "get_embedding_stats",
    "get_points_within_radius", "get_public_trip_track", "get_shared_trip",
    "get_user_preferences", "get_user_tracking_data", "handle_new_user",
    "is_current_user_admin", "is_trip_owner", "is_user_admin", "mark_setup_complete",
    "perform_bulk_import_with_distance_calculation", "prevent_role_escalation",
    "refresh_place_visits", "remove_duplicate_tracking_points", "resolve_country_code",
    "sample_tracker_data_if_needed", "search_similar_pois", "search_similar_trips",
    "set_first_user_admin", "st_distancesphere", "sync_user_role_to_auth",
    "trigger_calculate_distance", "trigger_calculate_distance_enhanced",
    "update_tracker_distances", "update_tracker_distances_batch",
    "update_tracker_distances_enhanced", "update_tracker_distances_small_batch",
    "update_user_profiles_updated_at", "update_want_to_visit_places_updated_at",
    "update_workers_updated_at", "validate_tracking_query_limits",
}

HEADER_RE = re.compile(r'^-- Name:\s*(.*?);\s*Type:\s*([A-Z_]+);')

KEEPSET = KEEP_RELATIONS | KEEP_FUNCTION_NAMES


def block_references_keep(block_text, obj_type, name):
    """Decide if a dependent-object block references a kept relation/function."""
    # Indexes: name often prefixed by table, but not always (idx_*). Check ON clause.
    if obj_type == "INDEX":
        # CREATE INDEX ... ON <table>
        m = re.search(r'\bON\s+(?:public\.)?(\w+)', block_text, re.IGNORECASE)
        if m and m.group(1) in KEEP_RELATIONS:
            return True
        # else fall back to name-prefix match against kept relations
        return any(name.startswith(r + "_") for r in KEEP_RELATIONS)
    if obj_type in ("CONSTRAINT", "TRIGGER"):
        m = re.search(r'\b(?:ON|TABLE)\s+(?:public\.)?(\w+)', block_text, re.IGNORECASE)
        return bool(m and m.group(1) in KEEP_RELATIONS)
    if obj_type == "POLICY":
        m = re.search(r'\bON\s+(?:public\.)?(\w+)', block_text, re.IGNORECASE)
        return bool(m and m.group(1) in KEEP_RELATIONS)
    if obj_type == "RLS":
        # RLS block header -- Name: <table>; Type: RLS;  body: ALTER TABLE <table> ENABLE/FORCE ROW LEVEL SECURITY
        if name in KEEP_RELATIONS:
            return True
        m = re.search(r'\bALTER TABLE\s+(?:public\.)?(\w+)', block_text, re.IGNORECASE)
        return bool(m and m.group(1) in KEEP_RELATIONS)
    if obj_type == "COMMENT":
        # COMMENT ON TABLE/COLUMN/FUNCTION <obj>
        for kw in ("TABLE", "COLUMN", "FUNCTION", "VIEW", "INDEX", "CONSTRAINT"):
            m = re.search(r'\bCOMMENT\s+ON\s+' + kw + r'\s+(?:public\.)?(\w+)', block_text, re.IGNORECASE)
            if m and m.group(1) in KEEPSET:
                return True
        return False
    if obj_type == "PRIVILEGE":
        # GRANT ... ON TABLE|SCHEMA|FUNCTION ... ; keep if object is in keepset
        for kw in ("TABLE", "FUNCTION", "SEQUENCE"):
            m = re.search(r'\bGRANT\b.*\bON\s+' + kw + r'\s+(?:public\.)?(\w+)', block_text, re.IGNORECASE)
            if m and m.group(1) in KEEPSET:
                return True
        # GRANT ... ON ALL TABLES / SCHEMA public — keep schema-level grants on public
        if re.search(r'\bON\s+SCHEMA\s+(?:public|"public")\b', block_text, re.IGNORECASE):
            return True
        return False
    return False


def main():
    lines = open(sys.argv[1]).read().split("\n")
    out = []
    # Preserve leading header (lines before first "-- Name:" block)
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        m = HEADER_RE.match(line)
        if not m:
            # Header preamble / inter-block blank lines — collect until first block.
            out.append(line)
            i += 1
            continue
        # Found a block header. Collect until the next header (or EOF).
        name, otype = m.group(1).strip(), m.group(2).strip()
        block = [line]
        j = i + 1
        while j < n and not HEADER_RE.match(lines[j]):
            block.append(lines[j])
            j += 1

        keep = False
        if otype in ("TABLE", "VIEW"):
            keep = name in KEEPSET
        elif otype == "FUNCTION":
            # name may be "funcname(argtypes)" — take leading identifier
            fn = re.split(r'[(\(]', name, 1)[0].strip()
            keep = fn in KEEP_FUNCTION_NAMES
            # Even if the name matches, never keep compiled/extension functions:
            # they have LANGUAGE c / $libdir bodies that cannot be recreated from
            # SQL. pgschema sometimes dumps the C overload of an overloaded name
            # (e.g. postgis's st_distancesphere LANGUAGE c) even when the app
            # owns a SQL-language overload of the same name.
            if keep and re.search(r'\bLANGUAGE\s+c\b|\$libdir', "\n".join(block), re.IGNORECASE):
                keep = False
        elif otype == "TYPE":
            keep = False  # all types in public dump are extension-owned (geometry_dump, valid_detail)
        elif otype == "DEFAULT_PRIVILEGE":
            keep = False  # Fluxbase-managed default privileges, not app objects
        elif otype == "X":
            keep = False  # unknown/internal marker
        else:
            # Dependent objects: INDEX, INDEX, POLICY, RLS, CONSTRAINT, TRIGGER, COMMENT, PRIVILEGE
            keep = block_references_keep("\n".join(block), otype, name)

        if keep:
            out.extend(block)
        i = j

    result = "\n".join(out)
    # Normalize invalid function-level search_path markers. pgschema dumps
    # `SET search_path = ""` (empty quoted identifier) which fails to apply in a
    # fresh validation schema ("zero-length delimited identifier"). Replace with
    # an explicit `public` search_path — functions resolve unqualified names
    # against the app schema.
    result = result.replace('SET search_path = ""', 'SET search_path = public')
    # Unquote PostGIS function calls. pgschema dumps these as "ST_Distance"(...)
    # (quoted), but PostGIS registers them lowercase as st_distance. A quoted
    # identifier skips case-folding, so "ST_Distance" is not found at apply time
    # ("function ST_Distance does not exist"). Unquote ST_* calls so they
    # case-fold to the real lowercase names. Only touches "ST_<name>(" patterns
    # (function calls), leaving JSON string keys like "AF": "Afghanistan" intact.
    result = re.sub(r'"(ST_[A-Za-z]+)"\s*\(', r'\1(', result)
    # Schema-qualify extension-provided types so pgschema can resolve them during
    # temp-schema plan validation. When pgschema applies the desired state to a
    # temporary schema, an unqualified `vector`/`geography`/`geometry` resolves to
    # the temp schema (where it doesn't exist), causing errors like
    # "operator does not exist: public.vector <=> public.vector". Qualifying to
    # `public.vector` resolves against the extension's home schema. Only qualify
    # when used as a type (followed by `(` for a typmod like vector(1536), or a
    # word boundary), never inside identifiers or strings.
    for typ in ("vector", "geography", "geometry"):
        # typmod form: vector(1536)  -> public.vector(1536)
        result = re.sub(r'(?<![.\w"])' + typ + r'\(', 'public.' + typ + '(', result)
        # bare form as a column/param type: "  vector," or " vector " at end
        result = re.sub(r'(?<![.\w"])' + typ + r'\b(?!\s*\()', 'public.' + typ, result)
    print(result)


if __name__ == "__main__":
    main()
