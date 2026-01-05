-- Supprimer toutes les politiques RLS existantes sur profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Créer une politique simple qui permet à l'utilisateur de voir son propre profil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Créer une politique pour permettre à l'utilisateur de mettre à jour son profil
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Vérifier que les RLS sont bien activés
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Test: vérifier que l'utilisateur peut lire son profil
-- (Cette requête devrait fonctionner depuis l'application)
SELECT * FROM profiles WHERE id = '0760a133-2996-41d1-8d60-ea40d809dca6';
