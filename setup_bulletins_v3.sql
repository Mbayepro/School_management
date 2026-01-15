-- Script de création des tables pour les bulletins (Version 3 - Robuste)
-- Ce script gère l'ordre de création pour éviter les erreurs "relation does not exist"

BEGIN;

-- 1. Création des tables (Si elles n'existent pas)
CREATE TABLE IF NOT EXISTS public.matieres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    coefficient NUMERIC DEFAULT 1,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titre TEXT NOT NULL,
    type_eval TEXT NOT NULL,
    trimestre INT NOT NULL,
    date_eval DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    valeur NUMERIC NOT NULL,
    appreciation TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- 2. Ajout des colonnes de liaison (avec vérification pour éviter les erreurs si elles existent déjà)

-- MATIERES : Ajout ecole_id et classe_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='matieres' AND column_name='ecole_id') THEN
        ALTER TABLE public.matieres ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='matieres' AND column_name='classe_id') THEN
        ALTER TABLE public.matieres ADD COLUMN classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;
    END IF;
END $$;

-- EVALUATIONS : Ajout classe_id et matiere_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evaluations' AND column_name='classe_id') THEN
        ALTER TABLE public.evaluations ADD COLUMN classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evaluations' AND column_name='matiere_id') THEN
        ALTER TABLE public.evaluations ADD COLUMN matiere_id UUID REFERENCES public.matieres(id) ON DELETE CASCADE;
    END IF;
END $$;

-- NOTES : Ajout evaluation_id et eleve_id
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notes' AND column_name='evaluation_id') THEN
        ALTER TABLE public.notes ADD COLUMN evaluation_id UUID REFERENCES public.evaluations(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notes' AND column_name='eleve_id') THEN
        ALTER TABLE public.notes ADD COLUMN eleve_id UUID REFERENCES public.eleves(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Ajout de la contrainte UNIQUE sur notes (si elle n'existe pas)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_evaluation_eleve_unique') THEN
        ALTER TABLE public.notes ADD CONSTRAINT notes_evaluation_eleve_unique UNIQUE (evaluation_id, eleve_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Ignorer si la contrainte existe déjà sous un autre nom ou conflit
    NULL; 
END $$;


-- 3. Activation RLS
ALTER TABLE public.matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;


-- 4. Nettoyage et Création des Politiques (Policies)
-- On supprime les anciennes politiques pour éviter les conflits de nom

-- MATIERES
DROP POLICY IF EXISTS "Voir matieres ecole" ON public.matieres;
DROP POLICY IF EXISTS "Gerer matieres directeur" ON public.matieres;

CREATE POLICY "Voir matieres ecole" ON public.matieres FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.ecole_id = matieres.ecole_id)
);
CREATE POLICY "Gerer matieres directeur" ON public.matieres FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'directeur' AND p.ecole_id = matieres.ecole_id)
);

-- EVALUATIONS
DROP POLICY IF EXISTS "Voir evaluations ecole" ON public.evaluations;
DROP POLICY IF EXISTS "Gerer evaluations staff" ON public.evaluations;

CREATE POLICY "Voir evaluations ecole" ON public.evaluations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.classes c JOIN public.profiles p ON p.ecole_id = c.ecole_id WHERE c.id = evaluations.classe_id AND p.id = auth.uid())
);
CREATE POLICY "Gerer evaluations staff" ON public.evaluations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.classes c JOIN public.profiles p ON p.ecole_id = c.ecole_id WHERE c.id = evaluations.classe_id AND p.id = auth.uid() AND p.role IN ('directeur', 'professeur'))
);

-- NOTES
DROP POLICY IF EXISTS "Voir notes ecole" ON public.notes;
DROP POLICY IF EXISTS "Gerer notes staff" ON public.notes;

CREATE POLICY "Voir notes ecole" ON public.notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.evaluations ev
    JOIN public.classes c ON c.id = ev.classe_id
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE ev.id = notes.evaluation_id AND p.id = auth.uid()
  )
);
CREATE POLICY "Gerer notes staff" ON public.notes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.evaluations ev
    JOIN public.classes c ON c.id = ev.classe_id
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE ev.id = notes.evaluation_id AND p.id = auth.uid() AND p.role IN ('directeur', 'professeur')
  )
);

COMMIT;
