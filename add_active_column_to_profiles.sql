-- Ajouter la colonne 'active' à la table profiles pour activer/désactiver les comptes
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Créer un index pour améliorer les performances des requêtes par statut actif
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(active);

-- Mettre à jour tous les profils existants pour qu'ils soient actifs par défaut
UPDATE public.profiles SET active = true WHERE active IS NULL;

-- Fonction pour mettre à jour le statut actif d'un profil par email
-- Cette fonction permet de rechercher dans auth.users et mettre à jour profiles
CREATE OR REPLACE FUNCTION update_profile_active_by_email(user_email TEXT, is_active BOOLEAN)
RETURNS TABLE(id UUID, role TEXT, active BOOLEAN) AS $$
DECLARE
  user_id UUID;
BEGIN
  -- Trouver l'ID utilisateur depuis auth.users
  SELECT au.id INTO user_id
  FROM auth.users au
  WHERE au.email = user_email
  LIMIT 1;
  
  -- Si l'utilisateur n'existe pas, lever une exception
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur trouvé avec l''email: %', user_email;
  END IF;
  
  -- Mettre à jour le profil
  UPDATE public.profiles
  SET active = is_active
  WHERE profiles.id = user_id;
  
  -- Retourner le profil mis à jour
  RETURN QUERY
  SELECT p.id, p.role, p.active
  FROM public.profiles p
  WHERE p.id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Donner les permissions nécessaires pour exécuter la fonction
GRANT EXECUTE ON FUNCTION update_profile_active_by_email(TEXT, BOOLEAN) TO authenticated;
