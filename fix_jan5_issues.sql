-- Fix case sensitivity for email lookups
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email_input TEXT)
RETURNS UUID
SECURITY DEFINER
AS $$
DECLARE
  found_id UUID;
BEGIN
  SELECT id INTO found_id FROM auth.users WHERE lower(email) = lower(email_input);
  RETURN found_id;
END;
$$ LANGUAGE plpgsql;

-- Fix assign_professor_by_email
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
  -- Get caller info
  SELECT role, ecole_id INTO caller_role, my_ecole FROM public.profiles WHERE id = auth.uid();
  
  IF caller_role IS NULL OR my_ecole IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Votre compte n’est pas associé à une école.');
  END IF;
  
  IF lower(caller_role) NOT IN ('directeur','director') THEN
    RETURN json_build_object('success', false, 'message', 'Action réservée au directeur.');
  END IF;

  -- Find target user (case insensitive)
  SELECT id INTO target_user_id FROM auth.users WHERE lower(email) = lower(target_email);
  
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Utilisateur introuvable. Demandez au professeur de créer son compte.');
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'professeur', my_ecole, true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'professeur',
      ecole_id = my_ecole,
      active = true;

  RETURN json_build_object('success', true, 'message', 'Professeur ajouté et rattaché à votre école.');
END;
$$;

-- Fix assign_class_to_professor
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

  SELECT id INTO target_user_id FROM auth.users WHERE lower(email) = lower(target_email);
  
  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Utilisateur introuvable. Demandez au professeur de créer son compte.');
  END IF;

  SELECT ecole_id INTO class_ecole FROM public.classes WHERE id = target_classe_id;
  IF class_ecole IS NULL OR class_ecole <> my_ecole THEN
    RETURN json_build_object('success', false, 'message', 'Classe non trouvée ou non liée à votre école.');
  END IF;

  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'professeur', my_ecole, true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'professeur',
      ecole_id = my_ecole,
      active = true;

  UPDATE public.classes
  SET professeur_id = target_user_id
  WHERE id = target_classe_id;

  RETURN json_build_object('success', true, 'message', 'Classe assignée au professeur.');
END;
$$;

-- Fix Payment RLS to be robust (Directeur & Director)
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage paiements" ON public.paiements;
CREATE POLICY "Manage paiements" ON public.paiements
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = paiements.eleve_id
    AND c.ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
  )
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(role) IN ('directeur','director'))
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = paiements.eleve_id
    AND c.ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
  )
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(role) IN ('directeur','director'))
);

DROP POLICY IF EXISTS "View paiements" ON public.paiements;
CREATE POLICY "View paiements" ON public.paiements
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.eleves e
    JOIN public.classes c ON c.id = e.classe_id
    WHERE e.id = paiements.eleve_id
    AND c.ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
  )
);
