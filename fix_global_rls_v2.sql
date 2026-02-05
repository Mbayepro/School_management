-- Script de réparation globale pour les problèmes de données et de permissions (RLS)
-- Ce script doit être exécuté par un administrateur ou directement dans l'interface SQL de Supabase

-- =============================================================================
-- 1. FONCTIONS UTILITAIRES DE SÉCURITÉ (PUBLIC)
-- S'assurer qu'elles existent et sont accessibles
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
-- 2. RÉPARATION DE LA TABLE ECOLES (Permissions UPDATE)
-- Permet aux directeurs de modifier les paramètres de LEUR école
-- =============================================================================
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Directeurs update own school" ON public.ecoles;
CREATE POLICY "Directeurs update own school" ON public.ecoles
    FOR UPDATE
    USING (
        id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin'
    )
    WITH CHECK (
        id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin'
    );

-- Lecture publique ou restreinte (pour l'affichage)
DROP POLICY IF EXISTS "Ecoles readable by members" ON public.ecoles;
CREATE POLICY "Ecoles readable by members" ON public.ecoles
    FOR SELECT
    USING (
        id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin'
    );

-- =============================================================================
-- 3. RÉPARATION DE LA TABLE CLASSES (Permissions SELECT/INSERT)
-- Résout le problème "0 classes" et "création impossible"
-- =============================================================================
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Lecture : Un utilisateur ne voit que les classes de SON école
DROP POLICY IF EXISTS "See classes from own school" ON public.classes;
CREATE POLICY "See classes from own school" ON public.classes
    FOR SELECT
    USING (
        ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin'
    );

-- Écriture : Un directeur peut créer/modifier/supprimer des classes dans SON école
DROP POLICY IF EXISTS "Director manage classes" ON public.classes;
CREATE POLICY "Director manage classes" ON public.classes
    FOR ALL
    USING (
        (public.get_user_role() IN ('directeur', 'director') AND ecole_id = public.get_user_ecole_id())
        OR public.get_user_role() = 'super_admin'
    );

-- =============================================================================
-- 4. RÉPARATION DES PAIEMENTS (Visibilité)
-- =============================================================================
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View payments own school" ON public.paiements;
CREATE POLICY "View payments own school" ON public.paiements
    FOR SELECT
    USING (
        -- Soit on est admin, soit le paiement est lié à un élève de notre école
        public.get_user_role() = 'super_admin' OR
        EXISTS (
            SELECT 1 FROM public.eleves e
            WHERE e.id = paiements.eleve_id
            AND e.ecole_id = public.get_user_ecole_id()
        )
    );

DROP POLICY IF EXISTS "Director manage payments" ON public.paiements;
CREATE POLICY "Director manage payments" ON public.paiements
    FOR ALL
    USING (
        public.get_user_role() = 'super_admin' OR
        EXISTS (
            SELECT 1 FROM public.eleves e
            WHERE e.id = paiements.eleve_id
            AND e.ecole_id = public.get_user_ecole_id()
        )
    );

-- =============================================================================
-- 5. RÉPARATION DES ÉLÈVES (Visibilité pour Paiements/Notes)
-- =============================================================================
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View eleves own school" ON public.eleves;
CREATE POLICY "View eleves own school" ON public.eleves
    FOR SELECT
    USING (
        ecole_id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin'
    );

DROP POLICY IF EXISTS "Director manage eleves" ON public.eleves;
CREATE POLICY "Director manage eleves" ON public.eleves
    FOR ALL
    USING (
        (public.get_user_role() IN ('directeur', 'director') AND ecole_id = public.get_user_ecole_id())
        OR public.get_user_role() = 'super_admin'
    );

-- =============================================================================
-- 6. DIAGNOSTIC ET NETTOYAGE DES DONNÉES ORPHELINES
-- Si l'utilisateur actuel est directeur mais a des données sans ecole_id
-- =============================================================================

-- Cette procédure stockée peut être appelée manuellement si besoin : SELECT public.fix_orphan_data();
CREATE OR REPLACE FUNCTION public.fix_orphan_data()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_ecole_id UUID;
    fixed_classes INT;
    fixed_eleves INT;
BEGIN
    current_ecole_id := public.get_user_ecole_id();
    
    IF current_ecole_id IS NULL THEN
        RETURN 'Aucune école associée à cet utilisateur.';
    END IF;

    -- Lier les classes orphelines créées par cet utilisateur (si on pouvait tracer l'auteur, mais ici on suppose ecole_id null)
    -- Attention: c'est risqué de tout update sans filtre auteur, mais pour un MVP mono-utilisateur par école ça passe.
    -- Mieux : on ne touche que si on est sûr. Ici on va s'abstenir d'update automatique de masse pour éviter de voler les données d'autres.
    
    RETURN 'Utilisez les fonctions de l''interface pour lier les données.';
END;
$$;
