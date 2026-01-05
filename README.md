# Gestion Scolaire Sénégal (School Management)

Une application web moderne, simple et efficace pour la gestion des écoles au Sénégal.
Conçue pour fonctionner sur mobile et ordinateur, même avec une connexion internet limitée.

## 🚀 Fonctionnalités Clés

*   **Gestion des Paiements (Scolarité) :** Suivi des paiements mensuels, relances WhatsApp, et impression de reçus.
*   **Gestion des Élèves & Classes :** Inscription facile, filtrage par classe.
*   **Gestion des Professeurs :** Assignation des professeurs aux classes.
*   **Rôles Sécurisés :** Interface Directeur (Admin) et Interface Professeur (Appel/Notes).
*   **Reçus Automatiques :** Génération de reçus PDF prêts à imprimer.

## 🛠️ Installation & Déploiement

Cette application est une "Single Page Application" (SPA) qui ne nécessite qu'un serveur web statique.

### 1. Hébergement
Hébergez le dossier `public` sur n'importe quel service :
*   Vercel / Netlify (Recommandé)
*   GitHub Pages
*   Serveur local (Apache/Nginx)

### 2. Configuration Base de Données (Supabase)
L'application utilise Supabase comme backend.
1.  Créez un projet sur [Supabase.com](https://supabase.com).
2.  Allez dans `SQL Editor`.
3.  Exécutez les scripts suivants (dans l'ordre) présents à la racine du projet :
    *   `fix_jan5_issues.sql` (Structure de base et correctifs)
    *   `fix_enseignements_rls.sql` (Permissions professeurs)
    *   `optimize_database.sql` (Normalisation des données)

### 3. Configuration de l'Application
Modifiez le fichier `public/js/config.js` avec vos clés Supabase :

```javascript
const CONFIG = {
    SUPABASE_URL: "VOTRE_URL_SUPABASE",
    SUPABASE_ANON_KEY: "VOTRE_CLE_ANON_KEY"
};
```

## 📱 Utilisation

1.  **Directeur :** Connectez-vous avec le compte directeur créé lors de l'installation.
2.  **Professeurs :** Créez les comptes professeurs depuis le tableau de bord directeur.
3.  **Paiements :** Allez dans l'onglet "Paiements" pour pointer les élèves et imprimer les reçus.

## 🇸🇳 Spécificités Sénégal
*   Format monétaire FCFA.
*   Support WhatsApp pour les relances parents.
*   Impression thermique ou A4 des reçus.

---
*Version 1.0.0 - Prêt pour déploiement*
