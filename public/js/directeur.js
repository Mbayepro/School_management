import { supabase } from './supabaseClient.js';
import CONFIG from './config.js';

const valClasses = document.getElementById('valClasses');
const valEleves = document.getElementById('valEleves');
const valAbsents = document.getElementById('valAbsents');
const valImpayes = document.getElementById('valImpayes');
const statusPill = document.getElementById('statusPill');
const errorEl = document.getElementById('error-message'); // Might not exist in new HTML but good to have safeguard

const init = async () => {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return; // auth.js handles redirect usually

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile) return;
  
  let ecoleId = profile.ecole_id;
  const role = (profile?.role || '').trim().toLowerCase();
  
  // Check if director (or pending approved) needs school association
  if ((role === 'directeur' || role === 'director' || (role === 'pending_director' && profile.is_approved)) && !ecoleId) {
    if (errorEl) {
      errorEl.textContent = "Votre compte n’est pas encore associé à une école. Réessayez plus tard ou contactez l’administrateur.";
      errorEl.style.display = "block";
    }
    return;
  }
  const month = getCurrentMonth();

  const addProfBtn = document.getElementById('addProfBtn');
  const addProfModal = document.getElementById('addProfModal');
  const closeProfModal = document.getElementById('closeProfModal');
  const submitProfBtn = document.getElementById('submitProfBtn');
  const profEmailInput = document.getElementById('profEmail');
  const profPasswordInput = document.getElementById('profPassword');

  if (addProfBtn && addProfModal) {
    addProfBtn.addEventListener('click', () => {
        if(profEmailInput) profEmailInput.value = '';
        if(profPasswordInput) profPasswordInput.value = '';
        addProfModal.style.display = 'flex';
        addProfModal.classList.remove('hidden');
    });
  }

  if (closeProfModal && addProfModal) {
      closeProfModal.addEventListener('click', () => {
          addProfModal.classList.add('hidden');
          addProfModal.style.display = 'none';
      });
  }

  if (submitProfBtn) {
      submitProfBtn.addEventListener('click', async () => {
          let email = profEmailInput?.value?.trim().toLowerCase();
          const password = profPasswordInput?.value?.trim();

          if (!email || !password) {
              alert('Veuillez remplir tous les champs.');
              return;
          }
          
          let isPseudo = false;
          if (!email.includes('@')) {
              email += '@ecole.local';
              isPseudo = true;
          }

          if (password.length < 6) {
              alert('Le mot de passe doit contenir au moins 6 caractères.');
              return;
          }

          const prev = submitProfBtn.textContent;
          submitProfBtn.disabled = true;
          submitProfBtn.textContent = 'Création...';

          try {
             const SUPABASE_URL = localStorage.getItem("SUPABASE_URL") || CONFIG.SUPABASE_URL;
             const SUPABASE_ANON_KEY = localStorage.getItem("SUPABASE_ANON_KEY") || CONFIG.SUPABASE_ANON_KEY;

             let createClientFn = window.supabase && window.supabase.createClient;
             if (!createClientFn) {
                 try {
                     const mod = await import('https://esm.sh/@supabase/supabase-js@2');
                     createClientFn = mod.createClient;
                 } catch(e) { console.error("Dynamic import failed", e); }
             }
             
             if (!createClientFn) {
                 throw new Error("Impossible d'initialiser le client Supabase.");
             }

             const tempClient = createClientFn(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: { 
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
             });

             const { error: upError } = await tempClient.auth.signUp({
                 email,
                 password
             });
             
             if (upError && !upError.message.includes('already registered')) {
                 alert('Erreur création compte: ' + upError.message);
                 return;
             }

             const { data, error } = await supabase.rpc('assign_professor_by_email', { target_email: email });
             if (error) {
                alert(error.message || 'Erreur lors de l’ajout du professeur.');
                return;
             }
             const ok = (data && data.success) !== false;
             if (ok) {
                 const displayUser = isPseudo ? email.split('@')[0] : email;
                 alert(`Professeur ajouté avec succès !\n\nIdentifiant de connexion : ${displayUser}\nMot de passe : ${password}`);
                 addProfModal.classList.add('hidden');
                 addProfModal.style.display = 'none';
             } else {
                 alert(data?.message || 'Erreur inconnue');
             }

          } catch (e) {
              console.error(e);
              alert('Une erreur est survenue.');
          } finally {
              submitProfBtn.disabled = false;
              submitProfBtn.textContent = prev;
          }
      });
  }

  // Fetch all data in parallel
  const [
    { count: classesCount, error: classesErr },
    { data: elevesData, error: elevesErr },
    { data: presencesToday, error: presErr },
    { data: impayesMonth, error: impErr }
  ] = await Promise.all([
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('ecole_id', ecoleId),
    supabase
      .from('eleves')
      .select('id, classes!inner(ecole_id)')
      .eq('actif', true)
      .eq('classes.ecole_id', ecoleId),
    supabase
      .from('presences')
      .select('statut, eleves!inner(classes!inner(ecole_id))')
      .eq('date', new Date().toISOString().split('T')[0])
      .eq('eleves.classes.ecole_id', ecoleId),
    supabase
      .from('paiements')
      .select('eleve_id, eleves!inner(classes!inner(ecole_id))')
      .eq('mois', month)
      .eq('statut', 'paye')
      .eq('eleves.classes.ecole_id', ecoleId)
  ]);

  // Suppression de l'affichage du bandeau d'erreur pour une expérience plus fluide
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }

  // Fix for Eleves count if deep filter failed in head only mode
  // The previous code did: select('id, classes!inner(ecole_id)').eq...
  // Let's stick to a robust query for eleves count.
  const finalElevesCount = (!elevesErr && elevesData) ? elevesData.length : 0;

  // Update DOM
  if (valClasses) valClasses.textContent = classesErr ? '-' : classesCount;
  if (valEleves) valEleves.textContent = finalElevesCount ?? '-';
  
  // Absents
  let absentsCount = 0;
  if (!presErr && presencesToday) {
      absentsCount = presencesToday.filter(p => p.statut === 'absent').length;
      if (valAbsents) valAbsents.textContent = absentsCount;
  } else {
      if (valAbsents) valAbsents.textContent = '-';
  }

  // Impayés (Total Élèves - Ceux qui ont payé)
  let impayesCount = 0;
  if (!impErr && impayesMonth) {
      const paidCount = new Set(impayesMonth.map(p => p.eleve_id)).size;
      impayesCount = (finalElevesCount || 0) - paidCount;
      if (impayesCount < 0) impayesCount = 0; // Safety
      if (valImpayes) valImpayes.textContent = impayesCount;
  } else {
      if (valImpayes) valImpayes.textContent = '-';
  }

  updateStatus(absentsCount, impayesCount);

  // Initialize Charts
  await loadCharts(ecoleId, month);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function loadCharts(ecoleId, month) {
    const ctxPayment = document.getElementById('paymentChart');
    const ctxPresence = document.getElementById('presenceChart');

    if (!ctxPayment || !ctxPresence) return;

    // 1. Fetch Payment Data (All statuses for the month)
    const { data: paiementsData } = await supabase
        .from('paiements')
        .select('statut, eleves!inner(classes!inner(ecole_id))')
        .eq('mois', month)
        .eq('eleves.classes.ecole_id', ecoleId);

    let paye = 0, impaye = 0, partiel = 0;
    if (paiementsData) {
        paiementsData.forEach(p => {
            if (p.statut === 'paye') paye++;
            else if (p.statut === 'partiel') partiel++;
            else impaye++;
        });
    }

    // Payment Chart (Doughnut)
    new Chart(ctxPayment, {
        type: 'doughnut',
        data: {
            labels: ['Payés', 'Impayés', 'Partiels'],
            datasets: [{
                data: [paye, impaye, partiel],
                backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // 2. Fetch Presence Data (Last 5 days)
    const dates = [];
    for (let i = 4; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }

    const { data: presencesData } = await supabase
        .from('presences')
        .select('date, statut, eleves!inner(classes!inner(ecole_id))')
        .gte('date', dates[0])
        .lte('date', dates[4])
        .eq('eleves.classes.ecole_id', ecoleId);

    // Group by date
    const presenceCounts = dates.map(date => {
        if (!presencesData) return 0;
        // Count 'present' or 'retard' as present-ish? Let's count 'present'.
        // Or maybe just show 'Absent' count trend? The user asked for "Presence".
        // Let's show "Présents" (Total - Absents). 
        // But we don't know the total per day easily without querying active students per day.
        // EASIER: Show "Absents" trend. It's more actionable. "Attention, les absences augmentent".
        // BUT "Courbe de présence" usually means presence.
        // Let's stick to "Absents" for now as it's what we track explicitly in `presences` table usually (if only exceptions are logged? No, usually all are logged).
        // Wait, `presences` table usually stores ALL statuses?
        // Let's check `presences` content. If it stores 'present', 'absent', 'retard'.
        // Assuming it stores everything.
        const dayRecs = presencesData.filter(p => p.date === date);
        const presentCount = dayRecs.filter(p => p.statut === 'present' || p.statut === 'retard').length;
        return presentCount;
    });

    const displayDates = dates.map(d => {
        const [y, m, day] = d.split('-');
        return `${day}/${m}`;
    });

    // Presence Chart (Line)
    new Chart(ctxPresence, {
        type: 'line',
        data: {
            labels: displayDates,
            datasets: [{
                label: 'Élèves Présents',
                data: presenceCounts,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

function updateStatus(absents, impayes) {
  if (!statusPill) return;
  
  if (absents >= 5 || impayes >= 10) {
    statusPill.textContent = 'Attention requise';
    statusPill.className = 'pill urgent';
  } else if (absents > 0 || impayes > 0) {
    statusPill.textContent = 'Activité normale';
    statusPill.className = 'pill alert'; // 'alert' is yellow/orange usually
  } else {
    statusPill.textContent = 'Excellent';
    statusPill.className = 'pill success';
  }
}

function getCurrentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
