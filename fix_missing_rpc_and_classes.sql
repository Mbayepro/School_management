-- Script de correction final pour les erreurs RPC et la création de classes
-- 1. Création de la fonction manquante 'admin_upsert_user'
-- 2. Correction des politiques de sécurité (RLS) pour les classes
-- 3. Garantie de l'accès aux profils

-- =============================================================================
-- 1. FONCTION RPC: admin_upsert_user
-- Cette fonction est appelée par le panneau Super Admin pour créer/modifier un directeur
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
    target_email TEXT,
    target_role TEXT,
    target_ecole_id UUID DEFAULT NULL,
    target_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Nécessaire pour accéder à auth.users et bypasser RLS
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    target_uid UUID;
    final_ecole_id UUID;
    user_full_name TEXT;
BEGIN
    -- 1. Trouver l'utilisateur dans auth.users (source de vérité)
    SELECT id, raw_user_meta_data->>'full_name' 
    INTO target_uid, user_full_name
    FROM auth.users 
    WHERE email = target_email;
    
    IF target_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Utilisateur introuvable. Veuillez créer le compte d''abord (Sign Up).');
    END IF;

    -- 2. Gestion de l'École (Création auto si Directeur sans école)
    final_ecole_id := target_ecole_id;
    
    IF final_ecole_id IS NULL AND target_role IN ('directeur', 'director') THEN
        -- Vérifier si le profil a déjà une école
        BEGIN
            SELECT ecole_id INTO final_ecole_id FROM public.profiles WHERE id = target_uid;
        EXCEPTION WHEN OTHERS THEN
            final_ecole_id := NULL;
        END;
        
        -- Si toujours null, créer une nouvelle école
        IF final_ecole_id IS NULL THEN
            INSERT INTO public.ecoles (nom, active)
            VALUES ('École de ' || target_email, TRUE)
            RETURNING id INTO final_ecole_id;
        END IF;
    END IF;

    -- 3. Upsert (Insertion ou Mise à jour) du Profil
    -- Cela corrige le problème "Compte non activé" si le profil était manquant
    INSERT INTO public.profiles (id, email, role, ecole_id, is_approved, full_name, updated_at)
    VALUES (
        target_uid, 
        target_email, 
        target_role, 
        final_ecole_id, 
        target_active, 
        COALESCE(user_full_name, target_email),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        role = EXCLUDED.role,
        ecole_id = COALESCE(EXCLUDED.ecole_id, public.profiles.ecole_id),
        is_approved = EXCLUDED.is_approved,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Profil mis à jour avec succès.',
        'user_id', target_uid,
        'ecole_id', final_ecole_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Erreur interne RPC: ' || SQLERRM);
END;
$$;

-- =============================================================================
-- 2. CORRECTION RLS CLASSES
-- S'assurer que les directeurs peuvent créer des classes
-- =============================================================================

-- S'assurer que les fonctions helper sont bien définies (Idempotent)
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

-- Mise à jour de la politique INSERT pour les classes
DROP POLICY IF EXISTS "Directeurs can manage classes" ON public.classes;
DROP POLICY IF EXISTS "allow_director_class_management" ON public.classes;

CREATE POLICY "allow_director_class_management" ON public.classes
    FOR ALL
    USING (
        (public.get_user_role() IN ('directeur', 'director') AND ecole_id = public.get_user_ecole_id())
        OR
        (public.get_user_role() = 'super_admin')
    )
    WITH CHECK (
        (public.get_user_role() IN ('directeur', 'director') AND ecole_id = public.get_user_ecole_id())
        OR
        (public.get_user_role() = 'super_admin')
    );

-- =============================================================================
-- 3. PERMISSIONS ADDITIONNELLES
-- =============================================================================
-- Accès à la table ecoles pour la lecture (nécessaire pour le login et dashboard)
DROP POLICY IF EXISTS "Ecoles readable by members" ON public.ecoles;
CREATE POLICY "Ecoles readable by members" ON public.ecoles
    FOR SELECT
    USING (
        id = public.get_user_ecole_id() OR public.get_user_role() = 'super_admin'
    );

-- Accès à la table profiles (lecture propre profil)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Accès update pour Super Admin sur profiles (déjà géré via RPC, mais au cas où accès direct)
DROP POLICY IF EXISTS "Super Admin manage all profiles" ON public.profiles;
CREATE POLICY "Super Admin manage all profiles" ON public.profiles
    FOR ALL
    USING (public.get_user_role() = 'super_admin');
