import { supabase } from "./supabaseClient.js";

document.addEventListener('DOMContentLoaded', () => {
    // Sélection des boutons (Barre de navigation et Carte du Dashboard)
    const scannerBtn = document.getElementById('scannerBtn');
    const scannerCardBtn = document.getElementById('scannerCardBtn'); 
    const scannerModal = document.getElementById('scannerModal');
    const closeScannerBtn = document.getElementById('closeScannerBtn');
    const scanResult = document.getElementById('scanResult');
    
    let html5Qrcode = null;

    // Écouteurs d'événements
    if (scannerBtn) scannerBtn.addEventListener('click', openScanner);
    if (scannerCardBtn) scannerCardBtn.addEventListener('click', openScanner);
    if (closeScannerBtn) closeScannerBtn.addEventListener('click', closeScanner);

    if (scannerModal) {
        scannerModal.addEventListener('click', (e) => {
            if (e.target === scannerModal) closeScanner();
        });
    }

    function openScanner() {
        scannerModal.classList.add('active');
        startScanning();
    }

    function closeScanner() {
        scannerModal.classList.remove('active');
        stopScanning();
        resetResult();
    }

    function resetResult() {
        if (scanResult) {
            scanResult.className = 'scan-result';
            scanResult.style.display = 'none';
            scanResult.innerHTML = '';
        }
    }

    async function startScanning() {
        if (html5Qrcode) return;

        const reader = document.getElementById("reader");
        if (!reader) return;

        html5Qrcode = new Html5Qrcode("reader");

        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        try {
            // FORCER LA CAMÉRA ARRIÈRE
            await html5Qrcode.start(
                { facingMode: { exact: "environment" } }, 
                config, 
                onScanSuccess, 
                onScanFailure
            );
        } catch (err) {
            console.error("Erreur caméra arrière (exact), essai environment simple...", err);
            try {
                // Fallback 1: Environment sans "exact"
                await html5Qrcode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
            } catch (err2) {
                console.error("Erreur caméra arrière (simple), essai user...", err2);
                // Fallback 2: Caméra par défaut (souvent frontale sur mobile si user, ou juste defaut)
                // On évite "user" explicite si on veut éviter le selfie, mais si rien d'autre ne marche...
                // On va tenter sans contrainte facingMode
                await html5Qrcode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure).catch(() => {
                     html5Qrcode.start({ facingMode: "user" }, config, onScanSuccess, onScanFailure);
                });
            }
        }
    }

    async function stopScanning() {
        if (html5Qrcode) {
            try {
                await html5Qrcode.stop();
                html5Qrcode = null;
            } catch (err) {
                console.error("Erreur arrêt scanner", err);
            }
        }
    }

    function onScanFailure(error) {
        // On ignore les erreurs de lecture continue pour ne pas saturer la console
    }

    async function onScanSuccess(decodedText) {
        const studentId = decodedText.trim();
        // Optionnel : un petit bip ou vibration ici
        await stopScanning();
        await checkStudentStatus(studentId);
    }

    async function checkStudentStatus(studentId) {
        resetResult();
        scanResult.style.display = 'block';
        scanResult.innerHTML = '<p>Vérification en cours...</p>';

        try {
            // 1. Récupération des infos de l'élève
            const { data: student, error: studentError } = await supabase
                .from('eleves')
                .select('nom, prenom')
                .eq('id', studentId)
                .single();

            if (studentError || !student) {
                showError("Élève non reconnu par le système !");
                return;
            }

            // 2. Vérification du paiement (Mois en cours)
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            
            const { data: paiement } = await supabase
                .from('paiements')
                .select('statut')
                .eq('eleve_id', studentId)
                .eq('mois', currentMonth)
                .maybeSingle();

            const isPaid = paiement && paiement.statut === 'paye';
            showResult(student, isPaid);

        } catch (err) {
            showError("Erreur de connexion à la base de données.");
        }
    }

    function showResult(student, isPaid) {
        scanResult.className = `scan-result ${isPaid ? 'success' : 'error'}`;
        scanResult.innerHTML = `
            <span class="scan-status-icon">${isPaid ? '✅' : '❌'}</span>
            <div class="student-info">
                <h4>${student.prenom} ${student.nom}</h4>
                <p><strong>Statut :</strong> ${isPaid ? 'ACCÈS AUTORISÉ' : 'IMPAYÉ'}</p>
            </div>
        `;
    }

    function showError(msg) {
        scanResult.className = 'scan-result error';
        scanResult.innerHTML = `<p>⚠️ ${msg}</p>`;
    }
});