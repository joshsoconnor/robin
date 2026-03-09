-- COMPREHENSIVE DELETION POLICIES FIX
-- This script ensures the admin (joshua@rakaviti.com) has permission to delete from ALL relevant tables.
-- Run this in the Supabase SQL Editor.

-- 1. Enable RLS (Safety Check)
ALTER TABLE IF EXISTS public.location_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.location_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.location_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cairns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hazards ENABLE ROW LEVEL SECURITY;

-- 2. Define Admin Deletion Policies
-- Using LOWER() to ensure case-insensitive email matching just in case.

-- Cairns
DROP POLICY IF EXISTS "Allow individual delete for admin" ON public.cairns;
DROP POLICY IF EXISTS "Enable delete for admin" ON public.cairns;
CREATE POLICY "Enable delete for admin" ON public.cairns FOR DELETE TO authenticated 
USING (LOWER(auth.jwt() ->> 'email') = 'joshua@rakaviti.com');

-- Hazards
DROP POLICY IF EXISTS "Allow individual delete for admin" ON public.hazards;
DROP POLICY IF EXISTS "Enable delete for admin" ON public.hazards;
CREATE POLICY "Enable delete for admin" ON public.hazards FOR DELETE TO authenticated 
USING (LOWER(auth.jwt() ->> 'email') = 'joshua@rakaviti.com');

-- Photos
DROP POLICY IF EXISTS "Enable delete for admin" ON public.location_photos;
CREATE POLICY "Enable delete for admin" ON public.location_photos FOR DELETE TO authenticated 
USING (LOWER(auth.jwt() ->> 'email') = 'joshua@rakaviti.com');

-- Videos
DROP POLICY IF EXISTS "Enable delete for admin" ON public.location_videos;
CREATE POLICY "Enable delete for admin" ON public.location_videos FOR DELETE TO authenticated 
USING (LOWER(auth.jwt() ->> 'email') = 'joshua@rakaviti.com');

-- Notes
DROP POLICY IF EXISTS "Enable delete for admin" ON public.location_notes;
CREATE POLICY "Enable delete for admin" ON public.location_notes FOR DELETE TO authenticated 
USING (LOWER(auth.jwt() ->> 'email') = 'joshua@rakaviti.com');

-- 3. Ensure Select/Insert policies still exist (Safety Check)
-- Cairn Select
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.cairns;
CREATE POLICY "Enable read access for all authenticated users" ON public.cairns FOR SELECT TO authenticated USING (true);

-- Hazard Select
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.hazards;
CREATE POLICY "Enable read access for all authenticated users" ON public.hazards FOR SELECT TO authenticated USING (true);
