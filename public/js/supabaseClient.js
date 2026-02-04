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
export const utils = {
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
    },

    showToast(message, type = 'info') {
        const containerId = 'toast-container-global';
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        const bgColor = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#3b82f6');
        toast.style.cssText = `background-color:${bgColor};color:white;padding:12px 24px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);font-family:system-ui,font-size:14px;pointer-events:auto;min-width:200px;opacity:0;transform:translateY(20px);transition:all 0.3s ease-out;`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
