-- FIX COMPLET: Ajouter colonne manquante ET Promouvoir Admin
-- Exécutez tout ce bloc dans l'éditeur SQL de Supabase

-- 1. Ajouter la colonne 'active' si elle manque
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='active') THEN
        ALTER TABLE public.profiles ADD COLUMN active BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. Promouvoir l'utilisateur mbayeadama669@gmail.com
DO $$
DECLARE
  target_email TEXT := 'mbayeadama669@gmail.com';
  target_user_id UUID;
  existing_ecole_id UUID;
BEGIN
  -- Récupérer l'ID user
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non trouvé : %', target_email;
  END IF;

  -- Assurer l'école Administration
  SELECT id INTO existing_ecole_id FROM public.ecoles WHERE nom = 'Administration' LIMIT 1;
  
  IF existing_ecole_id IS NULL THEN
    INSERT INTO public.ecoles (nom, active) VALUES ('Administration', true) 
    RETURNING id INTO existing_ecole_id;
  END IF;

  -- Upsert profil avec active = true
  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'super_admin', existing_ecole_id, true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'super_admin',
      ecole_id = existing_ecole_id,
      active = true;
      
  RAISE NOTICE 'Succès : Colonne active vérifiée et utilisateur % promu.', target_email;
END $$;
