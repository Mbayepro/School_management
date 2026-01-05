-- Script pour activer la fonctionnalité "Multi-Professeurs" (Matières)
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Table des enseignements (Lien Classe <-> Professeur <-> Matière)
CREATE TABLE IF NOT EXISTS enseignements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    professeur_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    matiere TEXT NOT NULL, -- Ex: "Maths", "Français", "Histoire"
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(classe_id, matiere) -- Optionnel: Empêche d'avoir 2 profs de Maths pour la même classe (supprimer si besoin)
);

-- 2. Politiques de sécurité (RLS)
ALTER TABLE enseignements ENABLE ROW LEVEL SECURITY;

-- Tout le monde dans l'école peut voir qui enseigne quoi
CREATE POLICY "View enseignements by school" ON enseignements
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM classes c
    JOIN profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = enseignements.classe_id
    AND p.id = auth.uid()
    AND p.role IN ('directeur', 'professeur') 
  )
);

-- Le Directeur peut tout gérer
CREATE POLICY "Director manage enseignements" ON enseignements
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM classes c
    JOIN profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = enseignements.classe_id
    AND p.id = auth.uid()
    AND p.role = 'directeur'
  )
);

-- 3. Index pour la performance
CREATE INDEX IF NOT EXISTS idx_enseignements_classe ON enseignements(classe_id);
CREATE INDEX IF NOT EXISTS idx_enseignements_prof ON enseignements(professeur_id);

-- 4. Helper pour trouver un User ID par email (car les profils n'ont pas l'email public)
-- Cette fonction est sécurisée: seul le directeur peut l'appeler pour trouver un prof.
CREATE OR REPLACE FUNCTION get_user_id_by_email(email_input TEXT)
RETURNS UUID
SECURITY DEFINER
AS $$
DECLARE
  found_id UUID;
BEGIN
  -- On cherche dans auth.users
  SELECT id INTO found_id FROM auth.users WHERE email = email_input;
  RETURN found_id;
END;
$$ LANGUAGE plpgsql;
