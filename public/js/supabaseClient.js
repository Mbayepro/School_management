/**
 * Configuration Supabase pour l'application School Management
 * Client JavaScript pour interagir avec Supabase Auth et Database
 */

const APP_NAME = "School Management";

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configuration Supabase
// Note: On force l'utilisation des valeurs par défaut pour éviter les erreurs de cache localStorage avec d'anciens projets
const DEFAULT_SUPABASE_URL = "https://xbfaznaecugwtgzypsjk.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiZmF6bmFlY3Vnd3Rnenlwc2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczOTI2NzEsImV4cCI6MjA4Mjk2ODY3MX0.bHUD2Gd6iW0IJUfk8_6WtQccNgc2qKfhoa_dKJe4mxY";

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
            .eq('ecole_id', ecoleId);
        return { data, error };
    },

    async getClassesByProfesseur(professeurId) {
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('professeur_id', professeurId);
        return { data, error };
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
