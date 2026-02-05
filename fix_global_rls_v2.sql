-- Script de réparation globale V2 (FINAL - CORRIGÉ)
-- Ce script corrige TOUTES les permissions (RLS) et la STRUCTURE de la base de données.
-- Il résout spécifiquement :
-- 1. L'erreur "coefficients_officiels.ecole_id does not exist"
-- 2. Le blocage du bouton de sauvegarde (dû à l'erreur SQL)
-- 3. Les permissions de création de classes/matières

-- =============================================================================
-- 0. VÉRIFICATION ET CRÉATION DES COLONNES MANQUANTES
-- =============================================================================

-- Table: coefficients_officiels (Ajout ecole_id)
CREATE TABLE IF NOT EXISTS public.coefficients_officiels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    niveau TEXT,
    serie TEXT,
    matiere TEXT,
    valeur_coef NUMERIC DEFAULT 1,
    cycle TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ 
BEGIN
    -- =================================================================
    -- A. CORRECTIFS TABLE ECOLES (Manque de colonnes = Erreur 400)
    -- =================================================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecoles' AND column_name = 'adresse') THEN
        ALTER TABLE public.ecoles ADD COLUMN adresse TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecoles' AND column_name = 'email') THEN
        ALTER TABLE public.ecoles ADD COLUMN email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecoles' AND column_name = 'telephone') THEN
        ALTER TABLE public.ecoles ADD COLUMN telephone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecoles' AND column_name = 'couleur') THEN
        ALTER TABLE public.ecoles ADD COLUMN couleur TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecoles' AND column_name = 'note_max') THEN
        ALTER TABLE public.ecoles ADD COLUMN note_max INTEGER DEFAULT 20;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ecoles' AND column_name = 'heure_limite') THEN
        ALTER TABLE public.ecoles ADD COLUMN heure_limite TEXT DEFAULT '08:00';
    END IF;

    -- =================================================================
    -- B. CORRECTIFS AUTRES TABLES
    -- =================================================================

    -- Ajout ecole_id sur coefficients_officiels
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coefficients_officiels' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.coefficients_officiels ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE;
    END IF;

    -- Ajout serie sur coefficients_officiels (FIX: erreur rapportée)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coefficients_officiels' AND column_name = 'serie') THEN
        ALTER TABLE public.coefficients_officiels ADD COLUMN serie TEXT;
    END IF;

    -- Ajout cycle sur coefficients_officiels (Safety check)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coefficients_officiels' AND column_name = 'cycle') THEN
        ALTER TABLE public.coefficients_officiels ADD COLUMN cycle TEXT;
    END IF;

    -- Ajout ecole_id sur matieres (juste au cas où)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matieres' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.matieres ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE;
    END IF;
    
    -- Ajout ecole_id sur evaluations (juste au cas où)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluations' AND column_name = 'ecole_id') THEN
        ALTER TABLE public.evaluations ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE;
    END IF;
END $$;


-- =============================================================================
-- 1. FONCTIONS UTILITAIRES DE SÉCURITÉ (PUBLIC)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_ecole_id()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN (SELECT ecole_id FROM public.profiles WHERE id = auth.uid());
END;
$$;

-- =============================================================================
-- 2. TABLE ECOLES (Paramètres)
-- =============================================================================
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Directeurs update own school" ON public.ecoles;
CREATE POLICY "Directeurs update own school" ON public.ecoles
    FOR UPDATE
    USING (id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin')
    WITH CHECK (id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Ecoles readable by members" ON public.ecoles;
CREATE POLICY "Ecoles readable by members" ON public.ecoles
    FOR SELECT
    USING (id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.ecoles;
CREATE POLICY "Enable insert for authenticated users" ON public.ecoles
    FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================================================
-- 3. TABLE CLASSES
-- =============================================================================
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "See classes from own school" ON public.classes;
CREATE POLICY "See classes from own school" ON public.classes
    FOR SELECT
    USING (ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Director manage classes" ON public.classes;
CREATE POLICY "Director manage classes" ON public.classes
    FOR ALL
    USING (
        (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND ecole_id = public.get_user_ecole_id())
    );

-- =============================================================================
-- 4. TABLE ELEVES
-- =============================================================================
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View eleves own school" ON public.eleves;
CREATE POLICY "View eleves own school" ON public.eleves
    FOR SELECT
    USING (ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Director manage eleves" ON public.eleves;
CREATE POLICY "Director manage eleves" ON public.eleves
    FOR ALL
    USING (
        (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND ecole_id = public.get_user_ecole_id())
    );

-- =============================================================================
-- 5. TABLE PAIEMENTS
-- =============================================================================
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View payments own school" ON public.paiements;
CREATE POLICY "View payments own school" ON public.paiements
    FOR SELECT
    USING (
        public.get_user_role() = 'super_admin' OR
        ecole_id = public.get_user_ecole_id() OR
        EXISTS (SELECT 1 FROM public.eleves e WHERE e.id = paiements.eleve_id AND e.ecole_id = public.get_user_ecole_id())
    );

DROP POLICY IF EXISTS "Director manage payments" ON public.paiements;
CREATE POLICY "Director manage payments" ON public.paiements
    FOR ALL
    USING (
        public.get_user_role() = 'super_admin' OR
        (public.get_user_role() IN ('directeur', 'director', 'admin') AND ecole_id = public.get_user_ecole_id())
    );

-- =============================================================================
-- 6. MATIERES & ENSEIGNEMENTS
-- =============================================================================
ALTER TABLE public.matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enseignements ENABLE ROW LEVEL SECURITY;

-- Matieres
DROP POLICY IF EXISTS "Matieres viewable by staff" ON public.matieres;
CREATE POLICY "Matieres viewable by staff" ON public.matieres FOR SELECT USING (ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Matieres manageable by director" ON public.matieres;
CREATE POLICY "Matieres manageable by director" ON public.matieres FOR ALL USING (
    (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND ecole_id = public.get_user_ecole_id())
);

-- Enseignements
DROP POLICY IF EXISTS "Enseignements viewable by staff" ON public.enseignements;
CREATE POLICY "Enseignements viewable by staff" ON public.enseignements FOR SELECT USING (
    classe_id IN (SELECT id FROM public.classes WHERE ecole_id = public.get_user_ecole_id()) OR public.get_user_role() = 'super_admin'
);

DROP POLICY IF EXISTS "Enseignements manageable by director" ON public.enseignements;
CREATE POLICY "Enseignements manageable by director" ON public.enseignements FOR ALL USING (
    (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND 
     classe_id IN (SELECT id FROM public.classes WHERE ecole_id = public.get_user_ecole_id()))
);

-- =============================================================================
-- 7. EVALUATIONS & NOTES
-- =============================================================================
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Evaluations
DROP POLICY IF EXISTS "Evaluations viewable by staff" ON public.evaluations;
CREATE POLICY "Evaluations viewable by staff" ON public.evaluations FOR SELECT USING (ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Evaluations manageable by staff" ON public.evaluations;
CREATE POLICY "Evaluations manageable by staff" ON public.evaluations FOR ALL USING (
    (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND ecole_id = public.get_user_ecole_id()) OR
    (public.get_user_role() = 'professeur' AND ecole_id = public.get_user_ecole_id())
);

-- Notes
DROP POLICY IF EXISTS "Notes viewable by staff" ON public.notes;
CREATE POLICY "Notes viewable by staff" ON public.notes FOR SELECT USING (ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Notes manageable by staff" ON public.notes;
CREATE POLICY "Notes manageable by staff" ON public.notes FOR ALL USING (
    (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND ecole_id = public.get_user_ecole_id()) OR
    (public.get_user_role() = 'professeur' AND ecole_id = public.get_user_ecole_id())
);

-- =============================================================================
-- 8. PRESENCES
-- =============================================================================
ALTER TABLE public.presences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Presences viewable by staff" ON public.presences;
CREATE POLICY "Presences viewable by staff" ON public.presences FOR SELECT USING (ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Presences manageable by staff" ON public.presences;
CREATE POLICY "Presences manageable by staff" ON public.presences FOR ALL USING (
    (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND ecole_id = public.get_user_ecole_id()) OR
    (public.get_user_role() = 'professeur' AND ecole_id = public.get_user_ecole_id())
);

-- =============================================================================
-- 9. COEFFICIENTS OFFICIELS (La correction principale)
-- =============================================================================
ALTER TABLE public.coefficients_officiels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coefficients viewable by staff" ON public.coefficients_officiels;
CREATE POLICY "Coefficients viewable by staff" ON public.coefficients_officiels
    FOR SELECT
    USING (ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin');

DROP POLICY IF EXISTS "Coefficients manageable by director" ON public.coefficients_officiels;
CREATE POLICY "Coefficients manageable by director" ON public.coefficients_officiels
    FOR ALL
    USING (
        (public.get_user_role() IN ('directeur', 'director', 'admin', 'super_admin') AND ecole_id = public.get_user_ecole_id())
    );

-- =============================================================================
-- 10. PROFILES
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
CREATE POLICY "Users can manage own profile" ON public.profiles
    FOR ALL
    USING (auth.uid() = id OR public.get_user_role() = 'super_admin')
    WITH CHECK (auth.uid() = id OR public.get_user_role() = 'super_admin');
