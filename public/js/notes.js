import { supabase } from './supabaseClient.js';

let ecoleId = null;
let ecoleName = 'School Management';
let noteMax = 20;
let currentClasseId = null;
let currentMatiereId = null;
let currentEvalId = null;
    let currentEvaluationsList = []; // Store evaluations for offline access

    // --- Offline Sync ---
    let offlineQueue = [];
    try {
        const saved = localStorage.getItem('school_mgr_offline_notes');
        if (saved) offlineQueue = JSON.parse(saved);
    } catch (_) {}

    function addToOfflineQueue(item) {
        offlineQueue.push(item);
        localStorage.setItem('school_mgr_offline_notes', JSON.stringify(offlineQueue));
        showToast('Mode hors ligne: Note sauvegardée localement', 'info');
        const ind = document.getElementById(`saved-${item.data.eleve_id}`);
        if (ind) {
             ind.classList.add('visible');
             ind.textContent = '💾'; // Local save icon
             setTimeout(() => ind.classList.remove('visible'), 2000);
        }
    }

    async function syncOfflineNotes() {
        if (!navigator.onLine || offlineQueue.length === 0) return;
        
        const queue = [...offlineQueue];
        // We don't clear queue immediately in case of crash, but here we assume success
        // or we filter out success ones.
        // Let's simple try one by one.
        
        showToast(`Synchronisation de ${queue.length} notes...`, 'info');
        let remaining = [];
        let synced = 0;

        for (const item of queue) {
            try {
                const { error } = await supabase.from('notes').upsert(item.data, item.options);
                if (error) throw error;
                synced++;
            } catch (e) {
                console.error('Sync error:', e);
                remaining.push(item);
            }
        }
        
        offlineQueue = remaining;
        localStorage.setItem('school_mgr_offline_notes', JSON.stringify(offlineQueue));
        
        if (synced > 0) showToast(`${synced} notes synchronisées !`, 'success');
        if (remaining.length > 0) showToast(`${remaining.length} erreurs de synchro.`, 'error');
    }

    window.addEventListener('online', syncOfflineNotes);
    window.addEventListener('load', syncOfflineNotes);

    const init = async () => {
    console.log('Init notes.js started');
    const selectClasse = document.getElementById('selectClasse');
    const selectMatiere = document.getElementById('selectMatiere');
    const selectEvaluation = document.getElementById('selectEvaluation');
    const newEvalBtn = document.getElementById('newEvalBtn');
    const notesContainer = document.getElementById('notesContainer');
    const emptyState = document.getElementById('emptyState');
    const notesBody = document.getElementById('notesBody');
    const evalModal = document.getElementById('evalModal');
    const closeEvalModal = document.getElementById('closeEvalModal');
    const evalForm = document.getElementById('evalForm');
    const evalClasse = document.getElementById('evalClasse');
    const evalMatiere = document.getElementById('evalMatiere');

    // --- 0. Toast System & Keyboard Nav ---
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);

    function showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';

        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-msg">${msg}</div>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s forwards';
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }

    // Keyboard Navigation (Excel-style)
    if (notesBody) {
        notesBody.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
                const current = e.target;
                if (!current.matches('.note-input, .appreciation-input')) return;
                
                e.preventDefault(); // Prevent scrolling
                const tr = current.closest('tr');
                if (!tr) return;
                
                const isNote = current.classList.contains('note-input');
                const selector = isNote ? '.note-input' : '.appreciation-input';
                
                let targetTr = null;
                if (e.key === 'ArrowDown' || e.key === 'Enter') {
                    targetTr = tr.nextElementSibling;
                } else if (e.key === 'ArrowUp') {
                    targetTr = tr.previousElementSibling;
                }
                
                if (targetTr) {
                    const targetInput = targetTr.querySelector(selector);
                    if (targetInput) {
                        targetInput.focus();
                        if (isNote) targetInput.select(); // Auto-select text for quick overwrite
                    }
                }
            }
        });
    }

    // --- 1. Attacher les écouteurs d'événements (UI) IMMÉDIATEMENT ---

    if (selectClasse) {
        selectClasse.addEventListener('change', async (e) => {
            currentClasseId = e.target.value;
            currentMatiereId = null;
            currentEvalId = null;
            resetSelect(selectMatiere, "Sélectionner une matière d'abord");
            resetSelect(selectEvaluation, "Sélectionner une matière d'abord");
            if (selectMatiere) selectMatiere.disabled = !currentClasseId;
            if (selectEvaluation) selectEvaluation.disabled = true;
            if (newEvalBtn) newEvalBtn.disabled = true;
            hideNotes();

            if (currentClasseId) {
                await loadMatieres(currentClasseId, selectMatiere);
                if (selectMatiere) selectMatiere.disabled = false;
            }
            updateContextBadge();
        });
    }

    if (selectMatiere) {
        selectMatiere.addEventListener('change', async (e) => {
            if (e.target.value === '__CREATE_NEW__') {
                const name = window.prompt('Nom de la matière');
                if (name && name.trim()) {
                    const ensuredId = await ensureMatiere(name.trim(), currentClasseId);
                    const opt = document.createElement('option');
                    opt.value = String(ensuredId);
                    opt.textContent = name.trim();
                    selectMatiere.appendChild(opt);
                    e.target.value = String(ensuredId);
                } else {
                    e.target.value = '';
                    currentMatiereId = null;
                    if (selectEvaluation) selectEvaluation.disabled = true;
                    if (newEvalBtn) newEvalBtn.disabled = true;
                    hideNotes();
                    return;
                }
            }
            currentMatiereId = e.target.value;
            currentEvalId = null;
            resetSelect(selectEvaluation, "Chargement...");
            if (!currentMatiereId) {
                if (selectEvaluation) selectEvaluation.disabled = true;
                if (newEvalBtn) newEvalBtn.disabled = true;
                hideNotes();
                return;
            }
            // Convertir les placeholders 'NOM:xxx' en ID de matière réel si nécessaire
            if (String(currentMatiereId).startsWith('NOM:')) {
                const matName = String(currentMatiereId).slice(4);
                const ensuredId = await ensureMatiere(matName, currentClasseId);
                currentMatiereId = ensuredId;
                // Mettre à jour la valeur du select avec l'ID réel
                const opt = Array.from(selectMatiere.options).find(o => o.value === `NOM:${matName}`);
                if (opt) opt.value = String(ensuredId);
                selectMatiere.value = String(ensuredId);
            }
            if (selectEvaluation) selectEvaluation.disabled = false;
            if (newEvalBtn) newEvalBtn.disabled = false;
            hideNotes();

            if (currentMatiereId) {
                await loadEvaluations(currentClasseId, currentMatiereId);
            }
            updateContextBadge();
        });
    }
    
    if (evalClasse) {
        evalClasse.addEventListener('change', async (e) => {
            const cid = e.target.value;
            if (cid) {
                await loadMatieres(cid, evalMatiere);
            } else {
                resetSelect(evalMatiere, "Sélectionner une classe");
            }
        });
    }
    
    if (evalMatiere) {
        evalMatiere.addEventListener('change', async (e) => {
            let val = e.target.value;
            if (val === '__CREATE_NEW__') {
                const name = window.prompt('Nom de la matière');
                if (name && name.trim()) {
                    const ensuredId = await ensureMatiere(name.trim(), evalClasse ? evalClasse.value : currentClasseId);
                    const opt = document.createElement('option');
                    opt.value = String(ensuredId);
                    opt.textContent = name.trim();
                    evalMatiere.appendChild(opt);
                    e.target.value = String(ensuredId);
                } else {
                    e.target.value = '';
                    return;
                }
            } else if (String(val).startsWith('NOM:')) {
                const matName = String(val).slice(4);
                const ensuredId = await ensureMatiere(matName, evalClasse ? evalClasse.value : currentClasseId);
                const opt = Array.from(evalMatiere.options).find(o => o.value === `NOM:${matName}`);
                if (opt) opt.value = String(ensuredId);
                evalMatiere.value = String(ensuredId);
            }
        });
    }

    if (selectEvaluation) {
        selectEvaluation.addEventListener('change', async (e) => {
            currentEvalId = e.target.value;
            if (currentEvalId) {
                await loadNotes(currentEvalId);
                const exportBtn = document.getElementById('exportBulletinBtn');
                if (exportBtn) {
                    exportBtn.disabled = false;
                    exportBtn.onclick = exportBulletinPdf;
                }
            } else {
                hideNotes();
                const exportBtn = document.getElementById('exportBulletinBtn');
                if (exportBtn) {
                    exportBtn.disabled = true;
                    exportBtn.onclick = null;
                }
            }
        });
    }

    if (newEvalBtn) {
        newEvalBtn.addEventListener('click', async () => {
            if (evalModal) evalModal.classList.remove('hidden');
            
            // Pre-fill if selected on main page
            if (currentClasseId && evalClasse) {
                evalClasse.value = currentClasseId;
                await loadMatieres(currentClasseId, evalMatiere);
                if (currentMatiereId && evalMatiere) {
                    evalMatiere.value = currentMatiereId;
                }
            } else if (evalClasse && evalClasse.value) {
                 await loadMatieres(evalClasse.value, evalMatiere);
            }

            const dateEl = document.getElementById('evalDate');
            if (dateEl && !dateEl.value) {
                dateEl.valueAsDate = new Date();
            }
            const msgEl = document.getElementById('evalMsg');
            if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; msgEl.style.color = ''; }
        });
    }

    if (closeEvalModal) {
        closeEvalModal.addEventListener('click', () => {
            const msgEl = document.getElementById('evalMsg');
            if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; msgEl.style.color = ''; }
            if (evalModal) evalModal.classList.add('hidden');
        });
    }
    // Close when clicking outside
    if (evalModal) {
        evalModal.addEventListener('click', (e) => {
            if (e.target === evalModal) evalModal.classList.add('hidden');
        });
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') evalModal.classList.add('hidden');
        });
    }

    if (evalForm) {
        evalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("Formulaire création évaluation soumis");
            
            const submitBtn = evalForm.querySelector('button[type="submit"]');
            const prev = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Création…'; }
            
            const titre = document.getElementById('evalTitre').value;
            const type = document.getElementById('evalType').value;
            const trimestreRaw = document.getElementById('evalTrimestre').value;
            const trimestre = Number.isFinite(parseInt(String(trimestreRaw), 10)) ? parseInt(String(trimestreRaw), 10) : 1;
            const date = document.getElementById('evalDate').value;
            
            // Get from modal fields first
            const selectedClasseId = evalClasse ? evalClasse.value : currentClasseId;
            let selectedMatiereId = evalMatiere ? evalMatiere.value : currentMatiereId;
            if (selectedMatiereId && String(selectedMatiereId).startsWith('NOM:')) {
                const matName = String(selectedMatiereId).slice(4);
                selectedMatiereId = await ensureMatiere(matName, selectedClasseId);
            }

            console.log("Données évaluation:", { titre, type, trimestre, date, selectedClasseId, selectedMatiereId });

            if (!selectedClasseId || !selectedMatiereId) {
                console.error("Classe ou matière manquante");
                showToast("Veuillez sélectionner une classe et une matière.", 'error');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prev; }
                return;
            }

            try {
                 const { data, error } = await supabase
                .from('evaluations')
                .insert([{
                    titre,
                    type_eval: type,
                    trimestre: trimestre,
                    date_eval: date,
                    classe_id: selectedClasseId,
                    matiere_id: selectedMatiereId
                }])
                .select()
                .single();


                if (error) throw error;
                
                const msgEl = document.getElementById('evalMsg');
                if (msgEl) {
                    msgEl.textContent = "Évaluation créée avec succès !";
                    msgEl.style.color = "green";
                    msgEl.style.display = "block";
                }
                
                // Refresh list if we are in the same view
                if (currentClasseId === selectedClasseId && currentMatiereId === selectedMatiereId) {
                    await loadEvaluations(currentClasseId, currentMatiereId);
                }

                setTimeout(() => {
                     if (evalModal) evalModal.classList.add('hidden');
                     if (evalForm) evalForm.reset();
                     if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prev; }
                     if (msgEl) msgEl.style.display = 'none';
                }, 1500);

            } catch (err) {
                console.error("Erreur création éval:", err);
                const msgEl = document.getElementById('evalMsg');
                if (msgEl) {
                    msgEl.textContent = "Erreur: " + err.message;
                    msgEl.style.color = "red";
                    msgEl.style.display = "block";
                }
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prev; }
            }
        });
    }

    async function ensureMatiere(nom, classeId) {
        const name = (nom || '').trim();
        if (!name) throw new Error('Nom de matière vide');
        const { data: mats } = await supabase
            .from('matieres')
            .select('*')
            .eq('ecole_id', ecoleId)
            .or(`classe_id.eq.${classeId},classe_id.is.null`);
        const match = (mats || []).find(m => ((m.nom ?? m.nom_matiere) || '').trim().toLowerCase() === name.toLowerCase());
        if (match) return match.id;
        let inserted = null;
        let err1 = null;
        try {
            const res1 = await supabase
                .from('matieres')
                .insert([{ nom: name, ecole_id: ecoleId, classe_id: classeId }])
                .select()
                .single();
            if (!res1.error) inserted = res1.data;
            else err1 = res1.error;
        } catch (e) { err1 = e; }
        if (!inserted) {
            try {
                const res2 = await supabase
                    .from('matieres')
                    .insert([{ nom_matiere: name, ecole_id: ecoleId, classe_id: classeId }])
                    .select()
                    .single();
                if (!res2.error) inserted = res2.data;
                else throw res2.error;
            } catch (err) {
                const msg = (err?.message || err1?.message || '').toLowerCase();
                if (msg.includes('row-level security') || msg.includes('rls')) {
                    showToast(`Impossible de créer la matière "${name}" avec votre compte. Demandez au directeur.`, 'error');
                } else {
                    showToast(`Impossible de créer la matière "${name}": ${err?.message || err1?.message}`, 'error');
                }
                throw err;
            }
        }
        return inserted.id;
    }
    // --- 2. Chargement des données (ASYNC) ---
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return window.location.href = 'index.html';

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (!profile) return;
        ecoleId = profile.ecole_id;
        try {
            const { data: ecoleRow } = await supabase.from('ecoles').select('nom, note_max').eq('id', ecoleId).single();
            if (ecoleRow?.nom) ecoleName = ecoleRow.nom;
            noteMax = parseInt(ecoleRow?.note_max ?? 20, 10) || 20;
        } catch (_) {}

        // Load Classes
        await loadClasses();
    } catch (err) {
        console.error("Error loading data in notes.js:", err);
    }

    // Functions

    function updateContextBadge() {
        const badge = document.getElementById('contextBadge');
        if (!badge) return;
        
        let cText = '';
        if (selectClasse && selectClasse.selectedIndex > 0) {
            cText = selectClasse.options[selectClasse.selectedIndex].text;
        }
        
        let mText = '';
        if (selectMatiere && selectMatiere.selectedIndex > 0) {
            mText = selectMatiere.options[selectMatiere.selectedIndex].text;
        }

        if (cText || mText) {
             const parts = [];
             if (cText) parts.push(`Classe: ${cText.split('(')[0].trim()}`);
             if (mText) parts.push(`Matière: ${mText}`);
             badge.textContent = parts.join(' • ');
             badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    async function loadClasses() {
        if (selectClasse) selectClasse.innerHTML = '<option value="">Chargement...</option>';
        if (evalClasse) evalClasse.innerHTML = '<option value="">Chargement...</option>';

        let classes = [];
        try {
            const { data: { user } } = await supabase.auth.getUser();
            let role = null;
            if (user) {
                const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                role = p?.role;
            }

            if (role === 'professeur' || role === 'teacher') {
                 const classIds = new Set();
                 // Enseignements
                 const { data: teaching } = await supabase.from('enseignements').select('classe_id').eq('professeur_id', user.id);
                 teaching?.forEach(t => classIds.add(t.classe_id));
                 // Main professor
                 const { data: main } = await supabase.from('classes').select('id').eq('professeur_id', user.id);
                 main?.forEach(m => classIds.add(m.id));
                 
                 if (classIds.size > 0) {
                     const { data: filtered } = await supabase
                        .from('classes')
                        .select('id, nom, niveau')
                        .eq('ecole_id', ecoleId)
                        .in('id', Array.from(classIds))
                        .order('nom');
                     classes = filtered || [];
                 }
            } else {
                const { data: all } = await supabase
                    .from('classes')
                    .select('id, nom, niveau')
                    .eq('ecole_id', ecoleId)
                    .order('nom');
                classes = all || [];
            }
        } catch (err) {
            console.error('Error loading classes:', err);
        }
        
        if (selectClasse) selectClasse.innerHTML = '<option value="">-- Choisir une classe --</option>';
        if (evalClasse) evalClasse.innerHTML = '<option value="">-- Choisir --</option>';

        classes.forEach(c => {
            const label = `${c.nom} (${c.niveau})`;
            
            if (selectClasse) {
                const opt1 = document.createElement('option');
                opt1.value = c.id;
                opt1.textContent = label;
                selectClasse.appendChild(opt1);
            }

            if (evalClasse) {
                const opt2 = document.createElement('option');
                opt2.value = c.id;
                opt2.textContent = label;
                evalClasse.appendChild(opt2);
            }
        });
    }

    async function loadMatieres(classeId, targetSelect = selectMatiere) {
        if (!targetSelect) return;
        targetSelect.innerHTML = '<option value="">Chargement...</option>';
        
        let matieres = null;
        try {
            const { data } = await supabase
                .from('matieres')
                .select('*')
                .eq('ecole_id', ecoleId)
                .or(`classe_id.eq.${classeId},classe_id.is.null`);
            matieres = (data || []).map(m => ({ id: m.id, label: (m.nom ?? m.nom_matiere ?? '').trim() })).filter(m => !!m.label);
            matieres.sort((a, b) => a.label.localeCompare(b.label));
        } catch (_) {
            matieres = [];
        }
        if (!matieres || matieres.length === 0) {
            const { data: ens } = await supabase
                .from('enseignements')
                .select('matiere')
                .eq('classe_id', classeId);
            const names = Array.from(new Set((ens || []).map(e => (e.matiere || '').trim()).filter(Boolean)));
            if (names.length > 0) {
                const existingNames = new Set((matieres || []).map(m => m.label));
                const toCreate = names.filter(n => !existingNames.has(n));
                for (const n of toCreate) {
                    try { await ensureMatiere(n, classeId); } catch (_) {}
                }
                try {
                    const { data } = await supabase
                        .from('matieres')
                        .select('*')
                        .eq('ecole_id', ecoleId)
                        .or(`classe_id.eq.${classeId},classe_id.is.null`);
                    matieres = (data || []).map(m => ({ id: m.id, label: (m.nom ?? m.nom_matiere ?? '').trim() })).filter(m => !!m.label);
                    matieres.sort((a, b) => a.label.localeCompare(b.label));
                } catch (_) {
                    matieres = [];
                }
            }
            if (!matieres || matieres.length === 0) {
                // Dernier recours: remplir avec les noms venant d'enseignements (placeholders NOM:xxx)
                targetSelect.innerHTML = '<option value="">-- Choisir une matière --</option>';
                const { data: ens2 } = await supabase
                    .from('enseignements')
                    .select('matiere')
                    .eq('classe_id', classeId);
                const names2 = Array.from(new Set((ens2 || []).map(e => (e.matiere || '').trim()).filter(Boolean)));
                if (names2.length === 0) {
                    targetSelect.innerHTML = '<option value="">Aucune matière disponible</option>';
                    const optCreate = document.createElement('option');
                    optCreate.value = '__CREATE_NEW__';
                    optCreate.textContent = 'Créer une matière…';
                    targetSelect.appendChild(optCreate);
                    targetSelect.disabled = false;
                    return;
                }
                names2.forEach(n => {
                    const opt = document.createElement('option');
                    opt.value = `NOM:${n}`;
                    opt.textContent = n;
                    targetSelect.appendChild(opt);
                });
                const optCreate = document.createElement('option');
                optCreate.value = '__CREATE_NEW__';
                optCreate.textContent = 'Créer une matière…';
                targetSelect.appendChild(optCreate);
                targetSelect.disabled = false;
                return;
            }
        }

        targetSelect.innerHTML = '<option value="">-- Choisir une matière --</option>';
        matieres?.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label;
            targetSelect.appendChild(opt);
        });
        const optCreate = document.createElement('option');
        optCreate.value = '__CREATE_NEW__';
        optCreate.textContent = 'Créer une matière…';
        targetSelect.appendChild(optCreate);
        targetSelect.disabled = false;
    }

    async function loadEvaluations(classeId, matiereId) {
        if (!selectEvaluation) return;
        selectEvaluation.innerHTML = '<option value="">Chargement...</option>';
        // Si matiereId est un placeholder NOM:xxx, assurer/créer la matière d'abord
        if (String(matiereId).startsWith('NOM:')) {
            const matName = String(matiereId).slice(4);
            const ensuredId = await ensureMatiere(matName, classeId);
            matiereId = ensuredId;
        }
        const { data: evals } = await supabase
            .from('evaluations')
            .select('id, titre, date_eval, type_eval, trimestre')
            .eq('classe_id', classeId)
            .eq('matiere_id', matiereId)
            .order('date_eval', { ascending: false });
        
        currentEvaluationsList = evals || [];

        if (!evals || evals.length === 0) {
            selectEvaluation.innerHTML = '<option value="">Aucune évaluation</option>';
            selectEvaluation.disabled = true;
            hideNotes();
            return;
        }
        selectEvaluation.innerHTML = '<option value="">-- Choisir une évaluation --</option>';
        evals.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = `${e.date_eval} - ${e.titre} (${e.type_eval})`;
            selectEvaluation.appendChild(opt);
        });
        selectEvaluation.disabled = false;
        const exportBtn = document.getElementById('exportBulletinBtn');
        if (exportBtn) exportBtn.disabled = !currentEvalId;
    }

    async function loadNotes(evalId) {
        if (!notesContainer || !emptyState || !notesBody) return;
        
        notesContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        notesBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Chargement des élèves...</td></tr>';

        // 1. Get Students
        const { data: eleves } = await supabase
            .from('eleves')
            .select('id, nom, prenom')
            .eq('classe_id', currentClasseId)
            .eq('actif', true)
            .order('nom');

        // Adjust header label based on noteMax
        const ths = document.querySelectorAll('.notes-table thead th');
        if (ths && ths[1]) ths[1].textContent = `Note (/${noteMax})`;
        // 2. Get existing Notes
        const { data: existingNotes } = await supabase
            .from('notes')
            .select('eleve_id, note, appreciation, matiere_id')
            .eq('evaluation_id', evalId);

        const notesMap = new Map();
        existingNotes?.forEach(n => notesMap.set(n.eleve_id, n));

        notesBody.innerHTML = '';
        if (!eleves || eleves.length === 0) {
            notesBody.innerHTML = '<tr><td colspan="4">Aucun élève dans cette classe.</td></tr>';
            return;
        }

        eleves.forEach(eleve => {
            const noteData = notesMap.get(eleve.id) || {};
                
                let displayVal = '';
                if (noteData.note === -1) displayVal = 'ABS';
                else if (noteData.note === -2) displayVal = 'NN';
                else if (noteData.note !== undefined && noteData.note !== null) displayVal = noteData.note;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${eleve.nom} ${eleve.prenom}</td>
                    <td>
                        <input type="text" inputmode="decimal"
                            class="note-input" 
                            value="${displayVal}"
                            placeholder="0-${noteMax}"
                            data-eleve="${eleve.id}">
                    </td>
                    <td>
                        <input type="text" 
                            class="appreciation-input" 
                            value="${noteData.appreciation || ''}" 
                            placeholder="Ex: Bien, Assez bien..."
                            data-eleve="${eleve.id}">
                    </td>
                    <td>
                        <span id="saved-${eleve.id}" class="saved-indicator">✔</span>
                    </td>
                `;
                notesBody.appendChild(tr);

                const valInput = tr.querySelector('.note-input');
                const appInput = tr.querySelector('.appreciation-input');

                const save = async () => {
                    let rawVal = valInput.value.trim().toUpperCase();
                    let finalNote = null;

                    // Validation & Conversion
                    if (rawVal === '') return; // Ignore empty

                    if (rawVal === 'ABS' || rawVal === 'A') {
                        finalNote = -1;
                        if(rawVal === 'A') valInput.value = 'ABS';
                    } else if (rawVal === 'NN' || rawVal === 'N') {
                        finalNote = -2;
                        if(rawVal === 'N') valInput.value = 'NN';
                    } else {
                        // Numeric check
                        // Replace comma with dot
                        const num = parseFloat(rawVal.replace(',', '.'));
                        if (isNaN(num)) {
                            showToast("Valeur invalide (Nombre, ABS ou NN)", 'error');
                            valInput.style.borderColor = 'red';
                            return;
                        }
                        if (num < 0 || num > noteMax) {
                            showToast(`La note doit être entre 0 et ${noteMax}`, 'error');
                            valInput.style.borderColor = 'red';
                            return;
                        }
                        finalNote = num;
                    }
                    
                    valInput.style.borderColor = ''; // Reset error style
                    const app = appInput.value;

                    await saveNote(evalId, eleve.id, finalNote, app);
                    
                    const indicator = document.getElementById(`saved-${eleve.id}`);
                    if (indicator) {
                        indicator.classList.add('visible');
                        indicator.textContent = '✔';
                        setTimeout(() => indicator.classList.remove('visible'), 2000);
                    }
                };

                valInput.addEventListener('change', save);
                appInput.addEventListener('change', save);
            });
    }

    async function saveNote(evalId, eleveId, valeur, appreciation) {
        // Check if note exists
        // Using upsert based on constraint (evaluation_id, eleve_id)
        // console.log(`Sauvegarde note - Eval: ${evalId}, Eleve: ${eleveId}, Val: ${valeur}`);
        
        let matId = currentMatiereId;
        if (matId && String(matId).startsWith('NOM:')) {
            const matName = String(matId).slice(4);
            // If offline, we can't ensure matiere. 
            // We must assume it exists or fail. 
            // If offline, we can't create new matiere.
            if (!navigator.onLine) {
                 showToast('Impossible de créer une matière hors ligne.', 'error');
                 return;
            }
            matId = await ensureMatiere(matName, currentClasseId);
        }
        if (!matId) {
            showToast('Sélectionnez une matière avant de saisir les notes.', 'error');
            return;
        }

        // Use cached evaluations list
        const evalRow = currentEvaluationsList.find(e => e.id === evalId);

        const typeEval = (evalRow?.type_eval ?? 'evaluation');
        const triRaw = evalRow?.trimestre ?? null;
        let triText = '';
        if (typeof triRaw === 'string') {
            triText = triRaw;
        } else {
            const n = parseInt(String(triRaw), 10);
            if (n === 1) triText = '1er Semestre';
            else if (n === 2) triText = '2ème Semestre';
            else if (!Number.isNaN(n)) triText = `Trimestre ${n}`;
        }

        const noteData = {
            evaluation_id: evalId,
            eleve_id: eleveId,
            note: parseFloat(valeur),
            appreciation: appreciation,
            matiere_id: matId,
            type_evaluation: typeEval,
            trimestre: triText
        };
        const upsertOptions = { onConflict: 'evaluation_id, eleve_id' };

        if (!navigator.onLine) {
            addToOfflineQueue({ data: noteData, options: upsertOptions });
            return;
        }

        let res = await supabase
            .from('notes')
            .upsert(noteData, upsertOptions);
        let error = res.error || null;
        if (error) {
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('column "matiere_id"') || msg.includes('column matiere_id')) {
                res = await supabase
                    .from('notes')
                    .upsert({
                        evaluation_id: evalId,
                        eleve_id: eleveId,
                        note: parseFloat(valeur),
                        appreciation: appreciation,
                        type_evaluation: typeEval,
                        trimestre: triText
                    }, { onConflict: 'evaluation_id, eleve_id' });
                error = res.error || null;
            } else if (msg.includes('column "trimestre"') || msg.includes('column trimestre')) {
                res = await supabase
                    .from('notes')
                    .upsert({
                        evaluation_id: evalId,
                        eleve_id: eleveId,
                        note: parseFloat(valeur),
                        appreciation: appreciation,
                        matiere_id: matId,
                        type_evaluation: typeEval
                    }, { onConflict: 'evaluation_id, eleve_id' });
                error = res.error || null;
            }
        }

        if (error) {
            console.error('Error saving note:', error);
            showToast('Erreur de sauvegarde: ' + error.message, 'error');
        } else {
            console.log('Note sauvegardée avec succès');
        }
    }
    
    async function exportBulletinPdf() {
        if (!currentClasseId || !currentMatiereId || !currentEvalId) {
            showToast('Sélectionnez classe, matière et évaluation.', 'info');
            return;
        }
        try {
            let matId = currentMatiereId;
            if (String(matId).startsWith('NOM:')) {
                const matName = String(matId).slice(4);
                matId = await ensureMatiere(matName, currentClasseId);
            }
            const { data: classe } = await supabase.from('classes').select('nom, niveau').eq('id', currentClasseId).single();
            const { data: matiere } = await supabase.from('matieres').select('nom, nom_matiere').eq('id', matId).single();
            const { data: evalRow } = await supabase.from('evaluations').select('titre, type_eval, date_eval').eq('id', currentEvalId).single();
            const { data: eleves } = await supabase.from('eleves').select('id, nom, prenom').eq('classe_id', currentClasseId).eq('actif', true).order('nom');
            const { data: notesData } = await supabase.from('notes').select('eleve_id, note, appreciation').eq('evaluation_id', currentEvalId);
            const nmap = new Map((notesData || []).map(n => [n.eleve_id, n]));
            
            const rows = (eleves || []).map(e => {
                const n = nmap.get(e.id);
                let val = '';
                if (n?.note !== undefined && n?.note !== null) {
                    if (n.note === -1) val = 'ABS';
                    else if (n.note === -2) val = 'NN';
                    else val = n.note;
                }
                return [ `${e.prenom || ''} ${e.nom || ''}`.trim(), val, n?.appreciation ?? '' ];
            });
            
            const doc = new window.jspdf.jsPDF();
            const title = `Bulletin – ${ecoleName}`;
            doc.setFontSize(16);
            doc.text(title, 14, 16);
            doc.setFontSize(11);
            doc.text(`Classe: ${classe?.nom || ''} (${classe?.niveau || ''})`, 14, 24);
            const matLabel = (matiere?.nom || matiere?.nom_matiere || '').trim();
            doc.text(`Matière: ${matLabel}`, 14, 30);
            doc.text(`Évaluation: ${evalRow?.titre || ''} • ${evalRow?.type_eval || ''} • ${evalRow?.date_eval || ''}`, 14, 36);
            
            doc.autoTable({
                startY: 42,
                head: [['Élève', `Note (/${noteMax})`, 'Appréciation']],
                body: rows
            });
            doc.save(`Bulletin_${classe?.nom || 'classe'}_${matLabel || 'matiere'}.pdf`);
        } catch (err) {
            console.error(err);
            showToast('Erreur export bulletin: ' + (err?.message || ''), 'error');
        }
    }

    function resetSelect(el, msg) {
        if (!el) return;
        el.innerHTML = `<option value="">${msg}</option>`;
        el.value = "";
    }

    function hideNotes() {
        if (notesContainer) notesContainer.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
