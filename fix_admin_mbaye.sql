-- FIX: Promouvoir un utilisateur en Super Admin et activer son compte
-- Remplacer 'EMAIL_DU_USER' par l'email réel si différent de mbayeadama669@gmail.com

DO $$
DECLARE
  target_email TEXT := 'mbayeadama669@gmail.com';
  target_user_id UUID;
  existing_ecole_id UUID;
BEGIN
  -- 1. Récupérer l'ID de l'utilisateur
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non trouvé : %', target_email;
  END IF;

  -- 2. Assurer qu'une école "Administration" existe
  SELECT id INTO existing_ecole_id FROM public.ecoles WHERE nom = 'Administration' LIMIT 1;
  
  IF existing_ecole_id IS NULL THEN
    INSERT INTO public.ecoles (nom, active) VALUES ('Administration', true) 
    RETURNING id INTO existing_ecole_id;
  END IF;

  -- 3. Mettre à jour ou insérer le profil
  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'super_admin', existing_ecole_id, true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'super_admin',
      ecole_id = existing_ecole_id,
      active = true;
      
  RAISE NOTICE 'Utilisateur % promu Super Admin avec succès.', target_email;
END $$;
