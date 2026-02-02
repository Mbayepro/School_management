import { supabase } from "./supabaseClient.js";
import CONFIG from './config.js';
import { setupLogoutButton } from "./auth.js";

function setupSupabaseConfigUI() {
  const urlInput = document.getElementById("supabaseUrlInput");
  const anonInput = document.getElementById("supabaseAnonInput");
  const saveBtn = document.getElementById("saveSupabaseConfig");
  const msg = document.getElementById("supabaseConfigMsg");
  if (!urlInput || !anonInput || !saveBtn || !msg) return;
  const existingUrl = localStorage.getItem("SUPABASE_URL") || "";
  const existingAnon = localStorage.getItem("SUPABASE_ANON_KEY") || "";
  if (existingUrl) urlInput.value = existingUrl;
  if (existingAnon) anonInput.value = existingAnon;
  saveBtn.addEventListener("click", () => {
    const u = urlInput.value.trim();
    const k = anonInput.value.trim();
    if (!u || !k) {
      msg.textContent = "Renseignez URL et clé anonyme";
      msg.style.display = "block";
      return;
    }
    localStorage.setItem("SUPABASE_URL", u);
    localStorage.setItem("SUPABASE_ANON_KEY", k);
    msg.textContent = "Configuration Supabase enregistrée";
    msg.style.display = "block";
  });
}

function setupAdvancedToggle() {
  const btn = document.getElementById("toggleAdvanced");
  const supa = document.getElementById("advancedSupabase");
  if (!btn || !supa) return;
  btn.addEventListener("click", () => {
    const hidden = supa.classList.contains("hidden");
    supa.classList.toggle("hidden", !hidden ? true : false);
  });
}

function setupDirectorManagement() {
  const emailInput = document.getElementById("profileEmailInput");
  const passwordInput = document.getElementById("profilePasswordInput");
  const roleSelect = document.getElementById("profileRoleSelect");
  const ecoleInput = document.getElementById("profileEcoleInput");
  const saveBtn = document.getElementById("saveProfileBtn");
  const msg = document.getElementById("profileActionMsg");

  if (!emailInput || !roleSelect || !saveBtn || !msg) return;

  async function handleSave() {
    msg.textContent = "";
    msg.style.display = "none";
    msg.className = "muted";
    
    const email = emailInput.value.trim();
    const password = passwordInput ? passwordInput.value : "";
    const role = roleSelect.value;
    const ecoleName = (ecoleInput?.value || "").trim();

    if (!email || !role) {
      msg.textContent = "Email et rôle sont requis";
      msg.style.display = "block";
      return;
    }

    const prev = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "…";

    try {
      let targetEcoleId = null;

      // 1. Si un nom d'école est fourni, on crée l'école d'abord
      if (ecoleName) {
          const { data: ecoleData, error: ecoleError } = await supabase
            .from('ecoles')
            .insert([{ nom: ecoleName, active: true }])
            .select()
            .single();
          
          if (ecoleError) {
              // Si erreur, peut-être qu'on voulait juste chercher? 
              // Pour simplifier, on assume que SuperAdmin crée une nouvelle école.
              throw new Error("Erreur création école: " + ecoleError.message);
          }
          targetEcoleId = ecoleData.id;
      }

      // 2. Création de l'utilisateur (Auth) si mot de passe fourni
      // On utilise un client temporaire pour ne pas écraser la session du Super Admin
      if (password && password.length >= 6) {
        const SUPABASE_URL = localStorage.getItem("SUPABASE_URL") || CONFIG.SUPABASE_URL;
        const SUPABASE_ANON_KEY = localStorage.getItem("SUPABASE_ANON_KEY") || CONFIG.SUPABASE_ANON_KEY;
        
        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
           // Fallback to window.supabase.createClient if ESM import failed or unavailable
           let createClientFn = window.supabase && window.supabase.createClient;
           if (!createClientFn) {
               try {
                  const mod = await import('https://esm.sh/@supabase/supabase-js@2');
                  createClientFn = mod.createClient;
               } catch(e) { console.error("Dynamic import failed", e); }
           }
           
           if (!createClientFn) {
               throw new Error("Impossible d'initialiser le client Supabase (createClient manquant).");
           }

           const tempClient = createClientFn(SUPABASE_URL, SUPABASE_ANON_KEY, {
               auth: { 
                 persistSession: false, // Important : ne pas stocker la session
                 autoRefreshToken: false,
                 detectSessionInUrl: false
               } 
           });
           
           const { error: upError } = await tempClient.auth.signUp({
               email,
               password
           });

           if (upError) {
               // On ignore l'erreur si l'utilisateur existe déjà, on continuera pour mettre à jour son rôle
               const isAlreadyRegistered = upError.message.includes("already registered") || upError.status === 422;
               if (!isAlreadyRegistered) {
                   throw new Error("Erreur création Auth: " + upError.message);
               }
           }
        } else {
            console.error("Configuration Supabase manquante (URL/KEY)");
            throw new Error("Configuration Supabase manquante. Veuillez vérifier config.js ou le localStorage.");
        }
      } else if (!password && role === 'director') {
          // Avertissement si on crée un directeur sans mot de passe (s'il n'existe pas déjà)
          // Mais on laisse passer pour la mise à jour
      }

      // 3. Appel RPC pour mettre à jour le profil (Rôle, Ecole, Active)
      // Si c'est un directeur, on s'assure qu'il a une école (créée automatiquement si ecoleId est null)
      const { data, error } = await supabase.rpc('admin_upsert_user', {
        target_email: email,
        target_role: role,
        target_ecole_id: targetEcoleId || null,
        target_active: true
      });

      if (error) {
        throw new Error("Erreur RPC: " + error.message);
      }
      
      const successMsg = data?.message || "Profil mis à jour avec succès";
      msg.textContent = successMsg;
      msg.style.display = "block";
      msg.style.color = "#10b981";
      
      // Reset inputs
      if (passwordInput) passwordInput.value = "";
      emailInput.value = "";
      if(ecoleInput) ecoleInput.value = "";

    } catch (e) {
      console.error(e);
      msg.textContent = "Erreur: " + (e.message || "Impossible de modifier le profil");
      msg.style.display = "block";
      msg.style.color = "#ef4444";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = prev;
    }
  }

  saveBtn.addEventListener("click", () => handleSave());
}

async function setupPendingApprovals() {
  const container = document.getElementById("pendingList");
  const countBadge = document.getElementById("pendingCount");
  if (!container) return;

  async function loadPending() {
    container.innerHTML = '<p class="muted">Chargement...</p>';
    
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*, ecoles(nom)')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = `<p class="error">Erreur: ${error.message}</p>`;
      return;
    }

    if (!profiles || profiles.length === 0) {
      container.innerHTML = '<p class="muted">Aucun compte en attente.</p>';
      if (countBadge) {
        countBadge.textContent = "0";
        countBadge.className = "pill";
      }
      return;
    }

    if (countBadge) {
      countBadge.textContent = profiles.length;
      countBadge.className = "pill warning";
    }

    container.innerHTML = '';
    profiles.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';
      card.style.padding = '12px';
      card.style.border = '1px solid #e5e7eb';
      card.style.borderRadius = '8px';
      card.style.backgroundColor = '#fff';

      const ecoleNom = p.ecoles?.nom || 'École inconnue';
      const roleDisplay = p.role === 'pending_director' ? 'Directeur (En attente)' : p.role;

      card.innerHTML = `
        <div>
          <div style="font-weight:600;">${p.email}</div>
          <div style="font-size:0.9rem; color:#6b7280;">${roleDisplay} • ${ecoleNom}</div>
          <div style="font-size:0.8rem; color:#9ca3af;">Inscrit le: ${new Date(p.created_at).toLocaleDateString()}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn primary btn-sm btn-approve" data-id="${p.id}">Approuver</button>
        </div>
      `;
      container.appendChild(card);
    });

    // Add event listeners
    document.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const uid = e.target.dataset.id;
        if (!uid) return;
        
        const originalText = e.target.textContent;
        e.target.textContent = '...';
        e.target.disabled = true;

        try {
          // Update profile directly via RLS
          const { error: updateErr } = await supabase
            .from('profiles')
            .update({ is_approved: true })
            .eq('id', uid);

          if (updateErr) throw updateErr;
          
          // Refresh list
          await loadPending();
          
        } catch (err) {
          console.error(err);
          alert("Erreur lors de l'approbation: " + err.message);
          e.target.textContent = originalText;
          e.target.disabled = false;
        }
      });
    });
  }

  // Initial load
  await loadPending();
}

document.addEventListener("DOMContentLoaded", async () => {
  setupSupabaseConfigUI();
  setupAdvancedToggle();
  setupDirectorManagement();
  setupPendingApprovals();
  setupLogoutButton();
});
