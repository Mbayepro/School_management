-- SCRIPT DE RÉPARATION COMPLET
-- Copiez tout ce contenu et exécutez-le dans l'éditeur SQL de Supabase

-- 1. AJOUT DES COLONNES MANQUANTES DANS 'ECOLES'
-- Ces colonnes sont requises par parametres.js et l'affichage
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS couleur text DEFAULT '#4a90e2';
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS adresse text;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS note_max numeric DEFAULT 20;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS heure_limite text DEFAULT '08:00';
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- 2. VÉRIFICATION DE LA TABLE 'CLASSES'
-- S'assure que la colonne professeur_id existe (utilisée pour l'assignation)
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS professeur_id uuid REFERENCES auth.users(id);

-- 3. CORRECTION DES POLITIQUES DE SÉCURITÉ (RLS)
-- Souvent la cause des problèmes "j'arrive pas à créer"
ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- Suppression des anciennes politiques pour éviter les conflits
DROP POLICY IF EXISTS "Lecture publique ecoles" ON public.ecoles;
DROP POLICY IF EXISTS "Creation ecoles auth" ON public.ecoles;
DROP POLICY IF EXISTS "Modification ecoles directeur" ON public.ecoles;
DROP POLICY IF EXISTS "Lecture classes auth" ON public.classes;
DROP POLICY IF EXISTS "Ecriture classes auth" ON public.classes;

-- Création de politiques permissives pour débloquer la situation
-- (Vous pourrez les restreindre plus tard)

-- Tout utilisateur connecté peut voir les écoles
CREATE POLICY "Lecture publique ecoles" ON public.ecoles FOR SELECT TO authenticated USING (true);

-- Tout utilisateur connecté peut créer une école
CREATE POLICY "Creation ecoles auth" ON public.ecoles FOR INSERT TO authenticated WITH CHECK (true);

-- Tout utilisateur connecté peut modifier (nécessaire pour parametres.js)
-- Idéalement, on restreint au directeur, mais pour débloquer :
CREATE POLICY "Modification ecoles directeur" ON public.ecoles FOR UPDATE TO authenticated USING (true);

-- CLASSES : Tout le monde peut voir et créer pour l'instant
CREATE POLICY "Lecture classes auth" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ecriture classes auth" ON public.classes FOR ALL TO authenticated USING (true);

-- 4. VÉRIFICATION FINALE
SELECT * FROM public.ecoles LIMIT 1;
