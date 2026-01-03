import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("register-form");
  const btn = document.getElementById("register-btn");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const confirmPasswordEl = document.getElementById("confirm-password");
  const errorEl = document.getElementById("error-message");
  const successEl = document.getElementById("success-message");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Reset messages
    if (errorEl) {
        errorEl.textContent = "";
        errorEl.style.display = "none";
    }
    if (successEl) successEl.classList.add("hidden");

    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmPasswordEl.value;

    // Validation simple
    if (password !== confirmPassword) {
      showError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 6) {
        showError("Le mot de passe doit contenir au moins 6 caractères.");
        return;
    }

    // Désactiver le bouton
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "Création en cours...";

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                role: 'directeur' // Métadonnée utile pour les triggers éventuels
            }
        }
      });

      if (authError) {
        // Fallback si erreur 500 côté Supabase
        if (authError.status === 500) {
          const { data: fbData, error: fbErr } = await supabase.auth.signUp({ email, password });
          if (!fbErr) {
            form.style.display = "none";
            successEl.classList.remove("hidden");
            return;
          }
        }
        throw authError;
      }

      const userId = authData.user?.id || null;
      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
              { 
                  id: userId, 
                  email: email, 
                  active: false 
              }
          ]);
        if (profileError && profileError.code !== '23505') {
          console.warn("Info profil:", profileError);
        }
      }

      form.style.display = "none";
      successEl.classList.remove("hidden");

    } catch (err) {
      showError(err.message || "Une erreur est survenue lors de l'inscription.");
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  });

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    } else {
      alert(msg);
    }
  }
});
