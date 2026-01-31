import { supabase } from "./supabaseClient.js";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
        const SUPABASE_URL = localStorage.getItem("SUPABASE_URL");
        const SUPABASE_ANON_KEY = localStorage.getItem("SUPABASE_ANON_KEY");
        
        if (SUPABASE_URL && SUPABASE_ANON_KEY) {
           const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

document.addEventListener("DOMContentLoaded", async () => {
  setupSupabaseConfigUI();
  setupAdvancedToggle();
  setupDirectorManagement();
  setupLogoutButton();
});
