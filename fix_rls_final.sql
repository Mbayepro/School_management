-- SOLUTION FINALE RLS AVEC FONCTION HELPER
-- 1. Fonction sécurisée pour récupérer l'école de l'utilisateur courant
-- 2. Policies simplifiées utilisant cette fonction

-- A. Création de la fonction helper (Security Definer pour contourner les RLS sur profiles)
CREATE OR REPLACE FUNCTION get_my_ecole_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ecole_id FROM public.profiles WHERE id = auth.uid();
$$;

-- B. Réinitialisation complète des policies

-- === CLASSES ===
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur view classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur manage classes" ON public.classes; -- nettoyage vieux noms
DROP POLICY IF EXISTS "Directeur insert classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur update classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur delete classes" ON public.classes;

-- Lecture (Directeur + Professeur + SuperAdmin)
CREATE POLICY "View classes" ON public.classes
FOR SELECT USING (
  ecole_id = get_my_ecole_id() 
  OR 
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'super_admin')
);

-- Ecriture (Directeur uniquement)
CREATE POLICY "Directeur insert classes" ON public.classes
FOR INSERT WITH CHECK (
  ecole_id = get_my_ecole_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
);

CREATE POLICY "Directeur update classes" ON public.classes
FOR UPDATE USING (
  ecole_id = get_my_ecole_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
)
WITH CHECK (
  ecole_id = get_my_ecole_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
);

CREATE POLICY "Directeur delete classes" ON public.classes
FOR DELETE USING (
  ecole_id = get_my_ecole_id()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
);


-- === ELEVES ===
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View eleves" ON public.eleves;
DROP POLICY IF EXISTS "Staff view eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur insert eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur update eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur delete eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur manage eleves" ON public.eleves;

-- Lecture
CREATE POLICY "View eleves" ON public.eleves
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = eleves.classe_id
    AND c.ecole_id = get_my_ecole_id()
  )
  OR 
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'super_admin')
);

-- Ecriture
CREATE POLICY "Directeur manage eleves" ON public.eleves
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = eleves.classe_id
    AND c.ecole_id = get_my_ecole_id()
  )
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = eleves.classe_id
    AND c.ecole_id = get_my_ecole_id()
  )
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
);


-- === PRESENCES ===
ALTER TABLE public.presences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View presences" ON public.presences;
DROP POLICY IF EXISTS "Manage presences" ON public.presences;
DROP POLICY IF EXISTS "View presences by school" ON public.presences;
-- ... nettoyage autres

CREATE POLICY "View presences" ON public.presences
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = presences.eleve_id
    AND c.ecole_id = get_my_ecole_id()
  )
);

CREATE POLICY "Manage presences" ON public.presences
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = presences.eleve_id
    AND c.ecole_id = get_my_ecole_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = presences.eleve_id
    AND c.ecole_id = get_my_ecole_id()
  )
  AND presences.marque_par = auth.uid()
);


-- === PAIEMENTS ===
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View paiements" ON public.paiements;
DROP POLICY IF EXISTS "Manage paiements" ON public.paiements;
DROP POLICY IF EXISTS "Director view paiements by school" ON public.paiements;

CREATE POLICY "View paiements" ON public.paiements
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = paiements.eleve_id
    AND c.ecole_id = get_my_ecole_id()
  )
);

CREATE POLICY "Manage paiements" ON public.paiements
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = paiements.eleve_id
    AND c.ecole_id = get_my_ecole_id()
  )
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = paiements.eleve_id
    AND c.ecole_id = get_my_ecole_id()
  )
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('directeur','director'))
);

-- === UTILITAIRE: ASSIGNER UN PROFESSEUR PAR EMAIL (appelable côté client) ===
CREATE OR REPLACE FUNCTION public.assign_professor_by_email(target_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id UUID;
  caller_role TEXT;
  my_ecole UUID;
BEGIN
  SELECT role, ecole_id INTO caller_role, my_ecole FROM public.profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR my_ecole IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Votre compte n’est pas associé à une école.');
  END IF;
  IF lower(caller_role) NOT IN ('directeur','director') THEN
    RETURN json_build_object('success', false, 'message', 'Action réservée au directeur.');
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Utilisateur introuvable. Demandez au professeur de créer son compte.');
  END IF;

  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'professeur', my_ecole, true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'professeur',
      ecole_id = my_ecole,
      active = true;

  RETURN json_build_object('success', true, 'message', 'Professeur ajouté et rattaché à votre école.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_professor_by_email(TEXT) TO authenticated;

-- === UTILITAIRE: ASSIGNER UNE CLASSE À UN PROFESSEUR PAR EMAIL ===
CREATE OR REPLACE FUNCTION public.assign_class_to_professor(target_email TEXT, target_classe_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id UUID;
  caller_role TEXT;
  my_ecole UUID;
  class_ecole UUID;
BEGIN
  SELECT role, ecole_id INTO caller_role, my_ecole FROM public.profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR my_ecole IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Votre compte n’est pas associé à une école.');
  END IF;
  IF lower(caller_role) NOT IN ('directeur','director') THEN
    RETURN json_build_object('success', false, 'message', 'Action réservée au directeur.');
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Utilisateur introuvable. Demandez au professeur de créer son compte.');
  END IF;

  -- S’assurer que la classe appartient à l’école du directeur
  SELECT ecole_id INTO class_ecole FROM public.classes WHERE id = target_classe_id;
  IF class_ecole IS NULL OR class_ecole <> my_ecole THEN
    RETURN json_build_object('success', false, 'message', 'Classe non trouvée ou non liée à votre école.');
  END IF;

  -- Upsert profil professeur côté école si nécessaire
  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'professeur', my_ecole, true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'professeur',
      ecole_id = my_ecole,
      active = true;

  -- Assignation
  UPDATE public.classes
  SET professeur_id = target_user_id
  WHERE id = target_classe_id;

  RETURN json_build_object('success', true, 'message', 'Classe assignée au professeur.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_class_to_professor(TEXT, UUID) TO authenticated;
