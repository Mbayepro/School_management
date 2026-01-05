-- Créer le profil pour l'utilisateur existant
INSERT INTO profiles (id, role, ecole_id, created_at) 
VALUES (
  '0760a133-2996-41d1-8d60-ea40d809dca6', 
  'directeur', 
  '5dcc05ea-f909-4f96-865f-80a3afd14dd4',
  now()
);

-- Vérifier que le profil a été créé
SELECT * FROM profiles WHERE id = '0760a133-2996-41d1-8d60-ea40d809dca6';
