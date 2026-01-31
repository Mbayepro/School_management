/**
 * Configuration Supabase pour l'application School Management
 * Client JavaScript pour interagir avec Supabase Auth et Database
 */

const APP_NAME = "School Management";

// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import CONFIG from './config.js';

let createClient;
if (window.supabase && window.supabase.createClient) {
    createClient = window.supabase.createClient;
} else {
    // Fallback if UMD script is missing (requires internet)
    try {
        const mod = await import('https://esm.sh/@supabase/supabase-js@2');
        createClient = mod.createClient;
    } catch (e) {
        console.error("Supabase load error:", e);
    }
}

// Configuration Supabase
// Note: On force l'utilisation des valeurs par défaut pour éviter les erreurs de cache localStorage avec d'anciens projets
const DEFAULT_SUPABASE_URL = CONFIG.SUPABASE_URL;
const DEFAULT_SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY;

// Nettoyage automatique si l'ancien projet cassé est détecté
const storedUrl = localStorage.getItem("SUPABASE_URL");
if (storedUrl && storedUrl.includes("nqbaodpzlxgpptzqhhul")) {
    console.warn("Nettoyage de l'ancienne configuration Supabase invalide");
    localStorage.removeItem("SUPABASE_URL");
    localStorage.removeItem("SUPABASE_ANON_KEY");
}

const SUPABASE_URL = localStorage.getItem("SUPABASE_URL") || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = localStorage.getItem("SUPABASE_ANON_KEY") || DEFAULT_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    alert(`Configuration ${APP_NAME}:\nVeuillez configurer SUPABASE_URL et SUPABASE_ANON_KEY dans localStorage`);
}

// Création du client Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    }
});

// Export des fonctions utilitaires
export const db = {
    // Ecoles
    async getAllEcoles() {
        const { data, error } = await supabase
            .from('ecoles')
            .select('*')
            .order('nom', { ascending: true });
        return { data, error };
    },
    async setEcoleActive(ecoleId, active) {
        const { data, error } = await supabase
            .from('ecoles')
            .update({ active })
            .eq('id', ecoleId)
            .select()
            .single();
        return { data, error };
    },
    async deleteEcole(ecoleId) {
        const { error } = await supabase
            .from('ecoles')
            .delete()
            .eq('id', ecoleId);
        return { error };
    },
    // Profiles
    async getProfile(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        return { data, error };
    },

    async getClassesForProfessorViaCours(professeurId) {
        const { data, error } = await supabase
            .from('enseignements')
            .select(`
                id,
                classe_id,
                classes!inner(
                    id,
                    nom,
                    niveau
                )
            `)
            .eq('professeur_id', professeurId);
        // Map to unique classes
        const classes = (data || [])
            .map(e => e.classes)
            .filter(Boolean);
        // Deduplicate by id
        const unique = [];
        const seen = new Set();
        for (const c of classes) {
            if (!seen.has(c.id)) {
                seen.add(c.id);
                unique.push(c);
            }
        }
        return { data: unique, error };
    },

    async getEnseignementsByEcole(ecoleId) {
        const { data, error } = await supabase
            .from('enseignements')
            .select(`
                id,
                classe_id,
                classes!inner(
                    id,
                    ecole_id
                )
            `)
            .eq('classes.ecole_id', ecoleId);
        return { data, error };
    },

    async getEcoleId(userId) {
        const { data, error } = await supabase
            .from('profiles')
            .select('ecole_id')
            .eq('id', userId)
            .single();
        return { data, error };
    },

    // Classes
    async getClassesByEcole(ecoleId) {
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('ecole_id', ecoleId)
            .order('nom');
        return { data, error };
    },

    async getEcole(ecoleId) {
        const { data, error } = await supabase
            .from('ecoles')
            .select('*')
            .eq('id', ecoleId)
            .single();
        return { data, error };
    },

    async getClassesByProfesseur(professeurId) {
        // 1. Classes where user is the main professor
        const { data: mainClasses, error: mainError } = await supabase
            .from('classes')
            .select('*')
            .eq('professeur_id', professeurId);
            
        // 2. Classes where user teaches a subject (via enseignements)
        const { data: subjectClasses, error: subjectError } = await supabase
            .from('enseignements')
            .select('classe_id, classes(*)')
            .eq('professeur_id', professeurId);
            
        if (mainError && subjectError) return { data: [], error: mainError };

        const classesMap = new Map();
        
        // Add main classes
        if (mainClasses) {
            mainClasses.forEach(c => classesMap.set(c.id, c));
        }
        
        // Add subject classes
        if (subjectClasses) {
            subjectClasses.forEach(e => {
                if (e.classes) classesMap.set(e.classes.id, e.classes);
            });
        }

        const classes = Array.from(classesMap.values()).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
        return { data: classes, error: null };
    },
    
    async assignProfessorByEmail(email) {
        const { data, error } = await supabase
            .rpc('assign_professor_by_email', { target_email: email });
        return { data, error };
    },
    
    async ensureProfileForUser(userId, email, schoolName = null) {
        const { data, error } = await supabase
            .rpc('ensure_profile_for_user', { p_user_id: userId, p_email: email, p_school_name: schoolName });
        return { data, error };
    },
    
    async assignClassToProfessor(email, classeId) {
        const { data, error } = await supabase
            .rpc('assign_class_to_professor', { target_email: email, target_classe_id: classeId });
        return { data, error };
    },

    // Élèves
    async getElevesByClasse(classeId) {
        const { data, error } = await supabase
            .from('eleves')
            .select('*')
            .eq('classe_id', classeId)
            .eq('actif', true);
        return { data, error };
    },

    async addEleve(eleve) {
        const { data, error } = await supabase
            .from('eleves')
            .insert([eleve])
            .select();
        return { data, error };
    },

    // Présences
    async getPresencesDate(date, classeId) {
        // Récupérer les élèves de la classe
        const { data: eleves, error: elevesError } = await this.getElevesByClasse(classeId);
        
        if (elevesError) {
            return { data: [], error: elevesError };
        }
        
        // Si aucun élève dans la classe, retourner un tableau vide
        if (!eleves || eleves.length === 0) {
            return { data: [], error: null };
        }
        
        // Récupérer les présences pour les élèves de cette classe
        const eleveIds = eleves.map(e => e.id);
        const { data, error } = await supabase
            .from('presences')
            .select('*')
            .eq('date', date)
            .in('eleve_id', eleveIds);
            
        return { data, error };
    },

    async savePresence(presence) {
        // S'assurer que marque_par correspond à l'utilisateur connecté
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return { data: null, error: new Error('Utilisateur non authentifié') };
        }
        
        // Forcer marque_par à l'ID de l'utilisateur connecté
        const presenceWithUser = {
            ...presence,
            marque_par: user.id
        };
        
        const { data, error } = await supabase
            .from('presences')
            .upsert([presenceWithUser], {
                onConflict: 'eleve_id,date'
            })
            .select();
        return { data, error };
    },

    // Paiements
    async getPaiementsByEleve(eleveId) {
        const { data, error } = await supabase
            .from('paiements')
            .select('*')
            .eq('eleve_id', eleveId)
            .order('mois', { ascending: false });
        return { data, error };
    },

    async updatePaiement(paiementId, updates) {
        const { data, error } = await supabase
            .from('paiements')
            .update(updates)
            .eq('id', paiementId)
            .select();
        return { data, error };
    },

    async getImpayes(ecoleId) {
        const { data, error } = await supabase
            .from('paiements')
            .select(`
                *,
                eleves!inner(
                    nom,
                    prenom,
                    classes!inner(
                        ecole_id
                    )
                )
            `)
            .eq('eleves.classes.ecole_id', ecoleId)
            .neq('statut', 'paye');
        return { data, error };
    },
    async getImpayesByMonth(ecoleId, mois) {
        const { data, error } = await supabase
            .from('paiements')
            .select(`
                id,
                eleve_id,
                statut,
                mois,
                eleves!inner(
                    classes!inner(
                        ecole_id
                    )
                )
            `)
            .eq('eleves.classes.ecole_id', ecoleId)
            .eq('mois', mois)
            .neq('statut', 'paye');
        return { data, error };
    },

    async getPaiementsByMonth(ecoleId, mois) {
        // Fetch all payments for the school and month
        const { data, error } = await supabase
            .from('paiements')
            .select(`
                id,
                eleve_id,
                statut,
                mois,
                montant,
                eleves!inner(
                    id,
                    classes!inner(
                        ecole_id
                    )
                )
            `)
            .eq('eleves.classes.ecole_id', ecoleId)
            .eq('mois', mois);
        return { data, error };
    },

    async getAllElevesByEcole(ecoleId) {
        const { data, error } = await supabase
            .from('eleves')
            .select(`
                id,
                nom,
                prenom,
                tel_parent,
                classe_id,
                classes!inner(
                    id,
                    nom,
                    ecole_id
                )
            `)
            .eq('classes.ecole_id', ecoleId)
            .eq('actif', true);
        return { data, error };
    },

    async upsertPaiement(paiement) {
        const { data, error } = await supabase
            .from('paiements')
            .upsert([paiement], { onConflict: 'eleve_id,mois' })
            .select();
        return { data, error };
    },

    async getUserByEmail(email) {
        // Recherche optimisée via RPC sécurisé
        const { data, error } = await supabase
            .rpc('get_user_id_by_email', { email_input: email });
            
        // Wrap the result to match expected format { data: { id: ... } }
        if (data) {
             return { data: { id: data }, error: null };
        }
        return { data: null, error: error || new Error('User not found') };
    },

    // Enseignements (Multi-Profs)
    async getEnseignementsByClasse(classeId) {
        const { data, error } = await supabase
            .from('enseignements')
            .select(`
                *,
                profiles (
                    id,
                    role
                )
            `)
            .eq('classe_id', classeId);
        return { data, error };
    },

    async getClassesByEnseignements(professeurId) {
        const { data, error } = await supabase
            .from('enseignements')
            .select(`
                classe_id,
                classes:classe_id (
                    id,
                    nom,
                    niveau
                )
            `)
            .eq('professeur_id', professeurId);
        return { data, error };
    },

    async addEnseignement(enseignement) {
        const { data, error } = await supabase
            .from('enseignements')
            .insert([enseignement])
            .select();
        return { data, error };
    },

    async deleteEnseignement(enseignementId) {
        const { error } = await supabase
            .from('enseignements')
            .delete()
            .eq('id', enseignementId);
        return { error };
    }
};

// Utilitaires UI & Sécurité
export const utils = {
    /**
     * Vérifie si un profil a l'un des rôles autorisés
     * @param {Object} profile - Le profil utilisateur
     * @param {string|string[]} allowedRoles - Rôle(s) autorisé(s)
     * @returns {boolean}
     */
    checkRole(profile, allowedRoles) {
        if (!profile || !profile.role) return false;
        const role = profile.role.trim().toLowerCase();
        const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        return allowed.map(r => r.toLowerCase()).includes(role);
    },

    /**
     * Affiche une notification Toast non-bloquante
     * @param {string} message - Le message à afficher
     * @param {'info'|'success'|'error'} type - Le type de message
     */
    showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.textContent = message;
        
        const colors = {
            error: '#ef4444',
            success: '#22c55e',
            info: '#3b82f6'
        };

        toast.style.cssText = `
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            min-width: 250px;
            font-family: system-ui, -apple-system, sans-serif;
        `;
        
        container.appendChild(toast);

        // Animation d'entrée
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        // Suppression automatique
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Fonctions d'authentification
export const auth = {
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { data, error };
    },

    async signOut() {
        const { error } = await supabase.auth.signOut();
        return { error };
    },

    async getCurrentUser() {
        const { data: { user }, error } = await supabase.auth.getUser();
        return { user, error };
    },

    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    }
};
