import { supabase } from './supabaseClient.js';

let ecoleId = null;
let currentClasseId = null;
let currentMatiereId = null;
let currentEvalId = null;

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
        });
    }

    if (selectMatiere) {
        selectMatiere.addEventListener('change', async (e) => {
            currentMatiereId = e.target.value;
            currentEvalId = null;
            resetSelect(selectEvaluation, "Chargement...");
            if (!currentMatiereId) {
                if (selectEvaluation) selectEvaluation.disabled = true;
                if (newEvalBtn) newEvalBtn.disabled = true;
                hideNotes();
                return;
            }
            if (selectEvaluation) selectEvaluation.disabled = false;
            if (newEvalBtn) newEvalBtn.disabled = false;
            hideNotes();

            if (currentMatiereId) {
                await loadEvaluations(currentClasseId, currentMatiereId);
            }
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

    if (selectEvaluation) {
        selectEvaluation.addEventListener('change', async (e) => {
            currentEvalId = e.target.value;
            if (currentEvalId) {
                await loadNotes(currentEvalId);
            } else {
                hideNotes();
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
            const trimestre = document.getElementById('evalTrimestre').value;
            const date = document.getElementById('evalDate').value;
            
            // Get from modal fields first
            const selectedClasseId = evalClasse ? evalClasse.value : currentClasseId;
            const selectedMatiereId = evalMatiere ? evalMatiere.value : currentMatiereId;

            console.log("Données évaluation:", { titre, type, trimestre, date, selectedClasseId, selectedMatiereId });

            if (!selectedClasseId || !selectedMatiereId) {
                console.error("Classe ou matière manquante");
                alert("Veuillez sélectionner une classe et une matière.");
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prev; }
                return;
            }

            try {
                 const { data, error } = await supabase
                .from('evaluations')
                .insert([{
                    titre,
                    type_eval: type,
                    trimestre: parseInt(trimestre),
                    date_eval: date,
                    classe_id: selectedClasseId,
                    matiere_id: selectedMatiereId,
                    ecole_id: ecoleId
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

    // --- 2. Chargement des données (ASYNC) ---
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return window.location.href = 'index.html';

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (!profile) return;
        ecoleId = profile.ecole_id;

        // Load Classes
        await loadClasses();
    } catch (err) {
        console.error("Error loading data in notes.js:", err);
    }

    // Functions

    async function loadClasses() {
        if (selectClasse) selectClasse.innerHTML = '<option value="">Chargement...</option>';
        if (evalClasse) evalClasse.innerHTML = '<option value="">Chargement...</option>';

        const { data: classes } = await supabase
            .from('classes')
            .select('id, nom, niveau')
            .eq('ecole_id', ecoleId)
            .order('nom');
        
        if (selectClasse) selectClasse.innerHTML = '<option value="">-- Choisir une classe --</option>';
        if (evalClasse) evalClasse.innerHTML = '<option value="">-- Choisir --</option>';

        classes?.forEach(c => {
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
        
        let { data: matieres } = await supabase
            .from('matieres')
            .select('id, nom')
            .eq('ecole_id', ecoleId)
            .or(`classe_id.eq.${classeId},classe_id.is.null`)
            .order('nom');
        if (!matieres || matieres.length === 0) {
            targetSelect.innerHTML = '<option value="">Aucune matière disponible</option>';
            targetSelect.disabled = true;
            return;
        }

        targetSelect.innerHTML = '<option value="">-- Choisir une matière --</option>';
        matieres?.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.nom;
            targetSelect.appendChild(opt);
        });
        targetSelect.disabled = false;
    }

    async function loadEvaluations(classeId, matiereId) {
        if (!selectEvaluation) return;
        selectEvaluation.innerHTML = '<option value="">Chargement...</option>';
        const { data: evals } = await supabase
            .from('evaluations')
            .select('id, titre, date_eval, type_eval')
            .eq('classe_id', classeId)
            .eq('matiere_id', matiereId)
            .order('date_eval', { ascending: false });

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

        // 2. Get existing Notes
        const { data: existingNotes } = await supabase
            .from('notes')
            .select('eleve_id, valeur, appreciation')
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
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>${eleve.nom} ${eleve.prenom}</td>
                <td>
                    <input type="number" min="0" max="20" step="0.5" 
                        class="note-input" 
                        value="${noteData.valeur !== undefined ? noteData.valeur : ''}"
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
                const val = valInput.value;
                const app = appInput.value;
                
                if (val === '') return; // Don't save empty grades immediately? Or delete?
                // For now, let's just save valid numbers.

                await saveNote(evalId, eleve.id, val, app);
                
                const indicator = document.getElementById(`saved-${eleve.id}`);
                if (indicator) {
                    indicator.classList.add('visible');
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
        console.log(`Sauvegarde note - Eval: ${evalId}, Eleve: ${eleveId}, Val: ${valeur}`);
        
        const { error } = await supabase
            .from('notes')
            .upsert({
                evaluation_id: evalId,
                eleve_id: eleveId,
                valeur: parseFloat(valeur),
                appreciation: appreciation
            }, { onConflict: 'evaluation_id, eleve_id' });

        if (error) {
            console.error('Error saving note:', error);
            alert('Erreur de sauvegarde pour un élève: ' + error.message);
        } else {
            console.log('Note sauvegardée avec succès');
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
