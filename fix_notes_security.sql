-- Sécurisation de la table NOTES et EVALUATIONS
-- Objectif: Garantir que seul le personnel autorisé (Directeur, Professeur) peut modifier les notes
-- et que les données sont cloisonnées par école.

-- 1. Ajouter la colonne ecole_id si elle manque (pour le cloisonnement)
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS ecole_id UUID REFERENCES public.ecoles(id);
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS ecole_id UUID REFERENCES public.ecoles(id);
ALTER TABLE public.matieres ADD COLUMN IF NOT EXISTS ecole_id UUID REFERENCES public.ecoles(id);

-- 2. Activer RLS sur les tables critiques
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matieres ENABLE ROW LEVEL SECURITY;

-- 3. Politiques pour NOTES

-- Lecture: Accessible aux utilisateurs de la même école (Directeur, Prof, Élève, Parent)
DROP POLICY IF EXISTS "Notes lecture same school" ON public.notes;
CREATE POLICY "Notes lecture same school" ON public.notes
FOR SELECT TO authenticated
USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Écriture (Insert/Update/Delete): Réservé aux Directeurs et Professeurs de l'école
DROP POLICY IF EXISTS "Notes ecriture staff" ON public.notes;
CREATE POLICY "Notes ecriture staff" ON public.notes
FOR ALL TO authenticated
USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('director', 'professeur', 'admin')
  )
)
WITH CHECK (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('director', 'professeur', 'admin')
  )
);

-- 4. Politiques pour EVALUATIONS (Même logique)

DROP POLICY IF EXISTS "Evaluations lecture same school" ON public.evaluations;
CREATE POLICY "Evaluations lecture same school" ON public.evaluations
FOR SELECT TO authenticated
USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Evaluations ecriture staff" ON public.evaluations;
CREATE POLICY "Evaluations ecriture staff" ON public.evaluations
FOR ALL TO authenticated
USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('director', 'professeur', 'admin')
  )
)
WITH CHECK (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('director', 'professeur', 'admin')
  )
);

-- 5. Politiques pour MATIERES

DROP POLICY IF EXISTS "Matieres lecture same school" ON public.matieres;
CREATE POLICY "Matieres lecture same school" ON public.matieres
FOR SELECT TO authenticated
USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Matieres ecriture staff" ON public.matieres;
CREATE POLICY "Matieres ecriture staff" ON public.matieres
FOR ALL TO authenticated
USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('director', 'professeur', 'admin')
  )
)
WITH CHECK (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles WHERE id = auth.uid()
  )
  AND
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('director', 'professeur', 'admin')
  )
);
