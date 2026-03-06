-- Fix Cairns table schema
-- Run this in your Supabase SQL Editor (https://app.supabase.com/)

DO $$ 
BEGIN
    -- 1. Rename 'latitude' to 'lat' if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cairns' AND column_name='latitude') THEN
        ALTER TABLE public.cairns RENAME COLUMN latitude TO lat;
    END IF;

    -- 2. Rename 'longitude' to 'lng' if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cairns' AND column_name='longitude') THEN
        ALTER TABLE public.cairns RENAME COLUMN longitude TO lng;
    END IF;

    -- 3. Add 'lat' if it still doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cairns' AND column_name='lat') THEN
        ALTER TABLE public.cairns ADD COLUMN lat FLOAT8;
    END IF;

    -- 4. Add 'lng' if it still doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cairns' AND column_name='lng') THEN
        ALTER TABLE public.cairns ADD COLUMN lng FLOAT8;
    END IF;

    -- 5. IMPORTANT: Make the 'location' column nullable if it exists
    -- This fixes the error: "null value in column 'location' violates not-null constraint"
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cairns' AND column_name='location') THEN
        ALTER TABLE public.cairns ALTER COLUMN location DROP NOT NULL;
    END IF;
END $$;

-- 5. Ensure RLS is enabled and policies are active
ALTER TABLE public.cairns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.cairns;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.cairns;
CREATE POLICY "Enable read access for all authenticated users" ON public.cairns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.cairns FOR INSERT TO authenticated WITH CHECK (true);

-- 6. Trigger a schema cache refresh
NOTIFY pgrst, 'reload schema';
