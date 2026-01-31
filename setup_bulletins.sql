-- Script de création des tables pour les bulletins
-- Ce script ne modifie pas les tables existantes, il ajoute de nouvelles tables

-- 1. Table MATIERES (Optionnelle, pour normaliser les noms de matières)
CREATE TABLE IF NOT EXISTS matieres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ecole_id UUID REFERENCES ecoles(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    coefficient NUMERIC DEFAULT 1,
    classe_id UUID REFERENCES classes(id) ON DELETE CASCADE, -- Si les matières sont spécifiques à une classe
    created_at TIMESTAMP DEFAULT now()
);

-- 2. Table EVALUATIONS (Pour grouper les notes : Devoir 1, Compo 1, etc.)
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    matiere_id UUID REFERENCES matieres(id) ON DELETE CASCADE, -- Ou simplement le nom si pas de table matieres
    titre TEXT NOT NULL, -- Ex: "Devoir 1", "Composition"
    type_eval TEXT NOT NULL, -- 'devoir', 'composition'
    trimestre INT NOT NULL, -- 1, 2, ou 3
    date_eval DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT now()
);

-- 3. Table NOTES (La note de l'élève pour une évaluation donnée)
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE,
    eleve_id UUID REFERENCES eleves(id) ON DELETE CASCADE,
    note NUMERIC NOT NULL, -- La note (ex: 15.5)
    appreciation TEXT,
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(evaluation_id, eleve_id) -- Un élève n'a qu'une seule note par évaluation
);

-- RLS (Sécurité)
ALTER TABLE matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Politiques RLS (Similaires aux autres tables)
-- Pour l'instant, politiques simplifiées basées sur l'école via les jointures

-- MATIERES
DROP POLICY IF EXISTS "Voir matieres ecole" ON matieres;
CREATE POLICY "Voir matieres ecole" ON matieres FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.ecole_id = matieres.ecole_id)
);

DROP POLICY IF EXISTS "Gerer matieres directeur" ON matieres;
CREATE POLICY "Gerer matieres directeur" ON matieres FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'directeur' AND p.ecole_id = matieres.ecole_id)
);

-- EVALUATIONS
DROP POLICY IF EXISTS "Voir evaluations ecole" ON evaluations;
CREATE POLICY "Voir evaluations ecole" ON evaluations FOR SELECT USING (
  EXISTS (SELECT 1 FROM classes c JOIN profiles p ON p.ecole_id = c.ecole_id WHERE c.id = evaluations.classe_id AND p.id = auth.uid())
);

-- Profs et Directeurs peuvent créer des évals
DROP POLICY IF EXISTS "Gerer evaluations staff" ON evaluations;
CREATE POLICY "Gerer evaluations staff" ON evaluations FOR ALL USING (
  EXISTS (SELECT 1 FROM classes c JOIN profiles p ON p.ecole_id = c.ecole_id WHERE c.id = evaluations.classe_id AND p.id = auth.uid() AND p.role IN ('directeur', 'professeur'))
);

-- NOTES
DROP POLICY IF EXISTS "Voir notes ecole" ON notes;
CREATE POLICY "Voir notes ecole" ON notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM evaluations ev
    JOIN classes c ON c.id = ev.classe_id
    JOIN profiles p ON p.ecole_id = c.ecole_id
    WHERE ev.id = notes.evaluation_id AND p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Gerer notes staff" ON notes;
CREATE POLICY "Gerer notes staff" ON notes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM evaluations ev
    JOIN classes c ON c.id = ev.classe_id
    JOIN profiles p ON p.ecole_id = c.ecole_id
    WHERE ev.id = notes.evaluation_id AND p.id = auth.uid() AND p.role IN ('directeur', 'professeur')
  )
);
