-- Tables pour l'application scolaire school-management

-- Table des écoles
CREATE TABLE IF NOT EXISTS ecoles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    telephone TEXT,
    created_at TIMESTAMP DEFAULT now()
);
-- Activation/Désactivation des écoles
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Table des profiles (utilisateurs)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    ecole_id UUID REFERENCES ecoles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now()
);

-- Table des classes
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    ecole_id UUID REFERENCES ecoles(id) ON DELETE CASCADE,
    professeur_id UUID REFERENCES profiles(id),
    created_at TIMESTAMP DEFAULT now()
);

-- Table des élèves
CREATE TABLE IF NOT EXISTS eleves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    prenom TEXT,
    classe_id UUID REFERENCES classes(id) ON DELETE CASCADE,
    tel_parent TEXT,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now()
);

-- Table des présences
CREATE TABLE IF NOT EXISTS presences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id UUID REFERENCES eleves(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    statut TEXT NOT NULL,
    marque_par UUID REFERENCES profiles(id),
    created_at TIMESTAMP DEFAULT now()
);

-- Table des paiements
CREATE TABLE IF NOT EXISTS paiements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eleve_id UUID REFERENCES eleves(id) ON DELETE CASCADE,
    mois TEXT NOT NULL,
    montant NUMERIC,
    statut TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_classes_ecole_id') THEN
  CREATE INDEX idx_classes_ecole_id ON public.classes(ecole_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_classes_professeur_id') THEN
  CREATE INDEX idx_classes_professeur_id ON public.classes(professeur_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_eleves_classe_id') THEN
  CREATE INDEX idx_eleves_classe_id ON public.eleves(classe_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_eleves_actif') THEN
  CREATE INDEX idx_eleves_actif ON public.eleves(actif);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_presences_eleve_id') THEN
  CREATE INDEX idx_presences_eleve_id ON public.presences(eleve_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_presences_date') THEN
  CREATE INDEX idx_presences_date ON public.presences(date);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_paiements_eleve_id') THEN
  CREATE INDEX idx_paiements_eleve_id ON public.paiements(eleve_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_paiements_mois') THEN
  CREATE INDEX idx_paiements_mois ON public.paiements(mois);
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_presences_eleve_date') THEN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT eleve_id, date, COUNT(*) AS c
      FROM public.presences
      GROUP BY eleve_id, date
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE NOTICE 'Duplicates found in presences; unique index not created';
  ELSE
    CREATE UNIQUE INDEX uniq_presences_eleve_date ON public.presences(eleve_id, date);
  END IF;
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_paiements_eleve_mois') THEN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT eleve_id, mois, COUNT(*) AS c
      FROM public.paiements
      GROUP BY eleve_id, mois
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE NOTICE 'Duplicates found in paiements; unique index not created';
  ELSE
    CREATE UNIQUE INDEX uniq_paiements_eleve_mois ON public.paiements(eleve_id, mois);
  END IF;
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_classes_ecole_nom_lower') THEN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT ecole_id, lower(nom) AS nom_l, COUNT(*) AS c
      FROM public.classes
      GROUP BY ecole_id, lower(nom)
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE NOTICE 'Duplicates found in classes; unique index not created';
  ELSE
    CREATE UNIQUE INDEX uniq_classes_ecole_nom_lower ON public.classes(ecole_id, lower(nom));
  END IF;
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_eleves_classe_nom_prenom_lower') THEN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT classe_id, lower(nom) AS nom_l, lower(coalesce(prenom, '')) AS prenom_l, COUNT(*) AS c
      FROM public.eleves
      GROUP BY classe_id, lower(nom), lower(coalesce(prenom, ''))
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE NOTICE 'Duplicates found in eleves; unique index not created';
  ELSE
    CREATE UNIQUE INDEX uniq_eleves_classe_nom_prenom_lower ON public.eleves(classe_id, lower(nom), lower(coalesce(prenom, '')));
  END IF;
END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_unique_presences()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.presences p
    WHERE p.eleve_id = NEW.eleve_id AND p.date = NEW.date AND (NEW.id IS NULL OR p.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'Duplicate presences for eleve % at date %', NEW.eleve_id, NEW.date;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_unique_paiements()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.paiements p
    WHERE p.eleve_id = NEW.eleve_id AND p.mois = NEW.mois AND (NEW.id IS NULL OR p.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'Duplicate paiements for eleve % at month %', NEW.eleve_id, NEW.mois;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_unique_classes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.ecole_id = NEW.ecole_id AND lower(c.nom) = lower(NEW.nom) AND (NEW.id IS NULL OR c.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'Duplicate class name % for school %', NEW.nom, NEW.ecole_id;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_unique_eleves()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.eleves e
    WHERE e.classe_id = NEW.classe_id
      AND lower(e.nom) = lower(NEW.nom)
      AND lower(coalesce(e.prenom, '')) = lower(coalesce(NEW.prenom, ''))
      AND (NEW.id IS NULL OR e.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'Duplicate student % % in class %', NEW.prenom, NEW.nom, NEW.classe_id;
  END IF;
  RETURN NEW;
END
$$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_unique_presences') THEN
  CREATE TRIGGER trg_enforce_unique_presences
  BEFORE INSERT ON public.presences
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_presences();
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_unique_paiements') THEN
  CREATE TRIGGER trg_enforce_unique_paiements
  BEFORE INSERT ON public.paiements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_paiements();
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_unique_classes') THEN
  CREATE TRIGGER trg_enforce_unique_classes
  BEFORE INSERT ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_classes();
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_unique_eleves') THEN
  CREATE TRIGGER trg_enforce_unique_eleves
  BEFORE INSERT ON public.eleves
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_eleves();
END IF;
END $$;

CREATE OR REPLACE VIEW public.dup_presences AS
SELECT eleve_id, date, COUNT(*) AS count
FROM public.presences
GROUP BY eleve_id, date
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW public.dup_paiements AS
SELECT eleve_id, mois, COUNT(*) AS count
FROM public.paiements
GROUP BY eleve_id, mois
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW public.dup_classes AS
SELECT ecole_id, lower(nom) AS nom_l, COUNT(*) AS count
FROM public.classes
GROUP BY ecole_id, lower(nom)
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW public.dup_eleves AS
SELECT classe_id, lower(nom) AS nom_l, lower(coalesce(prenom, '')) AS prenom_l, COUNT(*) AS count
FROM public.eleves
GROUP BY classe_id, lower(nom), lower(coalesce(prenom, ''))
HAVING COUNT(*) > 1;

ALTER TABLE public.ecoles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eleves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
  CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
  CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ecoles' AND policyname = 'View own ecole') THEN
  CREATE POLICY "View own ecole" ON public.ecoles
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.ecole_id = ecoles.id
          AND p.role IN ('directeur','professeur')
      )
    );
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'classes' AND policyname = 'Super Admin view classes') THEN
  CREATE POLICY "Super Admin view classes" ON public.classes
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'eleves' AND policyname = 'Super Admin view eleves') THEN
  CREATE POLICY "Super Admin view eleves" ON public.eleves
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'presences' AND policyname = 'Super Admin view presences') THEN
  CREATE POLICY "Super Admin view presences" ON public.presences
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paiements' AND policyname = 'Super Admin view paiements') THEN
  CREATE POLICY "Super Admin view paiements" ON public.paiements
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    );
END IF;
END $$;
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE schemaname = 'public' AND tablename = 'ecoles' AND policyname = 'Super Admin manage ecoles'
) THEN
  CREATE POLICY "Super Admin manage ecoles" ON public.ecoles
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'super_admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'super_admin'
      )
    );
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'classes' AND policyname = 'View classes by school') THEN
  CREATE POLICY "View classes by school" ON public.classes
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.ecole_id = classes.ecole_id
          AND p.role IN ('directeur','professeur')
      )
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'classes' AND policyname = 'Director manage classes') THEN
  CREATE POLICY "Director manage classes" ON public.classes
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'directeur'
          AND p.ecole_id = classes.ecole_id
      )
    );
  CREATE POLICY "Director update classes" ON public.classes
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'directeur'
          AND p.ecole_id = classes.ecole_id
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'directeur'
          AND p.ecole_id = classes.ecole_id
      )
    );
  CREATE POLICY "Director delete classes" ON public.classes
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'directeur'
          AND p.ecole_id = classes.ecole_id
      )
    );
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'eleves' AND policyname = 'View eleves by school') THEN
  CREATE POLICY "View eleves by school" ON public.eleves
    FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM public.classes c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = eleves.classe_id
          AND c.ecole_id = p.ecole_id
          AND p.role IN ('directeur','professeur')
      )
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'eleves' AND policyname = 'Director manage eleves') THEN
  CREATE POLICY "Director manage eleves" ON public.eleves
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.classes c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = eleves.classe_id
          AND p.role = 'directeur'
          AND c.ecole_id = p.ecole_id
      )
    );
  CREATE POLICY "Director update eleves" ON public.eleves
    FOR UPDATE USING (
      EXISTS (
        SELECT 1
        FROM public.classes c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = eleves.classe_id
          AND p.role = 'directeur'
          AND c.ecole_id = p.ecole_id
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.classes c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = eleves.classe_id
          AND p.role = 'directeur'
          AND c.ecole_id = p.ecole_id
      )
    );
  CREATE POLICY "Director delete eleves" ON public.eleves
    FOR DELETE USING (
      EXISTS (
        SELECT 1
        FROM public.classes c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = eleves.classe_id
          AND p.role = 'directeur'
          AND c.ecole_id = p.ecole_id
      )
    );
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'presences' AND policyname = 'View presences by school') THEN
  CREATE POLICY "View presences by school" ON public.presences
    FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = presences.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role IN ('directeur','professeur')
      )
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'presences' AND policyname = 'Professeur manage presences') THEN
  CREATE POLICY "Professeur manage presences" ON public.presences
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = presences.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'professeur'
          AND presences.marque_par = auth.uid()
      )
    );
  CREATE POLICY "Professeur update presences" ON public.presences
    FOR UPDATE USING (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = presences.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'professeur'
          AND presences.marque_par = auth.uid()
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = presences.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'professeur'
          AND presences.marque_par = auth.uid()
      )
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'presences' AND policyname = 'Director manage presences') THEN
  CREATE POLICY "Director manage presences" ON public.presences
    FOR UPDATE USING (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = presences.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'directeur'
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = presences.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'directeur'
      )
    );
END IF;
END $$;

DO $$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paiements' AND policyname = 'Director view paiements by school') THEN
  CREATE POLICY "Director view paiements by school" ON public.paiements
    FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = paiements.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'directeur'
      )
    );
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'paiements' AND policyname = 'Director manage paiements') THEN
  CREATE POLICY "Director manage paiements" ON public.paiements
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = paiements.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'directeur'
      )
    );
  CREATE POLICY "Director update paiements" ON public.paiements
    FOR UPDATE USING (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = paiements.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'directeur'
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = paiements.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'directeur'
      )
    );
  CREATE POLICY "Director delete paiements" ON public.paiements
    FOR DELETE USING (
      EXISTS (
        SELECT 1
        FROM public.eleves e
        JOIN public.classes c ON c.id = e.classe_id
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE e.id = paiements.eleve_id
          AND c.ecole_id = p.ecole_id
          AND p.role = 'directeur'
      )
    );
END IF;
END $$;
