-- Security Fixes for School Management (Global Consolidated)
-- Enforces ecole_id cloisonnement and Role-Based Access Control (RLS) across ALL modules
-- Merges fixes for Eleves, Paiements, Presences, Classes, Notes, Evaluations, Matieres

-- 1. Ensure ecole_id column exists on critical tables
DO $$
BEGIN
    -- Eleves
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'eleves' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.eleves ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;

    -- Paiements
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'paiements' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.paiements ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;

    -- Presences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'presences' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.presences ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;

    -- Notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.notes ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;

    -- Evaluations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.evaluations ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;

    -- Matieres
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matieres' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.matieres ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;
END $$;

-- 2. Populate ecole_id for existing records (Best Effort)
-- For eleves, get from classes
UPDATE public.eleves e
SET ecole_id = c.ecole_id
FROM public.classes c
WHERE e.classe_id = c.id
AND e.ecole_id IS NULL;

-- For paiements, get from eleves
UPDATE public.paiements p
SET ecole_id = e.ecole_id
FROM public.eleves e
WHERE p.eleve_id = e.id
AND p.ecole_id IS NULL;

-- For presences, get from classes
UPDATE public.presences p
SET ecole_id = c.ecole_id
FROM public.classes c
WHERE p.classe_id = c.id
AND p.ecole_id IS NULL;

-- For matieres, get from classes
UPDATE public.matieres m
SET ecole_id = c.ecole_id
FROM public.classes c
WHERE m.classe_id = c.id
AND m.ecole_id IS NULL;

-- For evaluations, get from classes
UPDATE public.evaluations ev
SET ecole_id = c.ecole_id
FROM public.classes c
WHERE ev.classe_id = c.id
AND ev.ecole_id IS NULL;

-- For notes, get from evaluations
UPDATE public.notes n
SET ecole_id = ev.ecole_id
FROM public.evaluations ev
WHERE n.evaluation_id = ev.id
AND n.ecole_id IS NULL;

-- 3. Enable RLS on all modules
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enseignements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- 4. Create Helper Functions
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.user_ecole_id()
RETURNS uuid AS $$
  SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. Create RLS Policies

-- === ELEVES ===
DROP POLICY IF EXISTS "Eleves viewable by school staff" ON public.eleves;
CREATE POLICY "Eleves viewable by school staff" ON public.eleves
FOR SELECT TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
  OR
  -- Fallback for cases where ecole_id might be null but linked to valid class
  classe_id IN (
    SELECT id FROM public.classes WHERE ecole_id = auth.user_ecole_id()
  )
);

DROP POLICY IF EXISTS "Eleves insertable by director" ON public.eleves;
CREATE POLICY "Eleves insertable by director" ON public.eleves
FOR INSERT TO authenticated
WITH CHECK (
  auth.user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = auth.user_ecole_id()
);

DROP POLICY IF EXISTS "Eleves editable by director" ON public.eleves;
CREATE POLICY "Eleves editable by director" ON public.eleves
FOR UPDATE TO authenticated
USING (
  auth.user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = auth.user_ecole_id()
);

-- === PAIEMENTS ===
DROP POLICY IF EXISTS "Paiements viewable by director" ON public.paiements;
CREATE POLICY "Paiements viewable by director" ON public.paiements
FOR SELECT TO authenticated
USING (
  auth.user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = auth.user_ecole_id()
);

DROP POLICY IF EXISTS "Paiements manageable by director" ON public.paiements;
CREATE POLICY "Paiements manageable by director" ON public.paiements
FOR ALL TO authenticated
USING (
  auth.user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = auth.user_ecole_id()
);

-- === PRESENCES ===
DROP POLICY IF EXISTS "Presences viewable by staff" ON public.presences;
CREATE POLICY "Presences viewable by staff" ON public.presences
FOR SELECT TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
);

DROP POLICY IF EXISTS "Presences manageable by staff" ON public.presences;
CREATE POLICY "Presences manageable by staff" ON public.presences
FOR ALL TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
  AND (
    auth.user_role() IN ('directeur', 'director', 'admin')
    OR
    (auth.user_role() = 'professeur' AND classe_id IN (
        SELECT classe_id FROM public.enseignements WHERE professeur_id = auth.uid()
        UNION
        SELECT id FROM public.classes WHERE professeur_id = auth.uid()
    ))
  )
);

-- === CLASSES ===
DROP POLICY IF EXISTS "Classes viewable by staff" ON public.classes;
CREATE POLICY "Classes viewable by staff" ON public.classes
FOR SELECT TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
);

DROP POLICY IF EXISTS "Classes manageable by director" ON public.classes;
CREATE POLICY "Classes manageable by director" ON public.classes
FOR ALL TO authenticated
USING (
  auth.user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = auth.user_ecole_id()
);

-- === ENSEIGNEMENTS ===
DROP POLICY IF EXISTS "Enseignements viewable by staff" ON public.enseignements;
CREATE POLICY "Enseignements viewable by staff" ON public.enseignements
FOR SELECT TO authenticated
USING (
  classe_id IN (SELECT id FROM public.classes WHERE ecole_id = auth.user_ecole_id())
);

DROP POLICY IF EXISTS "Enseignements manageable by director" ON public.enseignements;
CREATE POLICY "Enseignements manageable by director" ON public.enseignements
FOR ALL TO authenticated
USING (
  auth.user_role() IN ('directeur', 'director', 'admin')
  AND
  classe_id IN (SELECT id FROM public.classes WHERE ecole_id = auth.user_ecole_id())
);

-- === MATIERES ===
DROP POLICY IF EXISTS "Matieres viewable by staff" ON public.matieres;
CREATE POLICY "Matieres viewable by staff" ON public.matieres
FOR SELECT TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
);

DROP POLICY IF EXISTS "Matieres manageable by director" ON public.matieres;
CREATE POLICY "Matieres manageable by director" ON public.matieres
FOR ALL TO authenticated
USING (
  auth.user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = auth.user_ecole_id()
);

-- === EVALUATIONS ===
DROP POLICY IF EXISTS "Evaluations viewable by staff" ON public.evaluations;
CREATE POLICY "Evaluations viewable by staff" ON public.evaluations
FOR SELECT TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
);

DROP POLICY IF EXISTS "Evaluations manageable by staff" ON public.evaluations;
CREATE POLICY "Evaluations manageable by staff" ON public.evaluations
FOR ALL TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
  AND (
    auth.user_role() IN ('directeur', 'director', 'admin')
    OR
    (auth.user_role() = 'professeur' AND classe_id IN (
        SELECT classe_id FROM public.enseignements WHERE professeur_id = auth.uid()
        UNION
        SELECT id FROM public.classes WHERE professeur_id = auth.uid()
    ))
  )
);

-- === NOTES ===
DROP POLICY IF EXISTS "Notes viewable by staff" ON public.notes;
CREATE POLICY "Notes viewable by staff" ON public.notes
FOR SELECT TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
);

DROP POLICY IF EXISTS "Notes manageable by staff" ON public.notes;
CREATE POLICY "Notes manageable by staff" ON public.notes
FOR ALL TO authenticated
USING (
  ecole_id = auth.user_ecole_id()
  AND (
    auth.user_role() IN ('directeur', 'director', 'admin')
    OR
    EXISTS (
       SELECT 1 FROM public.evaluations e
       WHERE e.id = evaluation_id
       AND (
         e.classe_id IN (SELECT classe_id FROM public.enseignements WHERE professeur_id = auth.uid())
         OR
         e.classe_id IN (SELECT id FROM public.classes WHERE professeur_id = auth.uid())
       )
    )
  )
);
