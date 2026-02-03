import { supabase } from "./supabaseClient.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("register-form");
  const btn = document.getElementById("register-btn");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const confirmPasswordEl = document.getElementById("confirm-password");
  const ecoleNameEl = document.getElementById("ecoleName");
  const errorEl = document.getElementById("error-message");
  const successEl = document.getElementById("success-message");

  if (!form) return;

  // Helper pour afficher les erreurs
  function showError(msg) {
      if (errorEl) {
          errorEl.textContent = msg;
          errorEl.style.display = "block";
      } else {
          alert(msg);
      }
      btn.disabled = false;
      btn.textContent = "S'inscrire";
  }

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
    const ecoleNom = ecoleNameEl ? ecoleNameEl.value.trim() : "Nouvelle École";

    // Validation simple
    if (password !== confirmPassword) {
      showError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 6) {
        showError("Le mot de passe doit contenir au moins 6 caractères.");
        return;
    }

    if (!ecoleNom) {
        showError("Le nom de l'école est requis.");
        return;
    }

    // Désactiver le bouton
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "Création en cours...";

    try {
      // 1. Inscription Auth avec Métadonnées
      // Le Trigger SQL 'on_auth_user_created' se chargera de créer l'école et le profil
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                ecole_nom: ecoleNom, // Important : transmis au Trigger SQL
                role: 'pending_director'
            }
        }
      });

      if (authError) throw authError;

      // Si succès (même si email confirmation est requis)
      // On affiche le message de succès
      form.style.display = "none";
      window.scrollTo(0, 0);
      
      if (successEl) {
        successEl.classList.remove("hidden");
        successEl.style.display = "block";
        successEl.innerHTML = `
          <h3>Compte créé avec succès !</h3>
          <p>L'école <strong>${ecoleNom}</strong> a été enregistrée.</p>
          <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin-top: 15px; border: 1px solid #ffeeba;">
            <strong>Statut : En attente de validation</strong><br>
            Votre compte a été créé. Si vous ne pouvez pas vous connecter immédiatement, vérifiez vos emails pour confirmer votre adresse.
            <br><br>
            Une fois connecté, vous devrez attendre l'approbation de l'administrateur.
          </div>
          <a href="login.html" class="btn primary btn-sm" style="margin-top:15px;">Retour à la connexion</a>
        `;
      }

    } catch (error) {
      console.error("Erreur inscription:", error);
      showError(error.message || "Une erreur est survenue lors de l'inscription.");
    } finally {
        if (!successEl || successEl.classList.contains("hidden")) {
            btn.disabled = false;
            btn.textContent = prevText;
        }
    }
  });
});
