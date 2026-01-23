import { db, auth, utils } from './supabaseClient.js';

let currentEcoleId = null;
let currentEcole = null;
let allEleves = [];
let allPayments = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    const { user, error } = await auth.getCurrentUser();
    if (error || !user) {
        window.location.href = 'login.html';
        return;
    }

    const { data: profile } = await db.getProfile(user.id);
    if (!utils.checkRole(profile, ['directeur', 'director'])) {
        utils.showToast('Accès réservé au directeur', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }
    currentEcoleId = profile.ecole_id;
    
    // Fetch School Details
    const { data: ecole } = await db.getEcole(currentEcoleId);
    currentEcole = ecole;

    // Init Filters
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('monthFilter').value = monthStr;

    // Load Data
    await loadClassesFilter(); // Populate class select
    await loadData();

    // Event Listeners
    document.getElementById('monthFilter').addEventListener('change', loadData);
    document.getElementById('classFilter').addEventListener('change', renderList);
    document.getElementById('statusFilter').addEventListener('change', renderList);
    document.getElementById('searchFilter').addEventListener('input', renderList);
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = 'login.html';
    });
});

async function loadClassesFilter() {
    const { data: classes } = await db.getClassesByEcole(currentEcoleId);
    const select = document.getElementById('classFilter');
    // Keep 'all' option
    if (classes) {
        classes.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nom;
            select.appendChild(opt);
        });
    }
}

async function loadData() {
    const listEl = document.getElementById('paymentList');
    listEl.innerHTML = '<div style="text-align:center; padding:40px;">Chargement...</div>';

    const month = document.getElementById('monthFilter').value;
    
    // Parallel fetch
    const [elevesRes, paiementsRes] = await Promise.all([
        db.getAllElevesByEcole(currentEcoleId),
        db.getPaiementsByMonth(currentEcoleId, month)
    ]);

    if (elevesRes.error) {
        listEl.innerHTML = `<div class="error">Erreur: ${elevesRes.error.message}</div>`;
        return;
    }

    allEleves = elevesRes.data || [];
    allPayments = paiementsRes.data || [];

    renderList();
    updateSummary();
}

function updateSummary() {
    // Calculate totals
    // We only know amount for PAID students.
    const totalPaid = allPayments
        .filter(p => p.statut === 'paye')
        .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
    
    const paidCount = allPayments.filter(p => p.statut === 'paye').length;
    const totalStudents = allEleves.length;
    const unpaidCount = totalStudents - paidCount;

    document.getElementById('totalPaid').textContent = totalPaid.toLocaleString('fr-FR') + ' FCFA';
    // We can't know total unpaid amount easily without fee info, so show count or estimate
    // Let's show "X élèves" for Unpaid
    document.getElementById('totalUnpaid').textContent = `${unpaidCount} élèves`;
    
    const rate = totalStudents > 0 ? Math.round((paidCount / totalStudents) * 100) : 0;
    document.getElementById('recoveryRate').textContent = `${rate}%`;
}

function renderList() {
    const listEl = document.getElementById('paymentList');
    listEl.innerHTML = '';

    const classId = document.getElementById('classFilter').value;
    const status = document.getElementById('statusFilter').value;
    const search = document.getElementById('searchFilter').value.toLowerCase();
    const month = document.getElementById('monthFilter').value;

    // Merge Data
    const rows = allEleves.map(eleve => {
        const payment = allPayments.find(p => p.eleve_id === eleve.id);
        const isPaid = payment && payment.statut === 'paye';
        return { eleve, payment, isPaid };
    });

    // Filter
    const filtered = rows.filter(row => {
        if (classId !== 'all' && row.eleve.classe_id !== classId) return false;
        if (status === 'paid' && !row.isPaid) return false;
        if (status === 'unpaid' && row.isPaid) return false;
        const name = `${row.eleve.prenom} ${row.eleve.nom}`.toLowerCase();
        if (search && !name.includes(search)) return false;
        return true;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px;">Aucun élève trouvé.</div>';
        return;
    }

    // Sort: Unpaid first
    filtered.sort((a, b) => (a.isPaid === b.isPaid) ? 0 : a.isPaid ? 1 : -1);

    filtered.forEach(row => {
        const { eleve, payment, isPaid } = row;
        
        const card = document.createElement('div');
        card.className = 'payment-card';
        
        const statusHtml = isPaid 
            ? `<span class="payment-status status-paid">PAYÉ (${(payment.montant||0).toLocaleString()} F)</span>` 
            : `<span class="payment-status status-unpaid">NON PAYÉ</span>`;

        // WhatsApp Link
        // Format: https://wa.me/221770000000?text=...
        // Need to clean phone number. Assume Senegal (+221).
        let phone = eleve.tel_parent ? eleve.tel_parent.replace(/[^0-9]/g, '') : '';
        if (phone && !phone.startsWith('221') && phone.length === 9) phone = '221' + phone;
        
        const ecoleName = currentEcole ? currentEcole.nom : 'École';
        const waLink = phone 
            ? `https://wa.me/${phone}?text=${encodeURIComponent(`Bonjour, rappel pour la scolarité de ${eleve.prenom} ${eleve.nom} pour le mois de ${month} à ${ecoleName}. Merci.`)}` 
            : '#';
        
        const waBtn = (!isPaid && phone) 
            ? `<a href="${waLink}" target="_blank" class="btn btn-sm btn-whatsapp" style="text-decoration:none; padding:6px 12px; border-radius:6px;">
                 <span>📱 Relancer</span>
               </a>` 
            : '';

        // Payment Button
        const payBtn = `<button class="btn ${isPaid ? 'ghost' : 'primary'} btn-sm" onclick="togglePayment('${eleve.id}', ${isPaid})">
            ${isPaid ? 'Annuler' : 'Marquer Payé'}
        </button>`;

        const receiptBtn = isPaid 
            ? `<button class="btn btn-sm" style="background:#e2e8f0; color:#1e293b; margin-left:5px;" onclick="printReceipt('${eleve.id}')">
                🖨️ Reçu
               </button>`
            : '';

        card.innerHTML = `
            <div class="student-info">
                <h3>${eleve.prenom} ${eleve.nom}</h3>
                <p>${eleve.classes.nom} ${eleve.tel_parent ? '• ' + eleve.tel_parent : ''}</p>
            </div>
            <div class="actions">
                ${statusHtml}
                ${waBtn}
                ${receiptBtn}
                ${payBtn}
            </div>
        `;
        listEl.appendChild(card);
    });
}

// Make global
window.renderList = renderList;

window.printReceipt = function(eleveId) {
    const row = allEleves.find(e => e.id === eleveId);
    const payment = allPayments.find(p => p.eleve_id === eleveId);
    if (!row || !payment) return;

    const ecoleName = currentEcole ? currentEcole.nom : "École";
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const montant = (payment.montant || 0);
    const mois = document.getElementById('monthFilter').value;

    // Build URL to dedicated receipt page to avoid cache issues and Trusted Types
    const params = new URLSearchParams({
        prenom: row.prenom || '',
        nom: row.nom || '',
        classe: row.classes?.nom || '',
        mois,
        montant: String(montant),
        ecole: ecoleName,
        date: dateStr,
        v: 'v2'
    }).toString();

    window.open(`recu_v2.html?${params}`, 'Reçu', 'width=600,height=400');
}

// Expose to window for onclick
window.togglePayment = async (eleveId, isCurrentlyPaid) => {
    const month = document.getElementById('monthFilter').value;
    
    if (isCurrentlyPaid) {
        if (!confirm('Voulez-vous annuler ce paiement ?')) return;
        // Set status to 'en_attente' and montant to 0 or null?
        // Upsert with updated values
        await db.upsertPaiement({
            eleve_id: eleveId,
            mois: month,
            statut: 'en_attente',
            montant: 0
        });
    } else {
        const amountStr = prompt('Montant du paiement (FCFA) :', '10000');
        if (!amountStr) return;
        const amount = parseInt(amountStr.replace(/[^0-9]/g, ''));
        
        await db.upsertPaiement({
            eleve_id: eleveId,
            mois: month,
            statut: 'paye',
            montant: amount
        });
    }
    
    // Refresh data
    loadData();
};
