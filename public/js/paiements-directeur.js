import { supabase, db } from './supabaseClient.js';

let ecoleId = null;
let classesById = new Map();
let elevesByClass = new Map();
let impayesByClass = new Map();
let eleveById = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  const filterNiveau = document.getElementById('filterNiveau');
  const filterMois = document.getElementById('filterMois');
  const filterClasse = document.getElementById('filterClasse');
  const classesGrid = document.getElementById('classesGrid');
  const detailSection = document.getElementById('detailSection');
  const detailTitle = document.getElementById('detailTitle');
  const impayesList = document.getElementById('impayesList');
  const noDataEl = document.getElementById('noData');
  const statusPill = document.getElementById('statusPill');
  const statusTextEl = document.getElementById('statusText');
  const totalImpayesEl = document.getElementById('totalImpayes');
  const totalElevesEl = document.getElementById('totalEleves');
  const impayesCountEl = document.getElementById('impayesCount');
  const classesConcerneesEl = document.getElementById('classesConcernees');

  filterMois.value = getCurrentMonth();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await db.getProfile(user.id);
  const r = (profile?.role || '').trim().toLowerCase();
  if (!profile || (r !== 'directeur' && r !== 'director')) return;
  ecoleId = profile.ecole_id;

  await loadData(filterMois.value);
  renderGrid();
  populateClasseFilter();

  filterNiveau?.addEventListener('change', renderGrid);
  filterMois.addEventListener('change', async () => {
    await loadData(filterMois.value);
    renderGrid();
    populateClasseFilter();
  });
  filterClasse?.addEventListener('change', renderGrid);

  async function loadData(mois) {
    classesById.clear();
    elevesByClass.clear();
    impayesByClass.clear();
    eleveById.clear();
    if (detailSection) detailSection.classList.add('hidden');
    classesGrid.innerHTML = '';

    const { data: classes } = await supabase
      .from('classes')
      .select('id, nom, niveau')
      .eq('ecole_id', ecoleId);
    (classes || []).forEach(c => classesById.set(c.id, c));

    const { data: eleves } = await supabase
      .from('eleves')
      .select('id, nom, prenom, classe_id, classes!inner(ecole_id)')
      .eq('classes.ecole_id', ecoleId)
      .eq('actif', true);
    (eleves || []).forEach(e => {
      eleveById.set(e.id, e);
      const list = elevesByClass.get(e.classe_id) || [];
      list.push(e);
      elevesByClass.set(e.classe_id, list);
    });

    const { data: impayes } = await supabase
      .from('paiements')
      .select(`
        id,
        eleve_id,
        statut,
        mois,
        eleves!inner(
          nom,
          prenom,
          classe_id,
          classes!inner(ecole_id)
        )
      `)
      .eq('eleves.classes.ecole_id', ecoleId)
      .eq('mois', mois)
      .neq('statut', 'paye');

    (impayes || []).forEach(p => {
      const classeId = p.eleves?.classe_id;
      if (!classeId) return;
      const list = impayesByClass.get(classeId) || [];
      list.push(p);
      impayesByClass.set(classeId, list);
    });

    const totalEleves = (eleves || []).length;
    const uniqueImpayes = new Set((impayes || []).map(r => r.eleve_id)).size;
    const classesConcernees = Array.from(impayesByClass.keys()).length;
    if (totalElevesEl) totalElevesEl.textContent = String(totalEleves);
    if (impayesCountEl) impayesCountEl.textContent = String(uniqueImpayes);
    if (classesConcerneesEl) classesConcerneesEl.textContent = String(classesConcernees);
    if (totalImpayesEl) totalImpayesEl.textContent = String(uniqueImpayes);
    updateStatus(uniqueImpayes);
  }

  function renderGrid() {
    classesGrid.innerHTML = '';
    if (detailSection) detailSection.classList.add('hidden');
    const niveau = filterNiveau?.value || '';
    const classeId = filterClasse?.value || '';
    const visible = Array.from(classesById.values())
      .filter(c => (!niveau || c.niveau === niveau) && (!classeId || c.id === classeId));
    visible
      .forEach(c => {
        const total = elevesByClass.get(c.id)?.length || 0;
        const impayes = impayesByClass.get(c.id)?.length || 0;
        const ratio = total > 0 ? impayes / total : 0;
        const badge =
          impayes === 0 ? 'green' :
          ratio >= 0.5 ? 'red' : 'orange';
        const card = document.createElement('div');
        card.className = 'class-card';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:700;">${c.nom}</div>
              <div class="muted">Élèves : ${total} • Impayés : ${impayes}</div>
            </div>
            <span class="badge ${badge}">${impayes === 0 ? 'OK' : (impayes >= Math.ceil(total/2) ? 'Beaucoup' : 'Quelques')}</span>
          </div>
        `;
        card.addEventListener('click', () => showDetail(c));
        classesGrid.appendChild(card);
      });
    const totalImpayes = visible.reduce((acc, c) => acc + (impayesByClass.get(c.id)?.length || 0), 0);
    if (noDataEl) noDataEl.classList.toggle('hidden', totalImpayes !== 0);
  }

  function populateClasseFilter() {
    if (!filterClasse) return;
    const selected = filterClasse.value;
    filterClasse.innerHTML = '<option value=\"\">Toutes</option>';
    Array.from(classesById.values()).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nom;
      filterClasse.appendChild(opt);
    });
    if (selected) filterClasse.value = selected;
  }

  function showDetail(classe) {
    if (!detailSection || !impayesList) return;
    detailSection.classList.remove('hidden');
    impayesList.innerHTML = '';
    detailTitle.textContent = `Impayés – ${classe.nom}`;
    const list = impayesByClass.get(classe.id) || [];
    list.forEach(p => {
      const e = eleveById.get(p.eleve_id);
      const li = document.createElement('li');
      li.textContent = e ? `${e.prenom ?? ''} ${e.nom}` : `Élève #${p.eleve_id}`;
      impayesList.appendChild(li);
    });
  }

  function updateStatus(count) {
    if (!statusPill) return;
    let label = 'Fonctionnement normal';
    let cls = 'success';
    if (count >= 10) {
      label = 'Situation critique';
      cls = 'urgent';
    } else if (count > 0) {
      label = 'À surveiller';
      cls = 'alert';
    }
    statusPill.textContent = label;
    statusPill.classList.remove('ok', 'success', 'alert', 'urgent');
    statusPill.classList.add(cls);
    if (statusTextEl) {
      if (cls === 'urgent') {
        statusTextEl.textContent = 'Impayés élevés ce mois.';
      } else if (cls === 'alert') {
        statusTextEl.textContent = 'Quelques impayés signalés ce mois.';
      } else {
        statusTextEl.textContent = 'Aucun impayé critique signalé ce mois.';
      }
    }
  }
});

function getCurrentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
