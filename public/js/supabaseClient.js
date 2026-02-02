/**
 * Configuration Supabase pour l'application School Management
 * Client JavaScript pour interagir avec Supabase Auth et Database
 */

const APP_NAME = "School Management";

// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import CONFIG from './config_v2.js';

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
// On ignore TOUJOURS le localStorage pour l'URL et la KEY pour éviter les conflits avec d'anciens projets
const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY;

// Nettoyage forcé du localStorage pour éviter les conflits persistants
try {
    localStorage.removeItem("SUPABASE_URL");
    localStorage.removeItem("SUPABASE_ANON_KEY");
    // On nettoie aussi la session si elle est liée à l'ancien projet (vérification simple sur l'URL)
    const storedSession = localStorage.getItem(`sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`);
    if (!storedSession && localStorage.length > 0) {
        // Optionnel: on pourrait être plus agressif si nécessaire, mais commençons par ignorer les vieilles clés
    }
} catch(e) { console.warn("Erreur nettoyage localStorage:", e); }

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    alert(`Configuration ${APP_NAME}:\nVeuillez configurer SUPABASE_URL et SUPABASE_ANON_KEY dans config.js`);
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
        // Use specific columns to avoid RLS issues with select(*)
        const { data: mainClasses, error: mainError } = await supabase
            .from('classes')
            .select('id, nom, niveau, ecole_id, professeur_id')
            .eq('professeur_id', professeurId);
            
        // 2. Classes where user teaches a subject (via enseignements)
        const { data: subjectClasses, error: subjectError } = await supabase
            .from('enseignements')
            .select('classe_id, classes(id, nom, niveau, ecole_id)')
            .eq('professeur_id', professeurId);
            
        if (mainError && subjectError) {
             console.error("Error fetching classes:", mainError, subjectError);
             return { data: [], error: mainError };
        }

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

    // --- UTILS ---
    checkRole(profile, allowedRoles) {
        if (!profile || !profile.role) return false;
        const role = profile.role.trim().toLowerCase();
        const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        
        // Check exact match
        if (allowed.map(r => r.toLowerCase()).includes(role)) return true;

        // Special case: pending_director treated as director if approved
        if (role === 'pending_director' && profile.is_approved === true) {
            if (allowed.some(r => ['directeur', 'director'].includes(r.toLowerCase()))) {
                return true;
            }
        }

        return false;
    }
};
