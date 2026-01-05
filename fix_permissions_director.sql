-- CORRECTION DES PERMISSIONS DIRECTEUR
-- Ce script :
-- 1. Réinitialise toutes les permissions RLS
-- 2. Donne au directeur les droits de voir/modifier son école
-- 3. Donne au directeur les droits sur ses classes et élèves
-- 4. Assure qu'il peut voir son propre profil

-- === PROFILES ===
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

-- === ECOLES ===
-- Permettre au directeur de VOIR son école
DROP POLICY IF EXISTS "Directeur view own ecole" ON public.ecoles;
CREATE POLICY "Directeur view own ecole" ON public.ecoles
FOR SELECT USING (
  id IN (
    SELECT ecole_id FROM public.profiles 
    WHERE id = auth.uid() AND role = 'directeur'
  )
);

-- Permettre au directeur de MODIFIER son école
DROP POLICY IF EXISTS "Directeur update own ecole" ON public.ecoles;
CREATE POLICY "Directeur update own ecole" ON public.ecoles
FOR UPDATE USING (
  id IN (
    SELECT ecole_id FROM public.profiles 
    WHERE id = auth.uid() AND role = 'directeur'
  )
);

-- === CLASSES ===
DROP POLICY IF EXISTS "Directeur manage classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur view classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur insert classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur update classes" ON public.classes;
DROP POLICY IF EXISTS "Directeur delete classes" ON public.classes;

-- Lecture
CREATE POLICY "Directeur view classes" ON public.classes
FOR SELECT USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('directeur', 'professeur')
  )
);

-- Ecriture (Insert/Update/Delete) pour le Directeur uniquement
CREATE POLICY "Directeur insert classes" ON public.classes
FOR INSERT WITH CHECK (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles 
    WHERE id = auth.uid() AND role = 'directeur'
  )
);

CREATE POLICY "Directeur update classes" ON public.classes
FOR UPDATE USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles 
    WHERE id = auth.uid() AND role = 'directeur'
  )
);

CREATE POLICY "Directeur delete classes" ON public.classes
FOR DELETE USING (
  ecole_id IN (
    SELECT ecole_id FROM public.profiles 
    WHERE id = auth.uid() AND role = 'directeur'
  )
);

-- === ELEVES ===
DROP POLICY IF EXISTS "Directeur manage eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur view eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur insert eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur update eleves" ON public.eleves;
DROP POLICY IF EXISTS "Directeur delete eleves" ON public.eleves;

-- Lecture (Directeur + Professeur)
CREATE POLICY "Staff view eleves" ON public.eleves
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = eleves.classe_id
    AND c.ecole_id IN (
      SELECT ecole_id FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('directeur', 'professeur')
    )
  )
);

-- Ecriture (Directeur uniquement)
CREATE POLICY "Directeur insert eleves" ON public.eleves
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = eleves.classe_id
    AND c.ecole_id IN (
      SELECT ecole_id FROM public.profiles 
      WHERE id = auth.uid() AND role = 'directeur'
    )
  )
);

CREATE POLICY "Directeur update eleves" ON public.eleves
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = eleves.classe_id
    AND c.ecole_id IN (
      SELECT ecole_id FROM public.profiles 
      WHERE id = auth.uid() AND role = 'directeur'
    )
  )
);

CREATE POLICY "Directeur delete eleves" ON public.eleves
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = eleves.classe_id
    AND c.ecole_id IN (
      SELECT ecole_id FROM public.profiles 
      WHERE id = auth.uid() AND role = 'directeur'
    )
  )
);
