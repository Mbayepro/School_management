import { supabase, db } from './supabaseClient.js';

const classeSelect = document.getElementById('classeSelect');
const presenceSection = document.getElementById('presenceSection');
const elevesList = document.getElementById('elevesList');
const todayDate = document.getElementById('todayDate');
const saveBtn = document.getElementById('saveBtn');
const editBtn = document.getElementById('editBtn');
const errorEl = document.getElementById('error-message');
const statusPill = document.getElementById('statusPill');
const currentClassBadge = document.getElementById('currentClassBadge');
const matiereSelect = document.getElementById('matiereSelect');

let selectedClasseId = null;
let selectedMatiereId = null;
let presences = {};
let classesMap = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  todayDate.textContent = new Date().toLocaleDateString('fr-FR');
  const params = new URLSearchParams(window.location.search);
  const targetClasseId = params.get('classeId');
  await loadClasses();
  const firstOption = classeSelect.querySelector('option[value]:not([value=""])');
  if (targetClasseId) {
    selectedClasseId = targetClasseId;
    classeSelect.value = selectedClasseId;
  } else if (firstOption) {
    selectedClasseId = firstOption.value;
    classeSelect.value = selectedClasseId;
  }
  if (selectedClasseId) {
    await loadMatieresForClasse(selectedClasseId);
    await loadEleves(selectedClasseId);
    await checkAlreadySaved();
    presenceSection.classList.remove('hidden');
    updateCurrentClassBadge();
  }
  classeSelect.addEventListener('change', async () => {
    selectedClasseId = classeSelect.value;
    if (selectedClasseId) {
      await loadMatieresForClasse(selectedClasseId);
      await loadEleves(selectedClasseId);
      await checkAlreadySaved();
      presenceSection.classList.remove('hidden');
      updateCurrentClassBadge();
    }
  });
  if (matiereSelect) {
    matiereSelect.addEventListener('change', () => {
      selectedMatiereId = matiereSelect.value || null;
    });
  }
  saveBtn.addEventListener('click', savePresences);
  editBtn.addEventListener('click', async () => {
    const ok = confirm('Voulez-vous modifier les présences déjà enregistrées ?');
    if (!ok) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await db.getPresencesDate(today, selectedClasseId);
    if (data && data.length) {
      data.forEach(p => {
        presences[p.eleve_id] = p.statut;
        const sel = elevesList.querySelector(`select[data-eleve="${p.eleve_id}"]`);
        if (sel) sel.value = p.statut;
      });
    }
    saveBtn.disabled = false;
    editBtn.classList.add('hidden');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
    saveBtn.textContent = 'Enregistrer les modifications';
  });
});

async function loadClasses() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return;
  const { data, error: classesError } = await db.getClassesByProfesseur(user.id);
  if (classesError) return;
  classeSelect.innerHTML = `<option value="">-- Choisir une classe --</option>`;
  data.forEach(c => {
    classeSelect.innerHTML += `<option value="${c.id}">${c.nom}</option>`;
    classesMap.set(String(c.id), c);
  });
  // Si une seule classe, masquer le sélecteur et mettre le titre "Ma classe"
  const section = classeSelect.closest('section');
  const titleEl = section ? section.querySelector('.panel-head h2, h2') : null;
  if (classeSelect.options.length <= 2) {
    classeSelect.parentElement.style.display = 'none';
    if (titleEl) titleEl.textContent = 'Ma classe';
  }
}

async function loadMatieresForClasse(classeId) {
  if (!matiereSelect) return;
  matiereSelect.innerHTML = '<option value="">Chargement...</option>';
  selectedMatiereId = null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { matiereSelect.innerHTML = '<option value="">-- Choisir une matière --</option>'; return; }

  // Check if user is main professor for this class
  let isMainProf = false;
  try {
    const { data: classe } = await supabase.from('classes').select('professeur_id').eq('id', classeId).single();
    if (classe && classe.professeur_id === user.id) isMainProf = true;
  } catch (e) { console.error("Error checking main prof:", e); }

  let names = [];
  
  if (isMainProf) {
      // Load all subjects for the class
      const { data } = await supabase.from('matieres').select('nom').eq('classe_id', classeId);
      names = (data || []).map(m => m.nom).filter(Boolean);
      
      // Also check enseignements to be sure we don't miss shared subjects.
      const { data: ens } = await supabase.from('enseignements').select('matiere').eq('classe_id', classeId);
      const ensNames = (ens || []).map(r => r.matiere).filter(Boolean);
      names = [...new Set([...names, ...ensNames])];

  } else {
      // Load only assigned subjects
      const { data } = await supabase
        .from('enseignements')
        .select('matiere')
        .eq('classe_id', classeId)
        .eq('professeur_id', user.id);
      names = Array.from(new Set((data || []).map(r => (r.matiere || '').trim()).filter(Boolean)));
  }

  names.sort((a,b)=>a.localeCompare(b));
  
  matiereSelect.innerHTML = '<option value="">-- Choisir une matière --</option>';
  
  // Si aucune matière trouvée (cas primaire ou non configuré), ajouter une option par défaut
  if (names.length === 0) {
    const opt = document.createElement('option');
    opt.value = "Général";
    opt.textContent = "Général (Présence journalière)";
    matiereSelect.appendChild(opt);
    // Auto-select if it's the only option
    matiereSelect.value = "Général";
    selectedMatiereId = "Général";
  } else {
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      matiereSelect.appendChild(opt);
    });
  }
  matiereSelect.disabled = false;
}

async function loadEleves(classeId) {
  const { data, error } = await db.getElevesByClasse(classeId);
  if (error) return;
  elevesList.innerHTML = '';
  presences = {};
  data.forEach(e => {
    presences[e.id] = 'present';
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${e.prenom ?? ''} ${e.nom}</span>
      <select data-eleve="${e.id}">
        <option value="present">Présent</option>
        <option value="absent">Absent</option>
      </select>
    `;
    li.querySelector('select').addEventListener('change', ev => {
      presences[ev.target.dataset.eleve] = ev.target.value;
    });
    elevesList.appendChild(li);
  });
}

async function checkAlreadySaved() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await db.getPresencesDate(today, selectedClasseId);
  if (error) return;
  if (data && data.length > 0) {
    saveBtn.disabled = true;
    editBtn.classList.remove('hidden');
    editBtn.disabled = false;
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
    if (statusPill) {
      statusPill.textContent = 'Présences déjà enregistrées aujourd’hui';
      statusPill.classList.remove('hidden', 'success', 'urgent', 'alert');
      statusPill.classList.add('alert');
    }
  } else {
    saveBtn.disabled = false;
    editBtn.classList.add('hidden');
    editBtn.disabled = true;
    saveBtn.textContent = 'Enregistrer les présences';
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
    if (statusPill) {
      statusPill.textContent = 'Prêt à enregistrer';
      statusPill.classList.remove('hidden', 'alert', 'urgent');
      statusPill.classList.add('success');
    }
  }
}

async function savePresences() {
  const today = new Date().toISOString().split('T')[0];
  for (const eleveId in presences) {
    await db.savePresence({
      eleve_id: eleveId,
      date: today,
      statut: presences[eleveId]
    });
  }
  if (statusPill) {
    statusPill.textContent = 'Présences enregistrées';
    statusPill.classList.remove('hidden', 'alert', 'urgent');
    statusPill.classList.add('success');
  }
  showToast('success', 'Présences enregistrées');
  await checkAlreadySaved();
}

function showToast(type, text) {
  let container = document.querySelector('.toast-container');
  if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) container.remove();
  }, 3000);
}

function updateCurrentClassBadge() {
  if (!currentClassBadge || !selectedClasseId) return;
  const info = classesMap.get(String(selectedClasseId));
  currentClassBadge.textContent = `Classe: ${info?.nom ?? selectedClasseId}`;
}
