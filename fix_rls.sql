-- Désactiver temporairement les RLS pour debug
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Vérifier le profil existant
SELECT * FROM profiles WHERE id = '0760a133-2996-41d1-8d60-ea40d809dca6';

-- Si le profil existe mais est incomplet, le mettre à jour
UPDATE profiles 
SET role = 'directeur', 
    ecole_id = '5dcc05ea-f909-4f96-865f-80a3afd14dd4'
WHERE id = '0760a133-2996-41d1-8d60-ea40d809dca6';

-- Réactiver les RLS après correction
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
