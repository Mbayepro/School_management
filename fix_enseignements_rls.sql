-- Fix RLS for enseignements table (Case Insensitive Roles)

ALTER TABLE public.enseignements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View enseignements by school" ON public.enseignements;
CREATE POLICY "View enseignements by school" ON public.enseignements
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = enseignements.classe_id
    AND p.id = auth.uid()
    AND lower(p.role) IN ('directeur', 'director', 'professeur', 'teacher')
  )
);

DROP POLICY IF EXISTS "Director manage enseignements" ON public.enseignements;
CREATE POLICY "Director manage enseignements" ON public.enseignements
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = enseignements.classe_id
    AND p.id = auth.uid()
    AND lower(p.role) IN ('directeur', 'director')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.profiles p ON p.ecole_id = c.ecole_id
    WHERE c.id = enseignements.classe_id
    AND p.id = auth.uid()
    AND lower(p.role) IN ('directeur', 'director')
  )
);
