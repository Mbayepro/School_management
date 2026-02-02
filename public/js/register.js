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
      // 1. Inscription Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                role: 'directeur' // Métadonnée utile
            }
        }
      });

      if (authError) throw authError;

      const userId = authData.user?.id || null;
      
      if (userId) {
        // 2. Créer l'école
        const { data: ecoleData, error: ecoleError } = await supabase
            .from('ecoles')
            .insert([{ nom: ecoleNom, active: false }]) 
            .select()
            .single();

        if (ecoleError) {
             console.error("Erreur création école:", ecoleError);
             // Si l'école existe déjà ou autre erreur, on continue pour essayer de créer le profil si possible,
             // ou on arrête ? Pour un nouveau compte, l'école ne devrait pas exister.
             // On log mais on throw pour avertir l'utilisateur.
             throw new Error("Erreur lors de la création de l'école : " + ecoleError.message);
        }

        const ecoleId = ecoleData ? ecoleData.id : null;

        // 3. Créer le profil lié à l'école
        const role = (email === 'mbayeadama669@gmail.com') ? 'super_admin' : 'pending_director';
        const isApproved = (email === 'mbayeadama669@gmail.com');

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert([
              { 
                  id: userId, 
                  email: email, 
                  role: role, 
                  ecole_id: ecoleId,
                  active: true,
                  is_approved: isApproved
              }
          ]);
        
        if (profileError) {
             // Ignorer erreur de duplication si l'utilisateur a cliqué deux fois vite
             if (profileError.code !== '23505') {
                 console.error("Erreur création profil:", profileError);
                 throw new Error("Erreur lors de la création du profil : " + profileError.message);
             }
        }
      }

      // --- SUCCÈS ---
      form.style.display = "none";
      
      // Force le message de succès
      if (successEl) {
          successEl.classList.remove("hidden");
          successEl.style.display = "block";
          successEl.innerHTML = `
          <h3>Compte créé avec succès !</h3>
          <p>Votre école <strong>${ecoleNom}</strong> a été enregistrée.</p>
          <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin-top: 15px; border: 1px solid #ffeeba;">
            <strong>Statut : En attente de validation</strong><br>
            Votre compte a été créé mais doit être approuvé par l'administrateur avant de pouvoir accéder au tableau de bord.
          </div>
          <p style="margin-top:10px;">Vous pouvez tenter de vous connecter pour vérifier votre statut.</p>
          <a href="login.html" class="btn primary btn-sm" style="margin-top:10px;">Retour à la connexion</a>
        `;
        successEl.classList.remove("hidden");
        
        // Optionnel : rediriger après délai
        // setTimeout(() => { window.location.href = 'login.html'; }, 5000);
      } else {
          alert("Compte créé avec succès ! Redirection vers la connexion...");
          window.location.href = 'login.html';
      }

    } catch (err) {
      console.error(err);
      window.scrollTo(0, 0);
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
