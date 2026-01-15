-- Script de création des tables pour les bulletins (Correction)
-- Gestion des erreurs si les tables existent déjà partiellement

-- 1. Table MATIERES
-- On supprime la politique avant de potentiellement recréer la table pour éviter les conflits si on rejoue le script
DROP POLICY IF EXISTS "Voir matieres ecole" ON matieres;
DROP POLICY IF EXISTS "Gerer matieres directeur" ON matieres;

CREATE TABLE IF NOT EXISTS matieres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecole_id UUID REFERENCES ecoles(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    coefficient NUMERIC DEFAULT 1,
    classe_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now()
);

-- Sécurité : Vérifier que la colonne ecole_id existe bien (au cas où la table existait sans cette colonne)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='matieres' AND column_name='ecole_id') THEN
        ALTER TABLE matieres ADD COLUMN ecole_id UUID REFERENCES ecoles(id) ON DELETE CASCADE;
    END IF;
END $$;


-- 2. Table EVALUATIONS
DROP POLICY IF EXISTS "Voir evaluations ecole" ON evaluations;
DROP POLICY IF EXISTS "Gerer evaluations staff" ON evaluations;

CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id UUID REFERENCES matieres(id) ON DELETE CASCADE,
    titre TEXT NOT NULL,
    type_eval TEXT NOT NULL,
    trimestre INT NOT NULL,
    date_eval DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT now()
);

-- 3. Table NOTES
DROP POLICY IF EXISTS "Voir notes ecole" ON notes;
DROP POLICY IF EXISTS "Gerer notes staff" ON notes;

CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE,
    eleve_id UUID REFERENCES eleves(id) ON DELETE CASCADE,
    valeur NUMERIC NOT NULL,
    appreciation TEXT,
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(evaluation_id, eleve_id)
);

-- Activation RLS
ALTER TABLE matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Politiques RLS (Correction de la référence explicite à la table)

-- MATIERES
CREATE POLICY "Voir matieres ecole" ON matieres FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.ecole_id = matieres.ecole_id)
);

CREATE POLICY "Gerer matieres directeur" ON matieres FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'directeur' AND p.ecole_id = matieres.ecole_id)
);

-- EVALUATIONS
CREATE POLICY "Voir evaluations ecole" ON evaluations FOR SELECT USING (
  EXISTS (SELECT 1 FROM classes c JOIN profiles p ON p.ecole_id = c.ecole_id WHERE c.id = evaluations.classe_id AND p.id = auth.uid())
);

CREATE POLICY "Gerer evaluations staff" ON evaluations FOR ALL USING (
  EXISTS (SELECT 1 FROM classes c JOIN profiles p ON p.ecole_id = c.ecole_id WHERE c.id = evaluations.classe_id AND p.id = auth.uid() AND p.role IN ('directeur', 'professeur'))
);

-- NOTES
CREATE POLICY "Voir notes ecole" ON notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM evaluations ev
    JOIN classes c ON c.id = ev.classe_id
    JOIN profiles p ON p.ecole_id = c.ecole_id
    WHERE ev.id = notes.evaluation_id AND p.id = auth.uid()
  )
);

CREATE POLICY "Gerer notes staff" ON notes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM evaluations ev
    JOIN classes c ON c.id = ev.classe_id
    JOIN profiles p ON p.ecole_id = c.ecole_id
    WHERE ev.id = notes.evaluation_id AND p.id = auth.uid() AND p.role IN ('directeur', 'professeur')
  )
);
