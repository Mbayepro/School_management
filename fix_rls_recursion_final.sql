-- =============================================================================
-- CORRECTIF FINAL : RÉCURSION RLS & ACTIVATION COMPTE
-- =============================================================================

-- 1. Supprimer les anciennes fonctions problématiques
DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_ecole_id() CASCADE;

-- 2. Créer des fonctions SECURITY DEFINER (Bypass RLS pour les checks)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_my_ecole_id()
RETURNS UUID AS $$
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. Nettoyer TOUTES les politiques existantes pour éviter les conflits
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
    LOOP 
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP; 
END $$;

-- 4. RÉÉCRIRE LES POLITIQUES SANS RÉCURSION

-- PROFILES
CREATE POLICY "Profiles_Self" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles_SA" ON public.profiles FOR ALL USING (public.get_my_role() IN ('super_admin', 'superadmin'));
CREATE POLICY "Profiles_Director" ON public.profiles FOR SELECT USING (
    public.get_my_role() IN ('director', 'directeur', 'pending_director') AND 
    ecole_id = public.get_my_ecole_id()
);

-- ECOLES
CREATE POLICY "Ecoles_Self" ON public.ecoles FOR SELECT USING (id = public.get_my_ecole_id());
CREATE POLICY "Ecoles_SA" ON public.ecoles FOR ALL USING (public.get_my_role() IN ('super_admin', 'superadmin'));

-- CLASSES
CREATE POLICY "Classes_View" ON public.classes FOR SELECT USING (ecole_id = public.get_my_ecole_id());
CREATE POLICY "Classes_SA" ON public.classes FOR ALL USING (public.get_my_role() IN ('super_admin', 'superadmin'));
CREATE POLICY "Classes_Director" ON public.classes FOR ALL USING (
    public.get_my_role() IN ('director', 'directeur', 'pending_director') AND 
    ecole_id = public.get_my_ecole_id()
);

-- ELEVES
CREATE POLICY "Eleves_View" ON public.eleves FOR SELECT USING (ecole_id = public.get_my_ecole_id());
CREATE POLICY "Eleves_SA" ON public.eleves FOR ALL USING (public.get_my_role() IN ('super_admin', 'superadmin'));
CREATE POLICY "Eleves_Director" ON public.eleves FOR ALL USING (
    public.get_my_role() IN ('director', 'directeur', 'pending_director') AND 
    ecole_id = public.get_my_ecole_id()
);

-- MATIERES
CREATE POLICY "Matieres_View" ON public.matieres FOR SELECT USING (ecole_id = public.get_my_ecole_id());
CREATE POLICY "Matieres_SA" ON public.matieres FOR ALL USING (public.get_my_role() IN ('super_admin', 'superadmin'));
CREATE POLICY "Matieres_Director" ON public.matieres FOR ALL USING (
    public.get_my_role() IN ('director', 'directeur', 'pending_director') AND 
    ecole_id = public.get_my_ecole_id()
);

-- ENSEIGNEMENTS
CREATE POLICY "Enseignements_View" ON public.enseignements FOR SELECT USING (
    professeur_id = auth.uid() OR 
    public.get_my_role() IN ('director', 'directeur', 'super_admin', 'superadmin')
);
CREATE POLICY "Enseignements_SA" ON public.enseignements FOR ALL USING (public.get_my_role() IN ('super_admin', 'superadmin'));
CREATE POLICY "Enseignements_Director" ON public.enseignements FOR ALL USING (public.get_my_role() IN ('director', 'directeur'));

-- EVALUATIONS & NOTES
CREATE POLICY "Evals_All" ON public.evaluations FOR ALL USING (
    ecole_id = public.get_my_ecole_id() OR public.get_my_role() IN ('super_admin', 'superadmin')
);
CREATE POLICY "Notes_All" ON public.notes FOR ALL USING (
    ecole_id = public.get_my_ecole_id() OR public.get_my_role() IN ('super_admin', 'superadmin')
);

-- PRESENCES & PAIEMENTS
CREATE POLICY "Presences_All" ON public.presences FOR ALL USING (
    ecole_id = public.get_my_ecole_id() OR public.get_my_role() IN ('super_admin', 'superadmin')
);
CREATE POLICY "Paiements_All" ON public.paiements FOR ALL USING (
    ecole_id = public.get_my_ecole_id() OR public.get_my_role() IN ('super_admin', 'superadmin')
);

-- COEFFICIENTS OFFICIELS
CREATE POLICY "Coefficients_All" ON public.coefficients_officiels FOR ALL USING (
    ecole_id = public.get_my_ecole_id() OR public.get_my_role() IN ('super_admin', 'superadmin')
);

-- CONFIGURATIONS
CREATE POLICY "Config_All" ON public.school_configurations FOR ALL USING (
    ecole_id = public.get_my_ecole_id() OR public.get_my_role() IN ('super_admin', 'superadmin')
);

-- 5. FORCER L'ACTIVATION ET LA VALIDATION DE TOUS LES COMPTES EXISTANTS
-- On s'assure que chaque directeur a une école associée
DO $$
DECLARE
    p RECORD;
    new_ec_id UUID;
BEGIN
    FOR p IN SELECT id, email, ecole_id FROM public.profiles WHERE role IN ('director', 'directeur', 'pending_director') LOOP
        IF p.ecole_id IS NULL THEN
            INSERT INTO public.ecoles (nom) VALUES ('École de ' || p.email) RETURNING id INTO new_ec_id;
            UPDATE public.profiles SET ecole_id = new_ec_id WHERE id = p.id;
        END IF;
    END LOOP;
END $$;

UPDATE public.profiles 
SET is_approved = TRUE, 
    active = TRUE;

RAISE NOTICE 'Correctif appliqué. La récursion RLS est supprimée et les comptes sont activés.';
