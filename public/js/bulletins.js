import { supabase } from './supabaseClient.js';

let ecoleId = null;

const init = async () => {
    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return window.location.href = 'index.html';
    
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) return;
    ecoleId = profile.ecole_id;

    await loadClasses();

    const btn = document.getElementById('generateBtn');
    if (btn) btn.addEventListener('click', generateBulletins);
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

async function generateBulletins() {
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
        const { data: ecole } = await supabase.from('ecoles').select('nom').eq('id', ecoleId).single();
        const { data: classe } = await supabase.from('classes').select('nom, niveau').eq('id', classeId).single();
        const { data: eleves } = await supabase.from('eleves').select('*').eq('classe_id', classeId).eq('actif', true).order('nom');
        
        // Fetch Matieres: try to handle both 'nom' and 'nom_matiere'
        const { data: matieres } = await supabase
            .from('matieres')
            .select('*')
            .eq('ecole_id', ecoleId)
            .or(`classe_id.eq.${classeId},classe_id.is.null`);
            
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

        statusText.textContent = "Calcul des moyennes...";
        progressBar.style.width = "50%";

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
            // Handle if matiere_id is not in matieres list (should not happen if consistent)
            // But sometimes logic is weird
            
            let subData = eData.subjects[matId];
            if (!subData) {
                // Try to find if we missed it
                // Or maybe create a temporary subject entry
                subData = {
                    name: 'Autre',
                    coef: 1,
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
        
        let first = true;
        for (const studData of Object.values(reportData)) {
            if (!first) doc.addPage();
            first = false;
            
            const s = studData.student;
            
            // Header
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
                
                doc.text("Le Directeur", 150, finalY + 20);
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
