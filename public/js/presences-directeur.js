
import { supabase, db } from './supabaseClient.js';

let ecoleId = null;
let classesById = new Map();
let elevesByClass = new Map();
let eleveById = new Map();
let absentsByClass = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const filterNiveau = document.getElementById('filterNiveau');
  const filterDate = document.getElementById('filterDate');
  const classesGrid = document.getElementById('classesGrid');
  const filterClasse = document.getElementById('filterClasse');
  const elevesList = document.getElementById('elevesList');
  const elevesEmpty = document.getElementById('elevesEmpty');
  
  // Modal Elements
  const detailModal = document.getElementById('classDetailModal');
  const detailTitle = document.getElementById('detailTitle');
  const absentsList = document.getElementById('absentsList');
  const closeDetailModal = document.getElementById('closeDetailModal');
  
  // Stats Elements
  const noDataEl = document.getElementById('noData');
  const errorEl = document.getElementById('error-message');
  const statusPill = document.getElementById('statusPill');
  const totalAbsentsEl = document.getElementById('totalAbsents');
  const statusTextEl = document.getElementById('statusText');
  const totalElevesEl = document.getElementById('totalEleves');
  const classesConcerneesEl = document.getElementById('classesConcernees');
  const totalClassesEl = document.getElementById('totalClasses');

  if (!filterDate || !classesGrid) {
    console.error('Éléments DOM manquants');
    return;
  }

  // Init Date
  filterDate.value = new Date().toISOString().split('T')[0];

  // Auth & Profile
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return setError('Utilisateur non connecté');

  const { data: profile } = await db.getProfile(user.id);
  const r = (profile?.role || '').trim().toLowerCase();
  if (!profile || (r !== 'directeur' && r !== 'director' && !(r === 'pending_director' && profile.is_approved))) {
    return setError('Accès réservé à la direction');
  }

  ecoleId = profile.ecole_id;

  // Initial Load
  await loadData(filterDate.value);
  renderGrid();
  populateClasseFilter();
  renderElevesList();

  // Event Listeners
  filterNiveau?.addEventListener('change', renderGrid);
  
  filterDate.addEventListener('change', async () => {
    await loadData(filterDate.value);
    renderGrid();
    populateClasseFilter();
    renderElevesList();
  });
  filterClasse?.addEventListener('change', renderElevesList);

  // Modal Events
  if (closeDetailModal) closeDetailModal.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === detailModal) closeModal();
  });

  function setError(msg) {
    if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    } else {
        console.error(msg);
    }
  }

  async function loadData(date) {
    classesById.clear();
    elevesByClass.clear();
    eleveById.clear();
    absentsByClass.clear();

    classesGrid.innerHTML = '<div class="muted" style="grid-column: 1/-1; text-align: center;">Chargement des données...</div>';

    // Fetch Classes
    const { data: classes } = await supabase
      .from('classes')
      .select('id, nom, niveau')
      .eq('ecole_id', ecoleId)
      .order('nom');

    (classes || []).forEach(c => classesById.set(c.id, c));

    // Fetch Eleves (Actifs)
    const { data: eleves } = await supabase
      .from('eleves')
      .select('id, nom, prenom, classe_id, classes!inner(ecole_id), tel_parent')
      .eq('classes.ecole_id', ecoleId)
      .eq('actif', true);

    (eleves || []).forEach(e => {
      eleveById.set(e.id, e);
      const list = elevesByClass.get(e.classe_id) || [];
      list.push(e);
      elevesByClass.set(e.classe_id, list);
    });

    // Fetch Presences (Absents only)
    const { data: presences } = await supabase
      .from('presences')
      .select(`
        eleve_id,
        statut,
        eleves!inner(
          classe_id,
          classes!inner(ecole_id)
        )
      `)
      .eq('date', date)
      .eq('eleves.classes.ecole_id', ecoleId)
      .eq('statut', 'absent');

    (presences || []).forEach(p => {
      const classeId = p.eleves?.classe_id;
      if (!classeId) return;
      const list = absentsByClass.get(classeId) || [];
      list.push(p);
      absentsByClass.set(classeId, list);
    });
  }

  function populateClasseFilter() {
    if (!filterClasse) return;
    const selected = filterClasse.value;
    filterClasse.innerHTML = '<option value=\"\">Toutes les classes</option>';
    Array.from(classesById.values()).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nom;
      filterClasse.appendChild(opt);
    });
    if (selected) filterClasse.value = selected;
  }

  function renderElevesList() {
    if (!elevesList) return;
    elevesList.innerHTML = '';
    const classeId = filterClasse?.value || '';
    let rows = [];
    if (classeId) {
      rows = elevesByClass.get(classeId) || [];
    } else {
      rows = Array.from(elevesByClass.values()).flat();
    }
    if (rows.length === 0) {
      if (elevesEmpty) elevesEmpty.classList.remove('hidden');
      return;
    }
    if (elevesEmpty) elevesEmpty.classList.add('hidden');
    rows.forEach(e => {
      const li = document.createElement('li');
      const name = `${e.prenom || ''} ${e.nom}`.trim();
      li.innerHTML = `<span style=\"font-weight:500;\">${name}</span>`;
      elevesList.appendChild(li);
    });
  }

  function renderGrid() {
    classesGrid.innerHTML = '';
    
    const niveau = filterNiveau?.value || '';
    let totalAbsents = 0;
    let classesWithAbsents = 0;
    let totalElevesActifs = 0;

    // Filter classes
    const visibleClasses = Array.from(classesById.values())
      .filter(c => !niveau || c.niveau === niveau);

    if (visibleClasses.length === 0) {
        classesGrid.innerHTML = '<p class="muted" style="grid-column: 1/-1; text-align: center;">Aucune classe trouvée pour ce niveau.</p>';
        updateStats(0, 0, 0, 0);
        return;
    }

    visibleClasses.forEach(c => {
        const total = elevesByClass.get(c.id)?.length || 0;
        const absents = absentsByClass.get(c.id)?.length || 0;
        
        totalElevesActifs += total;
        totalAbsents += absents;
        if (absents > 0) classesWithAbsents++;
        
        const badgeText = absents === 0 ? 'OK' : `${absents} absent(s)`;
        const badgeClass = absents === 0 ? 'ok' : absents >= Math.ceil(total / 2) ? 'alert' : 'orange';

        const card = document.createElement('div');
        card.className = 'class-card';
        card.innerHTML = `
          <div>
            <h3>${c.nom}</h3>
            <span class="class-info">${c.niveau || 'N/A'}</span>
            <div class="class-info" style="margin-top: 6px;">
                ${total} élèves • <strong>${absents} absent(s)</strong>
            </div>
          </div>
          <span class="badge ${badgeClass}">
            ${badgeText}
          </span>
        `;

        card.addEventListener('click', () => showDetail(c));
        classesGrid.appendChild(card);
      });

    if (noDataEl) {
      noDataEl.classList.toggle('hidden', totalAbsents !== 0);
    }
    
    updateStats(totalAbsents, totalElevesActifs, classesWithAbsents, visibleClasses.length);
  }

  function updateStats(absents, totalEleves, classesConcernees, totalClasses) {
    if (totalAbsentsEl) totalAbsentsEl.textContent = absents;
    if (totalElevesEl) totalElevesEl.textContent = totalEleves;
    if (classesConcerneesEl) classesConcerneesEl.textContent = classesConcernees;
    if (totalClassesEl) totalClassesEl.textContent = totalClasses;

    updateStatusPill(absents);
  }

  function showDetail(classe) {
    if (!detailModal || !absentsList) return;

    if (detailTitle) detailTitle.textContent = `Absents – ${classe.nom}`;
    absentsList.innerHTML = '';

    const absents = absentsByClass.get(classe.id) || [];
    
    if (absents.length === 0) {
        absentsList.innerHTML = '<li class="muted" style="justify-content:center;">Aucun absent dans cette classe.</li>';
    } else {
        absents.forEach(p => {
          const e = eleveById.get(p.eleve_id);
          const li = document.createElement('li');
          
          const name = e ? `${e.prenom} ${e.nom}` : `Élève #${p.eleve_id}`;
          // Utilisation d'un style inline pour badge gray temporaire ou réutilisation de pill
          const phone = e?.tel_parent ? `<span style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:99px; font-size:0.8rem;">📞 ${e.tel_parent}</span>` : '';
          
          li.innerHTML = `
            <span style="font-weight:500;">${name}</span>
            ${phone}
          `;
          absentsList.appendChild(li);
        });
    }

    detailModal.classList.remove('hidden');
  }

  function closeModal() {
    if (detailModal) detailModal.classList.add('hidden');
  }

  function updateStatusPill(absentsCount) {
    if (!statusPill) return;
    
    let label = 'Fonctionnement normal';
    let cls = 'ok';
    let msg = 'Aucune absence critique signalée aujourd’hui.';

    if (absentsCount >= 10) {
      label = 'Situation critique';
      cls = 'urgent';
      msg = 'Taux d’absentéisme élevé aujourd’hui.';
    } else if (absentsCount > 0) {
      label = 'À surveiller';
      cls = 'alert';
      msg = 'Quelques absences signalées.';
    }

    statusPill.textContent = label;
    statusPill.className = `pill ${cls}`; 
    
    if (statusTextEl) statusTextEl.textContent = msg;
  }
});
