-- SECURITY AUDIT & FIX SCRIPT
-- Ce script réinitialise et renforce la sécurité (RLS) pour toutes les tables critiques.
-- Il permet d'éviter les erreurs "new row violates row-level security policy".

-- =============================================================================
-- 1. ECOLES
-- =============================================================================
ALTER TABLE IF EXISTS public.ecoles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.ecoles;
DROP POLICY IF EXISTS "Directors can update own school" ON public.ecoles;
DROP POLICY IF EXISTS "Read own school" ON public.ecoles;

-- Tout utilisateur connecté peut créer une école (Inscription)
CREATE POLICY "Enable insert for authenticated users" ON public.ecoles
FOR INSERT TO authenticated WITH CHECK (true);

-- Lecture : Tout le monde peut lire (pour l'instant, simplifie les joins, sinon restreindre par ID)
-- Idéalement : auth.uid() linked to this school via profiles, BUT profiles depends on ecoles.
-- Pour éviter la récursion infinie, on autorise la lecture publique des infos de base de l'école
CREATE POLICY "Read access for authenticated" ON public.ecoles
FOR SELECT TO authenticated USING (true);

-- Modification : Uniquement si on est le directeur de cette école (via profile)
CREATE POLICY "Directors can update own school" ON public.ecoles
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.ecole_id = ecoles.id
      AND (profiles.role = 'directeur' OR profiles.role = 'director' OR profiles.role = 'pending_director')
  )
);

-- =============================================================================
-- 2. PROFILES
-- =============================================================================
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super Admin full access" ON public.profiles;
DROP POLICY IF EXISTS "Directors view school profiles" ON public.profiles;

-- Lecture/Modif de son propre profil
CREATE POLICY "Users can manage own profile" ON public.profiles
FOR ALL TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Super Admin voit tout
CREATE POLICY "Super Admin full access" ON public.profiles
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  )
);

-- Directeurs voient les profils de leur école
CREATE POLICY "Directors view school profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- =============================================================================
-- 3. CLASSES
-- =============================================================================
ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School isolation for classes" ON public.classes;

CREATE POLICY "School isolation for classes" ON public.classes
FOR ALL TO authenticated
USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- =============================================================================
-- 4. ELEVES
-- =============================================================================
ALTER TABLE IF EXISTS public.eleves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School isolation for eleves" ON public.eleves;

-- On utilise une jointure avec classes pour vérifier l'école
CREATE POLICY "School isolation for eleves" ON public.eleves
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = eleves.classe_id
      AND p.id = auth.uid()
  )
);

-- =============================================================================
-- 5. MATIERES
-- =============================================================================
ALTER TABLE IF EXISTS public.matieres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School isolation for matieres" ON public.matieres;

CREATE POLICY "School isolation for matieres" ON public.matieres
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = matieres.classe_id
      AND p.id = auth.uid()
  )
);

-- =============================================================================
-- 6. ENSEIGNEMENTS
-- =============================================================================
ALTER TABLE IF EXISTS public.enseignements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School isolation for enseignements" ON public.enseignements;

CREATE POLICY "School isolation for enseignements" ON public.enseignements
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = enseignements.classe_id
      AND p.id = auth.uid()
  )
);

-- =============================================================================
-- 7. NOTES & EVALUATIONS
-- =============================================================================
ALTER TABLE IF EXISTS public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School isolation for evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "School isolation for notes" ON public.notes;

CREATE POLICY "School isolation for evaluations" ON public.evaluations
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.matieres m
    JOIN public.classes c ON c.id = m.classe_id
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE m.id = evaluations.matiere_id
      AND p.id = auth.uid()
  )
);

CREATE POLICY "School isolation for notes" ON public.notes
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.evaluations e
    JOIN public.matieres m ON m.id = e.matiere_id
    JOIN public.classes c ON c.id = m.classe_id
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE e.id = notes.evaluation_id
      AND p.id = auth.uid()
  )
);

-- =============================================================================
-- 8. PRESENCES
-- =============================================================================
ALTER TABLE IF EXISTS public.presences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School isolation for presences" ON public.presences;

CREATE POLICY "School isolation for presences" ON public.presences
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.eleves el
    JOIN public.classes c ON c.id = el.classe_id
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE el.id = presences.eleve_id
      AND p.id = auth.uid()
  )
);

-- =============================================================================
-- 9. COEFFICIENTS & CONFIG
-- =============================================================================
ALTER TABLE IF EXISTS public.coefficients_officiels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read official coefficients" ON public.coefficients_officiels;
DROP POLICY IF EXISTS "Manage official coefficients" ON public.coefficients_officiels;

CREATE POLICY "Read official coefficients" ON public.coefficients_officiels
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage official coefficients" ON public.coefficients_officiels
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

ALTER TABLE IF EXISTS public.school_configurations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "School isolation for config" ON public.school_configurations;

CREATE POLICY "School isolation for config" ON public.school_configurations
FOR ALL TO authenticated
USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
