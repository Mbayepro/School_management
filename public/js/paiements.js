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
    const montant = (payment.montant || 0).toLocaleString('fr-FR');
    const mois = document.getElementById('monthFilter').value;
    
    // Générer un numéro de reçu dynamique
    const receiptNumber = 'REC-2026-' + String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');

    const win = window.open('', 'Reçu', 'width=800,height=600');
    win.document.write(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reçu de Paiement</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .receipt-container, .receipt-container * {
                        visibility: visible;
                    }
                    .no-print {
                        display: none !important;
                    }
                    body {
                        background: white !important;
                    }
                    .receipt-container {
                        position: fixed !important;
                        top: 50% !important;
                        left: 50% !important;
                        transform: translate(-50%, -50%) !important;
                        width: 90% !important;
                        max-width: 600px !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                        border: 2px solid #000 !important;
                    }
                }
                
                @media (max-width: 640px) {
                    .receipt-container {
                        width: 95% !important;
                        margin: 10px !important;
                        padding: 20px !important;
                    }
                }
            </style>
        </head>
        <body class="bg-gray-100 p-4">
            <div class="receipt-container bg-white border-2 border-gray-800 rounded-lg p-8 max-w-2xl mx-auto shadow-lg">
                <!-- En-tête avec logo et nom de l'école -->
                <div class="flex items-center justify-center mb-6">
                    <div class="w-16 h-16 border-2 border-gray-400 rounded-lg flex items-center justify-center mr-4">
                        <span class="text-gray-500 text-xs">LOGO</span>
                    </div>
                    <div class="text-center">
                        <h1 class="text-2xl font-bold uppercase tracking-wide">GTS TRIOS SCIENTIFIQUES</h1>
                    </div>
                </div>
                
                <!-- Titre du reçu et numéro -->
                <div class="text-center mb-6">
                    <h2 class="text-xl font-bold uppercase mb-2">Reçu de Paiement</h2>
                    <p class="text-gray-600 font-mono">${receiptNumber}</p>
                </div>
                
                <!-- Date -->
                <div class="text-center mb-6">
                    <p class="text-gray-700">Date: ${dateStr}</p>
                </div>
                
                <!-- Tableau des informations -->
                <div class="mb-6">
                    <table class="w-full border-collapse">
                        <tr class="border-b border-gray-300">
                            <td class="py-3 font-semibold">Désignation</td>
                            <td class="py-3 text-right">Frais de scolarité - ${mois}</td>
                        </tr>
                        <tr class="border-b border-gray-300">
                            <td class="py-3 font-semibold">Élève</td>
                            <td class="py-3 text-right">${row.prenom} ${row.nom}</td>
                        </tr>
                        <tr class="border-b border-gray-300">
                            <td class="py-3 font-semibold">Classe</td>
                            <td class="py-3 text-right">${row.classes.nom}</td>
                        </tr>
                        <tr class="border-b border-gray-300">
                            <td class="py-3 font-semibold">Montant</td>
                            <td class="py-3 text-right">${montant} FCFA</td>
                        </tr>
                        <tr class="border-t-2 border-gray-800 font-bold">
                            <td class="py-3 text-lg">TOTAL PAYÉ</td>
                            <td class="py-3 text-right text-lg">${montant} FCFA</td>
                        </tr>
                    </table>
                </div>
                
                <!-- Mentions légales et signature -->
                <div class="mt-8">
                    <p class="text-sm text-gray-600 mb-6 text-center italic">
                        Ce reçu tient lieu de preuve de paiement.
                    </p>
                    
                    <div class="flex justify-end">
                        <div class="text-center">
                            <div class="w-32 h-16 border-2 border-dashed border-gray-400 rounded mb-2 flex items-center justify-center">
                                <span class="text-gray-400 text-xs">Cachet</span>
                            </div>
                            <p class="text-sm font-semibold">Cachet et Signature<br>de la Direction</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Boutons d'action -->
            <div class="flex justify-center gap-4 mt-6 no-print">
                <button onclick="window.print()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                    🖨️ Imprimer
                </button>
                <button onclick="window.close()" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                    ✕ Fermer
                </button>
            </div>
            
            <script>
                // Auto-impression après le chargement
                window.addEventListener('load', function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                });
            </script>
        </body>
        </html>
    `);
    win.document.close();
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
