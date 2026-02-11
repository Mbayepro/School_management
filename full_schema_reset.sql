-- =============================================================================
-- SCHOOL MANAGEMENT - FULL SCHEMA RESET (FINAL V3)
-- =============================================================================
-- INSTRUCTIONS:
-- 1. Copiez tout ce contenu.
-- 2. Exécutez-le dans l'éditeur SQL Supabase.
-- 3. Cela corrigera : "Ecole inconnue", erreurs RLS Admin, et création de classes.
-- =============================================================================

-- 1. NETTOYAGE COMPLET
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.admin_upsert_user CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role CASCADE;
DROP FUNCTION IF EXISTS public.get_user_ecole_id CASCADE;
DROP FUNCTION IF EXISTS public.approve_director_trigger() CASCADE;

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
DROP TABLE IF EXISTS public.school_configurations CASCADE;

-- 2. CRÉATION DES TABLES

CREATE TABLE public.ecoles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nom TEXT NOT NULL,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    type_enseignement TEXT,
    active BOOLEAN DEFAULT TRUE,
    couleur TEXT DEFAULT '#2563eb',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    role TEXT DEFAULT 'pending_director', 
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE SET NULL,
    nom TEXT,
    prenom TEXT,
    is_approved BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    professeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    nom TEXT NOT NULL,
    niveau TEXT NOT NULL,
    cycle TEXT,
    serie TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.matieres (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    nom TEXT NOT NULL,
    nom_matiere TEXT, -- Legacy support
    coefficient NUMERIC DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.eleves (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    date_naissance DATE,
    parent_email TEXT,
    telephone TEXT,
    tel_parent TEXT,
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.enseignements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    professeur_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    matiere TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(classe_id, professeur_id, matiere)
);

CREATE TABLE public.evaluations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    matiere_id UUID REFERENCES public.matieres(id) ON DELETE CASCADE NOT NULL,
    titre TEXT NOT NULL,
    type_eval TEXT,
    trimestre INTEGER DEFAULT 1,
    date_eval DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    evaluation_id UUID REFERENCES public.evaluations(id) ON DELETE CASCADE NOT NULL,
    eleve_id UUID REFERENCES public.eleves(id) ON DELETE CASCADE NOT NULL,
    note NUMERIC,
    appreciation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(evaluation_id, eleve_id)
);

CREATE TABLE public.presences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    eleve_id UUID REFERENCES public.eleves(id) ON DELETE CASCADE NOT NULL,
    matiere TEXT,
    date DATE DEFAULT CURRENT_DATE,
    statut TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.paiements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    eleve_id UUID REFERENCES public.eleves(id) ON DELETE CASCADE NOT NULL,
    montant NUMERIC DEFAULT 0,
    mois TEXT NOT NULL,
    date_paiement DATE DEFAULT CURRENT_DATE,
    statut TEXT DEFAULT 'paye',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.coefficients_officiels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL,
    niveau TEXT NOT NULL,
    cycle TEXT, -- Ajouté pour compatibilité
    serie TEXT,
    matiere TEXT NOT NULL,
    valeur_coef NUMERIC DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.school_configurations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    note_max NUMERIC DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. FONCTIONS CRITIQUES

-- Trigger: Création automatique Ecole/Profil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_ecole_id UUID;
    user_role TEXT;
    ecole_nom TEXT;
BEGIN
    user_role := COALESCE(new.raw_user_meta_data->>'role', 'pending_director');
    ecole_nom := new.raw_user_meta_data->>'ecole_nom';

    -- Fallback si nom école vide
    IF ecole_nom IS NULL OR ecole_nom = '' THEN
       ecole_nom := 'École de ' || new.email;
    END IF;

    -- Création école SI rôle directeur (ou pending)
    IF user_role IN ('director', 'directeur', 'pending_director') THEN
        INSERT INTO public.ecoles (nom) VALUES (ecole_nom) RETURNING id INTO new_ecole_id;
    END IF;

    -- Création profil
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

-- Trigger: Auto-promotion pending -> director
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

-- RPC: Création/Modif Utilisateur (Compatible SuperAdmin)
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
    existing_user_id UUID;
BEGIN
    -- Chercher dans profiles
    SELECT id INTO existing_user_id FROM public.profiles WHERE email = target_email;

    IF existing_user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET role = target_role,
            ecole_id = target_ecole_id,
            active = target_active,
            is_approved = TRUE
        WHERE id = existing_user_id;
        RETURN jsonb_build_object('status', 'success', 'message', 'Utilisateur mis à jour.');
    ELSE
        -- Chercher dans auth.users
        SELECT id INTO existing_user_id FROM auth.users WHERE email = target_email;
        
        IF existing_user_id IS NOT NULL THEN
             INSERT INTO public.profiles (id, email, role, ecole_id, active, is_approved)
             VALUES (existing_user_id, target_email, target_role, target_ecole_id, target_active, TRUE)
             ON CONFLICT (id) DO UPDATE
             SET role = EXCLUDED.role, ecole_id = EXCLUDED.ecole_id, active = EXCLUDED.active;
             RETURN jsonb_build_object('status', 'success', 'message', 'Profil créé.');
        ELSE
             RETURN jsonb_build_object('status', 'error', 'message', 'Utilisateur Auth introuvable.');
        END IF;
    END IF;
END;
$$;

-- 4. SECURITÉ RLS (CORRIGÉE POUR ADMIN & ECOLE)

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
ALTER TABLE public.school_configurations ENABLE ROW LEVEL SECURITY;

-- POLITIQUE UNIVERSELLE SUPER ADMIN (Tout pouvoir)
CREATE POLICY "SA Profiles" ON public.profiles FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
CREATE POLICY "SA Ecoles" ON public.ecoles FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
CREATE POLICY "SA Classes" ON public.classes FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
CREATE POLICY "SA Eleves" ON public.eleves FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
CREATE POLICY "SA Matieres" ON public.matieres FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
-- (Répéter implicitement via les droits admin, mais explicite c'est mieux)

-- POLITIQUES UTILISATEURS NORMAUX

-- Profiles
CREATE POLICY "Voir son profil" ON public.profiles FOR SELECT USING (auth.uid() = id);
-- Les directeurs voient les profs de leur école
CREATE POLICY "Directeur voit profiles" ON public.profiles FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Ecoles
CREATE POLICY "Voir son ecole" ON public.ecoles FOR SELECT USING (
  id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Classes
CREATE POLICY "Voir classes ecole" ON public.classes FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Directeur gere classes" ON public.classes FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur') AND
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Eleves
CREATE POLICY "Voir eleves ecole" ON public.eleves FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Directeur gere eleves" ON public.eleves FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur') AND
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Matieres
CREATE POLICY "Voir matieres ecole" ON public.matieres FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Directeur gere matieres" ON public.matieres FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur') AND
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

-- Enseignements
CREATE POLICY "Voir enseignements" ON public.enseignements FOR SELECT USING (
  professeur_id = auth.uid() OR
  classe_id IN (SELECT id FROM public.classes WHERE ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid()))
);
CREATE POLICY "Directeur gere enseignements" ON public.enseignements FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
);

-- Evaluations & Notes (Profs + Directeur)
CREATE POLICY "Voir evals ecole" ON public.evaluations FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Gerer evals" ON public.evaluations FOR ALL USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('professeur', 'teacher', 'director', 'directeur')
);

CREATE POLICY "Voir notes ecole" ON public.notes FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Gerer notes" ON public.notes FOR ALL USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('professeur', 'teacher', 'director', 'directeur')
);

-- Presences & Paiements
CREATE POLICY "Voir presences" ON public.presences FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Gerer presences" ON public.presences FOR ALL USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Voir paiements" ON public.paiements FOR SELECT USING (
  ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "Gerer paiements" ON public.paiements FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('director', 'directeur')
  AND ecole_id = (SELECT ecole_id FROM public.profiles WHERE id = auth.uid())
);
