if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      console.log('Unregistering SW:', registration);
      registration.unregister();
    }
  });
  
  // Vider tous les caches
  caches.keys().then(keys => {
    keys.forEach(key => {
        console.log('Deleting cache:', key);
        caches.delete(key);
    });
  });
}