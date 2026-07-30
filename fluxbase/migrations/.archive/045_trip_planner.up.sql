-- Trip plan items (day-by-day itinerary)
CREATE TABLE IF NOT EXISTS trip_plan_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    day_number      INTEGER NOT NULL DEFAULT 1,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    title           TEXT NOT NULL,
    description     TEXT,
    type            TEXT NOT NULL DEFAULT 'activity',
    start_time      TIME,
    end_time        TIME,
    location        geometry(Point, 4326),
    address         TEXT,
    cost_estimate   NUMERIC(10,2),
    currency        CHAR(3) DEFAULT 'EUR',
    booking_url     TEXT,
    booking_status  TEXT DEFAULT 'not_booked',
    want_to_visit_id UUID REFERENCES want_to_visit_places(id) ON DELETE SET NULL,
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_total NUMERIC(10,2);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_currency CHAR(3) DEFAULT 'EUR';

-- Collaboration: share a trip plan with other users
CREATE TABLE IF NOT EXISTS trip_collaborators (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL,
    role        TEXT DEFAULT 'editor',
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(trip_id, user_id)
);

-- Enable RLS
ALTER TABLE trip_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_collaborators ENABLE ROW LEVEL SECURITY;

-- RLS: owner or collaborator can read/write plan items
CREATE POLICY trip_plan_items_select ON trip_plan_items FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM trip_collaborators
        WHERE trip_id = trip_plan_items.trip_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM trips
        WHERE id = trip_plan_items.trip_id
        AND user_id = auth.uid()
    )
);

CREATE POLICY trip_plan_items_insert ON trip_plan_items FOR INSERT WITH CHECK (
    user_id = auth.uid()
);

CREATE POLICY trip_plan_items_update ON trip_plan_items FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM trip_collaborators
        WHERE trip_id = trip_plan_items.trip_id
        AND user_id = auth.uid()
        AND role = 'editor'
    )
);

CREATE POLICY trip_plan_items_delete ON trip_plan_items FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM trip_collaborators
        WHERE trip_id = trip_plan_items.trip_id
        AND user_id = auth.uid()
        AND role = 'editor'
    )
);

-- Collaborators: trip owner and collaborators can read
CREATE POLICY trip_collaborators_select ON trip_collaborators FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM trips WHERE id = trip_collaborators.trip_id AND user_id = auth.uid()
    )
);

CREATE POLICY trip_collaborators_insert ON trip_collaborators FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM trips WHERE id = trip_collaborators.trip_id AND user_id = auth.uid()
    )
);

CREATE POLICY trip_collaborators_delete ON trip_collaborators FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM trips WHERE id = trip_collaborators.trip_id AND user_id = auth.uid()
    )
);
