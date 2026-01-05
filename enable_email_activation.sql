-- FONCTION DE GESTION DIRECTEUR PAR EMAIL (Pour remplacer l'API Node.js)
-- Copiez ce code et exécutez-le dans le SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION manage_director_status(user_email TEXT, new_status BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- IMPORTANT: Permet à la fonction de lire auth.users (ce que le client JS ne peut pas faire)
SET search_path = public, auth -- Sécurité: définit le chemin de recherche
AS $$
DECLARE
  target_user_id UUID;
  assigned_ecole_id UUID;
  existing_profile RECORD;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = user_email;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Aucun compte trouvé avec cet email.');
  END IF;

  SELECT id, role, ecole_id, active INTO existing_profile
  FROM public.profiles
  WHERE id = target_user_id;

  IF existing_profile IS NOT NULL THEN
    assigned_ecole_id := existing_profile.ecole_id;
  END IF;

  IF assigned_ecole_id IS NULL THEN
    SELECT id INTO assigned_ecole_id FROM public.ecoles WHERE nom = 'Administration' LIMIT 1;
    IF assigned_ecole_id IS NULL THEN
      INSERT INTO public.ecoles (nom, active) VALUES ('Administration', true) RETURNING id INTO assigned_ecole_id;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'directeur', assigned_ecole_id, new_status)
  ON CONFLICT (id) DO UPDATE
    SET role = 'directeur',
        ecole_id = COALESCE(public.profiles.ecole_id, EXCLUDED.ecole_id),
        active = EXCLUDED.active;

  RETURN json_build_object('success', true, 'message', CASE WHEN new_status THEN 'Compte activé avec succès.' ELSE 'Compte désactivé.' END);
END;
$$;
