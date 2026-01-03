-- FONCTION COMPLÈTE POUR GÉRER LES UTILISATEURS (Role, Ecole, Activation)
-- Exécutez ce script dans le SQL Editor de Supabase pour activer la fonctionnalité.

CREATE OR REPLACE FUNCTION admin_upsert_user(
    target_email TEXT, 
    target_role TEXT, 
    target_ecole_id UUID, 
    target_active BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id UUID;
  final_ecole_id UUID;
  existing_profile RECORD;
BEGIN
  -- 1. Trouver l'utilisateur par email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Aucun utilisateur trouvé avec cet email. Il doit d''abord s''inscrire.');
  END IF;

  -- 2. Déterminer l'école finale
  -- a) Si un ecole_id est fourni, on l'utilise
  -- b) Sinon, on prend celle du profil existant s'il y en a une
  -- c) Sinon, on utilise/cree 'Administration'
  SELECT id, ecole_id INTO existing_profile
  FROM public.profiles
  WHERE id = target_user_id;

  final_ecole_id := target_ecole_id;
  IF final_ecole_id IS NULL THEN
    final_ecole_id := existing_profile.ecole_id;
  END IF;
  IF final_ecole_id IS NULL THEN
    SELECT id INTO final_ecole_id FROM public.ecoles WHERE nom = 'Administration' LIMIT 1;
    IF final_ecole_id IS NULL THEN
      INSERT INTO public.ecoles (nom, active) VALUES ('Administration', true)
      RETURNING id INTO final_ecole_id;
    END IF;
  END IF;

  -- 3. Upsert dans profiles
  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, target_role, final_ecole_id, target_active)
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      ecole_id = COALESCE(EXCLUDED.ecole_id, public.profiles.ecole_id),
      active = EXCLUDED.active;

  -- Forcer ecole_id final (sécurité)
  UPDATE public.profiles SET ecole_id = final_ecole_id WHERE id = target_user_id;

  RETURN json_build_object('success', true, 'message', 'Profil mis à jour (Rôle: ' || target_role || ', Actif: ' || target_active || ')');
END;
$$;
