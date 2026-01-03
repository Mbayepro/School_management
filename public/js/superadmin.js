import { supabase } from "./supabaseClient.js";
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
  const roleSelect = document.getElementById("profileRoleSelect");
  const ecoleInput = document.getElementById("profileEcoleInput");
  const saveBtn = document.getElementById("saveProfileBtn");
  const msg = document.getElementById("profileActionMsg");

  if (!emailInput || !roleSelect || !saveBtn || !msg) return;

  async function handleSave() {
    msg.textContent = "";
    msg.style.display = "none";
    msg.className = "muted";
    
    const inputVal = emailInput.value.trim();
    const role = roleSelect.value;
    const ecoleId = (ecoleInput?.value || "").trim() || null;
    if (!inputVal || !role) {
      msg.textContent = "Email et rôle sont requis";
      msg.style.display = "block";
      return;
    }

    const prev = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = "…";

    try {
      // Tentative d'appel RPC (si la fonction existe)
      const { data, error } = await supabase.rpc('admin_upsert_user', {
        target_email: inputVal,
        target_role: role,
        target_ecole_id: ecoleId || null,
        target_active: true
      });

      if (error) {
        // Fallback: Si la fonction RPC n'existe pas ou échoue, message d'erreur clair
        throw new Error("Erreur RPC: " + error.message + ". Assurez-vous d'avoir exécuté le script 'admin_upsert_user.sql'.");
      }
      
      msg.textContent = data?.message || "Profil mis à jour avec succès";
      msg.style.display = "block";
      msg.style.color = "#10b981";

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
