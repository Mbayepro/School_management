import { supabase } from './supabaseClient.js';

let ecoleId = null;
let ecoleRow = null;

const inputLogo = document.getElementById('inputLogo');
const btnUploadLogo = document.getElementById('btnUploadLogo');
const btnDeleteLogo = document.getElementById('btnDeleteLogo');
const previewLogo = document.getElementById('previewLogo');
const colorPicker = document.getElementById('colorPicker') || document.getElementById('couleurEcole');
const btnSaveTheme = document.getElementById('btnSaveTheme');

const inputCachet = document.getElementById('inputCachet');
const inputSignature = document.getElementById('inputSignature');
const btnUploadAssets = document.getElementById('btnUploadAssets');
const btnDeleteCachet = document.getElementById('btnDeleteCachet');
const btnDeleteSignature = document.getElementById('btnDeleteSignature');
const previewCachet = document.getElementById('previewCachet');
const previewSignature = document.getElementById('previewSignature');

const ecoleNom = document.getElementById('ecoleNom') || document.getElementById('nomEcole');
const ecoleAdresse = document.getElementById('ecoleAdresse') || document.getElementById('adresseEcole');
const ecoleTelephone = document.getElementById('ecoleTelephone') || document.getElementById('telephoneEcole');
const ecoleEmail = document.getElementById('ecoleEmail') || document.getElementById('emailEcole');
const btnSaveEcole = document.getElementById('btnSaveEcole');
const saveMessage = document.getElementById('saveMessage');
const errorEl = document.getElementById('error-message');
const topbarLogo = document.getElementById('topbarLogo');
const noteMaxSelect = document.getElementById('noteMaxSelect');
const btnSaveNoteMax = document.getElementById('btnSaveNoteMax');
const noteMaxMsg = document.getElementById('noteMaxMsg');
const heureLimiteSelect = document.getElementById('heureLimiteSelect');
const btnSaveHeureLimite = document.getElementById('btnSaveHeureLimite');
const heureLimiteMsg = document.getElementById('heureLimiteMsg');

const btnFixClasses = document.getElementById('btnFixClasses');
const fixMessage = document.getElementById('fixMessage');

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { window.location.href = 'login.html'; return; }
  const { data: profile } = await supabase.from('profiles').select('ecole_id').eq('id', user.id).single();
  ecoleId = profile?.ecole_id || null;
  if (!ecoleId) { showError("Votre compte n'est pas associé à une école."); return; }
  await loadEcole();
  await loadAssetsPreview();
  bindEvents();
  applyThemeFromRow();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function bindEvents() {
  if (btnUploadLogo) btnUploadLogo.addEventListener('click', uploadLogo);
  if (btnDeleteLogo) btnDeleteLogo.addEventListener('click', deleteLogo);
  if (btnSaveTheme) btnSaveTheme.addEventListener('click', saveThemeColor);
  if (btnUploadAssets) btnUploadAssets.addEventListener('click', uploadAssets);
  if (btnDeleteCachet) btnDeleteCachet.addEventListener('click', deleteCachet);
  if (btnDeleteSignature) btnDeleteSignature.addEventListener('click', deleteSignature);
  if (btnSaveEcole) btnSaveEcole.addEventListener('click', saveEcoleInfos);
  if (btnSaveNoteMax) btnSaveNoteMax.addEventListener('click', saveNoteMax);
  if (btnSaveHeureLimite) btnSaveHeureLimite.addEventListener('click', saveHeureLimite);
  if (btnFixClasses) btnFixClasses.addEventListener('click', fixOrphanClasses);
}

function showError(msg) {
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  } else {
    alert(msg);
  }
}

async function loadEcole() {
  const { data, error } = await supabase
    .from('ecoles')
    .select('id, nom, telephone, adresse, email, couleur, note_max, heure_limite')
    .eq('id', ecoleId)
    .single();
  if (error) {
    // Certains champs peuvent ne pas exister; on charge ceux présents
    const { data: base } = await supabase
      .from('ecoles')
      .select('id, nom, telephone')
      .eq('id', ecoleId)
      .single();
    ecoleRow = base || {};
  } else {
    ecoleRow = data || {};
  }
  if (ecoleNom) ecoleNom.value = ecoleRow.nom || '';
  if (ecoleTelephone) ecoleTelephone.value = ecoleRow.telephone || '';
  if (ecoleAdresse) ecoleAdresse.value = ecoleRow.adresse || '';
  if (ecoleEmail) ecoleEmail.value = ecoleRow.email || '';
  if (colorPicker && ecoleRow.couleur) colorPicker.value = ecoleRow.couleur;
  if (noteMaxSelect) noteMaxSelect.value = String(ecoleRow.note_max || 20);
  if (heureLimiteSelect) heureLimiteSelect.value = (ecoleRow.heure_limite || '08:00');
}

async function saveNoteMax() {
  const val = parseInt((noteMaxSelect?.value || '20'), 10) || 20;
  if (!ecoleId) return;
  btnSaveNoteMax.disabled = true;
  const prev = btnSaveNoteMax.textContent;
  btnSaveNoteMax.textContent = 'Sauvegarde…';
  try {
    const { error } = await supabase
      .from('ecoles')
      .update({ note_max: val })
      .eq('id', ecoleId);
    if (error) throw error;
    if (noteMaxMsg) { noteMaxMsg.textContent = 'Système de notation mis à jour.'; noteMaxMsg.style.display = 'inline'; }
  } catch (e) {
    showError("Échec de mise à jour. Si la colonne n’existe pas, exécute: ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS note_max INT DEFAULT 20;");
  } finally {
    btnSaveNoteMax.disabled = false;
    btnSaveNoteMax.textContent = prev;
  }
}

async function saveHeureLimite() {
  const val = (heureLimiteSelect?.value || '08:00');
  if (!ecoleId) return;
  btnSaveHeureLimite.disabled = true;
  const prev = btnSaveHeureLimite.textContent;
  btnSaveHeureLimite.textContent = 'Sauvegarde…';
  try {
    const { error } = await supabase
      .from('ecoles')
      .update({ heure_limite: val })
      .eq('id', ecoleId);
    if (error) throw error;
    if (heureLimiteMsg) { heureLimiteMsg.textContent = 'Heure limite mise à jour.'; heureLimiteMsg.style.display = 'inline'; }
  } catch (e) {
    showError("Échec de mise à jour. Si la colonne n’existe pas, exécute: ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS heure_limite TEXT DEFAULT '08:00';");
  } finally {
    btnSaveHeureLimite.disabled = false;
    btnSaveHeureLimite.textContent = prev;
  }
}

async function loadAssetsPreview() {
  const bucket = supabase.storage.from('school_assets');
  if (!ecoleId) return;

  // Optimization: List once to find all assets
  let fileNames = [];
  try {
      const { data: files, error } = await bucket.list(`${ecoleId}`);
      if (!error && files) {
          fileNames = files.map(f => f.name);
      }
  } catch (e) {
      console.warn("Could not list assets:", e);
  }

  const find = (base) => {
      const exts = ['png','jpg','jpeg','webp'];
      const ext = exts.find(e => fileNames.includes(`${base}.${e}`));
      return ext ? `${ecoleId}/${base}.${ext}` : null;
  };

  const logoPath = find('logo');
  const cachetPath = find('cachet');
  const signPath = find('signature');

  const logoUrl = logoPath ? bucket.getPublicUrl(logoPath)?.data?.publicUrl : null;
  const cachetUrl = cachetPath ? bucket.getPublicUrl(cachetPath)?.data?.publicUrl : null;
  const signUrl = signPath ? bucket.getPublicUrl(signPath)?.data?.publicUrl : null;
  
  // Add timestamp to bypass cache
  const t = new Date().getTime();

  if (logoUrl) { 
      const url = `${logoUrl}?t=${t}`;
      if (previewLogo) previewLogo.src = url; 
      if (topbarLogo) topbarLogo.src = url; 
  }
  if (cachetUrl && previewCachet) previewCachet.src = `${cachetUrl}?t=${t}`;
  if (signUrl && previewSignature) previewSignature.src = `${signUrl}?t=${t}`;
}

async function uploadLogo() {
  if (!ecoleId || !inputLogo?.files?.[0]) { alert("Sélectionnez un logo."); return; }
  btnUploadLogo.disabled = true;
  const bucket = supabase.storage.from('school_assets');
  try {
    const file = inputLogo.files[0];
    const name = String(file.name || '').toLowerCase();
    let ext = name.includes('.') ? name.split('.').pop() : 'png';
    if (!['png','jpg','jpeg','webp'].includes(ext)) ext = 'png';
    const path = `${ecoleId}/logo.${ext}`;
    const { error } = await bucket.upload(path, file, { upsert: true, contentType: file.type || `image/${ext}` });
    if (error) throw error;
    await loadAssetsPreview();
    alert('Logo enregistré.');
  } catch (e) {
    showError("Erreur upload logo: " + (e?.message || ''));
  } finally {
    btnUploadLogo.disabled = false;
  }
}

async function deleteLogo() {
  if (!ecoleId) return;
  const bucket = supabase.storage.from('school_assets');
  const { error } = await bucket.remove([`${ecoleId}/logo.png`, `${ecoleId}/logo.jpg`, `${ecoleId}/logo.jpeg`, `${ecoleId}/logo.webp`]);
  if (error) { showError("Suppression logo échouée: " + error.message); return; }
  previewLogo.src = '';
  if (topbarLogo) topbarLogo.src = 'logo.svg';
  alert('Logo supprimé.');
}

async function uploadAssets() {
  if (!ecoleId) { alert("École inconnue."); return; }
  btnUploadAssets.disabled = true;
  const bucket = supabase.storage.from('school_assets');
  try {
    if (inputCachet?.files?.[0]) {
      const file = inputCachet.files[0];
      const name = String(file.name || '').toLowerCase();
      let ext = name.includes('.') ? name.split('.').pop() : 'png';
      if (!['png','jpg','jpeg','webp'].includes(ext)) ext = 'png';
      const { error } = await bucket.upload(`${ecoleId}/cachet.${ext}`, file, { upsert: true, contentType: file.type || `image/${ext}` });
      if (error) throw error;
    }
    if (inputSignature?.files?.[0]) {
      const file = inputSignature.files[0];
      const name = String(file.name || '').toLowerCase();
      let ext = name.includes('.') ? name.split('.').pop() : 'png';
      if (!['png','jpg','jpeg','webp'].includes(ext)) ext = 'png';
      const { error } = await bucket.upload(`${ecoleId}/signature.${ext}`, file, { upsert: true, contentType: file.type || `image/${ext}` });
      if (error) throw error;
    }
    await loadAssetsPreview();
    alert('Cachet/Signature enregistrés.');
  } catch (e) {
    showError("Erreur upload: " + (e?.message || ''));
  } finally {
    btnUploadAssets.disabled = false;
  }
}

async function deleteCachet() {
  if (!ecoleId) return;
  const bucket = supabase.storage.from('school_assets');
  const { error } = await bucket.remove([`${ecoleId}/cachet.png`, `${ecoleId}/cachet.jpg`, `${ecoleId}/cachet.jpeg`, `${ecoleId}/cachet.webp`]);
  if (error) { showError("Suppression cachet échouée: " + error.message); return; }
  previewCachet.src = '';
  alert('Cachet supprimé.');
}

async function deleteSignature() {
  if (!ecoleId) return;
  const bucket = supabase.storage.from('school_assets');
  const { error } = await bucket.remove([`${ecoleId}/signature.png`, `${ecoleId}/signature.jpg`, `${ecoleId}/signature.jpeg`, `${ecoleId}/signature.webp`]);
  if (error) { showError("Suppression signature échouée: " + error.message); return; }
  previewSignature.src = '';
  alert('Signature supprimée.');
}

async function fixOrphanClasses() {
  if (!ecoleId) return;
  if (!confirm("Voulez-vous vraiment lier toutes les classes existantes sans école à votre école actuelle ?")) return;

  fixMessage.textContent = "Traitement en cours...";
  fixMessage.style.color = "blue";
  
  // Try to update classes where ecole_id is NULL
  try {
    const { data, error, count } = await supabase
      .from('classes')
      .update({ ecole_id: ecoleId })
      .is('ecole_id', null)
      .select();

    if (error) throw error;
    
    if (data && data.length > 0) {
      fixMessage.textContent = `Succès ! ${data.length} classe(s) récupérée(s).`;
      fixMessage.style.color = "green";
    } else {
      fixMessage.textContent = "Aucune classe orpheline trouvée ou vous n'avez pas la permission de les modifier.";
      fixMessage.style.color = "orange";
    }
  } catch (e) {
    console.error(e);
    fixMessage.textContent = "Erreur: " + e.message;
    fixMessage.style.color = "red";
  }
}

async function saveEcoleInfos() {
  const payload = {
    nom: (ecoleNom?.value || '').trim(),
    telephone: (ecoleTelephone?.value || '').trim(),
    adresse: (ecoleAdresse?.value || '').trim(),
    email: (ecoleEmail?.value || '').trim(),
    couleur: (colorPicker?.value || '').trim() || null
  };
  btnSaveEcole.disabled = true;
  const prev = btnSaveEcole.textContent;
  btnSaveEcole.textContent = 'Sauvegarde…';
  try {
    const { error } = await supabase
      .from('ecoles')
      .update(payload)
      .eq('id', ecoleId);
    if (error) throw error;
    showSaveMessage('Informations mises à jour.');
    // Met à jour le header et la couleur si besoin
    applyThemeFromRow({ ...ecoleRow, ...payload });
    if (payload.couleur) {
      document.documentElement.style.setProperty('--primary-color', payload.couleur);
    }
    const appEl = document.querySelector(".topbar .brand .app");
    if (appEl && payload.nom) appEl.textContent = payload.nom;
  } catch (e) {
    showError("Échec de sauvegarde. Si l’erreur mentionne une colonne inexistante, exécute la migration:\nALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS adresse TEXT; ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS email TEXT; ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS couleur TEXT;");
  } finally {
    btnSaveEcole.disabled = false;
    btnSaveEcole.textContent = prev;
  }
}

function showSaveMessage(text) {
  if (!saveMessage) return;
  saveMessage.textContent = text;
  saveMessage.style.display = 'inline';
  setTimeout(() => { saveMessage.style.display = 'none'; }, 2500);
}

async function saveThemeColor() {
  const color = colorPicker?.value || '#2563eb';
  btnSaveTheme.disabled = true;
  const prev = btnSaveTheme.textContent;
  btnSaveTheme.textContent = 'Application…';
  try {
    const { error } = await supabase
      .from('ecoles')
      .update({ couleur: color })
      .eq('id', ecoleId);
    if (error) throw error;
    applyThemeFromRow({ ...ecoleRow, couleur: color });
    showSaveMessage('Couleur mise à jour.');
  } catch (e) {
    showError("Échec de mise à jour de la couleur. Si la colonne n’existe pas, exécute: ALTER TABLE public.ecoles ADD COLUMN IF NOT EXISTS couleur TEXT;");
  } finally {
    btnSaveTheme.disabled = false;
    btnSaveTheme.textContent = prev;
  }
}

function applyThemeFromRow(row = ecoleRow) {
  const color = row?.couleur || colorPicker?.value || '#2563eb';
  document.documentElement.style.setProperty('--primary-color', color);
  const themeStyleId = 'school-theme-style';
  let styleEl = document.getElementById(themeStyleId);
  const css = `
    :root { --primary-color: ${color}; }
    .btn.primary { background-color: var(--primary-color) !important; border-color: var(--primary-color) !important; }
    .btn.ghost { color: var(--primary-color) !important; border-color: var(--primary-color) !important; }
    .btn.ghost:hover { background-color: rgba(0,0,0,0.03) !important; }
    .pill { background-color: var(--primary-color) !important; color: #fff !important; }
    .panel-head h2 { color: var(--primary-color) !important; }
    .card-arrow { color: var(--primary-color) !important; }
    .panel { border-top: 2px solid var(--primary-color); }
    input:focus, select:focus, textarea:focus { outline: none !important; border-color: var(--primary-color) !important; }
    a:hover { color: var(--primary-color) !important; }
  `;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = themeStyleId;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  } else {
    styleEl.textContent = css;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
}

function toPngBlob(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('PNG conversion failed')),
        'image/png'
      );
      URL.revokeObjectURL(img.src);
    };
    img.onerror = (e) => reject(e);
    img.src = URL.createObjectURL(file);
  });
}

async function resolveAssetPath(baseName) {
  const bucket = supabase.storage.from('school_assets');
  const exts = ['png','jpg','jpeg','webp'];
  
  for (const ext of exts) {
      const path = `${ecoleId}/${baseName}.${ext}`;
      const { data } = bucket.getPublicUrl(path);
      if (data && data.publicUrl) {
          // Check if it really exists via HEAD request (fast)
          try {
              const res = await fetch(data.publicUrl, { method: 'HEAD' });
              if (res.ok) return path;
          } catch(e) { continue; }
      }
  }
  return null;
}
