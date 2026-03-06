-- 1. Vehicle Profiles: Update `profiles` table
-- Add columns for vehicle routing details
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS vehicle_type text DEFAULT 'van',
ADD COLUMN IF NOT EXISTS vehicle_height numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vehicle_weight numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vehicle_length numeric DEFAULT NULL;

-- 2. Hazard Database: Create `hazards` table
CREATE TABLE IF NOT EXISTS public.hazards (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    lat numeric NOT NULL,
    lng numeric NOT NULL,
    street_name text,
    restriction_type text NOT NULL CHECK (restriction_type IN ('low_bridge', 'weight_limit', 'no_trucks', 'tight_turn', 'other')),
    max_height numeric,
    max_weight numeric,
    reported_by uuid REFERENCES auth.users(id),
    upvotes integer DEFAULT 0,
    downvotes integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

-- Turn on Row Level Security for hazards
ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read hazards
CREATE POLICY "Allow public read-access for hazards" ON public.hazards
FOR SELECT USING (true);

-- Allow authenticated users to report hazards
CREATE POLICY "Allow authenticated users to insert hazards" ON public.hazards
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to update their own reported hazards or vote
CREATE POLICY "Allow authenticated users to update hazards" ON public.hazards
FOR UPDATE USING (auth.uid() IS NOT NULL);
