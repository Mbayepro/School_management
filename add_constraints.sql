-- Contraintes pour les tables existantes

-- Contrainte sur le rôle des profiles
ALTER TABLE profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('directeur','professeur'));

-- Contrainte sur le statut des présences
ALTER TABLE presences 
ADD CONSTRAINT presences_statut_check 
CHECK (statut IN ('present','absent'));

-- Contrainte sur le statut des paiements
ALTER TABLE paiements 
ADD CONSTRAINT paiements_statut_check 
CHECK (statut IN ('paye','partiel','impaye'));

-- Contrainte d'unicité sur les présences
ALTER TABLE presences 
ADD CONSTRAINT presences_unique_eleve_date 
UNIQUE (eleve_id, date);
