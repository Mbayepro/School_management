-- Table des coefficients par Classe et Matière
-- Permet: Pour la classe X, la matière Y a le coef Z

BEGIN;

CREATE TABLE IF NOT EXISTS public.coefficients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE,
  classe_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  matiere_id UUID REFERENCES public.matieres(id) ON DELETE CASCADE,
  coef NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (classe_id, matiere_id)
);

-- Ajouter ecole_id si absent (pour RLS simplifiée)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'coefficients' AND column_name = 'ecole_id'
  ) THEN
    ALTER TABLE public.coefficients ADD COLUMN ecole_id UUID REFERENCES public.ecoles(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.coefficients ENABLE ROW LEVEL SECURITY;

-- Supprimer anciennes policies si rejoué
DROP POLICY IF EXISTS "Voir coefficients ecole" ON public.coefficients;
DROP POLICY IF EXISTS "Gerer coefficients staff" ON public.coefficients;
DROP POLICY IF EXISTS "Inserer coefficients directeur" ON public.coefficients;

-- Lecture: tout personnel de l’école peut voir
CREATE POLICY "Voir coefficients ecole" ON public.coefficients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 
      FROM public.profiles p 
      WHERE p.id = auth.uid() 
        AND p.ecole_id = public.coefficients.ecole_id
        AND p.role IN ('directeur','professeur','teacher','super_admin')
    )
  );

-- Gestion: directeur/professeur de l’école
CREATE POLICY "Gerer coefficients staff" ON public.coefficients
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ecole_id = public.coefficients.ecole_id
        AND p.role IN ('directeur','professeur','teacher','super_admin')
    )
  );

-- Insérer: directeur (et super_admin)
CREATE POLICY "Inserer coefficients directeur" ON public.coefficients
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ecole_id = public.coefficients.ecole_id
        AND p.role IN ('directeur','super_admin')
    )
  );

COMMIT;
