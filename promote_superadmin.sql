-- Script pour promouvoir mbayeadama669@gmail.com en Super Admin
-- À exécuter dans l'éditeur SQL de Supabase

DO $$
DECLARE
  admin_ecole_id UUID;
  user_id UUID;
BEGIN
  -- 1. Récupérer ou créer l'école "Administration" (pour que le Super Admin ait une affiliation)
  SELECT id INTO admin_ecole_id FROM public.ecoles WHERE nom = 'Administration' LIMIT 1;
  
  IF admin_ecole_id IS NULL THEN
    INSERT INTO public.ecoles (nom, active) VALUES ('Administration', TRUE) RETURNING id INTO admin_ecole_id;
  END IF;

  -- 2. Récupérer l'ID de l'utilisateur depuis auth.users
  SELECT id INTO user_id FROM auth.users WHERE email = 'mbayeadama669@gmail.com';

  IF user_id IS NOT NULL THEN
    -- 3. Mettre à jour ou créer le profil avec les droits Super Admin
    INSERT INTO public.profiles (id, email, role, ecole_id, is_approved)
    VALUES (user_id, 'mbayeadama669@gmail.com', 'super_admin', admin_ecole_id, TRUE)
    ON CONFLICT (id) DO UPDATE
    SET role = 'super_admin',
        ecole_id = admin_ecole_id,
        is_approved = TRUE;
        
    RAISE NOTICE 'SUCCÈS : Utilisateur mbayeadama669@gmail.com est maintenant Super Admin.';
  ELSE
    RAISE NOTICE 'ATTENTION : Utilisateur mbayeadama669@gmail.com introuvable. Inscrivez-vous d''abord.';
  END IF;
END $$;
