-- FIX RLS POLICIES FOR REGISTRATION
-- Exécutez ce script pour corriger l'erreur de permission lors de l'inscription

-- 1. Autoriser la création d'écoles
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for authenticated users" ON "public"."ecoles"
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable select for authenticated users" ON "public"."ecoles"
FOR SELECT TO authenticated
USING (true);

-- 2. Autoriser la gestion de son propre profil
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON "public"."profiles"
FOR ALL TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. Autoriser la lecture des coefficients officiels (si la table existe)
CREATE POLICY "Read access for official coefficients" ON "public"."coefficients_officiels"
FOR SELECT TO authenticated
USING (true);
