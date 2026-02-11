-- Script de RÉPARATION DES COMPTES
-- À exécuter si vous avez "Compte non activé" ou "Utilisateur introuvable" après la réinitialisation

DO $$
DECLARE
    r RECORD;
    admin_ecole_id UUID;
    user_role TEXT;
    ecole_nom TEXT;
    new_ecole_id UUID;
BEGIN
    -- 1. Assurer que l'école d'Administration existe
    SELECT id INTO admin_ecole_id FROM public.ecoles WHERE nom = 'Administration' LIMIT 1;
    IF admin_ecole_id IS NULL THEN
        INSERT INTO public.ecoles (nom, active) VALUES ('Administration', TRUE) RETURNING id INTO admin_ecole_id;
    END IF;

    -- 2. Parcourir tous les utilisateurs inscrits (Auth) qui n'ont plus de profil (Table Profiles vide)
    FOR r IN 
        SELECT u.id, u.email, u.raw_user_meta_data 
        FROM auth.users u
        LEFT JOIN public.profiles p ON u.id = p.id
        WHERE p.id IS NULL
    LOOP
        RAISE NOTICE 'Restauration du profil pour : %', r.email;
        
        -- Logique Spéciale Super Admin
        IF r.email = 'mbayeadama669@gmail.com' THEN
            user_role := 'super_admin';
            new_ecole_id := admin_ecole_id;
        ELSE
            -- Logique normale
            user_role := COALESCE(r.raw_user_meta_data->>'role', 'pending_director');
            ecole_nom := COALESCE(r.raw_user_meta_data->>'ecole_nom', 'Ecole de ' || r.email);
            
            -- Si c'est un directeur, on lui recrée une école s'il n'en a pas
            IF user_role IN ('director', 'directeur', 'pending_director') THEN
                 INSERT INTO public.ecoles (nom) VALUES (ecole_nom) RETURNING id INTO new_ecole_id;
            ELSE
                 new_ecole_id := NULL;
            END IF;
        END IF;

        -- Création du profil manquant
        INSERT INTO public.profiles (id, email, role, ecole_id, is_approved, active)
        VALUES (
            r.id, 
            r.email, 
            user_role, 
            new_ecole_id, 
            TRUE, -- On approuve automatiquement pour éviter le blocage "Non activé"
            TRUE
        );
    END LOOP;
    
    -- 3. Forcer les droits Super Admin pour mbayeadama669@gmail.com (Double sécurité)
    UPDATE public.profiles 
    SET role = 'super_admin', 
        is_approved = TRUE, 
        active = TRUE,
        ecole_id = admin_ecole_id
    WHERE email = 'mbayeadama669@gmail.com';
    
    RAISE NOTICE 'Réparation terminée. Vous pouvez vous connecter.';
END $$;
