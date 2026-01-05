-- V1 minimale — School Management
-- Exécuter dans le SQL Editor de votre nouveau projet Supabase
-- Objectif: schéma simple, aucune magie, aucune logique cachée

-- Tables
CREATE TABLE IF NOT EXISTS public.ecoles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  telephone TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  ecole_id UUID NULL REFERENCES public.ecoles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  niveau TEXT,
  ecole_id UUID NOT NULL REFERENCES public.ecoles(id) ON DELETE CASCADE,
  professeur_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eleves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  prenom TEXT,
  classe_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  tel_parent TEXT,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.presences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eleve_id UUID NOT NULL REFERENCES public.eleves(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  statut TEXT NOT NULL,
  marque_par UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.paiements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eleve_id UUID NOT NULL REFERENCES public.eleves(id) ON DELETE CASCADE,
  mois TEXT NOT NULL,
  montant NUMERIC,
  statut TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes minimales (nécessaires au code existant)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_presences_eleve_date') THEN
    CREATE UNIQUE INDEX uniq_presences_eleve_date ON public.presences (eleve_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_paiements_eleve_mois') THEN
    CREATE UNIQUE INDEX uniq_paiements_eleve_mois ON public.paiements (eleve_id, mois);
  END IF;
END $$;

-- RLS minimale
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'read-own-profile'
  ) THEN
    CREATE POLICY "read-own-profile" ON public.profiles
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

-- Aucune autre policy, aucun trigger
-- Le frontend contrôle les accès via role-guard.js
