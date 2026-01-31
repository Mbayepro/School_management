const CACHE_NAME = 'school-mgr-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard-directeur.html',
  '/dashboard-professeur.html',
  '/eleves.html',
  '/notes.html',
  '/bulletins.html',
  '/css/style.css',
  '/css/dashboard-directeur.css',
  '/js/auth.js',
  '/js/role-guard.js',
  '/js/notes.js',
  '/js/eleves.js',
  '/js/bulletins.js',
  '/js/vendor/jspdf.umd.min.js',
  '/js/vendor/jspdf.plugin.autotable.min.js',
  '/js/vendor/xlsx.full.min.js',
  '/js/vendor/qrcode.min.js',
  '/js/vendor/html5-qrcode.min.js',
  '/js/vendor/supabase.min.js',
  '/logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET ou vers l'API Supabase pour le cache statique
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, fetchRes.clone());
            return fetchRes;
        });
      });
    })
  );
});
