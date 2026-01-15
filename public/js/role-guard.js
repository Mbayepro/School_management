import { supabase, db } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", async () => {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js'); } catch (_) {}
  }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const id = 'install-banner';
    let banner = document.getElementById(id);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = id;
      banner.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#0ea5e9;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 10px 20px rgba(0,0,0,0.1);display:flex;align-items:center;gap:10px;z-index:9999;';
      const text = document.createElement('span');
      text.textContent = 'Installer School Management';
      const btn = document.createElement('button');
      btn.textContent = 'Installer';
      btn.style.cssText = 'background:#fff;color:#0ea5e9;border:none;padding:8px 12px;border-radius:8px;cursor:pointer;font-weight:600;';
      btn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        deferredPrompt = null;
        banner.remove();
      });
      banner.appendChild(text);
      banner.appendChild(btn);
      document.body.appendChild(banner);
    }
  });
  const page = window.location.pathname.split("/").pop();

  // Pages publiques
  if (
    page === "login.html" ||
    page === "reset-password.html" ||
    page === "index.html" ||
    page === ""
  ) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const { data: profile } = await db.getProfile(user.id);
  const deny = (msg) => {
    const el = document.getElementById("error-message");
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
      el.className = "muted";
    } else {
      alert(msg);
    }
  };

  if (!profile || !profile.role) {
    deny("Compte non activé");
    return;
  }

  const role = (profile.role || "").trim().toLowerCase();

  const permissions = {
    "dashboard-directeur.html": ["directeur", "director"],
    "presences-directeur.html": ["directeur", "director"],
    "paiements-directeur.html": ["directeur", "director"],
    "classes.html": ["directeur", "director"],
    "eleves.html": ["directeur", "director"],
    "paiements.html": ["directeur", "director"],
    "dashboard-professeur.html": ["professeur", "teacher"],
    "presences.html": ["professeur", "teacher"],
    "notes.html": ["professeur", "teacher", "directeur", "director"]
  };

  const allowedRoles = permissions[page];
  if (!allowedRoles) return;

  if (!allowedRoles.includes(role)) {
    deny("Accès refusé");
  }
});
