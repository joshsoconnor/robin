-- ============================================================
-- Robin - Backfill deliveries from admin_run_routes
-- This populates the deliveries table with historical run data
-- so the Calendar and Runs tabs can display it.
-- Safe to run multiple times — ON CONFLICT DO NOTHING skips duplicates.
-- ============================================================

INSERT INTO public.deliveries (user_id, address, delivery_date, created_at)
SELECT DISTINCT
    arr.user_id,
    arr.address,
    ar.run_date         AS delivery_date,
    ar.created_at
FROM public.admin_run_routes arr
JOIN public.admin_runs ar ON arr.run_id = ar.run_id
ON CONFLICT DO NOTHING;

-- Verify: show how many rows were in deliveries before/after
SELECT COUNT(*) AS total_deliveries FROM public.deliveries;
