-- Trigger pour créer automatiquement une École et un Profil Directeur lors de l'inscription
-- À exécuter dans l'éditeur SQL de Supabase
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(active);

CREATE OR REPLACE FUNCTION public.handle_new_director()
RETURNS trigger AS $$
DECLARE
  new_ecole_id UUID;
  school_name TEXT;
BEGIN
  school_name := new.raw_user_meta_data->>'school_name';
  IF school_name IS NULL OR school_name = '' THEN
    school_name := 'École de ' || new.email;
  END IF;

  INSERT INTO public.ecoles (nom, active)
  VALUES (school_name, true)
  RETURNING id INTO new_ecole_id;

  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (new.id, 'directeur', new_ecole_id, false);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_director();

CREATE OR REPLACE FUNCTION public.ensure_profile_for_user(p_user_id uuid, p_email text, p_school_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  exists_id UUID;
  new_ecole_id UUID;
  school_name TEXT;
BEGIN
  SELECT id INTO exists_id FROM public.profiles WHERE id = p_user_id;
  IF exists_id IS NOT NULL THEN
    RETURN;
  END IF;

  school_name := COALESCE(p_school_name, 'École de ' || p_email);

  INSERT INTO public.ecoles (nom, active)
  VALUES (school_name, true)
  RETURNING id INTO new_ecole_id;

  INSERT INTO public.profiles (id, role, ecole_id, active)
  VALUES (p_user_id, 'directeur', new_ecole_id, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile_for_user(uuid, text, text) TO authenticated;
