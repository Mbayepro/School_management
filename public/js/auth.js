/**
 * Auth – School Management (Supabase JS v2)
 * Objectif : ultra simple, stable, sans boucle de redirection
 * - Aucune redirection automatique au chargement
 * - AUCUN onAuthStateChange pour rediriger
 * - Redirection UNIQUE après clic sur login
 */

import { supabase, db } from "./supabaseClient.js";

/**
 * Effectue le login puis redirige UNE seule fois selon le rôle.
 * - Utilise uniquement supabase.auth.signInWithPassword
 * - Récupère le profil dans la table profiles
 * - Si profil absent : affiche une erreur et ne redirige pas
 */
export async function login(email, password) {
  const errorEl = document.getElementById("error-message");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Erreur de connexion:", error);
    if (errorEl) {
      // Affiche le message d'erreur spécifique de Supabase si disponible, sinon un message générique
      errorEl.textContent = error.message === "Invalid login credentials" 
        ? "Email ou mot de passe incorrect." 
        : `Erreur: ${error.message}`;
      errorEl.style.display = "block";
    }
    return;
  }

  const userId = data?.user?.id;
  if (!userId) {
    if (errorEl) {
      errorEl.textContent = "Session invalide";
      errorEl.style.display = "block";
    }
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ecole_id')
    .eq('id', userId)
    .single();
  if (!profile || !profile.role) {
    if (errorEl) {
      errorEl.textContent = "Compte non activé";
      errorEl.style.display = "block";
    }
    return;
  }
  const role = (profile.role || "").trim().toLowerCase();
  if (role === 'directeur' || role === 'director') {
    window.location.href = 'dashboard-directeur.html';
    return;
  }
  if (role === 'professeur' || role === 'teacher') {
    window.location.href = 'dashboard-professeur.html';
    return;
  }
  if (role === 'super_admin') {
    window.location.href = 'dashboard-superadmin.html';
    return;
  }
  if (errorEl) {
    errorEl.textContent = "Accès refusé";
    errorEl.style.display = "block";
  }
}

/**
 * Déconnecte puis redirige explicitement vers login.html
 */
export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

/**
 * Branche le formulaire de login (login.html)
 * - Redirection uniquement après clic sur le bouton
 * - Pas d’attente/boucle/timeout
 */
export function setupLoginForm() {
  const form = document.getElementById("login-form");
  const btn = document.getElementById("login-btn");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const errorEl = document.getElementById("error-message");
  const forgotLink = document.getElementById("forgot-link");
  const forgotSection = document.getElementById("forgot-section");
  const forgotEmail = document.getElementById("forgot-email");
  const resetBtn = document.getElementById("reset-btn");
  const resetMsg = document.getElementById("reset-message");
  const recoverySection = document.getElementById("recovery-section");
  const newPwd = document.getElementById("new-password");
  const confirmPwd = document.getElementById("confirm-password");
  const updatePwdBtn = document.getElementById("update-password-btn");
  const updateMsg = document.getElementById("update-message");

  if (!form || !btn || !emailEl || !passwordEl) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }

    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Connexion…";
    try {
      await login(emailEl.value.trim(), passwordEl.value);
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });

  if (forgotLink && forgotSection) {
    forgotLink.addEventListener("click", (e) => {
      e.preventDefault();
      forgotSection.classList.toggle("hidden");
    });
  }

  // --- SIGNUP LOGIC START ---
  const toggleSignupBtn = document.getElementById("toggle-signup");
  const toggleLoginBtn = document.getElementById("toggle-login");
  const signupForm = document.getElementById("signup-form");
  const signupSchool = document.getElementById("signup-school");
  const signupEmail = document.getElementById("signup-email");
  const signupPassword = document.getElementById("signup-password");
  const signupBtn = document.getElementById("signup-btn");
  const successMsg = document.getElementById("success-message");

  // Toggle Forms
  if (toggleSignupBtn && toggleLoginBtn && signupForm) {
    toggleSignupBtn.addEventListener("click", (e) => {
      e.preventDefault();
      form.classList.add("hidden");
      signupForm.classList.remove("hidden");
      toggleSignupBtn.classList.add("hidden");
      toggleLoginBtn.classList.remove("hidden");
      if(errorEl) errorEl.style.display = "none";
      if(successMsg) successMsg.style.display = "none";
    });

    toggleLoginBtn.addEventListener("click", (e) => {
      e.preventDefault();
      signupForm.classList.add("hidden");
      form.classList.remove("hidden");
      toggleLoginBtn.classList.add("hidden");
      toggleSignupBtn.classList.remove("hidden");
      if(errorEl) errorEl.style.display = "none";
      if(successMsg) successMsg.style.display = "none";
    });
  }

  // Handle Signup Submit
  if (signupForm && signupBtn) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (errorEl) { errorEl.style.display = "none"; }
      if (successMsg) { successMsg.style.display = "none"; }

      const email = signupEmail.value.trim();
      const password = signupPassword.value;
      const schoolName = signupSchool.value.trim();

      if (!email || !password || !schoolName) {
        if (errorEl) {
          errorEl.textContent = "Tous les champs sont requis.";
          errorEl.style.display = "block";
        }
        return;
      }

      if (password.length < 6) {
        if (errorEl) {
          errorEl.textContent = "Le mot de passe doit faire au moins 6 caractères.";
          errorEl.style.display = "block";
        }
        return;
      }

      signupBtn.disabled = true;
      const prev = signupBtn.textContent;
      signupBtn.textContent = "Création en cours...";

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              school_name: schoolName
            }
          }
        });

        if (error) throw error;

        if (!error) {
          if (successMsg) {
            successMsg.textContent = "Compte créé avec succès ! Veuillez contacter l'administrateur pour l'activation.";
            successMsg.classList.remove("hidden");
            successMsg.style.display = "block";
          }
          signupForm.reset();
          setTimeout(() => { toggleLoginBtn.click(); }, 3000);
          return;
        }

      } catch (err) {
        console.error(err);
        const msg = err?.message || "";
        const status = err?.status;
        if (status === 500) {
          try {
            const { data: fbData, error: fbErr } = await supabase.auth.signUp({ email, password });
            if (!fbErr) {
              if (successMsg) {
                successMsg.textContent = "Compte créé avec succès ! Veuillez contacter l'administrateur pour l'activation.";
                successMsg.classList.remove("hidden");
                successMsg.style.display = "block";
              }
              signupForm.reset();
              setTimeout(() => { toggleLoginBtn.click(); }, 3000);
              return;
            }
          } catch (_) {}
        }
        if (status === 422 || /already registered/i.test(msg)) {
          if (successMsg) {
            successMsg.textContent = "Cet email existe déjà. Veuillez vous connecter.";
            successMsg.classList.remove("hidden");
            successMsg.style.display = "block";
          }
          setTimeout(() => toggleLoginBtn.click(), 1500);
        } else {
          if (errorEl) {
            const raw = err?.message || "";
            const lower = raw.toLowerCase();
            let display = raw || "Erreur lors de l'inscription. Réessayez plus tard.";
            if (lower.includes("signup") && lower.includes("disable")) {
              display = "Inscriptions désactivées. Contactez l'administrateur.";
            }
            errorEl.textContent = display;
            errorEl.style.display = "block";
          }
        }
      } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = prev;
      }
    });
  }
  // --- SIGNUP LOGIC END ---

  if (resetBtn && forgotEmail && resetMsg) {
    resetBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      resetMsg.textContent = "";
      resetMsg.classList.remove("error");
      resetMsg.classList.remove("success");
      const email = forgotEmail.value.trim();
      if (!email) {
        resetMsg.textContent = "Veuillez saisir votre email";
        resetMsg.classList.add("error");
        resetMsg.style.display = "block";
        return;
      }
      resetBtn.disabled = true;
      const prev = resetBtn.textContent;
      resetBtn.textContent = "Envoi…";
      try {
        const redirectTo = `${window.location.origin}/reset-password.html`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
          resetMsg.textContent = "Échec de l’envoi. Vérifiez l’email.";
          resetMsg.classList.add("error");
        } else {
          resetMsg.textContent = "Email envoyé. Consultez votre boîte de réception.";
          resetMsg.classList.add("success");
        }
        resetMsg.style.display = "block";
      } finally {
        resetBtn.disabled = false;
        resetBtn.textContent = prev;
      }
    });
  }

  if (updatePwdBtn && recoverySection && newPwd && confirmPwd && updateMsg) {
    updatePwdBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      updateMsg.textContent = "";
      updateMsg.classList.remove("error");
      updateMsg.classList.remove("success");
      const p1 = newPwd.value;
      const p2 = confirmPwd.value;
      if (!p1 || p1.length < 6) {
        updateMsg.textContent = "Le nouveau mot de passe doit contenir au moins 6 caractères.";
        updateMsg.classList.add("error");
        updateMsg.style.display = "block";
        return;
      }
      if (p1 !== p2) {
        updateMsg.textContent = "Les mots de passe ne correspondent pas.";
        updateMsg.classList.add("error");
        updateMsg.style.display = "block";
        return;
      }
      updatePwdBtn.disabled = true;
      const prev = updatePwdBtn.textContent;
      updatePwdBtn.textContent = "Mise à jour…";
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr || !user) {
          updateMsg.textContent = "Session de récupération invalide. Reprenez le lien depuis l’email.";
          updateMsg.classList.add("error");
          updateMsg.style.display = "block";
          return;
        }
        const { data, error } = await supabase.auth.updateUser({ password: p1 });
        if (error) {
          updateMsg.textContent = "Échec de la mise à jour du mot de passe.";
          updateMsg.classList.add("error");
          updateMsg.style.display = "block";
          return;
        }
        updateMsg.textContent = "Mot de passe mis à jour. Redirection…";
        updateMsg.classList.add("success");
        updateMsg.style.display = "block";
        const { data: profile2 } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
      const role = (profile2?.role || "").trim().toLowerCase();
      if (role === "directeur" || role === "director") {
        window.location.href = "dashboard-directeur.html";
        return;
      }
      updateMsg.textContent = "Compte non activé";
      updateMsg.classList.add("error");
      updateMsg.style.display = "block";
    } finally {
      updatePwdBtn.disabled = false;
      updatePwdBtn.textContent = prev;
      }
    });
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      if (recoverySection) recoverySection.classList.remove("hidden");
      if (forgotSection) forgotSection.classList.add("hidden");
      if (form) form.classList.add("hidden");
    }
  });
}

export function setupResetPasswordPage() {
  const newPwd = document.getElementById("reset-new-password");
  const confirmPwd = document.getElementById("reset-confirm-password");
  const btn = document.getElementById("reset-submit");
  const msg = document.getElementById("reset-message");
  if (!newPwd || !confirmPwd || !btn || !msg) return;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    msg.classList.remove("error");
    msg.classList.remove("success");
    const p1 = newPwd.value;
    const p2 = confirmPwd.value;
    if (!p1 || p1.length < 6) {
      msg.textContent = "Le mot de passe doit contenir au moins 6 caractères.";
      msg.classList.add("error");
      msg.style.display = "block";
      return;
    }
    if (p1 !== p2) {
      msg.textContent = "Les mots de passe ne correspondent pas.";
      msg.classList.add("error");
      msg.style.display = "block";
      return;
    }
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "Mise à jour…";
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        msg.textContent = "Lien invalide ou expiré. Reprenez depuis l’email.";
        msg.classList.add("error");
        msg.style.display = "block";
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) {
        msg.textContent = "Échec de la mise à jour du mot de passe.";
        msg.classList.add("error");
        msg.style.display = "block";
        return;
      }
      msg.textContent = "Mot de passe mis à jour. Redirection…";
      msg.classList.add("success");
      msg.style.display = "block";
      const { data: profile2 } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      const role = (profile2?.role || "").trim().toLowerCase();
      if (role === "directeur" || role === "director") {
        window.location.href = "dashboard-directeur.html";
        return;
      }
      msg.textContent = "Compte non activé";
      msg.classList.add("error");
      msg.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

/**
 * Branche le bouton de déconnexion sur les pages protégées
 */
export function setupLogoutButton() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", async () => {
    await logout();
  });
}

export function setupChangePasswordUI() {
  const openBtn = document.getElementById("changePwdOpen");
  const panel = document.getElementById("changePwdPanel");
  const newEl = document.getElementById("changeNewPassword");
  const confirmEl = document.getElementById("changeConfirmPassword");
  const submitBtn = document.getElementById("changePwdSubmit");
  const msgEl = document.getElementById("changePwdMessage");

  if (!openBtn || !panel || !newEl || !confirmEl || !submitBtn || !msgEl) return;

  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    panel.classList.toggle("hidden");
  });

  submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    msgEl.textContent = "";
    msgEl.classList.remove("error");
    msgEl.classList.remove("success");
    const p1 = newEl.value;
    const p2 = confirmEl.value;
    if (!p1 || p1.length < 6) {
      msgEl.textContent = "Le mot de passe doit contenir au moins 6 caractères.";
      msgEl.classList.add("error");
      msgEl.style.display = "block";
      return;
    }
    if (p1 !== p2) {
      msgEl.textContent = "Les mots de passe ne correspondent pas.";
      msgEl.classList.add("error");
      msgEl.style.display = "block";
      return;
    }
    submitBtn.disabled = true;
    const prev = submitBtn.textContent;
    submitBtn.textContent = "Mise à jour…";
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        msgEl.textContent = "Session invalide. Veuillez vous reconnecter.";
        msgEl.classList.add("error");
        msgEl.style.display = "block";
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) {
        msgEl.textContent = "Échec de la mise à jour du mot de passe.";
        msgEl.classList.add("error");
        msgEl.style.display = "block";
        return;
      }
      msgEl.textContent = "Mot de passe mis à jour.";
      msgEl.classList.add("success");
      msgEl.style.display = "block";
      newEl.value = "";
      confirmEl.value = "";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = prev;
    }
  });
}

/**
 * Met à jour la marque (nom d'application) dans le topbar avec le nom de l'école
 */
export async function setupTopbarBrand() {
  const appEl = document.querySelector(".topbar .brand .app");
  if (!appEl) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await db.getProfile(user.id);
    const ecoleId = profile?.ecole_id;
    if (!ecoleId) return;
    const { data: ecoleRow } = await supabase
      .from("ecoles")
      .select("nom")
      .eq("id", ecoleId)
      .single();
    if (ecoleRow?.nom) {
      appEl.textContent = ecoleRow.nom;
    }
  } catch (_) {}
}

// Si on est sur login.html, brancher le formulaire sans redirection automatique
document.addEventListener("DOMContentLoaded", () => {
  const page = window.location.pathname.split("/").pop();
  if (page === "login.html") {
    setupLoginForm();
    return;
  }
  if (page === "reset-password.html") {
    setupResetPasswordPage();
    return;
  }
  setupChangePasswordUI();
});
