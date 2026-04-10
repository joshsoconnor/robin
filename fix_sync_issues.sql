-- ============================================================
-- Robin - Fix Run Sync Issues
-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/_/sql
-- ============================================================

-- 1. Add unique constraint to deliveries table
--    This is REQUIRED for the upsert in syncRouteToSupabase to work.
--    Without this, every run silently fails to save.
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_unique_idx
ON public.deliveries (address, delivery_date, user_id);

-- 2. Add vehicle profile columns to profiles (if they don't exist)
--    These are needed for hazard avoidance routing.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS vehicle_type text DEFAULT 'van',
ADD COLUMN IF NOT EXISTS vehicle_height numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vehicle_weight numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vehicle_length numeric DEFAULT NULL;

-- 3. Ensure admin_runs RLS policies exist correctly
--    DROP first in case they exist with wrong definitions
DROP POLICY IF EXISTS "admin_runs: own rows" ON public.admin_runs;
CREATE POLICY "admin_runs: own rows" ON public.admin_runs
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_run_routes: own rows" ON public.admin_run_routes;
CREATE POLICY "admin_run_routes: own rows" ON public.admin_run_routes
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_entries: own rows" ON public.calendar_entries;
CREATE POLICY "calendar_entries: own rows" ON public.calendar_entries
    FOR ALL USING (auth.uid() = user_id);

-- 4. Ensure deliveries RLS is enabled and user can see their own rows
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deliveries: own rows" ON public.deliveries;
CREATE POLICY "deliveries: own rows" ON public.deliveries
    FOR ALL USING (auth.uid() = user_id);

-- 5. Trigger a schema cache refresh so changes take effect immediately
NOTIFY pgrst, 'reload schema';
