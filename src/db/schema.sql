CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    total_inventory INT NOT NULL,
    hold_seconds INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid() ,
    event_id uuid NOT NULL,
    queue_id uuid NOT NULL,
    client_id uuid NOT NULL,
    status text NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id,client_id),
    FOREIGN KEY (event_id) REFERENCES events(id)
);