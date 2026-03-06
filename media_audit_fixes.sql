-- 1. Ensure columns exist for location_photos
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='location_photos' AND column_name='user_id') THEN
        ALTER TABLE public.location_photos ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
    END IF;
END $$;

-- 2. Ensure columns exist for location_videos
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='location_videos' AND column_name='user_id') THEN
        ALTER TABLE public.location_videos ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='location_videos' AND column_name='category') THEN
        ALTER TABLE public.location_videos ADD COLUMN category TEXT;
    END IF;
END $$;

-- 3. Ensure columns exist for location_notes
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='location_notes' AND column_name='user_id') THEN
        ALTER TABLE public.location_notes ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
    END IF;
END $$;

-- 4. Enable RLS
ALTER TABLE public.location_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_notes ENABLE ROW LEVEL SECURITY;

-- 5. Polices for location_photos
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.location_photos;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.location_photos;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.location_photos;
DROP POLICY IF EXISTS "Enable delete for admin" ON public.location_photos;

CREATE POLICY "Enable read access for all authenticated users" ON public.location_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.location_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable update for users based on user_id" ON public.location_photos FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable delete for admin" ON public.location_photos FOR DELETE TO authenticated 
USING (auth.uid() IN (SELECT id FROM auth.users WHERE email = 'joshua@rakaviti.com'));

-- 6. Policies for location_videos
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.location_videos;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.location_videos;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.location_videos;
DROP POLICY IF EXISTS "Enable delete for admin" ON public.location_videos;

CREATE POLICY "Enable read access for all authenticated users" ON public.location_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.location_videos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable update for users based on user_id" ON public.location_videos FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable delete for admin" ON public.location_videos FOR DELETE TO authenticated 
USING (auth.uid() IN (SELECT id FROM auth.users WHERE email = 'joshua@rakaviti.com'));

-- 7. Policies for location_notes
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.location_notes;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.location_notes;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.location_notes;
DROP POLICY IF EXISTS "Enable delete for admin" ON public.location_notes;

CREATE POLICY "Enable read access for all authenticated users" ON public.location_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.location_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable update for users based on user_id" ON public.location_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Enable delete for admin" ON public.location_notes FOR DELETE TO authenticated 
USING (auth.uid() IN (SELECT id FROM auth.users WHERE email = 'joshua@rakaviti.com'));

-- 8. Storage Bucket Policies (location-photos and location-videos)
-- Bucket: location-photos
DO $$
BEGIN
    -- Select Access
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can see photos') THEN
        CREATE POLICY "Authenticated users can see photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'location-photos');
    END IF;

    -- Insert Access
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload photos') THEN
        CREATE POLICY "Authenticated users can upload photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'location-photos');
    END IF;

    -- Delete Access (Admin only)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin can delete photos') THEN
        CREATE POLICY "Admin can delete photos" ON storage.objects FOR DELETE TO authenticated 
        USING (bucket_id = 'location-photos' AND auth.uid() IN (SELECT id FROM auth.users WHERE email = 'joshua@rakaviti.com'));
    END IF;
END $$;

-- Bucket: location-videos
DO $$
BEGIN
    -- Select Access
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can see videos') THEN
        CREATE POLICY "Authenticated users can see videos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'location-videos');
    END IF;

    -- Insert Access
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload videos') THEN
        CREATE POLICY "Authenticated users can upload videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'location-videos');
    END IF;

    -- Delete Access (Admin only)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admin can delete videos') THEN
        CREATE POLICY "Admin can delete videos" ON storage.objects FOR DELETE TO authenticated 
        USING (bucket_id = 'location-videos' AND auth.uid() IN (SELECT id FROM auth.users WHERE email = 'joshua@rakaviti.com'));
    END IF;
END $$;
