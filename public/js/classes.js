import { supabase, db } from './supabaseClient.js';

const form = document.getElementById('classeForm');
const classeNomEl = document.getElementById('classeNom');
const classeNiveauEl = document.getElementById('classeNiveau');
const classeMessage = document.getElementById('classeMessage');
const classesGrid = document.getElementById('classesGrid');
const totalClassesPill = document.getElementById('totalClassesPill');
const noClassesMsg = document.getElementById('noClassesMsg');

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

// Logic: Open Modal -> Load current teachers (via getEnseignements) -> Allow Add
async function openAssignModal(classeId) {
    if (assignProfEmail) assignProfEmail.value = '';
    if (assignMatiere) assignMatiere.value = '';
    if (assignClasseId) assignClasseId.value = classeId;
    
    // Load current teachers
    if (currentTeachersList) {
        currentTeachersList.innerHTML = '<p class="muted" style="text-align:center;">Chargement...</p>';
        
        const { data: ens, error } = await db.getEnseignementsByClasse(classeId);
        
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
                    await db.deleteEnseignement(e.id);
                    openAssignModal(classeId); // Refresh
                });
                
                list.appendChild(li);
            });
            currentTeachersList.appendChild(list);
        }
    }
    
    if (assignProfModal) assignProfModal.classList.remove('hidden');
}

if (submitAssignBtn) {
    submitAssignBtn.addEventListener('click', async () => {
        let email = assignProfEmail.value.trim().toLowerCase();
        const matiere = assignMatiere.value.trim();
        const cid = assignClasseId.value;
        
        if (!email || !cid || !matiere) {
            alert("Veuillez remplir l'email et la matière.");
            return;
        }

        if (!email.includes('@')) {
            email += '@ecole.local';
        }

        const prev = submitAssignBtn.textContent;
        submitAssignBtn.disabled = true;
        submitAssignBtn.textContent = 'Ajout...';

        try {
            // Use getUserByEmail to get ID
            const { data: userData, error: userErr } = await db.getUserByEmail(email);
            
            if (userErr || !userData) {
                alert("Professeur introuvable. Avez-vous créé son compte d'abord ?");
                return;
            }
            
            const pid = userData.id;

            const { error: insErr } = await db.addEnseignement({
                classe_id: cid,
                professeur_id: pid,
                matiere: matiere
            });

            if (insErr) {
                if (insErr.code === '23505') alert('Ce professeur enseigne déjà cette matière dans cette classe.');
                else alert(insErr.message);
            } else {
                const { error: assignErr } = await db.assignClassToProfessor(email, cid);
                if (assignErr) {
                    alert(assignErr.message);
                    return;
                }
                alert('Enseignant ajouté !');
                openAssignModal(cid); // Refresh list
                await loadClasses();
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

let ecoleId = null;
let professeurs = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: ecole, error: ecoleError } = await db.getEcoleId(user.id);
  if (ecoleError) return;
  ecoleId = ecole?.ecole_id || null;
  if (!ecoleId) {
    try {
      await db.ensureProfileForUser(user.id, user.email || '', null);
      const { data: refreshed } = await db.getEcoleId(user.id);
      ecoleId = refreshed?.ecole_id || null;
    } catch (_) {}
    if (!ecoleId) {
      showError('Impossible de créer une classe: compte non associé à une école.');
      if (form) {
        Array.from(form.querySelectorAll('input, select, button')).forEach(el => { el.disabled = true; });
      }
      return;
    }
  }

  await loadClasses();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    classeMessage.textContent = '';
    classeMessage.style.display = 'none';

    if (!ecoleId) {
      showError('Impossible de créer une classe: compte non associé à une école.');
      return;
    }

    const nom = classeNomEl.value.trim();
    const niveau = classeNiveauEl.value;
    if (!nom || !niveau) return;

    // Bonus: empêcher doublons (même nom + même niveau pour l'école)
    const { data: exist, error: existErr } = await supabase
      .from('classes')
      .select('id')
      .eq('ecole_id', ecoleId)
      .eq('niveau', niveau)
      .ilike('nom', nom)
      .limit(1);
    if (!existErr && exist && exist.length > 0) {
      showError('Une classe avec ce nom existe déjà pour ce niveau.');
      return;
    }

    try {
      const { error } = await supabase
        .from('classes')
        .insert([{ nom, niveau, ecole_id: ecoleId }]);

      if (error) {
        showError(`Erreur lors de la création: ${error.message ?? 'inconnue'}`);
        return;
      }
    } catch (err) {
      showError(`Erreur lors de la création: ${err?.message ?? 'inconnue'}`);
      return;
    }

    form.reset();
    await loadClasses();
    // Optional: Toast notification could go here
  });
});

function showError(msg) {
  classeMessage.textContent = msg;
  classeMessage.style.display = 'block';
}

async function loadClasses() {
  classesGrid.innerHTML = '<div class="muted" style="grid-column: 1/-1; text-align: center;">Chargement...</div>';
  
  const { data, error } = await db.getClassesByEcole(ecoleId);
  if (error) {
    classesGrid.innerHTML = '<div class="error">Erreur de chargement.</div>';
    return;
  }
  // Note: La liste des professeurs n'est pas chargée ici à cause des RLS sur profiles.
  // On propose l'assignation par email via RPC pour contourner proprement.
  
  classesGrid.innerHTML = '';
  
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
        openAssignModal(c.id);
      });
      // Update pill with actual count of enseignements
      const pill = card.querySelector('[data-role="ens-pill"]');
      try {
        const { data: ens } = await db.getEnseignementsByClasse(c.id);
        const count = ens ? ens.length : 0;
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
      } catch (_) {}
      const deleteBtn = card.querySelector('.btn-icon');
      deleteBtn.addEventListener('click', async () => {
        const ok = confirm(`Voulez-vous vraiment supprimer la classe "${c.nom}" ?\nAttention : cela peut affecter les élèves liés.`);
        if (!ok) return;

        // Visual feedback
        deleteBtn.innerHTML = '...';
        
        const { error: delErr } = await supabase.from('classes').delete().eq('id', c.id);
        if (delErr) {
          alert('Erreur suppression: ' + delErr.message);
          deleteBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
          return;
        }
        await loadClasses();
      });

      classesGrid.appendChild(card);
    });
}
