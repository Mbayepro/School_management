import { utils, supabase } from './supabaseClient.js';

let currentEcoleId = null;
let currentEcole = null;
let allEleves = [];
let allPayments = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    let user = null;
    try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        user = data?.user;
    } catch (e) {
        console.warn("Auth check warning:", e);
    }

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    if (!utils.checkRole(profile, ['directeur', 'director'])) {
        utils.showToast('Accès réservé au directeur', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }
    currentEcoleId = profile.ecole_id;
    
    // Fetch School Details
    const { data: ecole, error: ecoleErr } = await supabase
        .from('ecoles')
        .select('*')
        .eq('id', currentEcoleId)
        .single();
    if (ecoleErr) console.warn("Erreur chargement école:", ecoleErr);
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
    console.log("Paiements: Loading classes for ecole_id:", currentEcoleId);
    // IMPORTANT: RLS is active, but we explicitly filter by ecole_id for safety
    // if default value is present in DB, ensure we read it correctly
    const { data: classes, error: err } = await supabase
        .from('classes')
        .select('*')
        .eq('ecole_id', currentEcoleId)
        .order('nom', { ascending: true });
    
    if (err) console.error("Paiements: Error loading classes", err);
    console.log("Paiements: Classes found:", classes?.length);
    
    const select = document.getElementById('classFilter');
    // Keep 'all' option
    // Clear existing options except first
    while (select.options.length > 1) {
        select.remove(1);
    }
    
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
        supabase
            .from('eleves')
            .select('*, classes(nom)')
            .eq('ecole_id', currentEcoleId),
        supabase
            .from('paiements')
            .select('*')
            .eq('ecole_id', currentEcoleId)
            .eq('mois', month)
    ]);

    if (elevesRes.error) {
        listEl.innerHTML = `<div class="error">Erreur: ${elevesRes.error.message}</div>`;
        return;
    }

    allEleves = elevesRes.data || [];
    allPayments = paiementsRes.data || []; // Even if error, default to empty to allow retry/UI render

    renderList();
    updateSummary();
}

function updateSummary() {
    // Calculate totals
    const totalPaid = allPayments
        .filter(p => p.statut === 'paye')
        .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
    
    const paidCount = allPayments.filter(p => p.statut === 'paye').length;
    const totalStudents = allEleves.length;
    // Unpaid is total students minus paid (approx)
    // Note: If a student pays 0, they are paid. If no record, they are unpaid.
    const unpaidCount = totalStudents - paidCount;

    const totalPaidEl = document.getElementById('totalPaid');
    const totalUnpaidEl = document.getElementById('totalUnpaid');
    const recoveryRateEl = document.getElementById('recoveryRate');

    if (totalPaidEl) totalPaidEl.textContent = totalPaid.toLocaleString('fr-FR') + ' FCFA';
    if (totalUnpaidEl) totalUnpaidEl.textContent = `${Math.max(0, unpaidCount)} élèves`;
    
    const rate = totalStudents > 0 ? Math.round((paidCount / totalStudents) * 100) : 0;
    if (recoveryRateEl) recoveryRateEl.textContent = `${rate}%`;
}

function renderList() {
    const listEl = document.getElementById('paymentList');
    listEl.innerHTML = '';

    const classId = document.getElementById('classFilter').value;
    const status = document.getElementById('statusFilter').value;
    const search = document.getElementById('searchFilter').value.toLowerCase();
    const month = document.getElementById('monthFilter').value;

    if (allEleves.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px;">Aucun élève dans l\'école.</div>';
        return;
    }

    // Merge Data
    const rows = allEleves.map(eleve => {
        const payment = allPayments.find(p => p.eleve_id === eleve.id);
        const isPaid = payment && payment.statut === 'paye';
        const isRelance = payment && payment.statut === 'relance';
        return { eleve, payment, isPaid, isRelance };
    });

    // Filter
    const filtered = rows.filter(row => {
        if (classId !== 'all' && String(row.eleve.classe_id) !== String(classId)) return false;
        
        if (status === 'paid' && !row.isPaid) return false;
        if (status === 'unpaid' && row.isPaid) return false;
        if (status === 'relance' && !row.isRelance) return false; // Add specific filter support if needed
        
        const name = `${row.eleve.prenom} ${row.eleve.nom}`.toLowerCase();
        if (search && !name.includes(search)) return false;
        return true;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px;">Aucun élève trouvé pour ces critères.</div>';
        return;
    }

    // Sort: Unpaid first, then by name
    filtered.sort((a, b) => {
        if (a.isPaid === b.isPaid) return (a.eleve.nom || '').localeCompare(b.eleve.nom || '');
        return a.isPaid ? 1 : -1;
    });

    filtered.forEach(row => {
        const { eleve, payment, isPaid, isRelance } = row;
        
        const card = document.createElement('div');
        card.className = 'payment-card';
        
        let statusHtml = '';
        if (isPaid) {
            statusHtml = `<span class="payment-status status-paid">PAYÉ (${(payment.montant||0).toLocaleString()} F)</span>`;
        } else if (isRelance) {
             statusHtml = `<span class="payment-status" style="background:#f59e0b; color:white;">RELANCÉ</span>`;
        } else {
            statusHtml = `<span class="payment-status status-unpaid">NON PAYÉ</span>`;
        }

        // WhatsApp Link
        let phone = eleve.tel_parent ? eleve.tel_parent.replace(/[^0-9]/g, '') : '';
        if (phone && !phone.startsWith('221') && phone.length === 9) phone = '221' + phone;
        
        const ecoleName = currentEcole ? currentEcole.nom : 'École';
        const waLink = phone 
            ? `https://wa.me/${phone}?text=${encodeURIComponent(`Bonjour, rappel pour la scolarité de ${eleve.prenom} ${eleve.nom} pour le mois de ${month} à ${ecoleName}. Merci.`)}` 
            : '#';
        
        const waBtn = (!isPaid && phone) 
            ? `<a href="${waLink}" target="_blank" onclick="markRelance('${eleve.id}')" class="btn btn-sm btn-whatsapp" style="text-decoration:none; padding:6px 12px; border-radius:6px;">
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

// Mark as relance
window.markRelance = async (eleveId) => {
    // We update status to 'relance' if not paid
    // This allows tracking relances without marking paid
    const month = document.getElementById('monthFilter').value;
    const payment = allPayments.find(p => p.eleve_id === eleveId);
    
    if (payment && payment.statut === 'paye') return; // Don't overwrite paid
    
    // Optimistic update
    const pIndex = allPayments.findIndex(p => p.eleve_id === eleveId);
    if (pIndex >= 0) {
        allPayments[pIndex].statut = 'relance';
    } else {
        allPayments.push({ eleve_id: eleveId, mois: month, statut: 'relance', montant: 0 });
    }
    renderList();
    
    await supabase.from('paiements').upsert({
        eleve_id: eleveId,
        mois: month,
        statut: 'relance',
        montant: 0,
        ecole_id: currentEcoleId
    }, { onConflict: 'eleve_id, mois' });
    // Silent update
};

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
    const parts = mois.split('-');
    const year = parts[0];
    const m = parseInt(parts[1] || '1', 10) || 1;
    const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const moisText = `${months[m - 1]} ${year}`;
    const color = currentEcole?.couleur || '#2563eb';
    const bucket = supabase.storage.from('school_assets');
    const logoUrl = currentEcoleId ? (bucket.getPublicUrl(`${currentEcoleId}/logo.png`)?.data?.publicUrl || '') : '';
    const cachetUrl = currentEcoleId ? (bucket.getPublicUrl(`${currentEcoleId}/cachet.png`)?.data?.publicUrl || '') : '';
    const signUrl = currentEcoleId ? (bucket.getPublicUrl(`${currentEcoleId}/signature.png`)?.data?.publicUrl || '') : '';

    // Build URL to dedicated receipt page to avoid cache issues and Trusted Types
    const numero = payment?.numero || '';
    const params = new URLSearchParams({
        prenom: row.prenom || '',
        nom: row.nom || '',
        classe: row.classes?.nom || '',
        mois,
        mois_text: moisText,
        montant: String(montant),
        ecole: ecoleName,
        date: dateStr,
        color,
        logo: logoUrl,
        cachet: cachetUrl,
        signature: signUrl,
        numero,
        v: 'v2'
    }).toString();

    const ts = Date.now();
    window.open(`recu_v2.html?ts=${ts}&${params}`, 'Reçu', 'width=600,height=400');
}

// Expose to window for onclick
window.togglePayment = async (eleveId, isCurrentlyPaid) => {
    const month = document.getElementById('monthFilter').value;
    
    if (isCurrentlyPaid) {
        if (!confirm('Voulez-vous annuler ce paiement ?')) return;
        // Set status to 'en_attente' and montant to 0 or null?
        // Upsert with updated values
        await supabase.from('paiements').upsert({
            eleve_id: eleveId,
            mois: month,
            statut: 'en_attente',
            montant: 0,
            ecole_id: currentEcoleId
        }, { onConflict: 'eleve_id, mois' });
    } else {
        const amountStr = prompt('Montant du paiement (FCFA) :', '10000');
        if (!amountStr) return;
        const amount = parseInt(amountStr.replace(/[^0-9]/g, ''));
        const { data: existing } = await supabase
            .from('paiements')
            .select('*')
            .eq('ecole_id', currentEcoleId)
            .eq('mois', month);
        const countPaid = (existing || []).filter(p => p.statut === 'paye').length;
        // Find existing payment for this student if any
        const existingPayment = (existing || []).find(p => p.eleve_id === eleveId);
        
        // Preserve existing number if available, else generate new
        const numero = existingPayment?.numero || `REÇU-${String(countPaid + 1).padStart(3, '0')}`;
        
        await supabase.from('paiements').upsert({
            eleve_id: eleveId,
            mois: month,
            statut: 'paye',
            montant: amount,
            numero,
            ecole_id: currentEcoleId
        }, { onConflict: 'eleve_id, mois' });
    }
    
    // Refresh data
    loadData();
};
