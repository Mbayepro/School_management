import { supabase } from "./supabaseClient.js";
import { SyncManager } from './sync-manager.js';

// Logic: Open Modal -> Load current teachers (via getEnseignements) -> Allow Add
async function openAssignModal(classeId, assignProfEmail, assignMatiere, assignClasseId, currentTeachersList, assignProfModal) {
    if (assignProfEmail) assignProfEmail.value = '';
    if (assignMatiere) assignMatiere.value = '';
    if (assignClasseId) assignClasseId.value = classeId;

    // Load current teachers
    if (currentTeachersList) {
        currentTeachersList.innerHTML = '<p class="muted" style="text-align:center;">Chargement...</p>';

        const { data: ens, error } = await supabase
            .from('enseignements')
            .select('id, professeur_id, matiere, profiles:professeur_id(email)')
            .eq('classe_id', classeId);
            // Note: RLS handles filtering, but we could add .eq('classe.ecole_id', ecoleId) if we joined classes


        currentTeachersList.innerHTML = '';

        if (error) {
             currentTeachersList.innerHTML = '<p class="error">Erreur chargement</p>';
        } else if (!ens || ens.length === 0) {
             currentTeachersList.innerHTML = '<p class="muted" style="text-align:center;">Aucun enseignant assigné.</p>';
        } else {
            const list = document.createElement('ul');
            list.style.listStyle = 'none';
            list.style.padding = 0;
            list.style.margin = 0;

            ens.forEach(e => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.style.padding = '4px 0';
                li.style.borderBottom = '1px solid #f1f5f9';

                li.innerHTML = `
                    <span><b>${e.matiere}</b></span>
                    <button class="btn ghost btn-sm" style="color:#ef4444; padding:2px 6px;">✕</button>
                `;

                // Delete action
                li.querySelector('button').addEventListener('click', async () => {
                    if(!confirm('Retirer ce cours ?')) return;
                    await supabase.from('enseignements').delete().eq('id', e.id);
                    openAssignModal(classeId, assignProfEmail, assignMatiere, assignClasseId, currentTeachersList, assignProfModal); // Refresh
                });

                list.appendChild(li);
            });
            currentTeachersList.appendChild(list);
        }
    }

    if (assignProfModal) assignProfModal.classList.remove('hidden');
}

let ecoleId = null;
let professeurs = [];

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('classeForm');
  const classeNomEl = document.getElementById('classeNom');
  const classeNiveauEl = document.getElementById('classeNiveau');
  const classeSerieEl = document.getElementById('classeSerie');
  const classeCycleEl = document.getElementById('classeCycle');
  const labelSerie = document.getElementById('labelSerie');
  const classeMessage = document.getElementById('classeMessage');
  const classesGrid = document.getElementById('classesGrid');
  const totalClassesPill = document.getElementById('totalClassesPill');
  const noClassesMsg = document.getElementById('noClassesMsg');

  // Logic to auto-set Cycle and toggle Serie
  if (classeNiveauEl) {
      classeNiveauEl.addEventListener('change', () => {
          const val = classeNiveauEl.value;
          
          // Cycle Logic
          if (val === 'primaire') {
              classeCycleEl.value = 'Primaire';
          } else if (val === 'college' || val === 'lycee') {
              classeCycleEl.value = 'Secondaire';
          } else {
              classeCycleEl.value = '';
          }

          // Serie Logic
          if (val === 'lycee') {
              labelSerie.classList.remove('hidden');
          } else {
              labelSerie.classList.add('hidden');
              if (classeSerieEl) classeSerieEl.value = '';
          }
      });
  }

  // Modal elements
  const assignProfModal = document.getElementById('assignProfModal');
  const closeAssignModal = document.getElementById('closeAssignModal');
  const submitAssignBtn = document.getElementById('submitAssignBtn');
  const assignProfEmail = document.getElementById('assignProfEmail');
  const assignClasseId = document.getElementById('assignClasseId');
  const assignMatiere = document.getElementById('assignMatiere');
  const currentTeachersList = document.getElementById('currentTeachersList');

  if (closeAssignModal) {
      closeAssignModal.addEventListener('click', () => {
          assignProfModal.classList.add('hidden');
      });
  }

  if (submitAssignBtn) {
      submitAssignBtn.addEventListener('click', async () => {
          let email = assignProfEmail.value.trim().toLowerCase();
          const matiere = assignMatiere.value.trim();
          const coef = parseFloat(document.getElementById('assignCoef')?.value || '1');
          const cid = assignClasseId.value;

          if (!email || !cid || !matiere) {
              alert("Veuillez remplir l'email et la matière.");
              return;
          }

          // Support for username-only input (e.g., "mbaye-maths")
          if (!email.includes('@')) {
              email += '@ecole.local';
          }

          const prev = submitAssignBtn.textContent;
          submitAssignBtn.disabled = true;
          submitAssignBtn.textContent = 'Ajout...';

          try {
              // 0. Ensure Matiere exists/updates with Coefficient
              // Check if matiere exists for this class
              const { data: matData, error: matErr } = await supabase
                  .from('matieres')
                  .select('id')
                  .eq('classe_id', cid)
                  .ilike('nom', matiere)
                  .maybeSingle();
              
              if (!matData) {
                  // Create it
                  const { error: createErr } = await supabase.from('matieres').insert([{
                      nom: matiere,
                      classe_id: cid,
                      ecole_id: ecoleId,
                      coefficient: coef
                  }]);
                  if (createErr) console.warn("Erreur création matière:", createErr);
              } else {
                  // Update coef
                  await supabase.from('matieres').update({ coefficient: coef }).eq('id', matData.id);
              }

              // Use getUserByEmail to get ID
              const { data: userData, error: userErr } = await supabase
                  .from('profiles')
                  .select('id')
                  .eq('email', email)
                  .single();

              if (userErr || !userData) {
                  alert("Professeur introuvable. Avez-vous créé son compte d'abord ?");
                  return;
              }

              const pid = userData.id;

              const { error: insErr } = await supabase.from('enseignements').insert({
                  classe_id: cid,
                  professeur_id: pid,
                  matiere: matiere
              });

              if (insErr) {
                  if (insErr.code === '23505') alert('Ce professeur enseigne déjà cette matière dans cette classe.');
                  else alert(insErr.message);
              } else {
                  const { error: assignErr } = await supabase.from('classes').update({ professeur_id: pid }).eq('id', cid);
                  if (assignErr) {
                      alert(assignErr.message);
                      return;
                  }
                  alert('Enseignant ajouté et matière configurée !');
                  openAssignModal(cid, assignProfEmail, assignMatiere, assignClasseId, currentTeachersList, assignProfModal); // Refresh list
                  await loadClasses(classesGrid, totalClassesPill, noClassesMsg);
              }

          } catch (e) {
              console.error(e);
              alert('Erreur: ' + e.message);
          } finally {
              submitAssignBtn.disabled = false;
              submitAssignBtn.textContent = prev;
          }
      });
  }

  let user = null;
  try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      user = data?.user;
  } catch (e) {
      console.warn("Auth check warning:", e);
  }

  if (!user) {
      console.error("No user found after auth check");
      alert("Session expirée ou erreur de connexion. Veuillez vous reconnecter.");
      window.location.href = 'login.html';
      return;
  }

  // 1. Get Ecole ID with better error handling - prioritizing profiles table
  // Use global ecoleId variable
  
  try {
      const { data: profile } = await supabase.from('profiles').select('ecole_id').eq('id', user.id).single();
      if (profile && profile.ecole_id) {
          ecoleId = profile.ecole_id;
      }
  } catch (err) {
      console.warn("Profile fetch error:", err);
  }

  // Fallback if not found in profiles (legacy support or race condition)
  if (!ecoleId) {
      console.warn("Ecole ID not found in profiles.");
  }

  if (!ecoleId) {
    const msg = 'Impossible de récupérer l\'identifiant de l\'école. Veuillez contacter le support ou vous reconnecter.';
    console.error(msg);
    showError(msg, classeMessage);
    if (form) {
      Array.from(form.querySelectorAll('input, select, button')).forEach(el => { el.disabled = true; });
    }
    return;
  }

  if (classesGrid) {
    await loadClasses(classesGrid, totalClassesPill, noClassesMsg);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      classeMessage.textContent = '';
      classeMessage.style.display = 'none';

      // 1. Re-vérification de la session et de l'école (CRITIQUE pour RLS)
      const { data: { user: currentUser }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !currentUser) {
          showError('Session expirée. Veuillez vous reconnecter.', classeMessage);
          return;
      }

      // 2. Récupération fraîche de l'ID école depuis le profil
      const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('ecole_id, role')
          .eq('id', currentUser.id)
          .single();

      if (profileErr || !profile || !profile.ecole_id) {
          console.error("Erreur profil/ecole_id:", profileErr, profile);
          showError('Impossible de récupérer l\'identifiant de l\'école depuis votre profil.', classeMessage);
          return;
      }

      // Mise à jour de la variable globale pour cohérence
      ecoleId = profile.ecole_id;
      
      const nom = classeNomEl.value.trim();
      const niveau = classeNiveauEl.value;
      const cycle = classeCycleEl.value;
      const serie = classeSerieEl ? classeSerieEl.value : null;
      
      if (!nom || !niveau || !cycle) {
          showError('Veuillez remplir tous les champs obligatoires (Nom, Niveau).', classeMessage);
          return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const prevBtnText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Création...';

      try {
          // 3. Insertion avec l'ecole_id certifié
          const { error } = await supabase.from('classes').insert([{
              nom,
              niveau,
              cycle,
              serie: serie || null,
              ecole_id: ecoleId // On utilise l'ID fraîchement récupéré
          }]);

          if (error) {
            console.error("Erreur Supabase INSERT:", error);
            throw error;
          }

          console.log("Succès création classe");
          classeNomEl.value = '';
          classeMessage.textContent = 'Classe créée avec succès !';
          classeMessage.className = 'success-message';
          classeMessage.style.display = 'block';
          
          await loadClasses(classesGrid, totalClassesPill, noClassesMsg);
      } catch (e) {
          console.error("Catch Error:", e);
          console.error("[CreateClass] Détails de l'échec - Payload:", { nom, niveau, cycle, serie, ecole_id: ecoleId });
          
          // --- OFFLINE SYNC LOGIC ---
          if (!navigator.onLine || (e.message && (e.message.includes('fetch') || e.message.includes('network')))) {
              SyncManager.addToQueue('classes', { nom, niveau, cycle, serie: serie || null, ecole_id: ecoleId }, 'INSERT');
              classeNomEl.value = '';
              classeMessage.textContent = 'Connexion perdue. Classe sauvegardée localement.';
              classeMessage.className = 'success-message';
              classeMessage.style.display = 'block';
              return;
          }
          // --------------------------

          let errorDetail = e.message || JSON.stringify(e);
          
          if (e.code === '23505') {
              errorDetail = "Une classe avec ce nom existe déjà pour votre école.";
          }
          
          alert('Erreur: ' + errorDetail); // Alert explicit
          showError(errorDetail, classeMessage);
      } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = prevBtnText;
      }
    });
  }
});

function showError(msg, classeMessage) {
  classeMessage.textContent = msg;
  classeMessage.style.display = 'block';
}

async function loadClasses(classesGrid, totalClassesPill, noClassesMsg) {
  if (!classesGrid) return;
  classesGrid.innerHTML = '<div class="muted" style="grid-column: 1/-1; text-align: center;">Chargement...</div>';

  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('ecole_id', ecoleId)
    .order('nom');
  if (error) {
    if (classesGrid) classesGrid.innerHTML = '<div class="error">Erreur de chargement.</div>';
    return;
  }
  // Note: La liste des professeurs n'est pas chargée ici à cause des RLS sur profiles.
  // On propose l'assignation par email via RPC pour contourner proprement.

  if (classesGrid) classesGrid.innerHTML = '';

  const count = data ? data.length : 0;
  if (totalClassesPill) totalClassesPill.textContent = `${count} classe${count > 1 ? 's' : ''}`;

  if (!data || data.length === 0) {
    if (noClassesMsg) noClassesMsg.classList.remove('hidden');
    return;
  }

  if (noClassesMsg) noClassesMsg.classList.add('hidden');

  // Trier par niveau personnalisé puis par nom
  const order = { primaire: 0, college: 1, lycee: 2 };
  data
    .sort((a, b) => {
      const oa = order[a.niveau] ?? 99;
      const ob = order[b.niveau] ?? 99;
      if (oa !== ob) return oa - ob;
      return (a.nom || '').localeCompare(b.nom || '');
    })
    .forEach(async (c, index) => {
      const card = document.createElement('div');
      card.className = 'class-card';
      // Add staggered animation delay
      card.style.animationDelay = `${index * 0.05}s`;
      
      card.innerHTML = `
        <div class="class-info">
          <div class="class-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
          <div class="class-details">
            <h3>${c.nom}</h3>
            <p>${c.niveau}</p>
          </div>
        </div>
        <div class="class-assign" style="display:flex; align-items:center; gap:.5rem; margin-top:.5rem;">
          <button class="btn btn-sm" data-action="assign-email" style="white-space:nowrap;">Assigner par email</button>
          ${c.professeur_id ? `<span class="pill" style="margin-left:.5rem;" data-role="ens-pill">Professeur assigné</span>` : `<span class="pill" style="margin-left:.5rem; background:#f1f5f9; color:#64748b;" data-role="ens-pill">Aucun professeur</span>`}
        </div>
        <button class="btn-icon" title="Supprimer la classe" data-id="${c.id}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      const assignEmailBtn = card.querySelector('[data-action="assign-email"]');
      assignEmailBtn?.addEventListener('click', () => {
        openAssignModal(c.id, assignProfEmail, assignMatiere, assignClasseId, currentTeachersList, assignProfModal);
      });
      // Update pill with actual count of enseignements
      const pill = card.querySelector('[data-role="ens-pill"]');
      try {
        const { data: ens } = await supabase
          .from('enseignements')
          .select('id')
          .eq('classe_id', c.id);
        const count = ens ? ens.length : 0;
        if (pill) {
          if (count > 0) {
            pill.textContent = `${count} professeur${count > 1 ? 's' : ''} assigné${count > 1 ? 's' : ''}`;
            pill.className = 'pill';
            pill.style.background = '';
            pill.style.color = '';
          } else {
            pill.textContent = 'Aucun professeur';
            pill.className = 'pill';
            pill.style.background = '#f1f5f9';
            pill.style.color = '#64748b';
          }
        }
      } catch (_) {}
      const deleteBtn = card.querySelector('.btn-icon');
      deleteBtn && deleteBtn.addEventListener('click', async () => {
        const ok = confirm(`Voulez-vous vraiment supprimer la classe "${c.nom}" ?\nAttention : cela peut affecter les élèves liés.`);
        if (!ok) return;

        // Visual feedback
        if (deleteBtn) deleteBtn.innerHTML = '...';
        
        const { error: delErr } = await supabase.from('classes').delete().eq('id', c.id).eq('ecole_id', ecoleId);
        if (delErr) {
          alert('Erreur suppression: ' + delErr.message);
          if (deleteBtn) deleteBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
          return;
        }
        await loadClasses(classesGrid, totalClassesPill, noClassesMsg);
      });

      classesGrid && classesGrid.appendChild(card);
    });
}
