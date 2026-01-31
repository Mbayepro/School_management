import { supabase, utils } from './supabaseClient.js';

let ecoleId = null;
let noteMax = 20; // Default value

const init = async () => {
    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return window.location.href = 'index.html';
    
    // Charger la config de l'école pour note_max
    try {
        const { data: profile } = await supabase.from('profiles').select('ecole_id').eq('id', user.id).single();
        if (profile && profile.ecole_id) {
            ecoleId = profile.ecole_id;
            const { data: config } = await supabase
                .from('school_configurations')
                .select('note_max')
                .eq('ecole_id', ecoleId)
                .single();
            if (config && config.note_max) {
                noteMax = config.note_max;
            }
        }
    } catch (e) {
        console.warn("Erreur chargement config:", e);
    }

    await loadClasses();

    if (btn) btn.addEventListener('click', prepareGeneration);
    
    // Modal Listeners
    const closeBtn = document.getElementById('closeCoefModal');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        document.getElementById('coefModal').classList.add('hidden');
        document.getElementById('status').classList.add('hidden');
    });
    
    const confirmBtn = document.getElementById('confirmCoefBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', finalizeGeneration);
};

async function loadClasses() {
    const select = document.getElementById('selectClasse');
    if (!select) return;
    select.innerHTML = '<option value="">Chargement...</option>';
    
    const { data: classes } = await supabase
        .from('classes')
        .select('id, nom, niveau')
        .eq('ecole_id', ecoleId)
        .order('nom');
        
    select.innerHTML = '<option value="">-- Choisir une classe --</option>';
    classes?.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.nom} (${c.niveau})`;
        select.appendChild(opt);
    });
}

// Global state for generation flow
let genContext = null;

async function prepareGeneration() {
    const classeId = document.getElementById('selectClasse').value;
    const periodeVal = document.getElementById('selectPeriode').value; // "1" or "2"
    
    if (!classeId) return alert("Veuillez sélectionner une classe.");
    
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const progressBar = document.getElementById('progressBar');
    
    statusDiv.classList.remove('hidden');
    statusText.textContent = "Récupération des données...";
    statusText.style.color = "";
    progressBar.style.width = "10%";

    try {
        // 1. Fetch Data
        const { data: ecole } = await supabase.from('ecoles').select('nom, note_max').eq('id', ecoleId).single();
        if (ecole && ecole.note_max) noteMax = ecole.note_max;

        const { data: classe } = await supabase.from('classes').select('nom, niveau').eq('id', classeId).single();
        const { data: eleves } = await supabase.from('eleves').select('*').eq('classe_id', classeId).eq('actif', true).order('nom');
        
        // Fetch Evaluations
        const { data: evals } = await supabase
            .from('evaluations')
            .select('*')
            .eq('classe_id', classeId)
            .eq('trimestre', parseInt(periodeVal));
            
        const evalIds = evals?.map(e => e.id) || [];
        
        if (evalIds.length === 0) {
            throw new Error("Aucune évaluation trouvée pour cette période.");
        }

        const { data: notes } = await supabase
            .from('notes')
            .select('*')
            .in('evaluation_id', evalIds);

        // Fetch Matieres referenced in evaluations
        const matiereIds = [...new Set(evals.map(e => e.matiere_id))];
        const { data: matieres } = await supabase
            .from('matieres')
            .select('*')
            .in('id', matiereIds)
            .order('nom');

        // Store context
        genContext = { ecole, classe, eleves, evals, notes, matieres, periodeVal };
        
        // Show Coef Modal
        showCoefModal(matieres);
        statusText.textContent = "Vérification des coefficients...";
        progressBar.style.width = "30%";

    } catch (err) {
        console.error(err);
        statusText.textContent = "Erreur: " + err.message;
        statusText.style.color = "red";
    }
}

function showCoefModal(matieres) {
    const modal = document.getElementById('coefModal');
    const list = document.getElementById('coefList');
    list.innerHTML = '';
    
    if (!matieres || matieres.length === 0) {
        list.innerHTML = '<p style="padding:10px;">Aucune matière trouvée.</p>';
    } else {
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.innerHTML = `
            <thead>
                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                    <th style="padding:10px; text-align:left;">Matière</th>
                    <th style="padding:10px; width:100px;">Coefficient</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        
        matieres.forEach(m => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f1f5f9';
            tr.innerHTML = `
                <td style="padding:10px;">${m.nom || m.nom_matiere || 'Inconnue'}</td>
                <td style="padding:10px;">
                    <input type="number" data-id="${m.id}" value="${m.coefficient || 1}" min="1" step="0.5" 
                    style="width:80px; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
                </td>
            `;
            tbody.appendChild(tr);
        });
        list.appendChild(table);
    }
    
    modal.classList.remove('hidden');
}

async function finalizeGeneration() {
    if (!genContext) return;
    
    const modal = document.getElementById('coefModal');
    const inputs = modal.querySelectorAll('input[data-id]');
    const statusText = document.getElementById('statusText');
    const progressBar = document.getElementById('progressBar');
    
    // Update button state
    const confirmBtn = document.getElementById('confirmCoefBtn');
    const prevText = confirmBtn.textContent;
    confirmBtn.textContent = "Mise à jour...";
    confirmBtn.disabled = true;
    
    try {
        // Update coefficients in DB and Memory
        const updates = [];
        inputs.forEach(input => {
            const id = input.getAttribute('data-id');
            const newCoef = parseFloat(input.value) || 1;
            
            // Update in memory
            const m = genContext.matieres.find(x => x.id == id);
            if (m) m.coefficient = newCoef;
            
            // Update in DB (parallel)
            updates.push(supabase.from('matieres').update({ coefficient: newCoef }).eq('id', id));
        });
        
        await Promise.all(updates);
        
        // Close modal
        modal.classList.add('hidden');
        confirmBtn.textContent = prevText;
        confirmBtn.disabled = false;
        
        // Proceed with generation
        statusText.textContent = "Calcul des moyennes...";
        progressBar.style.width = "50%";
        
        await generatePDF(genContext);
        
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la mise à jour des coefficients: " + e.message);
        confirmBtn.disabled = false;
        confirmBtn.textContent = prevText;
    }
}

async function generatePDF(ctx) {
    const { ecole, classe, eleves, evals, notes, matieres, periodeVal } = ctx;
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const progressBar = document.getElementById('progressBar');
    
    try {
        // 2. Process Data
        // Map: EleveID -> { MatiereID -> { notes: [], sum: 0, coef: 0 } }
        const reportData = {}; 
        
        eleves.forEach(e => {
            reportData[e.id] = {
                student: e,
                subjects: {},
                general: { sum: 0, coefSum: 0, avg: 0 }
            };
            matieres?.forEach(m => {
                reportData[e.id].subjects[m.id] = {
                    name: (m.nom || m.nom_matiere || 'Matière inconnue').trim(),
                    coef: parseFloat(m.coefficient) || 1,
                    notes: [],
                    avg: null
                };
            });
        });

        notes.forEach(n => {
            const eData = reportData[n.eleve_id];
            if (!eData) return;
            
            const ev = evals.find(e => e.id === n.evaluation_id);
            if (!ev) return;
            
            let matId = ev.matiere_id;
            
            let subData = eData.subjects[matId];
            if (!subData) {
                // Should not happen with the new fetching logic, but safety fallback
                const matInfo = matieres?.find(m => m.id === matId);
                subData = {
                    name: matInfo ? (matInfo.nom || matInfo.nom_matiere) : 'Autre',
                    coef: matInfo ? (parseFloat(matInfo.coefficient) || 1) : 1,
                    notes: [],
                    avg: null
                };
                eData.subjects[matId] = subData;
            }
            
            if (subData) {
                subData.notes.push({ val: n.note, type: ev.type_eval });
            }
        });

        // Calculate Averages
        Object.values(reportData).forEach(studData => {
            Object.values(studData.subjects).forEach(sub => {
                // Filter valid notes (ignore ABS/NN for average)
                const validNotes = sub.notes.filter(n => n.val >= 0);
                
                if (validNotes.length > 0) {
                    const sum = validNotes.reduce((acc, curr) => acc + curr.val, 0);
                    sub.avg = sum / validNotes.length;
                    
                    studData.general.sum += sub.avg * sub.coef;
                    studData.general.coefSum += sub.coef;
                }
            });
            if (studData.general.coefSum > 0) {
                studData.general.avg = studData.general.sum / studData.general.coefSum;
            }
        });

        statusText.textContent = "Génération du PDF...";
        progressBar.style.width = "80%";

        // 3. Generate PDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Load images if available
        const bucket = supabase.storage.from('school_assets');
        const logoUrl = ecoleId ? (bucket.getPublicUrl(`${ecoleId}/logo.png`)?.data?.publicUrl) : null;
        const cachetUrl = ecoleId ? (bucket.getPublicUrl(`${ecoleId}/cachet.png`)?.data?.publicUrl) : null;
        const signUrl = ecoleId ? (bucket.getPublicUrl(`${ecoleId}/signature.png`)?.data?.publicUrl) : null;

        const logoImg = logoUrl ? await utils.urlToBase64(logoUrl).catch(() => null) : null;
        const cachetImg = cachetUrl ? await utils.urlToBase64(cachetUrl).catch(() => null) : null;
        const signImg = signUrl ? await utils.urlToBase64(signUrl).catch(() => null) : null;
        
        let first = true;
        for (const studData of Object.values(reportData)) {
            if (!first) doc.addPage();
            first = false;
            
            const s = studData.student;
            
            // Header
            if (logoImg) {
                try {
                    doc.addImage(logoImg, 'PNG', 14, 10, 20, 20);
                } catch (e) { console.warn("Logo add failed", e); }
            }

            doc.setFontSize(18);
            doc.text((ecole?.nom || "École").toUpperCase(), 105, 20, { align: 'center' });
            
            doc.setFontSize(14);
            const pLabel = periodeVal === '3' ? '3ème TRIMESTRE' : (periodeVal === '1' ? '1er SEMESTRE / TRIMESTRE' : '2ème SEMESTRE / TRIMESTRE');
            doc.text(`BULLETIN DE NOTES - PÉRIODE ${periodeVal}`, 105, 30, { align: 'center' });
            
            doc.setFontSize(11);
            doc.text(`Élève: ${s.prenom} ${s.nom}`, 14, 45);
            doc.text(`Classe: ${classe.nom} ${classe.niveau}`, 14, 52);
            doc.text(`Année: ${new Date().getFullYear()}`, 150, 45);
            
            // Table Rows
            const rows = [];
            Object.values(studData.subjects)
                .filter(sub => sub.notes.length > 0)
                .forEach(sub => {
                    rows.push([
                        sub.name,
                        sub.coef,
                        sub.notes.map(n => {
                            if (n.val === -1) return 'ABS';
                            if (n.val === -2) return 'NN';
                            return n.val;
                        }).join('; '),
                        sub.avg !== null ? sub.avg.toFixed(2) : '-',
                        getAppreciation(sub.avg)
                    ]);
                });
            
            if (rows.length === 0) {
                doc.text("Aucune note disponible.", 14, 60);
            } else {
                doc.autoTable({
                    startY: 60,
                    head: [['Matière', 'Coef', 'Notes', 'Moyenne', 'Appréciation']],
                    body: rows,
                    theme: 'grid',
                    headStyles: { fillColor: [37, 99, 235] }
                });
                
                const finalY = doc.lastAutoTable.finalY + 10;
                
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text(`Moyenne Générale: ${studData.general.avg.toFixed(2)} / ${noteMax}`, 14, finalY);
                doc.setFont(undefined, 'normal');
                
                // Observations
                doc.rect(14, finalY + 10, 180, 20);
                doc.text("Observations:", 16, finalY + 16);
                
                // Signatures
                const signY = finalY + 40;
                doc.text("Le Directeur", 150, signY);
                
                if (cachetImg) {
                    try {
                         doc.addImage(cachetImg, 'PNG', 140, signY + 5, 30, 30);
                    } catch (e) {}
                }
                if (signImg) {
                    try {
                        doc.addImage(signImg, 'PNG', 150, signY + 10, 40, 20);
                    } catch (e) {}
                }
            }
        }

        doc.save(`Bulletins_${classe.nom}_S${periodeVal}.pdf`);
        
        statusText.textContent = "Terminé !";
        progressBar.style.width = "100%";
        setTimeout(() => statusDiv.classList.add('hidden'), 3000);

    } catch (err) {
        console.error(err);
        statusText.textContent = "Erreur: " + err.message;
        statusText.style.color = "red";
    }
}

function getAppreciation(note) {
    if (note === null || note === undefined) return "-";
    // Scale to /20 for appreciation standard
    const scaled = (note / noteMax) * 20;
    
    if (scaled >= 16) return "Très Bien";
    if (scaled >= 14) return "Bien";
    if (scaled >= 12) return "Assez Bien";
    if (scaled >= 10) return "Passable";
    return "Insuffisant";
}

document.addEventListener('DOMContentLoaded', init);
