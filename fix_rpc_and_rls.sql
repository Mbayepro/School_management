-- FONCTION ET CORRECTIFS CRITIQUES
-- Copiez tout ce code dans l'éditeur SQL de Supabase et exécutez-le.

-- 1. CRÉATION DE LA FONCTION D'ASSIGNATION (Manquante)
-- Cette fonction permet d'assigner un prof via son email sans connaître son ID à l'avance
CREATE OR REPLACE FUNCTION public.assign_professor_by_email(target_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Exécute avec les droits admin pour contourner les RLS si besoin
AS $$
DECLARE
  target_user_id UUID;
  current_ecole_id UUID;
  result JSONB;
BEGIN
  -- Récupérer l'ID de l'utilisateur cible via la table profiles (plus sûr que auth.users)
  SELECT id INTO target_user_id
  FROM public.profiles
  WHERE email = target_email
  LIMIT 1;

  -- Si non trouvé dans profiles, on peut essayer de deviner via auth.users (si accès permis)
  -- Mais pour la sécurité, on se base sur profiles.
  IF target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Utilisateur introuvable. A-t-il créé son compte ?');
  END IF;

  -- Récupérer l'école de l'utilisateur qui fait la demande (le directeur)
  SELECT ecole_id INTO current_ecole_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF current_ecole_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Votre compte n''est associé à aucune école.');
  END IF;

  -- Mettre à jour le profil du professeur pour l'associer à l'école
  UPDATE public.profiles
  SET ecole_id = current_ecole_id,
      role = 'professeur' -- On force le rôle professeur
  WHERE id = target_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Professeur assigné avec succès.');
END;
$$;

-- 2. DÉBLOCAGE DE LA CRÉATION DE CLASSES (RLS)
-- Si la création de classe échoue, c'est souvent à cause de politiques trop strictes.
-- On s'assure que TOUTE personne authentifiée peut créer une classe (dans un premier temps).
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.classes;
DROP POLICY IF EXISTS "Classes insert policy" ON public.classes;

CREATE POLICY "Classes insert policy" ON public.classes
FOR INSERT TO authenticated
WITH CHECK (true); -- Permet tout insert si connecté

-- On s'assure aussi qu'on peut LIRE les classes qu'on vient de créer
DROP POLICY IF EXISTS "Classes select policy" ON public.classes;
CREATE POLICY "Classes select policy" ON public.classes
FOR SELECT TO authenticated
USING (true);

-- 3. PERMISSION SUR LA TABLE PROFILS (Pour que la fonction puisse lire/écrire)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture profiles publique" ON public.profiles
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Ecriture profiles self" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id);

-- 4. AJOUT DE LA COLONNE EMAIL DANS PROFILES (Si manquante)
-- La fonction ci-dessus dépend de la colonne email dans profiles pour la recherche
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Mettre à jour les emails dans profiles à partir de auth.users (nécessite des droits élevés, peut échouer si exécuté par un user lambda, mais le script SQL Editor est admin)
-- Note: Supabase SQL Editor a les droits admin.
UPDATE public.profiles
SET email = (SELECT email FROM auth.users WHERE auth.users.id = public.profiles.id)
WHERE email IS NULL;
