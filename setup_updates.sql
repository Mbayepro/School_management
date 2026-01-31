BEGIN;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS note_max INT DEFAULT 20;
ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS heure_limite TEXT DEFAULT '08:00';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS note NUMERIC;

-- Migration des données: copier valeur vers note si note est vide (Safe check)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notes' AND column_name='valeur') THEN
        UPDATE public.notes SET note = valeur WHERE note IS NULL AND valeur IS NOT NULL;
    END IF;
END $$;

ALTER TABLE public.paiements ADD COLUMN IF NOT EXISTS numero TEXT;
COMMIT;
