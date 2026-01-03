-- !!! SCRIPT D'URGENCE COMPLET !!!
-- Ce script fait TOUT :
-- 1. Réinitialise le mot de passe à 'pass123'
-- 2. Promeut en Super Admin
-- 3. Active le compte
-- 4. Corrige les colonnes manquantes

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  target_email TEXT := 'mbayeadama669@gmail.com';
  target_password TEXT := 'pass123';
  target_user_id UUID;
  existing_ecole_id UUID;
BEGIN
  -- 1. Récupérer l'ID de l'utilisateur
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'ERREUR: Utilisateur % introuvable. Veuillez créer le compte via Sign Up d''abord.', target_email;
  END IF;

  -- 2. Réinitialiser le mot de passe (FORCE BRUTE)
  UPDATE auth.users
  SET encrypted_password = crypt(target_password, gen_salt('bf'))
  WHERE id = target_user_id;

  -- 3. Vérifier/Créer la colonne 'active' sur profiles si manquante
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='active') THEN
      ALTER TABLE public.profiles ADD COLUMN active BOOLEAN DEFAULT true;
  END IF;

  -- 4. Assurer l'école Administration
  SELECT id INTO existing_ecole_id FROM public.ecoles WHERE nom = 'Administration' LIMIT 1;
  IF existing_ecole_id IS NULL THEN
    INSERT INTO public.ecoles (nom, active) VALUES ('Administration', true) 
    RETURNING id INTO existing_ecole_id;
  END IF;

  -- 5. Forcer le profil Super Admin Actif
  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (target_user_id, 'super_admin', existing_ecole_id, true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'super_admin',
      ecole_id = existing_ecole_id,
      active = true;

  RAISE NOTICE '--- SUCCESS ---';
  RAISE NOTICE 'Compte: %', target_email;
  RAISE NOTICE 'Nouveau Mot de passe: %', target_password;
  RAISE NOTICE 'Role: Super Admin';
  RAISE NOTICE 'Statut: Actif';
END $$;
