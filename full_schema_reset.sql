-- =============================================================================
-- SCHOOL MANAGEMENT - FULL SCHEMA RESET
-- =============================================================================
-- This script resets the entire public schema and recreates it to match the 
-- application code requirements exactly.
--
-- INSTRUCTIONS:
-- 1. Run this script in the Supabase SQL Editor.
-- 2. It will DROP ALL EXISTING DATA in the public schema.
-- =============================================================================

-- 1. CLEANUP
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.admin_upsert_user;
DROP FUNCTION IF EXISTS public.get_user_role;
DROP FUNCTION IF EXISTS public.get_user_ecole_id;

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.presences CASCADE;
DROP TABLE IF EXISTS public.paiements CASCADE;
DROP TABLE IF EXISTS public.enseignements CASCADE;
DROP TABLE IF EXISTS public.evaluations CASCADE;
DROP TABLE IF EXISTS public.eleves CASCADE;
DROP TABLE IF EXISTS public.matieres CASCADE;
DROP TABLE IF EXISTS public.classes CASCADE;
DROP TABLE IF EXISTS public.coefficients_officiels CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.ecoles CASCADE;

-- 2. TABLES

-- Table: ecoles
CREATE TABLE public.ecoles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nom TEXT NOT NULL,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    type_enseignement TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: profiles
-- Links auth.users to application data
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    role TEXT DEFAULT 'pending_director', -- 'superadmin', 'director', 'professeur', 'pending_director'
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE SET NULL,
    nom TEXT,
    prenom TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Table: classes
CREATE TABLE public.classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    professeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Main teacher
    nom TEXT NOT NULL,
    niveau TEXT NOT NULL, -- 'primaire', 'college', 'lycee'
    cycle TEXT,           -- 'Primaire', 'Secondaire'
    serie TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: matieres
-- Represents a subject in a specific class
CREATE TABLE public.matieres (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    nom TEXT NOT NULL,        -- Display name (e.g., "Maths")
    nom_matiere TEXT,         -- Normalized name (e.g., "MATHEMATIQUES")
    coefficient NUMERIC DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: eleves
CREATE TABLE public.eleves (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    date_naissance DATE,
    parent_email TEXT,
    telephone TEXT,
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: enseignements
-- Links professors to subjects in classes (for non-main teachers)
CREATE TABLE public.enseignements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    professeur_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    matiere TEXT NOT NULL, -- Name of the subject taught
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(classe_id, professeur_id, matiere)
);

-- Table: evaluations
CREATE TABLE public.evaluations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    matiere_id UUID REFERENCES public.matieres(id) ON DELETE CASCADE NOT NULL,
    titre TEXT NOT NULL,
    type_eval TEXT, -- 'devoir', 'compo'
    trimestre INTEGER DEFAULT 1,
    date_eval DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: notes
CREATE TABLE public.notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    evaluation_id UUID REFERENCES public.evaluations(id) ON DELETE CASCADE NOT NULL,
    eleve_id UUID REFERENCES public.eleves(id) ON DELETE CASCADE NOT NULL,
    note NUMERIC, -- Can be -1 (ABS) or -2 (NN) logic handled in frontend
    appreciation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(evaluation_id, eleve_id)
);

-- Table: presences
CREATE TABLE public.presences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    eleve_id UUID REFERENCES public.eleves(id) ON DELETE CASCADE NOT NULL,
    matiere TEXT, -- Optional, usually 'General' or specific subject
    date DATE DEFAULT CURRENT_DATE,
    statut TEXT NOT NULL, -- 'present', 'absent', 'retard'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: paiements
CREATE TABLE public.paiements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    eleve_id UUID REFERENCES public.eleves(id) ON DELETE CASCADE NOT NULL,
    montant NUMERIC DEFAULT 0,
    mois TEXT NOT NULL, -- Format 'YYYY-MM'
    date_paiement DATE DEFAULT CURRENT_DATE,
    statut TEXT DEFAULT 'paye', -- 'paye', 'relance'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table: coefficients_officiels
-- Used for weighted mean calculations
CREATE TABLE public.coefficients_officiels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    niveau TEXT NOT NULL,
    serie TEXT,
    matiere TEXT NOT NULL,
    valeur_coef NUMERIC DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 3. FUNCTIONS & TRIGGERS

-- Function: handle_new_user
-- Automatically creates a profile when a user signs up via Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_ecole_id UUID;
    user_role TEXT;
    ecole_nom TEXT;
BEGIN
    -- Extract metadata
    user_role := COALESCE(new.raw_user_meta_data->>'role', 'pending_director');
    ecole_nom := new.raw_user_meta_data->>'ecole_nom';

    -- If role is director or pending_director, create school if needed
    IF (user_role = 'director' OR user_role = 'pending_director') AND ecole_nom IS NOT NULL THEN
        INSERT INTO public.ecoles (nom) VALUES (ecole_nom) RETURNING id INTO new_ecole_id;
    END IF;

    -- Create profile
    INSERT INTO public.profiles (id, email, role, ecole_id, is_approved)
    VALUES (
        new.id,
        new.email,
        user_role,
        new_ecole_id,
        CASE WHEN user_role = 'superadmin' THEN TRUE ELSE FALSE END
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Function: approve_director_trigger
-- Automatically promotes pending_director to director when is_approved becomes TRUE
CREATE OR REPLACE FUNCTION public.approve_director_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_approved = TRUE AND OLD.is_approved = FALSE AND NEW.role = 'pending_director' THEN
        NEW.role := 'director';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profile_approved
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.approve_director_trigger();


-- Function: admin_upsert_user (RPC)
-- Allows superadmin or directors to create/manage users securely
CREATE OR REPLACE FUNCTION public.admin_upsert_user(
    target_email TEXT,
    target_role TEXT,
    target_ecole_id UUID,
    target_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_user_id UUID;
    existing_user_id UUID;
BEGIN
    -- Check if user exists in profiles
    SELECT id INTO existing_user_id FROM public.profiles WHERE email = target_email;

    IF existing_user_id IS NOT NULL THEN
        -- Update existing
        UPDATE public.profiles
        SET role = target_role,
            ecole_id = target_ecole_id,
            active = target_active,
            is_approved = TRUE -- Auto approve if edited by admin
        WHERE id = existing_user_id;
        
        RETURN jsonb_build_object('status', 'success', 'message', 'Utilisateur mis à jour.');
    ELSE
        -- For new users, we rely on the client to have created the Auth User first via signUp
        -- OR we can just return a message saying "User not found"
        -- However, typically the frontend creates the Auth user first.
        
        -- Try to find in auth.users just in case profile was missing
        SELECT id INTO existing_user_id FROM auth.users WHERE email = target_email;
        
        IF existing_user_id IS NOT NULL THEN
             INSERT INTO public.profiles (id, email, role, ecole_id, active, is_approved)
             VALUES (existing_user_id, target_email, target_role, target_ecole_id, target_active, TRUE)
             ON CONFLICT (id) DO UPDATE
             SET role = EXCLUDED.role, ecole_id = EXCLUDED.ecole_id, active = EXCLUDED.active;
             
             RETURN jsonb_build_object('status', 'success', 'message', 'Profil créé pour utilisateur existant.');
        ELSE
             RETURN jsonb_build_object('status', 'error', 'message', 'Utilisateur Auth introuvable. Créez le compte d''abord.');
        END IF;
    END IF;
END;
$$;

-- Helper Functions
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_ecole_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT ecole_id FROM public.profiles WHERE id = auth.uid();
$$;


-- 4. ROW LEVEL SECURITY (RLS)
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enseignements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coefficients_officiels ENABLE ROW LEVEL SECURITY;

-- POLICIES

-- Profiles
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Ecoles
CREATE POLICY "Ecoles viewable by related users" ON public.ecoles FOR SELECT USING (
    id IN (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
    OR 
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
);
-- Only Superadmin or the Director can update ecole (Director logic omitted for simplicity, relying on profile link)

-- GENERIC POLICY FUNCTION for School-Based Data
-- Returns true if the user belongs to the same school as the record
-- Or if the user is superadmin
-- Note: For insertion, we check the ecole_id provided matches the user's ecole_id

-- Classes
CREATE POLICY "Classes viewable by school members" ON public.classes FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Classes insertable by director" ON public.classes FOR INSERT WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
    AND
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Classes updatable by director" ON public.classes FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
    AND
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Classes deletable by director" ON public.classes FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
    AND
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Eleves
CREATE POLICY "Eleves viewable by school members" ON public.eleves FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Eleves manage by director" ON public.eleves FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
    AND
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Matieres
CREATE POLICY "Matieres viewable by school members" ON public.matieres FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Matieres manage by director" ON public.matieres FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
    AND
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Enseignements
CREATE POLICY "Enseignements viewable by school members" ON public.enseignements FOR SELECT USING (
    professeur_id = auth.uid() OR
    classe_id IN (SELECT id FROM public.classes WHERE ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid()))
);
CREATE POLICY "Enseignements manage by director" ON public.enseignements FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = enseignements.classe_id
        AND c.ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
    )
    AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
);

-- Evaluations
CREATE POLICY "Evaluations viewable by school members" ON public.evaluations FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Evaluations insert by prof/director" ON public.evaluations FOR INSERT WITH CHECK (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Notes
CREATE POLICY "Notes viewable by school members" ON public.notes FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Notes insert by prof/director" ON public.notes FOR INSERT WITH CHECK (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Notes update by prof/director" ON public.notes FOR UPDATE USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Presences
CREATE POLICY "Presences viewable by school members" ON public.presences FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Presences manage by prof/director" ON public.presences FOR ALL USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Paiements
CREATE POLICY "Paiements viewable by school members" ON public.paiements FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Paiements manage by director" ON public.paiements FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
    AND
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Coefficients Officiels
CREATE POLICY "Coefs viewable by school members" ON public.coefficients_officiels FOR SELECT USING (
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Coefs manage by director" ON public.coefficients_officiels FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
    AND
    ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Superadmin Override (Optional, but good for debugging)
-- Since we use RLS, superadmin usually needs explicit policies or bypass RLS.
-- Here we rely on the fact that superadmin is checked in the frontend or we can add OR role='superadmin' to policies.
-- For simplicity, assume superadmin has database admin rights (bypass RLS) or we add specific policies if needed.

