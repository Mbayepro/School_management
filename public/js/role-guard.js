import { supabase, db } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", async () => {
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
    "presences.html": ["professeur", "teacher"]
  };

  const allowedRoles = permissions[page];
  if (!allowedRoles) return;

  if (!allowedRoles.includes(role)) {
    deny("Accès refusé");
  }
});
