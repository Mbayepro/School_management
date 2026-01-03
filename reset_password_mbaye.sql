-- Réinitialisation du mot de passe pour mbayeadama669@gmail.com
-- Ce script définit le mot de passe à : pass123

-- 1. S'assurer que l'extension de cryptage est active
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Mettre à jour le mot de passe
UPDATE auth.users
SET encrypted_password = crypt('pass123', gen_salt('bf'))
WHERE email = 'mbayeadama669@gmail.com';

-- 3. Vérification (optionnel, affiche juste l'ID si trouvé)
DO $$
DECLARE
  u_id UUID;
BEGIN
  SELECT id INTO u_id FROM auth.users WHERE email = 'mbayeadama669@gmail.com';
  IF u_id IS NOT NULL THEN
    RAISE NOTICE 'Mot de passe réinitialisé pour % (ID: %)', 'mbayeadama669@gmail.com', u_id;
  ELSE
    RAISE NOTICE 'Utilisateur non trouvé !';
  END IF;
END $$;
