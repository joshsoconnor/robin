-- ============================================================
-- Robin v4.2 — Admin Runs & Calendar Tables
-- Run this once in the Supabase SQL editor
-- ============================================================

-- 1. admin_runs — one tile per run
CREATE TABLE IF NOT EXISTS admin_runs (
    run_id          TEXT PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    run_date        DATE NOT NULL,
    total_stops     INTEGER NOT NULL DEFAULT 0,
    completed_stops INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. admin_run_routes — individual stops for each run
CREATE TABLE IF NOT EXISTS admin_run_routes (
    id          BIGSERIAL PRIMARY KEY,
    run_id      TEXT NOT NULL REFERENCES admin_runs(run_id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address     TEXT NOT NULL,
    stop_order  INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'pending',
    place_id    TEXT,
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION
);

-- 3. calendar_entries — one entry per run per day
CREATE TABLE IF NOT EXISTS calendar_entries (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_date  DATE NOT NULL,
    run_id      TEXT NOT NULL,
    total_stops INTEGER NOT NULL DEFAULT 0,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, entry_date, run_id)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_runs_user_date     ON admin_runs (user_id, run_date);
CREATE INDEX IF NOT EXISTS idx_admin_run_routes_run_id  ON admin_run_routes (run_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_user    ON calendar_entries (user_id, entry_date);

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE admin_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_run_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_entries ENABLE ROW LEVEL SECURITY;

-- Users can only see/write their own rows
CREATE POLICY "admin_runs: own rows"       ON admin_runs
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "admin_run_routes: own rows" ON admin_run_routes
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "calendar_entries: own rows" ON calendar_entries
    FOR ALL USING (auth.uid() = user_id);
