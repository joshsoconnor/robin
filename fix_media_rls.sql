-- Enable RLS (if not already enabled, though likely is)
ALTER TABLE public.location_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_videos ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert photos
CREATE POLICY "Enable insert for authenticated users" 
ON public.location_photos
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to update their own photos (optional but good practice)
CREATE POLICY "Enable update for users based on user_id" 
ON public.location_photos
FOR UPDATE
TO authenticated 
USING (auth.uid() = user_id);

-- Allow authenticated users to insert videos
CREATE POLICY "Enable insert for authenticated users" 
ON public.location_videos
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to update their own videos (optional)
CREATE POLICY "Enable update for users based on user_id" 
ON public.location_videos
FOR UPDATE
TO authenticated 
USING (auth.uid() = user_id);
