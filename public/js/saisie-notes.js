// Variables globales
let classes = [];
let matieres = [];
let elevesActuels = [];
let matiereSelectionnee = null;

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
    await verifierAuth();
    await chargerClasses();
    await chargerMatieres();
});

// Vérifier l'authentification
async function verifierAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Vérifier si l'utilisateur est un professeur
    const { data: professeur } = await supabase
        .from('professeurs')
        .select('id, nom, prenom')
        .eq('email', user.email)
        .single();
    
    if (!professeur) {
        afficherMessage('Erreur: Vous devez être un professeur pour accéder à cette page', 'error');
        setTimeout(() => {
            window.location.href = 'dashboard-directeur.html';
        }, 2000);
        return;
    }
    
    document.getElementById('userName').textContent = `Prof. ${professeur.prenom} ${professeur.nom}`;
}

// Charger la liste des classes
async function chargerClasses() {
    try {
        const { data, error } = await supabase
            .from('classes')
            .select('id, nom, niveau')
            .order('niveau');
        
        if (error) throw error;
        
        classes = data;
        const selectClasse = document.getElementById('selectClasse');
        
        classes.forEach(classe => {
            const option = document.createElement('option');
            option.value = classe.id;
            option.textContent = `${classe.niveau} - ${classe.nom}`;
            selectClasse.appendChild(option);
        });
        
    } catch (error) {
        console.error('Erreur lors du chargement des classes:', error);
        afficherMessage('Erreur lors du chargement des classes', 'error');
    }
}

// Charger la liste des matières
async function chargerMatieres() {
    try {
        const { data, error } = await supabase
            .from('matieres')
            .select('id, nom_matiere, coefficient')
            .order('nom_matiere');
        
        if (error) throw error;
        
        matieres = data;
        const selectMatiere = document.getElementById('selectMatiere');
        
        matieres.forEach(matiere => {
            const option = document.createElement('option');
            option.value = matiere.id;
            option.textContent = `${matiere.nom_matiere} (Coef: ${matiere.coefficient})`;
            selectMatiere.appendChild(option);
        });
        
    } catch (error) {
        console.error('Erreur lors du chargement des matières:', error);
        afficherMessage('Erreur lors du chargement des matières', 'error');
    }
}

// Charger les élèves d'une classe
async function chargerEleves() {
    const classeId = document.getElementById('selectClasse').value;
    const matiereId = document.getElementById('selectMatiere').value;
    const trimestre = document.getElementById('selectTrimestre').value;
    const typeEvaluation = document.getElementById('selectType').value;
    
    if (!classeId || !matiereId || !trimestre || !typeEvaluation) {
        afficherMessage('Veuillez sélectionner tous les champs', 'error');
        return;
    }
    
    try {
        // Récupérer les informations de la matière
        const { data: matiereData, error: matiereError } = await supabase
            .from('matieres')
            .select('nom_matiere, coefficient')
            .eq('id', matiereId)
            .single();
        
        if (matiereError) throw matiereError;
        
        matiereSelectionnee = matiereData;
        document.getElementById('coefficientMatiere').textContent = matiereData.coefficient;
        
        // Récupérer les élèves de la classe
        const { data: elevesData, error: elevesError } = await supabase
            .from('eleves')
            .select('id, nom, prenom, matricule')
            .eq('classe_id', classeId)
            .order('nom');
        
        if (elevesError) throw elevesError;
        
        elevesActuels = elevesData;
        
        // Récupérer les notes existantes pour cette matière et ce trimestre
        const { data: notesExistantes, error: notesError } = await supabase
            .from('notes')
            .select('eleve_id, valeur_note')
            .eq('matiere_id', matiereId)
            .eq('trimestre', trimestre)
            .eq('type_evaluation', typeEvaluation);
        
        if (notesError) throw notesError;
        
        // Créer un objet pour accéder rapidement aux notes existantes
        const notesMap = {};
        notesExistantes.forEach(note => {
            notesMap[note.eleve_id] = note.valeur_note;
        });
        
        // Afficher le formulaire
        afficherFormulaire(elevesData, notesMap);
        
    } catch (error) {
        console.error('Erreur lors du chargement des élèves:', error);
        afficherMessage('Erreur lors du chargement des élèves', 'error');
    }
}

// Afficher le formulaire de saisie
function afficherFormulaire(eleves, notesExistantes) {
    const tbody = document.getElementById('elevesTableBody');
    tbody.innerHTML = '';
    
    eleves.forEach((eleve, index) => {
        const tr = document.createElement('tr');
        const noteExistante = notesExistantes[eleve.id] || '';
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${eleve.nom}</td>
            <td>${eleve.prenom}</td>
            <td>
                <div class="note-input">
                    <input type="number" 
                           id="note_${eleve.id}" 
                           value="${noteExistante}"
                           min="0" 
                           max="20" 
                           step="0.5"
                           placeholder="Note">
                    <small>/20</small>
                </div>
            </td>
            <td>
                <input type="text" 
                       id="remarque_${eleve.id}" 
                       placeholder="Remarque (optionnel)">
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    document.getElementById('notesForm').style.display = 'block';
    afficherMessage(`${eleves.length} élève(s) chargé(s)`, 'success');
}

// Enregistrer les notes
async function enregistrerNotes(event) {
    event.preventDefault();
    
    const matiereId = document.getElementById('selectMatiere').value;
    const trimestre = document.getElementById('selectTrimestre').value;
    const typeEvaluation = document.getElementById('selectType').value;
    
    const notes = [];
    let notesValides = true;
    
    elevesActuels.forEach(eleve => {
        const noteInput = document.getElementById(`note_${eleve.id}`);
        const remarqueInput = document.getElementById(`remarque_${eleve.id}`);
        
        const noteValue = noteInput.value.trim();
        
        if (noteValue !== '') {
            const note = parseFloat(noteValue);
            
            if (isNaN(note) || note < 0 || note > 20) {
                noteInput.style.borderColor = '#dc3545';
                notesValides = false;
                return;
            }
            
            noteInput.style.borderColor = '#ddd';
            
            notes.push({
                eleve_id: eleve.id,
                matiere_id: matiereId,
                valeur_note: note,
                type_evaluation: typeEvaluation,
                trimestre: trimestre
            });
        }
    });
    
    if (!notesValides) {
        afficherMessage('Veuillez entrer des notes valides entre 0 et 20', 'error');
        return;
    }
    
    if (notes.length === 0) {
        afficherMessage('Aucune note à enregistrer', 'error');
        return;
    }
    
    try {
        // Supprimer d'abord les notes existantes pour éviter les conflits
        const { error: deleteError } = await supabase
            .from('notes')
            .delete()
            .eq('matiere_id', matiereId)
            .eq('trimestre', trimestre)
            .eq('type_evaluation', typeEvaluation)
            .in('eleve_id', notes.map(n => n.eleve_id));
        
        if (deleteError) throw deleteError;
        
        // Ensuite, insérer les nouvelles notes
        const { error: insertError } = await supabase
            .from('notes')
            .insert(notes);
        
        if (insertError) throw insertError;
        
        afficherMessage(`${notes.length} note(s) enregistrée(s) avec succès!`, 'success');
        
        // Recharger les données pour afficher les notes mises à jour
        setTimeout(() => {
            chargerEleves();
        }, 1500);
        
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement des notes:', error);
        afficherMessage('Erreur lors de l\'enregistrement des notes', 'error');
    }
}

// Annuler la saisie
function annulerSaisie() {
    document.getElementById('notesForm').style.display = 'none';
    document.getElementById('elevesTableBody').innerHTML = '';
    
    // Réinitialiser les champs de sélection
    document.getElementById('selectClasse').value = '';
    document.getElementById('selectMatiere').value = '';
    document.getElementById('selectTrimestre').value = '';
    document.getElementById('selectType').value = '';
}

// Afficher un message
function afficherMessage(message, type) {
    const messageZone = document.getElementById('messageZone');
    messageZone.innerHTML = `<div class="${type}">${message}</div>`;
    
    setTimeout(() => {
        messageZone.innerHTML = '';
    }, 5000);
}

// Déconnexion
async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
}