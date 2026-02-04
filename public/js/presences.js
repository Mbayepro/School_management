import { supabase } from './supabaseClient.js';

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
// currentEcoleId is declared below imports to be accessible

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
    const mat = selectedMatiereId || "Général";
    const { data } = await supabase.from('presences').select('*').eq('date', today).eq('classe_id', selectedClasseId).eq('matiere', mat);
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
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return;
    
    // Check role
    const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profileErr || !profile) {
        console.error("Erreur profil:", profileErr);
        return;
    }

    const isDirector = (profile.role === 'directeur' || profile.role === 'director' || (profile.role === 'pending_director' && profile.is_approved));
    currentEcoleId = profile.ecole_id;

    let data = [];
    let classesError = null;

    if (isDirector) {
        // Director sees all classes
        const { data: all, error: err } = await supabase
            .from('classes')
            .select('*')
            .eq('ecole_id', profile.ecole_id)
            .order('nom', { ascending: true });
        data = all;
        classesError = err;
    } else {
        // Professor sees assigned classes
        // 1. Main classes
        const { data: mainClasses, error: mainErr } = await supabase
            .from('classes')
            .select('*')
            .eq('professeur_id', user.id);
            
        // 2. Teaching classes (via enseignements)
        const { data: teachingData, error: teachErr } = await supabase
            .from('enseignements')
            .select('classes(*)')
            .eq('professeur_id', user.id);
            
        if (mainErr || teachErr) {
            classesError = mainErr || teachErr;
        } else {
             const teachingClasses = (teachingData || []).map(t => t.classes).filter(Boolean);
             // Merge and unique
             const map = new Map();
             (mainClasses || []).forEach(c => map.set(c.id, c));
             (teachingClasses || []).forEach(c => map.set(c.id, c));
             data = Array.from(map.values());
             data.sort((a,b) => a.nom.localeCompare(b.nom));
        }
    }
    
    if (classesError) {
      console.error("Erreur chargement classes:", classesError);
      return;
    }

    if (!data || data.length === 0) {
       classeSelect.innerHTML = `<option value="">Aucune classe assignée</option>`;
       return;
    }

    classeSelect.innerHTML = `<option value="">-- Choisir une classe --</option>`;
    classesMap.clear();
    
    data.forEach(c => {
      if (c && c.id) {
          classeSelect.innerHTML += `<option value="${c.id}">${c.nom}</option>`;
          classesMap.set(String(c.id), c);
      }
    });
    
    // Si une seule classe, masquer le sélecteur et mettre le titre "Ma classe"
    const section = classeSelect.closest('section');
    const titleEl = section ? section.querySelector('.panel-head h2, h2') : null;
    if (data.length === 1) {
      classeSelect.parentElement.style.display = 'none';
      if (titleEl) titleEl.textContent = `Ma classe : ${data[0].nom}`;
      // Auto-select
      classeSelect.value = data[0].id;
      // Trigger change manually
      classeSelect.dispatchEvent(new Event('change'));
    }
  } catch (e) {
    console.error("Exception loadClasses:", e);
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
    
    // Director also acts as main prof (sees all subjects)
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (profile && (profile.role === 'directeur' || profile.role === 'director')) isMainProf = true;
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

  // Always add "Général" for Main Professors or if no subjects found
  if (isMainProf && !names.includes('Général')) {
      const opt = document.createElement('option');
      opt.value = "Général";
      opt.textContent = "Général (Présence journalière)";
      matiereSelect.appendChild(opt);
  }
  
  // Si aucune matière trouvée (cas primaire ou non configuré), ajouter une option par défaut
  if (names.length === 0 && !isMainProf) {
    const opt = document.createElement('option');
    opt.value = "Général";
    opt.textContent = "Général (Présence journalière)";
    matiereSelect.appendChild(opt);
    // Auto-select if it's the only option
    matiereSelect.value = "Général";
    selectedMatiereId = "Général";
  } else {
    names.forEach(n => {
      if (n === 'Général') return; // Already added
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      matiereSelect.appendChild(opt);
    });
    // Select first one by default if not empty
    if(matiereSelect.options.length > 1) { // >1 because of default option "-- Choisir --" or "Général"
        // Prefer "Général" if available? Or first subject?
        // Let's default to first available option that is not empty
        const firstVal = matiereSelect.options[1].value;
        matiereSelect.value = firstVal;
        selectedMatiereId = firstVal;
    }
  }
  matiereSelect.disabled = false;
  
  // Trigger check
  await checkAlreadySaved();
}

async function loadEleves(classeId) {
  const { data, error } = await supabase
    .from('eleves')
    .select('*')
    .eq('classe_id', classeId)
    .order('nom', { ascending: true });
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
        <option value="retard">Retard</option>
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
  const { data, error } = await supabase
    .from('presences')
    .select('*')
    .eq('date', today)
    .eq('classe_id', selectedClasseId)
    .eq('matiere', selectedMatiereId || "Général")
    .eq('ecole_id', currentEcoleId);
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
      statusPill.textContent = 'Présences déjà enregistrées';
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
  const mat = selectedMatiereId || "Général";
  
  saveBtn.disabled = true;
  saveBtn.textContent = "Enregistrement...";
  
  try {
      for (const eleveId in presences) {
        await supabase.from('presences').upsert({
          eleve_id: eleveId,
          date: today,
          statut: presences[eleveId],
          matiere: mat,
          classe_id: selectedClasseId,
          ecole_id: currentEcoleId
        }, { onConflict: 'eleve_id, date, matiere' });
      }
      if (statusPill) {
        statusPill.textContent = 'Présences enregistrées';
        statusPill.classList.remove('hidden', 'alert', 'urgent');
        statusPill.classList.add('success');
      }
      showToast('success', 'Présences enregistrées');
      await checkAlreadySaved();
  } catch(e) {
      console.error(e);
      showToast('error', 'Erreur lors de l\'enregistrement');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Réessayer';
  }
}

// showToast removed (imported from supabaseClient.js)

function updateCurrentClassBadge() {
  if (!currentClassBadge || !selectedClasseId) return;
  const info = classesMap.get(String(selectedClasseId));
  currentClassBadge.textContent = `Classe: ${info?.nom ?? selectedClasseId}`;
}
