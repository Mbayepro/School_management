-- Script d'optimisation et de normalisation des données
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Fonction pour normaliser les données textuelles (Minuscules, Espaces inutiles)
CREATE OR REPLACE FUNCTION public.normalize_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Normalisation des profils
  IF TG_TABLE_NAME = 'profiles' THEN
    IF NEW.role IS NOT NULL THEN
      NEW.role := lower(trim(NEW.role));
    END IF;
    -- Note: L'email est géré par Supabase Auth, mais on peut le nettoyer ici si besoin
  END IF;

  -- Normalisation des élèves
  IF TG_TABLE_NAME = 'eleves' THEN
    IF NEW.nom IS NOT NULL THEN
      NEW.nom := trim(NEW.nom); -- Garder la casse pour les noms propres, juste trim
    END IF;
    IF NEW.prenom IS NOT NULL THEN
      NEW.prenom := trim(NEW.prenom);
    END IF;
  END IF;

  -- Normalisation des écoles
  IF TG_TABLE_NAME = 'ecoles' THEN
      IF NEW.nom IS NOT NULL THEN
        NEW.nom := trim(NEW.nom);
      END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Création des Triggers

-- Trigger pour les profiles
DROP TRIGGER IF EXISTS trigger_normalize_profiles ON public.profiles;
CREATE TRIGGER trigger_normalize_profiles
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_data();

-- Trigger pour les élèves
DROP TRIGGER IF EXISTS trigger_normalize_eleves ON public.eleves;
CREATE TRIGGER trigger_normalize_eleves
BEFORE INSERT OR UPDATE ON public.eleves
FOR EACH ROW
EXECUTE FUNCTION public.normalize_data();

-- Trigger pour les écoles
DROP TRIGGER IF EXISTS trigger_normalize_ecoles ON public.ecoles;
CREATE TRIGGER trigger_normalize_ecoles
BEFORE INSERT OR UPDATE ON public.ecoles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_data();

-- 3. Index pour accélérer les recherches (Optionnel mais recommandé)
CREATE INDEX IF NOT EXISTS idx_eleves_nom ON public.eleves(nom);
CREATE INDEX IF NOT EXISTS idx_eleves_classe ON public.eleves(classe_id);
CREATE INDEX IF NOT EXISTS idx_paiements_eleve_mois ON public.paiements(eleve_id, mois);

COMMENT ON FUNCTION public.normalize_data IS 'Nettoie les données avant insertion (trim, lower)';
