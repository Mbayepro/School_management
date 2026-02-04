-- Security Fixes for School Management (Global Consolidated)
-- Enforces ecole_id cloisonnement and Role-Based Access Control (RLS) across ALL modules
-- Merges fixes for Eleves, Paiements, Presences, Classes, Notes, Evaluations, Matieres, Ecoles, Profiles, and Registration

-- 0. CREATE TABLES IF NOT EXIST (Schema Initialization)
-- Ensure all required tables exist before applying policies

-- 0.1 ECOLES
CREATE TABLE IF NOT EXISTS public.ecoles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    telephone TEXT,
    email TEXT,
    adresse TEXT,
    couleur TEXT DEFAULT '#2563eb',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.2 PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    role TEXT CHECK (role IN ('super_admin', 'directeur', 'director', 'professeur', 'teacher', 'pending_director', 'admin')),
    ecole_id UUID REFERENCES public.ecoles(id),
    is_approved BOOLEAN DEFAULT false,
    full_name TEXT,
    email TEXT,
    telephone TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.3 CLASSES
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    niveau TEXT CHECK (niveau IN ('primaire', 'college', 'lycee', 'crèche', 'maternelle')),
    serie TEXT,
    annee_scolaire TEXT,
    ecole_id UUID REFERENCES public.ecoles(id),
    professeur_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.4 MATIERES
CREATE TABLE IF NOT EXISTS public.matieres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    classe_id UUID REFERENCES public.classes(id),
    ecole_id UUID REFERENCES public.ecoles(id),
    coefficient NUMERIC DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.5 ELEVES
CREATE TABLE IF NOT EXISTS public.eleves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prenom TEXT NOT NULL,
    nom TEXT NOT NULL,
    date_naissance DATE,
    lieu_naissance TEXT,
    sexe TEXT CHECK (sexe IN ('M', 'F')),
    matricule TEXT,
    classe_id UUID REFERENCES public.classes(id),
    ecole_id UUID REFERENCES public.ecoles(id),
    tuteur_nom TEXT,
    tuteur_telephone TEXT,
    adresse TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.6 ENSEIGNEMENTS
CREATE TABLE IF NOT EXISTS public.enseignements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id UUID REFERENCES public.classes(id),
    matiere TEXT,
    professeur_id UUID REFERENCES auth.users(id),
    ecole_id UUID REFERENCES public.ecoles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.7 EVALUATIONS
CREATE TABLE IF NOT EXISTS public.evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titre TEXT,
    type_eval TEXT CHECK (type_eval IN ('devoir', 'composition', 'examen')),
    date_eval DATE DEFAULT CURRENT_DATE,
    trimestre TEXT,
    classe_id UUID REFERENCES public.classes(id),
    matiere_id UUID REFERENCES public.matieres(id),
    ecole_id UUID REFERENCES public.ecoles(id),
    note_max NUMERIC DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.8 NOTES
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID REFERENCES public.evaluations(id),
    eleve_id UUID REFERENCES public.eleves(id),
    note NUMERIC,
    appreciation TEXT,
    ecole_id UUID REFERENCES public.ecoles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.9 PRESENCES
CREATE TABLE IF NOT EXISTS public.presences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE DEFAULT CURRENT_DATE,
    status TEXT CHECK (status IN ('present', 'absent', 'retard', 'excuse')),
    eleve_id UUID REFERENCES public.eleves(id),
    classe_id UUID REFERENCES public.classes(id),
    ecole_id UUID REFERENCES public.ecoles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.10 PAIEMENTS
CREATE TABLE IF NOT EXISTS public.paiements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE DEFAULT CURRENT_DATE,
    montant NUMERIC NOT NULL,
    motif TEXT,
    mois TEXT,
    eleve_id UUID REFERENCES public.eleves(id),
    ecole_id UUID REFERENCES public.ecoles(id),
    reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0.11 COEFFICIENTS OFFICIELS (Optional)
CREATE TABLE IF NOT EXISTS public.coefficients_officiels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    niveau TEXT,
    serie TEXT,
    matiere TEXT,
    coefficient NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1. Ensure ecole_id column exists on critical tables (Redundant but safe)
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

    -- Presences: ensure ecole_id and classe_id exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'presences' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.presences ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'presences' AND column_name = 'classe_id') THEN
        ALTER TABLE public.presences ADD COLUMN classe_id UUID REFERENCES public.classes(id);
    END IF;

    -- Notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.notes ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes' AND column_name = 'evaluation_id') THEN
        ALTER TABLE public.notes ADD COLUMN evaluation_id UUID REFERENCES public.evaluations(id);
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

-- For presences, first ensure classe_id is populated from eleves
UPDATE public.presences p
SET classe_id = e.classe_id
FROM public.eleves e
WHERE p.eleve_id = e.id
AND p.classe_id IS NULL;

-- Then populate ecole_id from eleves (safest link)
UPDATE public.presences p
SET ecole_id = e.ecole_id
FROM public.eleves e
WHERE p.eleve_id = e.id
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
WHERE n.evaluation_id IS NOT NULL 
AND n.evaluation_id = ev.id
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
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Coefficients table might not exist in all installations
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coefficients_officiels') THEN
        ALTER TABLE public.coefficients_officiels ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- 4. Create Helper Functions
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_ecole_id()
RETURNS uuid AS $$
  SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. Create RLS Policies

-- === ECOLES ===
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.ecoles;
CREATE POLICY "Enable insert for authenticated users" ON public.ecoles
FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.ecoles;
CREATE POLICY "Enable select for authenticated users" ON public.ecoles
FOR SELECT TO authenticated
USING (true);

-- === PROFILES ===
DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
CREATE POLICY "Users can manage own profile" ON public.profiles
FOR ALL TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- === ELEVES ===
DROP POLICY IF EXISTS "Eleves viewable by school staff" ON public.eleves;
CREATE POLICY "Eleves viewable by school staff" ON public.eleves
FOR SELECT TO authenticated
USING (
  ecole_id = public.get_user_ecole_id()
  OR
  -- Fallback for cases where ecole_id might be null but linked to valid class
  classe_id IN (
    SELECT id FROM public.classes WHERE ecole_id = public.get_user_ecole_id()
  )
);

DROP POLICY IF EXISTS "Eleves insertable by director" ON public.eleves;
CREATE POLICY "Eleves insertable by director" ON public.eleves
FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = public.get_user_ecole_id()
);

DROP POLICY IF EXISTS "Eleves editable by director" ON public.eleves;
CREATE POLICY "Eleves editable by director" ON public.eleves
FOR UPDATE TO authenticated
USING (
  public.get_user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = public.get_user_ecole_id()
);

-- === PAIEMENTS ===
DROP POLICY IF EXISTS "Paiements viewable by director" ON public.paiements;
CREATE POLICY "Paiements viewable by director" ON public.paiements
FOR SELECT TO authenticated
USING (
  public.get_user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = public.get_user_ecole_id()
);

DROP POLICY IF EXISTS "Paiements manageable by director" ON public.paiements;
CREATE POLICY "Paiements manageable by director" ON public.paiements
FOR ALL TO authenticated
USING (
  public.get_user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = public.get_user_ecole_id()
);

-- === PRESENCES ===
DROP POLICY IF EXISTS "Presences viewable by staff" ON public.presences;
CREATE POLICY "Presences viewable by staff" ON public.presences
FOR SELECT TO authenticated
USING (
  ecole_id = public.get_user_ecole_id()
);

DROP POLICY IF EXISTS "Presences manageable by staff" ON public.presences;
CREATE POLICY "Presences manageable by staff" ON public.presences
FOR ALL TO authenticated
USING (
  ecole_id = public.get_user_ecole_id()
  AND (
    public.get_user_role() IN ('directeur', 'director', 'admin')
    OR
    (public.get_user_role() = 'professeur' AND classe_id IN (
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
  ecole_id = public.get_user_ecole_id()
);

DROP POLICY IF EXISTS "Classes manageable by director" ON public.classes;
CREATE POLICY "Classes manageable by director" ON public.classes
FOR ALL TO authenticated
USING (
  public.get_user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = public.get_user_ecole_id()
);

-- === ENSEIGNEMENTS ===
DROP POLICY IF EXISTS "Enseignements viewable by staff" ON public.enseignements;
CREATE POLICY "Enseignements viewable by staff" ON public.enseignements
FOR SELECT TO authenticated
USING (
  classe_id IN (SELECT id FROM public.classes WHERE ecole_id = public.get_user_ecole_id())
);

DROP POLICY IF EXISTS "Enseignements manageable by director" ON public.enseignements;
CREATE POLICY "Enseignements manageable by director" ON public.enseignements
FOR ALL TO authenticated
USING (
  public.get_user_role() IN ('directeur', 'director', 'admin')
  AND
  classe_id IN (SELECT id FROM public.classes WHERE ecole_id = public.get_user_ecole_id())
);

-- === MATIERES ===
DROP POLICY IF EXISTS "Matieres viewable by staff" ON public.matieres;
CREATE POLICY "Matieres viewable by staff" ON public.matieres
FOR SELECT TO authenticated
USING (
  ecole_id = public.get_user_ecole_id()
);

DROP POLICY IF EXISTS "Matieres manageable by director" ON public.matieres;
CREATE POLICY "Matieres manageable by director" ON public.matieres
FOR ALL TO authenticated
USING (
  public.get_user_role() IN ('directeur', 'director', 'admin')
  AND
  ecole_id = public.get_user_ecole_id()
);

-- === EVALUATIONS ===
DROP POLICY IF EXISTS "Evaluations viewable by staff" ON public.evaluations;
CREATE POLICY "Evaluations viewable by staff" ON public.evaluations
FOR SELECT TO authenticated
USING (
  ecole_id = public.get_user_ecole_id()
);

DROP POLICY IF EXISTS "Evaluations manageable by staff" ON public.evaluations;
CREATE POLICY "Evaluations manageable by staff" ON public.evaluations
FOR ALL TO authenticated
USING (
  ecole_id = public.get_user_ecole_id()
  AND (
    public.get_user_role() IN ('directeur', 'director', 'admin')
    OR
    (public.get_user_role() = 'professeur' AND classe_id IN (
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
  ecole_id = public.get_user_ecole_id()
);

DROP POLICY IF EXISTS "Notes manageable by staff" ON public.notes;
CREATE POLICY "Notes manageable by staff" ON public.notes
FOR ALL TO authenticated
USING (
  ecole_id = public.get_user_ecole_id()
  AND (
    public.get_user_role() IN ('directeur', 'director', 'admin')
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

-- === COEFFICIENTS ===
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coefficients_officiels') THEN
        DROP POLICY IF EXISTS "Read access for official coefficients" ON public.coefficients_officiels;
        CREATE POLICY "Read access for official coefficients" ON public.coefficients_officiels
        FOR SELECT TO authenticated
        USING (true);
    END IF;
END $$;

-- 6. REGISTRATION TRIGGER (Handles new user creation)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_ecole_id UUID;
  school_name TEXT;
  user_role TEXT;
  is_approved BOOLEAN;
BEGIN
  -- Check metadata
  school_name := new.raw_user_meta_data->>'ecole_nom';
  IF school_name IS NULL OR school_name = '' THEN
    school_name := 'École de ' || new.email;
  END IF;

  -- Default role logic
  IF new.email = 'mbayeadama669@gmail.com' THEN
    user_role := 'super_admin';
    is_approved := TRUE;
  ELSE
    user_role := 'pending_director';
    is_approved := FALSE;
  END IF;

  -- Create School
  INSERT INTO public.ecoles (nom, active)
  VALUES (school_name, TRUE)
  RETURNING id INTO new_ecole_id;

  -- Create Profile
  INSERT INTO public.profiles (id, email, role, ecole_id, is_approved, full_name)
  VALUES (
    new.id, 
    new.email, 
    user_role, 
    new_ecole_id, 
    is_approved,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erreur dans handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
