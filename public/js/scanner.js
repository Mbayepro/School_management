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
        const payloadRaw = decodedText.trim();
        let studentId = null;
        let payload = null;
        try {
            const obj = JSON.parse(payloadRaw);
            payload = obj;
            studentId = obj.eleve_id || obj.id || null;
        } catch (_) {
            studentId = payloadRaw;
        }
        // Optionnel : un petit bip ou vibration ici
        await stopScanning();
        await checkStudentStatus(studentId, payload);
    }

    async function checkStudentStatus(studentId, payload) {
        resetResult();
        scanResult.style.display = 'block';
        scanResult.innerHTML = '<p>Vérification en cours...</p>';

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                showError("Session expirée. Veuillez vous reconnecter.");
                return;
            }
            const { data: profile } = await supabase.from('profiles').select('id, ecole_id').eq('id', user.id).single();
            const currentEcoleId = profile?.ecole_id || null;
            if (!studentId) {
                showError("QR invalide: élève introuvable.");
                return;
            }
            // 1. Récupération des infos de l'élève
            const { data: student, error: studentError } = await supabase
                .from('eleves')
                .select('id, nom, prenom, classe_id, classes!inner(ecole_id)')
                .eq('id', studentId)
                .single();

            if (studentError || !student) {
                showError("Élève non reconnu par le système !");
                return;
            }
            if (currentEcoleId && student.classes?.ecole_id && String(student.classes.ecole_id) !== String(currentEcoleId)) {
                showError("QR d'une autre école. Accès refusé.");
                return;
            }
            if (payload && payload.ecole_id && String(payload.ecole_id) !== String(currentEcoleId)) {
                showError("QR invalide pour cette école.");
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
                .eq('ecole_id', currentEcoleId)
                .maybeSingle();

            const isPaid = paiement && paiement.statut === 'paye';
            await showResult(student, isPaid, currentEcoleId);

            // 3. Enregistrement de la présence du jour (statut 'present')
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            let HEURE_LIMITE = '08:00';
            try {
                const { data: ecoleCfg } = await supabase
                  .from('ecoles')
                  .select('heure_limite')
                  .eq('id', currentEcoleId)
                  .single();
                if (ecoleCfg?.heure_limite) HEURE_LIMITE = ecoleCfg.heure_limite;
            } catch (_) {}
            const [hhStr, mmStr] = HEURE_LIMITE.split(':');
            const limitDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(hhStr || '8', 10), parseInt(mmStr || '0', 10), 0, 0);
            const statutPresence = (today > limitDate) ? 'retard' : 'present';
            const presence = {
                eleve_id: student.id,
                ecole_id: currentEcoleId,
                date: todayStr,
                statut: statutPresence,
                marque_par: profile?.id || user.id,
                statut_paiement: isPaid ? 'paye' : 'impaye'
            };
            const { error: presErr } = await supabase.from('presences').insert([presence]);
            if (presErr) {
                const msg = (presErr.message || '').toLowerCase();
                if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('exists')) {
                    // Déjà enregistré aujourd'hui: afficher info sans bloquer
                    scanResult.innerHTML += `<p style="margin-top:8px;">Présence déjà enregistrée aujourd'hui.</p>`;
                } else if (msg.includes('row-level security')) {
                    scanResult.innerHTML += `<p style="margin-top:8px;">Autorisation insuffisante pour enregistrer la présence.</p>`;
                } else {
                    scanResult.innerHTML += `<p style="margin-top:8px;">Erreur enregistrement présence: ${presErr.message}</p>`;
                }
            } else {
                scanResult.innerHTML += `<p style="margin-top:8px; color:#ffffff;">Présence enregistrée (${statutPresence}).</p>`;
            }

        } catch (err) {
            showError("Erreur de connexion à la base de données.");
        }
    }

    async function showResult(student, isPaid, ecoleId) {
        scanResult.className = `scan-result ${isPaid ? 'success' : 'error'}`;
        const photoUrl = await getElevePhotoUrl(ecoleId, student.id);
        const name = `${student.prenom || ''} ${student.nom || ''}`.trim();
        const statusText = isPaid ? 'ACCÈS AUTORISÉ' : 'ACCÈS BLOQUÉ – Voir Comptabilité';
        scanResult.innerHTML = `
            <div class="scan-layout">
              <div>
                <img class="student-photo" src="${photoUrl}" alt="Photo élève" onerror="this.style.display='none'">
              </div>
              <div class="scan-text-block">
                <span class="scan-status-icon">${isPaid ? '✅' : '❌'}</span>
                <div class="student-info">
                    <h4>${name}</h4>
                    <p><strong>Statut :</strong> ${statusText}</p>
                </div>
              </div>
            </div>
        `;
    }

    async function getElevePhotoUrl(ecoleId, eleveId) {
        try {
            const path = `${ecoleId}/${eleveId}.jpg`;
            const { data } = supabase.storage.from('school_photos').getPublicUrl(path);
            return (data?.publicUrl || '') + `?t=${Date.now()}`;
        } catch (_) {
            return '';
        }
    }

    function showError(msg) {
        scanResult.className = 'scan-result error';
        scanResult.innerHTML = `<p>⚠️ ${msg}</p>`;
    }
});
