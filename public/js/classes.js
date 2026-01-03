import { supabase, db } from './supabaseClient.js';

const form = document.getElementById('classeForm');
const classeNomEl = document.getElementById('classeNom');
const classeNiveauEl = document.getElementById('classeNiveau');
const classeMessage = document.getElementById('classeMessage');
const classesGrid = document.getElementById('classesGrid');
const totalClassesPill = document.getElementById('totalClassesPill');
const noClassesMsg = document.getElementById('noClassesMsg');

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
    .forEach((c, index) => {
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
          ${c.professeur_id ? `<span class="pill" style="margin-left:.5rem;">Professeur assigné</span>` : `<span class="pill" style="margin-left:.5rem; background:#f1f5f9; color:#64748b;">Aucun professeur</span>`}
        </div>
        <button class="btn-icon" title="Supprimer la classe" data-id="${c.id}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      const assignEmailBtn = card.querySelector('[data-action="assign-email"]');
      assignEmailBtn?.addEventListener('click', async () => {
        const email = prompt('Email du professeur à assigner:');
        if (!email) return;
        const prev = assignEmailBtn.textContent;
        assignEmailBtn.disabled = true;
        assignEmailBtn.textContent = '…';
        const { data, error } = await db.assignClassToProfessor(email.trim(), c.id);
        assignEmailBtn.disabled = false;
        assignEmailBtn.textContent = prev;
        if (error) {
          alert(error.message || 'Erreur lors de l’assignation.');
          return;
        }
        const ok = (data && data.success) !== false;
        alert((ok ? data.message : (data?.message || 'Résultat inconnu')));
        await loadClasses();
      });
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
