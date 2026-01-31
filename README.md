# School Management System

Une solution de gestion scolaire moderne, rapide et fonctionnant hors-ligne (PWA). Conçue pour les écoles privées (Primaire, Collège, Lycée).

## 🚀 Fonctionnalités Clés

*   **Gestion des Élèves** : Inscriptions, dossiers complets, photos, import Excel/CSV.
*   **Notes & Bulletins** : Saisie rapide (type Excel), calcul automatique des moyennes, génération de bulletins PDF en masse.
*   **Mode Hors-Ligne (PWA)** : Continuez à travailler sans internet. Synchronisation automatique au retour de la connexion.
*   **Finance** : Suivi des paiements, scolarités, reçus.
*   **Cartes d'Identité** : Génération automatique de cartes scolaires avec QR Code.
*   **Rôles & Sécurité** : Accès différenciés pour Directeurs (Admin) et Professeurs (Vue limitée à leurs classes).

## 🛠 Installation & Déploiement

### Prérequis
*   Un projet [Supabase](https://supabase.com) (Plan gratuit suffisant pour démarrer).
*   Un hébergement web statique (Netlify, Vercel, ou simple serveur Apache/Nginx).

### Configuration de la Base de Données
1.  Créez un projet sur Supabase.
2.  Allez dans l'éditeur SQL de Supabase.
3.  Exécutez le script `setup_bulletins.sql` pour créer la structure.
4.  Exécutez le script `setup_updates.sql` pour appliquer les dernières mises à jour.

### Configuration de l'Application
1.  Ouvrez le fichier `public/js/config.js`.
2.  Remplacez les valeurs `SUPABASE_URL` et `SUPABASE_ANON_KEY` par celles de votre projet Supabase.

### Déploiement
Uploadez simplement tout le contenu du dossier `public/` sur votre hébergeur.

## 📱 Utilisation Mobile
L'application est une **Progressive Web App (PWA)**.
*   Sur Android (Chrome) : Cliquez sur "Ajouter à l'écran d'accueil".
*   Sur iOS (Safari) : Cliquez sur "Partager" > "Sur l'écran d'accueil".
*   L'icône apparaîtra comme une application native et fonctionnera hors-ligne.

## 🔒 Architecture Technique
*   **Frontend** : HTML5, CSS3, JavaScript (Vanilla). Aucune étape de "build" complexe (npm/webpack) n'est requise pour la mise en ligne, ce qui facilite la maintenance.
*   **Backend** : Supabase (PostgreSQL + Auth + RLS).
*   **Dépendances** : Toutes les librairies (jsPDF, XLSX, Html5-QRCode) sont incluses localement dans `js/vendor` pour garantir le fonctionnement hors-ligne.

---
*Développé pour la gestion simplifiée des établissements scolaires.*
