import { supabase, db } from './supabaseClient.js';

let ecoleId = null;
let ecoleName = 'School Management';
let classesById = new Map();
let elevesByClass = new Map();
let selectedEleve = null;

document.addEventListener('DOMContentLoaded', async () => {
  const filterClasse = document.getElementById('filterClasse');
  const filterNiveau = document.getElementById('filterNiveau');
  const searchEleve = document.getElementById('searchEleve');
  const elevesList = document.getElementById('elevesList');
  const elevesEmpty = document.getElementById('elevesEmpty');
  const idCardModal = document.getElementById('idCardModal');
  const idCardPreview = document.getElementById('idCardPreview');
  const closeIdCardModal = document.getElementById('closeIdCardModal');
  const closeIdCardBtn = document.getElementById('closeIdCardBtn');
  const printIdCardBtn = document.getElementById('printIdCardBtn');
  const printMultipleIdCardsBtn = document.getElementById('printMultipleIdCardsBtn');
  const photoUpload = document.getElementById('photoUpload');
  const sumTotalEleves = document.getElementById('sumTotalEleves');
  const sumActifs = document.getElementById('sumActifs');
  const sumDesactives = document.getElementById('sumDesactives');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const addEleveBtn = document.getElementById('addEleveBtn');
  const eleveModal = document.getElementById('eleveModal');
  const closeModal = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelBtn');
  const eleveForm = document.getElementById('eleveForm');
  const modalTitle = document.getElementById('modalTitle');
  const eleveIdInput = document.getElementById('eleveId');
  const saveEleveBtn = document.getElementById('saveEleveBtn');
  const nomInput = document.getElementById('nom');
  const prenomInput = document.getElementById('prenom');
  const classeSelectEl = document.getElementById('classeSelect');
  const parentTelInput = document.getElementById('parentTel');
  const formMessage = document.getElementById('formMessage');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await db.getProfile(user.id);
  const r = ((profile?.role) || '').trim().toLowerCase();
  if (!profile || (r !== 'directeur' && r !== 'director')) return;
  ecoleId = profile?.ecole_id || null;
  const errEl = document.getElementById('error-message');
  if (!ecoleId && errEl) {
    errEl.textContent = "Schéma indisponible ou compte non associé à une école.";
    errEl.style.display = "block";
    if (addEleveBtn) addEleveBtn.disabled = true;
    Array.from(document.querySelectorAll('#eleveForm input, #eleveForm select, #eleveForm button')).forEach(el => { el.disabled = true; });
    Array.from(document.querySelectorAll('#filterClasse, #filterNiveau, #searchEleve, #exportExcelBtn, #exportPdfBtn')).forEach(el => { if (el) el.disabled = true; });
    return;
  }
  try {
    const { data: ecoleRow } = await supabase.from('ecoles').select('nom').eq('id', ecoleId).single();
    if (ecoleRow?.nom) ecoleName = ecoleRow.nom;
  } catch (_) {}

  try { await loadData(); } catch (_) { if (errEl) { errEl.textContent = "Aucune donnée disponible."; errEl.style.display = "block"; } }
  try { await loadMetrics(); } catch (_) {}
  populateClasseFilter();
  populateNiveauFilter();
  renderElevesList();

  filterClasse?.addEventListener('change', renderElevesList);
  filterNiveau?.addEventListener('change', () => { populateClasseFilter(); renderElevesList(); });
  searchEleve?.addEventListener('input', renderElevesList);
  if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportExcel);
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPdf);
  if (addEleveBtn && eleveModal) addEleveBtn.addEventListener('click', () => {
    populateClasseSelect();
    if (formMessage) { formMessage.textContent = ""; formMessage.style.display = "none"; }
    if (eleveForm) eleveForm.reset();
    if (eleveIdInput) eleveIdInput.value = "";
    if (modalTitle) modalTitle.textContent = "Ajouter un élève";
    if (saveEleveBtn) saveEleveBtn.textContent = "Enregistrer";
    eleveModal.classList.remove('hidden');
  });
  if (closeModal && eleveModal) closeModal.addEventListener('click', () => eleveModal.classList.add('hidden'));
  if (cancelBtn && eleveModal) cancelBtn.addEventListener('click', () => eleveModal.classList.add('hidden'));
  if (eleveForm) {
    eleveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (formMessage) { formMessage.textContent = ""; formMessage.style.display = "none"; }
      const nom = (nomInput?.value || '').trim();
      const prenom = (prenomInput?.value || '').trim();
      const classeId = classeSelectEl?.value || '';
      const tel = (parentTelInput?.value || '').trim();
      if (!nom || !prenom || !classeId) {
        if (formMessage) { formMessage.textContent = "Veuillez remplir Nom, Prénom et Classe."; formMessage.style.display = "block"; }
        return;
      }
      const currentId = (eleveIdInput?.value || '').trim();
      try {
        if (currentId) {
          const { data, error } = await supabase
            .from('eleves')
            .update({ nom, prenom, classe_id: classeId, tel_parent: tel })
            .eq('id', currentId)
            .select()
            .single();
          if (error) {
            if (formMessage) { formMessage.textContent = "Erreur lors de la mise à jour."; formMessage.style.display = "block"; }
            return;
          }
          const updated = data || { id: currentId, nom, prenom, classe_id: classeId, tel_parent: tel };
          let oldClasseId = null;
          for (const [cid, list] of elevesByClass.entries()) {
            const idx = list.findIndex(x => String(x.id) === String(currentId));
            if (idx !== -1) {
              oldClasseId = cid;
              list.splice(idx, 1);
              elevesByClass.set(cid, list);
              break;
            }
          }
          const targetList = elevesByClass.get(updated.classe_id) || [];
          targetList.push(updated);
          elevesByClass.set(updated.classe_id, targetList);
          eleveModal.classList.add('hidden');
          renderElevesList();
          updateFilteredMetrics(filterClasse?.value || '', filterNiveau?.value || '');
        } else {
          const { data, error } = await supabase.from('eleves').insert([{ nom, prenom, classe_id: classeId, tel_parent: tel, actif: true }]).select().single();
          if (error) {
            if (formMessage) { formMessage.textContent = "Erreur lors de l'enregistrement."; formMessage.style.display = "block"; }
            return;
          }
          const created = data || { nom, prenom, classe_id: classeId, tel_parent: tel, actif: true };
          const list = elevesByClass.get(classeId) || [];
          list.push(created);
          elevesByClass.set(classeId, list);
          eleveModal.classList.add('hidden');
          renderElevesList();
          updateFilteredMetrics(filterClasse?.value || '', filterNiveau?.value || '');
        }
      } catch (_) {
        if (formMessage) { formMessage.textContent = "Une erreur est survenue."; formMessage.style.display = "block"; }
      }
    });
  }
  if (closeIdCardModal) closeIdCardModal.addEventListener('click', () => { idCardModal.classList.add('hidden'); selectedEleve = null; });
  if (closeIdCardBtn) closeIdCardBtn.addEventListener('click', () => { idCardModal.classList.add('hidden'); selectedEleve = null; });
  if (printIdCardBtn) printIdCardBtn.addEventListener('click', () => window.print());
  if (printMultipleIdCardsBtn) printMultipleIdCardsBtn.addEventListener('click', printMultipleIdCards);
  window.addEventListener('click', (e) => { if (e.target === idCardModal) { idCardModal.classList.add('hidden'); selectedEleve = null; } });
  if (photoUpload) {
    photoUpload.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file || !selectedEleve || !idCardPreview) return;
      const url = URL.createObjectURL(file);
      const img = idCardPreview.querySelector('.id-card-photo');
      if (img) img.src = url;
    });
  }

  async function loadData() {
    classesById.clear();
    elevesByClass.clear();

    const { data: classes } = await supabase
      .from('classes')
      .select('id, nom, niveau')
      .eq('ecole_id', ecoleId)
      .order('nom');

    (classes || []).forEach(c => classesById.set(c.id, c));

    const { data: eleves } = await supabase
      .from('eleves')
      .select('id, nom, prenom, classe_id, tel_parent, classes!inner(ecole_id)')
      .eq('classes.ecole_id', ecoleId)
      .eq('actif', true);

    (eleves || []).forEach(e => {
      const list = elevesByClass.get(e.classe_id) || [];
      list.push(e);
      elevesByClass.set(e.classe_id, list);
    });
  }

  async function loadMetrics() {
    const classIdsAll = Array.from(classesById.keys());
    const { count: totalCount } = await supabase.from('eleves').select('id', { count: 'exact', head: true }).in('classe_id', classIdsAll);
    const { count: actifsCount } = await supabase.from('eleves').select('id', { count: 'exact', head: true }).in('classe_id', classIdsAll).eq('actif', true);
    const { count: desactivesCount } = await supabase.from('eleves').select('id', { count: 'exact', head: true }).in('classe_id', classIdsAll).eq('actif', false);
    if (sumTotalEleves) sumTotalEleves.textContent = totalCount ?? '–';
    if (sumActifs) sumActifs.textContent = actifsCount ?? '–';
    if (sumDesactives) sumDesactives.textContent = desactivesCount ?? '–';
  }

  function populateClasseFilter() {
    if (!filterClasse) return;
    filterClasse.innerHTML = '<option value="">Toutes les classes</option>';
    const niveau = filterNiveau?.value || '';
    Array.from(classesById.values()).filter(c => !niveau || (c.niveau || '') === niveau).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nom;
      filterClasse.appendChild(opt);
    });
  }
  function populateClasseSelect() {
    if (!classeSelectEl) return;
    const niveau = filterNiveau?.value || '';
    classeSelectEl.innerHTML = '';
    Array.from(classesById.values()).filter(c => !niveau || (c.niveau || '') === niveau).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nom;
      classeSelectEl.appendChild(opt);
    });
  }
  function populateNiveauFilter() {
    if (!filterNiveau) return;
    const niveaux = Array.from(new Set(Array.from(classesById.values()).map(c => c.niveau).filter(Boolean)));
    filterNiveau.innerHTML = '<option value="">Tous les niveaux</option>';
    niveaux.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      filterNiveau.appendChild(opt);
    });
  }

  function renderElevesList() {
    if (!elevesList) return;
    elevesList.innerHTML = '';
    const classeId = filterClasse?.value || '';
    const niveau = filterNiveau?.value || '';
    const q = (searchEleve?.value || '').toLowerCase();
    let rows = getFilteredRows(classeId, niveau, q);
    updateFilteredMetrics(classeId, niveau);
    if (rows.length === 0) {
      if (elevesEmpty) elevesEmpty.classList.remove('hidden');
      if (sumActifs) sumActifs.textContent = '0';
      return;
    }
    if (elevesEmpty) elevesEmpty.classList.add('hidden');
    if (sumActifs) sumActifs.textContent = String(rows.length);
    rows.forEach(e => {
      const li = document.createElement('li');
      const name = `${e.prenom || ''} ${e.nom}`.trim();
      const phone = e?.tel_parent ? `<span style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:99px; font-size:0.8rem;">📞 ${e.tel_parent}</span>` : '';
      const classeInfo = classesById.get(e.classe_id);
      const badge = classeInfo ? `<span class="pill" style="margin-left:8px;">${classeInfo.nom} • ${classeInfo.niveau || 'N/A'}</span>` : '';
      li.innerHTML = `<span style="font-weight:500;">${name}</span> ${badge} ${phone} <button class="btn btn-sm primary" data-action="idcard" style="margin-left:8px;">Carte</button> <button class="btn btn-sm" data-action="edit" style="margin-left:6px;">Modifier</button>`;
      li.querySelector('[data-action="idcard"]').addEventListener('click', () => openIdCard(e));
      li.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(e));
      elevesList.appendChild(li);
    });
  }
  function getFilteredRows(classeId, niveau, q) {
    let rows = [];
    if (classeId) {
      rows = elevesByClass.get(classeId) || [];
    } else {
      rows = Array.from(elevesByClass.values()).flat();
    }
    if (niveau) {
      rows = rows.filter(e => (classesById.get(e.classe_id)?.niveau || '') === niveau);
    }
    if (q) {
      rows = rows.filter(e => (`${e.prenom || ''} ${e.nom || ''}`.toLowerCase().includes(q)));
    }
    return rows;
  }
  function exportExcel() {
    const classeId = filterClasse?.value || '';
    const niveau = filterNiveau?.value || '';
    const q = (searchEleve?.value || '').toLowerCase();
    const rows = getFilteredRows(classeId, niveau, q);
    const data = rows.map(e => {
      const c = classesById.get(e.classe_id);
      return {
        Prénom: e.prenom || '',
        Nom: e.nom || '',
        Classe: c?.nom || '',
        Niveau: c?.niveau || '',
        Téléphone: e.tel_parent || ''
      };
    });
    if (data.length === 0) return alert("Aucune donnée à exporter.");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Élèves");
    XLSX.writeFile(wb, "eleves.xlsx");
  }
  function exportPdf() {
    const classeId = filterClasse?.value || '';
    const niveau = filterNiveau?.value || '';
    const q = (searchEleve?.value || '').toLowerCase();
    const rows = getFilteredRows(classeId, niveau, q);
    if (rows.length === 0) return alert("Aucune donnée à exporter.");
    const doc = new window.jspdf.jsPDF();
    const table = rows.map(e => {
      const c = classesById.get(e.classe_id);
      return [e.prenom || '', e.nom || '', c?.nom || '', c?.niveau || '', e.tel_parent || ''];
    });
    doc.autoTable({
      head: [["Prénom", "Nom", "Classe", "Niveau", "Téléphone"]],
      body: table
    });
    doc.save("eleves.pdf");
  }

  function openIdCard(eleve) {
    selectedEleve = eleve;
    if (!idCardModal || !idCardPreview) return;
    const classeNom = classesById.get(eleve.classe_id)?.nom || 'N/A';
    const matricule = 'GTS-' + (eleve.id || '').toString().substring(0, 6);
    
    idCardPreview.innerHTML = `
      <div class="id-card-header">
        <div class="id-card-logo-container">
          <div class="id-card-logo-placeholder">Logo</div>
        </div>
        <div class="id-card-school-info">
          <div class="id-card-school">GTS TRIOS SCIENTIFIQUES</div>
          <div class="id-card-subtitle">${ecoleName}</div>
        </div>
      </div>
      <div class="id-card-content">
        <div class="id-card-left">
          <img class="id-card-photo" alt="Photo élève">
          <div class="id-card-qr" id="idCardQR"></div>
        </div>
        <div class="id-card-right">
          <div class="id-card-name">${eleve.prenom || ''} ${eleve.nom || ''}</div>
          <div class="id-card-info"><strong>Matricule:</strong> ${matricule}</div>
          <div class="id-card-info"><strong>Classe:</strong> ${classeNom}</div>
        </div>
      </div>
      <div class="id-card-footer">
        <div class="id-card-year">Année Scolaire : 2025-2026</div>
      </div>
    `;
    try {
      const qrEl = idCardPreview.querySelector('#idCardQR');
      if (qrEl && window.QRCode) {
        new QRCode(qrEl, { 
          text: String(eleve.id), 
          width: 60, 
          height: 60,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    } catch (_) {}
    idCardModal.classList.remove('hidden');
  }

  function printMultipleIdCards() {
    const elevesToPrint = getFilteredEleves();

    if (elevesToPrint.length === 0) {
      alert("Aucun élève à imprimer avec les filtres actuels.");
      return;
    }

    const printContainer = document.createElement('div');
    printContainer.className = 'id-cards-print-container';
    
    elevesToPrint.slice(0, 8).forEach((eleve, index) => {
      const cardItem = document.createElement('div');
      cardItem.className = 'id-card-print-item';
      
      const card = document.createElement('div');
      card.className = 'id-card-preview';
      
      const classeNom = classesById.get(eleve.classe_id)?.nom || 'N/A';
      const matricule = 'GTS-' + (eleve.id || '').toString().substring(0, 6);
      
      card.innerHTML = `
        <div class="id-card-header">
          <div class="id-card-logo-container">
            <div class="id-card-logo-placeholder">Logo</div>
          </div>
          <div class="id-card-school-info">
            <div class="id-card-school">GTS TRIOS SCIENTIFIQUES</div>
            <div class="id-card-subtitle">${ecoleName}</div>
          </div>
        </div>
        <div class="id-card-content">
          <div class="id-card-left">
            <img class="id-card-photo" alt="Photo élève">
            <div class="id-card-qr" id="printQR${index}"></div>
          </div>
          <div class="id-card-right">
            <div class="id-card-name">${eleve.prenom || ''} ${eleve.nom || ''}</div>
            <div class="id-card-info"><strong>Matricule:</strong> ${matricule}</div>
            <div class="id-card-info"><strong>Classe:</strong> ${classeNom}</div>
          </div>
        </div>
        <div class="id-card-footer">
          <div class="id-card-year">Année Scolaire : 2025-2026</div>
        </div>
      `;
      
      cardItem.appendChild(card);
      printContainer.appendChild(cardItem);
      
      setTimeout(() => {
        const qrEl = cardItem.querySelector(`#printQR${index}`);
        if (qrEl && window.QRCode) {
          new QRCode(qrEl, { 
            text: String(eleve.id), 
            width: 55, 
            height: 55,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      }, 50);
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Impression des cartes d\\'étudiants</title>');
    printWindow.document.write('<link rel="stylesheet" href="css/style.css">');
    printWindow.document.write('<link rel="stylesheet" href="css/dashboard-directeur.css">');
    printWindow.document.write('<style>@media print { @page { size: A4; margin: 10mm; } body { background: white !important; } .id-cards-print-container { display: grid; grid-template-columns: repeat(2, 1fr); grid-gap: 15mm; } .id-card-print-item { position: relative; page-break-inside: avoid; } }</style>');
    printWindow.document.write('</head><body></body></html>');
    printWindow.document.close();
    printWindow.document.body.appendChild(printContainer);
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  function getFilteredEleves() {
    const filterNiveau = document.getElementById('filterNiveau')?.value || '';
    const filterClasse = document.getElementById('filterClasse')?.value || '';
    const searchTerm = document.getElementById('searchEleve')?.value.toLowerCase() || '';
    
    let allEleves = [];
    elevesByClass.forEach(eleves => {
      allEleves = allEleves.concat(eleves);
    });
    
    return allEleves.filter(eleve => {
      const classe = classesById.get(eleve.classe_id);
      const matchesNiveau = !filterNiveau || (classe && classe.niveau === filterNiveau);
      const matchesClasse = !filterClasse || eleve.classe_id === filterClasse;
      const matchesSearch = !searchTerm || (eleve.nom.toLowerCase().includes(searchTerm) || eleve.prenom.toLowerCase().includes(searchTerm));
      return matchesNiveau && matchesClasse && matchesSearch;
    });
  }

  function updateFilteredMetrics(classeId, niveau) {
    let count = 0;
    if (classeId) {
      count = (elevesByClass.get(classeId) || []).length;
    } else if (niveau) {
      count = Array.from(elevesByClass.entries())
        .filter(([cid, _]) => (classesById.get(cid)?.niveau || '') === niveau)
        .reduce((acc, [_, list]) => acc + list.length, 0);
    } else {
      count = Array.from(elevesByClass.values()).flat().length;
    }
    if (sumActifs) sumActifs.textContent = String(count);
  }

  function openEditModal(eleve) {
    if (!eleveModal) return;
    populateClasseSelect();
    if (formMessage) { formMessage.textContent = ""; formMessage.style.display = "none"; }
    if (eleveForm) eleveForm.reset();
    if (eleveIdInput) eleveIdInput.value = eleve.id;
    if (modalTitle) modalTitle.textContent = "Modifier l'élève";
    if (saveEleveBtn) saveEleveBtn.textContent = "Mettre à jour";
    if (nomInput) nomInput.value = eleve.nom || '';
    if (prenomInput) prenomInput.value = eleve.prenom || '';
    if (classeSelectEl) classeSelectEl.value = eleve.classe_id || '';
    if (parentTelInput) parentTelInput.value = eleve.tel_parent || '';
    eleveModal.classList.remove('hidden');
  }
});
