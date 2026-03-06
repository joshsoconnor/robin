-- 1. Create Cairns table if it's missing
CREATE TABLE IF NOT EXISTS public.cairns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    lat FLOAT8 NOT NULL,
    lng FLOAT8 NOT NULL,
    category TEXT NOT NULL,
    raw_note TEXT,
    gate_code TEXT
);

-- 2. Create Hazards table if it's missing (this fixes the 42P01 error)
CREATE TABLE IF NOT EXISTS public.hazards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    lat FLOAT8 NOT NULL,
    lng FLOAT8 NOT NULL,
    restriction_type TEXT NOT NULL,
    max_height FLOAT8,
    max_weight FLOAT8,
    street_name TEXT,
    reported_by UUID
);

-- 3. Enable RLS on all relevant tables to be safe
ALTER TABLE IF EXISTS public.cairns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.location_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.location_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.run_stops ENABLE ROW LEVEL SECURITY;

-- 4. Cairns Policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.cairns;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.cairns;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.cairns;
CREATE POLICY "Enable read access for all authenticated users" ON public.cairns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.cairns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.cairns FOR UPDATE TO authenticated USING (true);

-- 5. Hazards Policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.hazards;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.hazards;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.hazards;
CREATE POLICY "Enable read access for all authenticated users" ON public.hazards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.hazards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.hazards FOR UPDATE TO authenticated USING (true);

-- 6. Location Photos Policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.location_photos;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.location_photos;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.location_photos;
CREATE POLICY "Enable read access for all authenticated users" ON public.location_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.location_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.location_photos FOR UPDATE TO authenticated USING (true);

-- 7. Location Videos Policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.location_videos;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.location_videos;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.location_videos;
CREATE POLICY "Enable read access for all authenticated users" ON public.location_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.location_videos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.location_videos FOR UPDATE TO authenticated USING (true);

-- 8. Run Stops Policies
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.run_stops;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.run_stops;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.run_stops;
CREATE POLICY "Enable read access for all authenticated users" ON public.run_stops FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.run_stops FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.run_stops FOR UPDATE TO authenticated USING (true);
