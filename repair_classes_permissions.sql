-- Script de réparation des permissions pour la création de classes
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Fonction sécurisée pour récupérer l'école de l'utilisateur
CREATE OR REPLACE FUNCTION get_my_ecole_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ecole_id FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Réinitialiser les politiques de sécurité pour la table 'classes'
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques pour éviter les conflits
DROP POLICY IF EXISTS "View classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur insert classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur update classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur delete classes" ON public.classes;
DROP POLICY IF EXISTS "Enable insert for directors" ON public.classes;
DROP POLICY IF EXISTS "Enable select for users based on ecole_id" ON public.classes;

-- Politique de LECTURE : Directeurs, Professeurs, Élèves (de la même école) + SuperAdmin
CREATE POLICY "View classes" ON public.classes
FOR SELECT USING (
  ecole_id = get_my_ecole_id() 
  OR 
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'super_admin')
);

-- Politique d'INSERTION : Directeurs uniquement
CREATE POLICY "Directeur insert classes" ON public.classes
FOR INSERT WITH CHECK (
  -- L'utilisateur doit être un directeur
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur', 'director'))
  -- ET l'école de la classe doit correspondre à l'école du directeur
  AND ecole_id = get_my_ecole_id()
);

-- Politique de MODIFICATION : Directeurs uniquement
CREATE POLICY "Directeur update classes" ON public.classes
FOR UPDATE USING (
  ecole_id = get_my_ecole_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur', 'director'))
)
WITH CHECK (
  ecole_id = get_my_ecole_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur', 'director'))
);

-- Politique de SUPPRESSION : Directeurs uniquement
CREATE POLICY "Directeur delete classes" ON public.classes
FOR DELETE USING (
  ecole_id = get_my_ecole_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur', 'director'))
);

-- 3. Vérification de la table profiles (au cas où)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

-- 4. Accorder les droits explicites
GRANT ALL ON public.classes TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.ecoles TO authenticated;
