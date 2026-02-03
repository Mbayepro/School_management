-- FIX REGISTRATION FLOW & TRIGGERS
-- Ce script remplace les tentatives d'insertion côté client par un Trigger robuste côté serveur.
-- Cela contourne définitivement les problèmes de RLS lors de l'inscription.

-- 1. Nettoyage des anciens triggers/fonctions
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. Création de la fonction déclencheur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_ecole_id UUID;
  school_name TEXT;
  user_role TEXT;
  is_approved BOOLEAN;
BEGIN
  -- Récupérer le nom de l'école depuis les métadonnées (envoyé par register.js)
  school_name := new.raw_user_meta_data->>'ecole_nom';
  
  -- Fallback si pas de nom d'école
  IF school_name IS NULL OR school_name = '' THEN
    school_name := 'École de ' || new.email;
  END IF;

  -- Déterminer le rôle et l'approbation
  IF new.email = 'mbayeadama669@gmail.com' THEN
    user_role := 'super_admin';
    is_approved := TRUE;
  ELSE
    user_role := 'pending_director';
    is_approved := FALSE;
  END IF;

  -- 1. Créer l'école
  INSERT INTO public.ecoles (nom, active)
  VALUES (school_name, TRUE)
  RETURNING id INTO new_ecole_id;

  -- 2. Créer le profil lié
  INSERT INTO public.profiles (id, email, role, ecole_id, is_approved, nom_complet)
  VALUES (
    new.id, 
    new.email, 
    user_role, 
    new_ecole_id, 
    is_approved,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- En cas d'erreur, on log mais on ne bloque pas forcément l'inscription auth (optionnel)
    -- Mais ici on veut que ça réussisse proprement.
    RAISE WARNING 'Erreur dans handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ré-attacher le Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Permissions (au cas où)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO postgres, service_role;
GRANT ALL ON TABLE public.ecoles TO postgres, service_role;
GRANT ALL ON SEQUENCE public.ecoles_id_seq TO postgres, service_role; -- Si ID auto-increment (mais c'est UUID normalement)

-- 5. S'assurer que RLS ne bloque pas le SELECT de base pour l'UI
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read access for authenticated" ON public.ecoles;
CREATE POLICY "Read access for authenticated" ON public.ecoles
FOR SELECT TO authenticated USING (true);

