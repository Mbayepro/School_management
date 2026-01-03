import { supabase, db } from './supabaseClient.js';

const classesList = document.getElementById('classesList');
const classesCount = document.getElementById('classesCount');

document.addEventListener('DOMContentLoaded', async () => {
  await loadClasses();
});

async function loadClasses() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return;
  }
  const { data: profile } = await db.getProfile(user.id);
  const r = (profile?.role || '').trim().toLowerCase();
  if (!profile || (r !== 'professeur' && r !== 'teacher')) {
    if (classesList) classesList.innerHTML = '<div class="error" style="grid-column: 1/-1; text-align: center;">Accès réservé aux professeurs.</div>';
    return;
  }

  const { data, error: classesError } = await db.getClassesByProfesseur(user.id);
  
  if (classesError) {
    classesList.innerHTML = '<div class="error" style="grid-column: 1/-1; text-align: center;">Erreur de chargement des classes.</div>';
    return;
  }

  classesList.innerHTML = '';
  const count = data ? data.length : 0;
  if (classesCount) classesCount.textContent = `${count} classe${count > 1 ? 's' : ''}`;

  if (!data || data.length === 0) {
    classesList.innerHTML = '<div class="muted" style="grid-column: 1/-1; text-align: center;">Aucune classe assignée.</div>';
    return;
  }

  // Sort by level/name logic
  const order = { primaire: 0, college: 1, lycee: 2 };
  data.sort((a, b) => {
    const oa = order[a.niveau] ?? 99;
    const ob = order[b.niveau] ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.nom || '').localeCompare(b.nom || '');
  });

  data.forEach((c, index) => {
    const link = document.createElement('a');
    link.href = `presences.html?classeId=${c.id}`;
    link.style.textDecoration = 'none';
    link.style.color = 'inherit';
    link.className = 'class-card';
    link.style.animation = `fadeInUp 0.3s ease-out ${index * 0.05}s backwards`;
    
    const icon = `
      <div style="background: #eff6ff; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: #3b82f6;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
      </div>
    `;

    link.innerHTML = `
      ${icon}
      <h3>${c.nom}</h3>
      <div class="badge">${c.niveau || 'Classe'}</div>
    `;
    classesList.appendChild(link);
  });
}
