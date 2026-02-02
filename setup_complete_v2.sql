-- Trigger for new user creation (if not already exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Manual update in case user already exists
UPDATE public.profiles
SET role = 'super_admin', is_approved = TRUE
WHERE email = 'mbayeadama669@gmail.com';

-- 5. STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public)
VALUES ('school_assets', 'school_assets', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('school_photos', 'school_photos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for school_assets
CREATE POLICY "Public Access Assets" ON storage.objects
FOR SELECT USING (bucket_id = 'school_assets');

CREATE POLICY "Authenticated Upload Assets" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'school_assets');

CREATE POLICY "Authenticated Manage Assets" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'school_assets');

CREATE POLICY "Authenticated Delete Assets" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'school_assets');


-- Policies for school_photos
CREATE POLICY "Public Access Photos" ON storage.objects
FOR SELECT USING (bucket_id = 'school_photos');

CREATE POLICY "Authenticated Upload Photos" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'school_photos');

CREATE POLICY "Authenticated Manage Photos" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'school_photos');

CREATE POLICY "Authenticated Delete Photos" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'school_photos');
