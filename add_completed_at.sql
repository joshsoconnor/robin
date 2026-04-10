-- ============================================================
-- Robin - Add per-stop completion timestamp
-- Run in Supabase SQL Editor
-- ============================================================

-- Add completed_at to admin_run_routes
ALTER TABLE public.admin_run_routes
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Also add completed_at to deliveries for future per-stop inserts
ALTER TABLE public.deliveries
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
