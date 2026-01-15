import { supabase } from "./supabaseClient.js";

document.addEventListener('DOMContentLoaded', () => {
    const scannerBtn = document.getElementById('scannerBtn');
    const scannerCardBtn = document.getElementById('scannerCardBtn');
    const scannerModal = document.getElementById('scannerModal');
    const closeScannerBtn = document.getElementById('closeScannerBtn');
    const scanResult = document.getElementById('scanResult');
    
    let html5QrcodeScanner = null;
    let html5Qrcode = null;

    if (scannerBtn) {
        scannerBtn.addEventListener('click', openScanner);
    }
    if (scannerCardBtn) {
        scannerCardBtn.addEventListener('click', openScanner);
    }

    if (closeScannerBtn) {
        closeScannerBtn.addEventListener('click', closeScanner);
    }

    // Close on click outside
    if (scannerModal) {
        scannerModal.addEventListener('click', (e) => {
            if (e.target === scannerModal) {
                closeScanner();
            }
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
            scanResult.className = 'scan-result'; // reset classes
            scanResult.style.display = 'none';
            scanResult.innerHTML = '';
        }
    }
    const readerEl = document.getElementById('reader');
    if (readerEl) {
        readerEl.addEventListener('click', (e) => {
            const t = e.target;
            if (t && t.tagName === 'BUTTON' && (t.textContent || '').toLowerCase().includes('request camera permissions')) {
                startScanning();
            }
        });
    }

    async function startScanning() {
        // Avoid duplicate starts
        if (html5Qrcode || html5QrcodeScanner) return;

        // Permission preflight
        const hasAccess = await ensureCameraAccess();
        if (!hasAccess) return;

        // Prefer direct Html5Qrcode start with explicit back camera constraint
        if (typeof Html5Qrcode !== 'undefined') {
            try {
                html5Qrcode = new Html5Qrcode("reader");
                await html5Qrcode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    onScanSuccess,
                    onScanFailure
                );
                return;
            } catch (err) {
                try {
                    const devices = await Html5Qrcode.getCameras();
                    const backCam = (devices || []).find(d => /back|rear|environment/i.test(d.label)) || (devices || [])[devices?.length - 1];
                    const cameraId = backCam ? backCam.id : undefined;
                    if (cameraId) {
                        await html5Qrcode.start(
                            cameraId,
                            { fps: 10, qrbox: { width: 250, height: 250 } },
                            onScanSuccess,
                            onScanFailure
                        );
                        return;
                    }
                } catch (_) {}
                try {
                    if (typeof Html5QrcodeScanner !== 'undefined') {
                        html5QrcodeScanner = new Html5QrcodeScanner(
                            "reader",
                            { fps: 10, qrbox: { width: 250, height: 250 } },
                            false
                        );
                        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
                        return;
                    }
                } catch (_) {}
            }
        }

        if (typeof Html5QrcodeScanner === 'undefined') {
            console.error('Html5QrcodeScanner not loaded');
            showError("Librairie de scanner non chargée. Vérifiez votre connexion.");
            return;
        }

        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            false
        );
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    }

    async function stopScanning() {
        try {
            if (html5Qrcode) {
                await html5Qrcode.stop();
                await html5Qrcode.clear();
                html5Qrcode = null;
            }
            if (html5QrcodeScanner) {
                await html5QrcodeScanner.clear();
                html5QrcodeScanner = null;
            }
        } catch (error) {
            console.error("Failed to stop scanner", error);
        }
    }

    function onScanFailure(error) {
        // handle scan failure, usually better to ignore and keep scanning.
        // console.warn(`Code scan error = ${error}`);
    }

    async function onScanSuccess(decodedText, decodedResult) {
        // Handle the scanned code
        console.log(`Scan result: ${decodedText}`, decodedResult);
        
        // Stop scanning temporarily or permanently? 
        // User might want to scan multiple, but for now let's show result.
        // Usually we pause or just show overlay.
        
        // Let's assume the QR code contains the Student ID (UUID)
        const studentId = decodedText.trim();
        await stopScanning();
        await checkStudentStatus(studentId);
    }

    async function ensureCameraAccess() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError("Caméra non supportée par le navigateur.");
            return false;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            stream.getTracks().forEach(t => t.stop());
            return true;
        } catch (err) {
            console.error(err);
            const msg = err?.name === 'NotAllowedError'
                ? "Permission caméra refusée. Autorisez-la puis réessayez."
                : err?.name === 'NotFoundError'
                    ? "Aucune caméra détectée sur cet appareil."
                    : "Erreur d’accès à la caméra. Fermez autres apps caméra, utilisez HTTPS/localhost.";
            showError(msg);
            return false;
        }
    }

    async function checkStudentStatus(studentId) {
        resetResult();
        scanResult.style.display = 'block';
        scanResult.innerHTML = '<p>Vérification en cours...</p>';

        try {
            // 1. Get Student Info
            const { data: student, error: studentError } = await supabase
                .from('eleves')
                .select('nom, prenom, classe_id')
                .eq('id', studentId)
                .single();

            if (studentError || !student) {
                showError("Élève non trouvé !");
                return;
            }

            // 2. Check Payment Status for Current Month
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            
            const { data: paiement, error: paiementError } = await supabase
                .from('paiements')
                .select('statut')
                .eq('eleve_id', studentId)
                .eq('mois', currentMonth)
                .maybeSingle();

            // Determine status
            const isPaid = paiement && paiement.statut === 'paye';
            
            showResult(student, isPaid);

        } catch (err) {
            console.error(err);
            showError("Erreur lors de la vérification.");
        }
    }

    function showResult(student, isPaid) {
        scanResult.className = `scan-result ${isPaid ? 'success' : 'error'}`;
        
        const icon = isPaid ? '✅' : '❌';
        const statusText = isPaid ? 'Accès Autorisé' : 'Impayé';
        
        scanResult.innerHTML = `
            <span class="scan-status-icon">${icon}</span>
            <div class="student-info">
                <h4>${student.prenom} ${student.nom}</h4>
                <p><strong>Statut:</strong> ${statusText}</p>
            </div>
        `;
        
        // Optional: Audio feedback
        // playAudio(isPaid);
    }

    function showError(msg) {
        scanResult.className = 'scan-result error';
        scanResult.innerHTML = `
            <span class="scan-status-icon">⚠️</span>
            <div class="student-info">
                <h4>Erreur</h4>
                <p>${msg}</p>
            </div>
        `;
    }
});
