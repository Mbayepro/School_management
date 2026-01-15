import { supabase } from './supabaseClient.js';

let ecoleId = null;
let currentClasseId = null;
let currentMatiereId = null;
let currentEvalId = null;

document.addEventListener('DOMContentLoaded', async () => {
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

    // Load User & Ecole
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return window.location.href = 'index.html';

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) return;
    ecoleId = profile.ecole_id;

    // Load Classes
    await loadClasses();

    // Event Listeners
    selectClasse.addEventListener('change', async (e) => {
        currentClasseId = e.target.value;
        currentMatiereId = null;
        currentEvalId = null;
        resetSelect(selectMatiere, "Sélectionner une matière d'abord");
        resetSelect(selectEvaluation, "Sélectionner une matière d'abord");
        selectMatiere.disabled = !currentClasseId;
        selectEvaluation.disabled = true;
        newEvalBtn.disabled = true;
        hideNotes();

        if (currentClasseId) {
            await loadMatieres(currentClasseId);
        }
    });

    selectMatiere.addEventListener('change', async (e) => {
        currentMatiereId = e.target.value;
        currentEvalId = null;
        resetSelect(selectEvaluation, "Chargement...");
        selectEvaluation.disabled = false;
        newEvalBtn.disabled = false;
        hideNotes();

        if (currentMatiereId) {
            await loadEvaluations(currentClasseId, currentMatiereId);
        }
    });

    selectEvaluation.addEventListener('change', async (e) => {
        currentEvalId = e.target.value;
        if (currentEvalId) {
            await loadNotes(currentEvalId);
        } else {
            hideNotes();
        }
    });

    if (newEvalBtn) {
        newEvalBtn.addEventListener('click', () => {
            if (!currentClasseId || !currentMatiereId) return;
            evalModal.classList.remove('hidden');
            const dateEl = document.getElementById('evalDate');
            if (dateEl) dateEl.valueAsDate = new Date();
            const msgEl = document.getElementById('evalMsg');
            if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; msgEl.style.color = ''; }
        });
    }

    if (closeEvalModal) {
        closeEvalModal.addEventListener('click', () => {
            const msgEl = document.getElementById('evalMsg');
            if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; msgEl.style.color = ''; }
            evalModal.classList.add('hidden');
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
            const submitBtn = evalForm.querySelector('button[type="submit"]');
            const prev = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Création…'; }
            const titre = document.getElementById('evalTitre').value;
            const type = document.getElementById('evalType').value;
            const trimestre = document.getElementById('evalTrimestre').value;
            const date = document.getElementById('evalDate').value;

            if (!currentClasseId || !currentMatiereId) {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prev; }
                return;
            }

            const { data, error } = await supabase.from('evaluations').insert([{
                titre,
                type_eval: type,
                trimestre: parseInt(trimestre),
                date_eval: date,
                classe_id: currentClasseId,
                matiere_id: currentMatiereId
            }]).select().single();

            if (error) {
                alert("Erreur lors de la création de l'évaluation: " + error.message);
            } else {
                const msgEl = document.getElementById('evalMsg');
                if (msgEl) {
                    msgEl.textContent = 'Évaluation créée avec succès.';
                    msgEl.style.color = '#10b981';
                    msgEl.style.display = 'block';
                }
                await loadEvaluations(currentClasseId, currentMatiereId);
                selectEvaluation.value = data.id;
                currentEvalId = data.id;
                await loadNotes(currentEvalId);
                setTimeout(() => {
                    if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; msgEl.style.color = ''; }
                    evalModal.classList.add('hidden');
                }, 1200);
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = prev; }
        });
    }

    // Functions

    async function loadClasses() {
        selectClasse.innerHTML = '<option value="">Chargement...</option>';
        const { data: classes } = await supabase
            .from('classes')
            .select('id, nom, niveau')
            .eq('ecole_id', ecoleId)
            .order('nom');
        
        selectClasse.innerHTML = '<option value="">-- Choisir une classe --</option>';
        classes?.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.nom} (${c.niveau})`;
            selectClasse.appendChild(opt);
        });
    }

    async function loadMatieres(classeId) {
        selectMatiere.innerHTML = '<option value="">Chargement...</option>';
        // Fetch matieres linked to this class OR generic subjects? 
        // For now, let's fetch all subjects for the school and assume they apply, 
        // or strictly those with classe_id = current or null?
        // Based on schema, matieres has classe_id.
        const { data: matieres } = await supabase
            .from('matieres')
            .select('id, nom')
            .eq('ecole_id', ecoleId)
            .or(`classe_id.eq.${classeId},classe_id.is.null`)
            .order('nom');

        selectMatiere.innerHTML = '<option value="">-- Choisir une matière --</option>';
        matieres?.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.nom;
            selectMatiere.appendChild(opt);
        });
    }

    async function loadEvaluations(classeId, matiereId) {
        selectEvaluation.innerHTML = '<option value="">Chargement...</option>';
        const { data: evals } = await supabase
            .from('evaluations')
            .select('id, titre, date_eval, type_eval')
            .eq('classe_id', classeId)
            .eq('matiere_id', matiereId)
            .order('date_eval', { ascending: false });

        selectEvaluation.innerHTML = '<option value="">-- Choisir une évaluation --</option>';
        evals?.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = `${e.date_eval} - ${e.titre} (${e.type_eval})`;
            selectEvaluation.appendChild(opt);
        });
    }

    async function loadNotes(evalId) {
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
                indicator.classList.add('visible');
                setTimeout(() => indicator.classList.remove('visible'), 2000);
            };

            valInput.addEventListener('change', save);
            appInput.addEventListener('change', save);
        });
    }

    async function saveNote(evalId, eleveId, valeur, appreciation) {
        // Check if note exists
        // Using upsert based on constraint (evaluation_id, eleve_id)
        
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
            alert('Erreur de sauvegarde pour un élève.');
        }
    }

    function resetSelect(el, msg) {
        el.innerHTML = `<option value="">${msg}</option>`;
        el.value = "";
    }

    function hideNotes() {
        notesContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
    }
});
