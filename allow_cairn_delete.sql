-- Allow authenticated users to delete their own cairns (if we tracked user_id)
-- For now, allowing all authenticated users to delete cairns since the UI restricts it to the admin
-- Better yet, a specific policy for the admin:

DROP POLICY IF EXISTS "Allow individual delete for admin" ON cairns;
CREATE POLICY "Allow individual delete for admin" ON cairns
    FOR DELETE
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'joshua@rakaviti.com');

-- Also allow admin deletion for hazards
DROP POLICY IF EXISTS "Allow individual delete for admin" ON hazards;
CREATE POLICY "Allow individual delete for admin" ON hazards
    FOR DELETE
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'joshua@rakaviti.com');

-- Also ensure anyone authenticated can select/insert (existing policies should cover this, but here's a safety check)
DROP POLICY IF EXISTS "Allow select for all authenticated" ON cairns;
CREATE POLICY "Allow select for all authenticated" ON cairns
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow insert for all authenticated" ON cairns;
CREATE POLICY "Allow insert for all authenticated" ON cairns
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
