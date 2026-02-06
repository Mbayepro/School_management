-- SCRIPT DE RÉPARATION FINALE (V3)
-- Ce script corrige TOUS les problèmes bloquants signalés :
-- 1. Erreur "column updated_at does not exist" (Ajout global)
-- 2. Mise à jour automatique du rôle 'pending_director' -> 'director' après approbation
-- 3. Permissions Super Admin manquantes
-- 4. Erreurs de création de classes/matières

-- =============================================================================
-- 1. CORRECTION GLOBALE : COLONNE UPDATED_AT
-- =============================================================================
-- Cette fonction met à jour automatiquement la date de modification
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Macro pour ajouter updated_at et le trigger sur une table si manquant
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY['ecoles', 'classes', 'matieres', 'profiles', 'eleves', 'enseignements', 'evaluations', 'notes', 'paiements', 'coefficients_officiels'];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        -- 1. Ajouter la colonne updated_at si elle n'existe pas
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'updated_at') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()', t);
        END IF;

        -- 2. Créer le trigger de mise à jour automatique
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = format('set_timestamp_%s', t)) THEN
            EXECUTE format('
                CREATE TRIGGER set_timestamp_%s
                BEFORE UPDATE ON public.%I
                FOR EACH ROW
                EXECUTE PROCEDURE public.handle_updated_at();
            ', t, t);
        END IF;
    END LOOP;
END $$;


-- =============================================================================
-- 2. CORRECTION APPROBATION DIRECTEUR (Trigger Automatique)
-- =============================================================================
-- Dès que 'is_approved' passe à true, on change le rôle en 'director'
CREATE OR REPLACE FUNCTION public.auto_approve_director()
RETURNS TRIGGER AS $$
BEGIN
    -- Si l'utilisateur est approuvé et qu'il est encore en 'pending_director'
    IF NEW.is_approved = true AND OLD.role = 'pending_director' THEN
        NEW.role := 'director';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_director_approval ON public.profiles;
CREATE TRIGGER on_director_approval
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.auto_approve_director();


-- =============================================================================
-- 3. CORRECTION DES DROITS SUPER ADMIN (Bypass Total)
-- =============================================================================
-- Le Super Admin doit pouvoir TOUT faire, partout.

-- Fonction utilitaire pour vérifier si on est super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'super_admin'
    );
END;
$$;

-- Application des policies "Tout permis" pour le Super Admin sur toutes les tables
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY['ecoles', 'classes', 'matieres', 'profiles', 'eleves', 'enseignements', 'evaluations', 'notes', 'paiements', 'coefficients_officiels'];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        -- Supprimer l'ancienne policy si elle existe (conflit de nom possible)
        EXECUTE format('DROP POLICY IF EXISTS "Super Admin All Access %s" ON public.%I', t, t);
        
        -- Créer une nouvelle policy prioritaire
        -- Note: Postgres applique les policies en OR. Si une policy dit OUI, c'est OUI.
        EXECUTE format('
            CREATE POLICY "Super Admin All Access %s" ON public.%I
            FOR ALL
            USING (public.is_super_admin())
            WITH CHECK (public.is_super_admin());
        ', t, t);
    END LOOP;
END $$;


-- =============================================================================
-- 4. VERIFICATIONS FINALES (Colonnes critiques manquantes)
-- =============================================================================

-- Table ECOLES
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS note_max INTEGER DEFAULT 20;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS heure_limite TEXT DEFAULT '08:00';
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS couleur TEXT DEFAULT '#2563eb';
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS telephone TEXT;

-- Table COEFFICIENTS_OFFICIELS
ALTER TABLE public.coefficients_officiels ADD COLUMN IF NOT EXISTS serie TEXT;
ALTER TABLE public.coefficients_officiels ADD COLUMN IF NOT EXISTS cycle TEXT;
ALTER TABLE public.coefficients_officiels ADD COLUMN IF NOT EXISTS ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE;

-- Table MATIERES
ALTER TABLE public.matieres ADD COLUMN IF NOT EXISTS ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE;

-- Table CLASSES
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS cycle TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS serie TEXT;
