import { supabase, db } from './supabaseClient.js';

const paiementsList = document.getElementById('paiementsList');
const errorEl = document.getElementById('error-message');

// Stats
const totalElevesEl = document.getElementById('totalEleves');
const payesEl = document.getElementById('payes');
const impayesEl = document.getElementById('impayes');

// Filters
const monthFilterEl = document.getElementById('monthFilter');
const searchEleveEl = document.getElementById('searchEleve');
const statusFilterEl = document.getElementById('statusFilter');
const classFilterEl = document.getElementById('classFilter');

// Export Buttons
const exportExcelBtn = document.getElementById('exportExcelBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

// Modals
const paymentModal = document.getElementById('paymentModal');
const paymentForm = document.getElementById('paymentForm');
const closePaymentModalBtn = document.getElementById('closePaymentModal');
const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');

const receiptModal = document.getElementById('receiptModal');
const closeReceiptModalBtn = document.getElementById('closeReceiptModal');
const closeReceiptBtn = document.getElementById('closeReceiptBtn');
const printReceiptBtn = document.getElementById('printReceiptBtn');
const sendWhatsappBtn = document.getElementById('sendWhatsappBtn');
const receiptContent = document.getElementById('receiptContent');

// State
let ecoleId = null;
let ecoleName = 'School Management';
let elevesMap = new Map();
let paymentsByEleve = new Map();
let currentEleveId = null; // For editing
let classesById = new Map();

async function init() {
  // Auth Check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: ecole, error: ecoleError } = await db.getEcoleId(user.id);
  if (ecoleError || !ecole) return;
  ecoleId = ecole.ecole_id;
  if (!ecoleId && errorEl) {
    errorEl.textContent = "Compte non associé à une école.";
    errorEl.style.display = "block";
    Array.from(document.querySelectorAll('#monthFilter, #searchEleve, #statusFilter, #classFilter, #exportExcelBtn, #exportPdfBtn')).forEach(el => { if (el) el.disabled = true; });
    Array.from(document.querySelectorAll('#paymentForm input, #paymentForm select, #paymentForm button')).forEach(el => { el.disabled = true; });
    return;
  }
  try {
    const { data: ecoleRow } = await supabase.from('ecoles').select('nom').eq('id', ecoleId).single();
    if (ecoleRow?.nom) ecoleName = ecoleRow.nom;
  } catch (_) {}

  // Init Month
  const initialMonth = getCurrentMonth();
  if (monthFilterEl) monthFilterEl.value = initialMonth;

  // Initial Load
  await loadData(initialMonth);

  // Listeners
  if (monthFilterEl) {
    monthFilterEl.addEventListener('change', async () => {
      await loadMonthlyPayments(monthFilterEl.value);
      renderList();
    });
  }

  if (searchEleveEl) {
    searchEleveEl.addEventListener('input', renderList);
  }

  if (statusFilterEl) {
    statusFilterEl.addEventListener('change', renderList);
  }
  if (classFilterEl) {
    classFilterEl.addEventListener('change', renderList);
  }

  if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportToExcel);
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportToPdf);

  // Modal Events
  if (closePaymentModalBtn) closePaymentModalBtn.addEventListener('click', closePaymentModal);
  if (cancelPaymentBtn) cancelPaymentBtn.addEventListener('click', closePaymentModal);
  if (paymentForm) paymentForm.addEventListener('submit', handleSavePayment);

  if (closeReceiptModalBtn) closeReceiptModalBtn.addEventListener('click', closeReceiptModal);
  if (closeReceiptBtn) closeReceiptBtn.addEventListener('click', closeReceiptModal);
  if (printReceiptBtn) printReceiptBtn.addEventListener('click', printReceipt);
  if (sendWhatsappBtn) sendWhatsappBtn.addEventListener('click', sendReceiptViaWhatsapp);
  
  window.addEventListener('click', (e) => {
    if (e.target === paymentModal) closePaymentModal();
    if (e.target === receiptModal) closeReceiptModal();
  });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

async function loadData(month) {
  paiementsList.innerHTML = '<div class="muted" style="padding:1rem;">Chargement...</div>';
  await loadEleves();
  await loadMonthlyPayments(month);
  renderList();
}

async function loadEleves() {
  const { data, error } = await supabase
    .from('eleves')
    .select('id, nom, prenom, classe_id, tel_parent, classes!inner(ecole_id, nom)')
    .eq('classes.ecole_id', ecoleId)
    .eq('actif', true)
    .order('nom');

  if (error) {
    console.error(error);
    return;
  }
  elevesMap = new Map();
  (data || []).forEach(e => elevesMap.set(e.id, e));
  classesById = new Map();
  (data || []).forEach(e => {
    if (e.classe_id && e.classes?.nom) {
      classesById.set(e.classe_id, e.classes.nom);
    }
  });
  populateClassFilter();
}

async function loadMonthlyPayments(month) {
  if (!month) return;
  const { data, error } = await supabase
    .from('paiements')
    .select('id, eleve_id, mois, montant, statut, created_at, eleves!inner(classes!inner(ecole_id))')
    .eq('eleves.classes.ecole_id', ecoleId)
    .eq('mois', month);

  if (error) {
    console.error(error);
    return;
  }
  paymentsByEleve = new Map();
  (data || []).forEach(p => paymentsByEleve.set(p.eleve_id, p));
}

function renderList() {
  paiementsList.innerHTML = '';
  
  const searchTerm = searchEleveEl ? searchEleveEl.value.toLowerCase() : '';
  const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
  const classFilter = classFilterEl ? classFilterEl.value : '';
  
  let countTotal = 0;
  let countPayes = 0;
  let countImpayes = 0;

  const eleves = Array.from(elevesMap.values());
  const filtered = eleves.filter(e => {
    const p = paymentsByEleve.get(e.id);
    const statut = p?.statut ?? 'impaye';
    
    // Status Filter
    if (statusFilter !== 'all' && statut !== statusFilter) return false;
    // Class Filter
    if (classFilter && e.classe_id !== classFilter) return false;
    
    // Search Filter
    const fullName = `${e.nom} ${e.prenom}`.toLowerCase();
    if (searchTerm && !fullName.includes(searchTerm)) return false;

    return true;
  });

  if (filtered.length === 0) {
    paiementsList.innerHTML = '<div class="muted" style="padding:1rem; text-align:center;">Aucun élève trouvé.</div>';
    updateStats(0, 0, 0);
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(e => {
    const p = paymentsByEleve.get(e.id);
    const statut = p?.statut ?? 'impaye';
    const montant = p?.montant ?? 0;
    
    // Global Stats Calculation (based on full list or filtered? usually full list, but let's do filtered for context)
    // Wait, stats usually reflect the whole month, not just search results. 
    // Let's calculate stats separately based on ALL eleves to be accurate for the "Resume".
    
    const badge = getBadge(statut);

    const row = document.createElement('div');
    row.className = 'paiement-row';
    const hasPayment = !!p;
    const editLabel = hasPayment ? 'Modifier' : 'Ajouter';
    const receiptBtn = hasPayment ? `<button class="btn btn-sm ghost" data-action="receipt">Reçu</button>` : '';
    const whatsappReceiptBtn = hasPayment && statut === 'paye' && e.tel_parent ? `<button class="btn btn-sm success" data-action="whatsappReceipt">WhatsApp</button>` : '';
    const reminderBtn = statut !== 'paye' ? `<button class="btn btn-sm success" data-action="reminder">WhatsApp</button>` : '';
    row.innerHTML = `
      <div>
        <strong>${e.nom} ${e.prenom}</strong>
      </div>
      <div>
        <span class="badge gray">${e.classes?.nom ?? '-'}</span>
      </div>
      <div>
        <span class="badge ${badge.cls}">${badge.label}</span>
        ${montant > 0 ? `<small class="muted" style="margin-left:5px;">(${montant} F)</small>` : ''}
      </div>
      <div class="actions-group" style="display:flex; gap:0.5rem;">
        <button class="btn btn-sm primary" data-action="edit">${editLabel}</button>
        ${receiptBtn}
        ${whatsappReceiptBtn}
        ${reminderBtn}
      </div>
    `;

    row.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(e));
    const receiptEl = row.querySelector('[data-action="receipt"]');
    if (receiptEl) receiptEl.addEventListener('click', () => openReceiptModal(e));
    const whatsappReceiptEl = row.querySelector('[data-action="whatsappReceipt"]');
    if (whatsappReceiptEl) whatsappReceiptEl.addEventListener('click', () => sendReceiptViaWhatsappDirect(e));
    const reminderEl = row.querySelector('[data-action="reminder"]');
    if (reminderEl) reminderEl.addEventListener('click', () => sendPaymentReminder(e, statut, montant));

    fragment.appendChild(row);
  });

  paiementsList.appendChild(fragment);
  calculateGlobalStats(filtered);
}

function calculateGlobalStats(list) {
    const arr = Array.isArray(list) ? list : Array.from(elevesMap.values());
    let total = arr.length;
    let payes = 0;
    let impayes = 0;

    arr.forEach(e => {
        const p = paymentsByEleve.get(e.id);
        const statut = p?.statut ?? 'impaye';
        if (statut === 'paye') payes++;
        else impayes++;
    });

    // Note: 'partiel' counts as impaye effectively for 'Payés' count, or maybe separate?
    // Let's stick to strict 'paye'.
    
    if (totalElevesEl) totalElevesEl.textContent = total;
    if (payesEl) payesEl.textContent = payes;
    if (impayesEl) impayesEl.textContent = impayes; // Includes partiel and impaye
}

function getBadge(statut) {
    switch (statut) {
        case 'paye': return { cls: 'success', label: 'Payé' };
        case 'partiel': return { cls: 'warning', label: 'Partiel' };
        default: return { cls: 'danger', label: 'Impayé' };
    }
}

// --- MODAL EDIT ---

function openEditModal(eleve) {
    currentEleveId = eleve.id;
    const p = paymentsByEleve.get(eleve.id);
    
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const editMois = document.getElementById('editMois');
    const editMontant = document.getElementById('editMontant');
    const editStatut = document.getElementById('editStatut');

    if (modalTitle) modalTitle.textContent = `Paiement – ${eleve.nom} ${eleve.prenom}`;
    if (modalSubtitle) modalSubtitle.textContent = `Classe : ${eleve.classes?.nom}`;
    
    // Set values
    editMois.value = monthFilterEl.value;
    editMontant.value = p?.montant ?? '';
    editStatut.value = p?.statut ?? 'impaye';

    paymentModal.classList.remove('hidden');
}

function closePaymentModal() {
    paymentModal.classList.add('hidden');
    currentEleveId = null;
    paymentForm.reset();
}

async function handleSavePayment(e) {
    e.preventDefault();
    if (!currentEleveId) return;

    const mois = document.getElementById('editMois').value;
    const montant = parseFloat(document.getElementById('editMontant').value || '0');
    const statut = document.getElementById('editStatut').value;

    const btn = document.getElementById('savePaymentBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Enregistrement...';
    btn.disabled = true;

    try {
        await upsertPaiement(currentEleveId, { mois, montant, statut });
        closePaymentModal();
        renderList(); // Refresh list to show changes
        showSuccess('Paiement enregistré avec succès');
    } catch (err) {
        console.error(err);
        alert('Erreur lors de l\'enregistrement');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function upsertPaiement(eleveId, { mois, montant, statut }) {
  if (!mois) return;
  const existing = paymentsByEleve.get(eleveId);
  
  let result = null;

  // Optimistic Update or DB call first? DB call.
  if (existing && existing.id) {
    // Update
    const { data, error } = await db.updatePaiement(existing.id, { mois, montant, statut });
    if (error) throw error;
    // Update local map
    paymentsByEleve.set(eleveId, { ...existing, mois, montant, statut });
  } else {
    // Insert (or check duplicate if concurrency issues, but let's trust logic)
    // Check if exists in DB but not in local map (edge case)
    const { data: dup } = await supabase.from('paiements').select('id').eq('eleve_id', eleveId).eq('mois', mois).single();
    
    if (dup) {
       // Update found dup
       const { error } = await db.updatePaiement(dup.id, { mois, montant, statut });
       if (error) throw error;
       paymentsByEleve.set(eleveId, { id: dup.id, eleve_id: eleveId, mois, montant, statut });
    } else {
       // Insert
       const { data, error } = await supabase.from('paiements').insert([{ eleve_id: eleveId, mois, montant, statut }]).select().single();
       if (error) throw error;
       paymentsByEleve.set(eleveId, data);
    }
  }
}

// --- MODAL RECEIPT ---

function openReceiptModal(eleve) {
  const p = paymentsByEleve.get(eleve.id);
  if (!p) {
      alert("Aucun paiement enregistré pour ce mois.");
      return;
  }

    const date = new Date(p.created_at || Date.now()).toLocaleDateString('fr-FR');
    const mois = p.mois;
    const montant = p.montant;
    const statut = p.statut;

  receiptContent.innerHTML = `
        <div style="text-align:center; margin-bottom: 1rem;">
            <h2 style="margin:0;">${ecoleName}</h2>
            <div style="color:#6b7280; font-size:.9rem;">Reçu de paiement – Généré via School Management</div>
        </div>
        <div class="receipt-row">
            <strong>Élève :</strong>
            <span>${eleve.nom} ${eleve.prenom}</span>
        </div>
        <div class="receipt-row">
            <strong>Classe :</strong>
            <span>${eleve.classes?.nom}</span>
        </div>
        <div class="receipt-row">
            <strong>Mois :</strong>
            <span>${mois}</span>
        </div>
        <div class="receipt-row">
            <strong>Date de paiement :</strong>
            <span>${date}</span>
        </div>
        <div class="receipt-row">
            <strong>Statut :</strong>
            <span style="text-transform:uppercase;">${statut}</span>
        </div>
        <br>
        <div class="receipt-row" style="font-size: 1.2rem; border-bottom: 2px solid #000;">
            <strong>MONTANT PERÇU :</strong>
            <strong>${montant} FCFA</strong>
        </div>
        <div style="margin-top: 1rem; text-align: center; font-size: 0.8rem; color: #666;">
            <em>Reçu généré électroniquement par School Management.</em>
        </div>
    `;

    // Show/Hide WhatsApp button
    if (eleve.tel_parent) {
        sendWhatsappBtn.style.display = 'inline-block';
        // Store current receipt details on the button for easy access
        sendWhatsappBtn.dataset.eleveId = eleve.id;
    } else {
        sendWhatsappBtn.style.display = 'none';
    }

    receiptModal.classList.remove('hidden');
}

function sendReceiptViaWhatsapp() {
    const eleveId = sendWhatsappBtn.dataset.eleveId;
    if (!eleveId) {
        alert("Erreur : Impossible de retrouver l'élève concerné.");
        return;
    }

    const eleve = elevesMap.get(eleveId);
    const p = paymentsByEleve.get(eleveId);
    
    if (!eleve) {
        alert("Erreur : Données de l'élève introuvables.");
        return;
    }
    if (!p) {
        alert("Erreur : Paiement introuvable.");
        return;
    }

    const rawNumber = eleve.tel_parent;
    if (!rawNumber) {
        alert("Aucun numéro de téléphone pour ce parent.");
        return;
    }

    // Nettoyage du numéro
    let num = rawNumber.replace(/[^\d]/g, '');
    
    // Gestion basique du format international (Sénégal par défaut si 9 chiffres)
    if (num.length === 9 && (num.startsWith('7') || num.startsWith('3') || num.startsWith('8'))) {
        num = '221' + num;
    }

    if (num.length < 9) { 
         alert("Numéro de téléphone invalide (trop court).");
         return;
    }

    const date = new Date(p.created_at || Date.now()).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    // Formatage du statut pour un meilleur affichage
    const statutFormate = p.statut === 'paye' ? '✅ PAYÉ' : 
                          p.statut === 'partiel' ? '⚠️ PARTIEL' : 
                          '❌ IMPAYÉ';
    
    const message = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*📋 REÇU DE PAIEMENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bonjour,

Nous vous confirmons la réception du paiement de la scolarité pour :

👤 *Élève :* ${eleve.prenom} ${eleve.nom}
📚 *Classe :* ${eleve.classes?.nom || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*DÉTAILS DU PAIEMENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Période :* ${p.mois}
💰 *Montant :* ${Number(p.montant || 0).toLocaleString('fr-FR')} FCFA
${statutFormate}
🗓️ *Date de paiement :* ${date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Merci de votre confiance et de votre régularité.

Cordialement,
*${ecoleName}*

💬 Pour toute question, n'hésitez pas à nous contacter.`;

    const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    
    const win = window.open(url, '_blank');
    if (!win) {
        alert("Le lien WhatsApp a été bloqué par votre navigateur. Veuillez autoriser les pop-ups.");
    }
}

function closeReceiptModal() {
    receiptModal.classList.add('hidden');
}

function sendReceiptViaWhatsappDirect(eleve) {
    const p = paymentsByEleve.get(eleve.id);
    if (!p) {
        alert("Aucun paiement enregistré pour ce mois.");
        return;
    }
    const rawNumber = eleve.tel_parent;
    if (!rawNumber) {
        alert("Aucun numéro de téléphone pour ce parent.");
        return;
    }
    let num = rawNumber.replace(/[^\d]/g, '');
    if (num.length === 9 && (num.startsWith('7') || num.startsWith('3') || num.startsWith('8'))) {
        num = '221' + num;
    }
    if (num.length < 9) { 
         alert("Numéro de téléphone invalide (trop court).");
         return;
    }
    const date = new Date(p.created_at || Date.now()).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const statutFormate = p.statut === 'paye' ? '✅ PAYÉ' : 
                          p.statut === 'partiel' ? '⚠️ PARTIEL' : 
                          '❌ IMPAYÉ';
    const message = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*📋 REÇU DE PAIEMENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bonjour,

Nous vous confirmons la réception du paiement de la scolarité pour :

👤 *Élève :* ${eleve.prenom} ${eleve.nom}
📚 *Classe :* ${eleve.classes?.nom || 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*DÉTAILS DU PAIEMENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Période :* ${p.mois}
💰 *Montant :* ${Number(p.montant || 0).toLocaleString('fr-FR')} FCFA
${statutFormate}
🗓️ *Date de paiement :* ${date}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Merci de votre confiance et de votre régularité.

Cordialement,
*${ecoleName}*

💬 Pour toute question, n'hésitez pas à nous contacter.`;
    const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    const win = window.open(url, '_blank');
    if (!win) {
        alert("Le lien WhatsApp a été bloqué par votre navigateur. Veuillez autoriser les pop-ups.");
    }
}

function printReceipt() {
    const content = receiptContent.innerHTML;
    const win = window.open('', '', 'height=600,width=800');
    win.document.write('<html><head><title>Reçu de Paiement</title>');
    win.document.write('<style>body { font-family: sans-serif; padding: 2rem; } h1,h2{margin:0 0 .5rem 0;} .receipt-row { display: flex; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px dashed #ccc; padding-bottom: 0.5rem; }</style>');
    win.document.write('</head><body>');
    win.document.write(`<h1>${ecoleName}</h1>`);
    win.document.write('<div style="color:#6b7280; font-size:.9rem; margin-bottom: 1rem;">Reçu de paiement — Généré via School Management</div>');
    win.document.write(content);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
    showToast('success', 'Reçu prêt pour impression');
}

function sendPaymentReminder(eleve, statut, montant) {
    if (!eleve.tel_parent) {
        alert("Aucun numéro de téléphone pour ce parent.");
        return;
    }

    let num = eleve.tel_parent.replace(/[^\d]/g, '');
    if (num.length === 9 && (num.startsWith('7') || num.startsWith('3') || num.startsWith('8'))) {
        num = '221' + num;
    }

    const moisStr = document.getElementById('monthFilter').value;
    
    // Formatage du statut pour un meilleur affichage
    const statutFormate = statut === 'paye' ? '✅ PAYÉ' : 
                          statut === 'partiel' ? '⚠️ PARTIEL' : 
                          '❌ IMPAYÉ';
    
    // Calcul du montant restant si partiel
    const montantRestant = statut === 'partiel' ? 
        `\n💰 *Montant restant dû :* À régulariser` : 
        `\n💰 *Montant total dû :* À régler`;
    
    const message = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*🔔 RAPPEL DE PAIEMENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bonjour,

Nous souhaitons vous rappeler que la scolarité du mois de *${moisStr}* pour votre enfant n'a pas encore été entièrement réglée.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*INFORMATIONS ÉLÈVE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 *Élève :* ${eleve.prenom} ${eleve.nom}
📚 *Classe :* ${eleve.classes?.nom || 'N/A'}
📅 *Période concernée :* ${moisStr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*SITUATION ACTUELLE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${statutFormate}
${statut === 'partiel' ? `💰 *Montant déjà versé :* ${Number(montant || 0).toLocaleString('fr-FR')} FCFA` : ''}${montantRestant}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nous vous remercions de bien vouloir régulariser cette situation dans les meilleurs délais afin d'éviter tout désagrément.

Pour toute question ou pour convenir d'un échéancier, n'hésitez pas à nous contacter.

Cordialement,
*${ecoleName}*

💬 Nous restons à votre disposition pour toute information complémentaire.`;

    const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    
    const win = window.open(url, '_blank');
    if (!win) {
        alert("Le lien WhatsApp a été bloqué par votre navigateur. Veuillez autoriser les pop-ups.");
    }
}

// --- EXPORT FUNCTIONS ---

function getFilteredPayments() {
    const searchTerm = searchEleveEl ? searchEleveEl.value.toLowerCase() : '';
    const statusFilter = statusFilterEl ? statusFilterEl.value : 'all';
    const classFilter = classFilterEl ? classFilterEl.value : '';
    
    const eleves = Array.from(elevesMap.values());
    return eleves.filter(e => {
        const p = paymentsByEleve.get(e.id);
        const statut = p?.statut ?? 'impaye';
        
        if (statusFilter !== 'all' && statut !== statusFilter) return false;
        if (classFilter && e.classe_id !== classFilter) return false;
        
        const fullName = `${e.nom} ${e.prenom}`.toLowerCase();
        if (searchTerm && !fullName.includes(searchTerm)) return false;
        return true;
    }).map(e => {
        const p = paymentsByEleve.get(e.id);
        return {
            nom: e.nom,
            prenom: e.prenom,
            classe: e.classes?.nom || '-',
            statut: p?.statut ?? 'impaye',
            montant: p?.montant ?? 0
        };
    });
}

function populateClassFilter() {
  if (!classFilterEl) return;
  const selected = classFilterEl.value;
  classFilterEl.innerHTML = '<option value=\"\">Toutes les classes</option>';
  Array.from(classesById.entries()).forEach(([id, name]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    classFilterEl.appendChild(opt);
  });
  if (selected) classFilterEl.value = selected;
}
function exportToExcel() {
    const data = getFilteredPayments().map(item => ({
        "Prénom": item.prenom,
        "Nom": item.nom,
        "Classe": item.classe,
        "Statut": item.statut === 'paye' ? 'Payé' : (item.statut === 'partiel' ? 'Partiel' : 'Impayé'),
        "Montant": item.montant
    }));

    if (data.length === 0) {
        alert("Aucune donnée à exporter.");
        return;
    }

    const month = monthFilterEl.value;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Paiements");
    XLSX.writeFile(wb, `paiements_${month}.xlsx`);
}

function exportToPdf() {
    const data = getFilteredPayments();
    if (data.length === 0) {
        alert("Aucune donnée à exporter.");
        return;
    }

    const month = monthFilterEl.value;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("État des Paiements", 14, 22);
    doc.setFontSize(11);
    doc.text(`Mois : ${month}`, 14, 30);
    doc.text(`Date d'export : ${new Date().toLocaleDateString()}`, 14, 36);

    const tableData = data.map(item => [
        item.prenom,
        item.nom,
        item.classe,
        item.statut === 'paye' ? 'Payé' : (item.statut === 'partiel' ? 'Partiel' : 'Impayé'),
        item.montant + ' FCFA'
    ]);

    doc.autoTable({
        head: [['Prénom', 'Nom', 'Classe', 'Statut', 'Montant']],
        body: tableData,
        startY: 42,
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [46, 204, 113] }
    });

    doc.save(`paiements_${month}.pdf`);
}

// Utilities
function getCurrentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function showSuccess(msg) {
    // Simple toast or reuse error element with green color
    showToast('success', msg);
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
