// Service worker — fonctionnement hors ligne.
//
// En cuisine le Wi-Fi est souvent mauvais : l'app doit se charger même sans
// réseau. Stratégie « stale-while-revalidate » : on sert immédiatement la
// version en cache (démarrage instantané, marche hors ligne) et on rafraîchit
// en arrière-plan pour la fois suivante.

const CACHE = 'lacarte-etiqueteuse-v3';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Ignore tout ce qui n'est pas sur la même origine (rien ici, mais par sûreté).
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cache) => {
      const reseau = fetch(req)
        .then((rep) => {
          if (rep && rep.ok) {
            const copie = rep.clone();
            caches.open(CACHE).then((c) => c.put(req, copie)).catch(() => {});
          }
          return rep;
        })
        .catch(() => null);

      // Cache d'abord : instantané et fonctionnel sans réseau.
      if (cache) {
        reseau.catch(() => {});
        return cache;
      }

      // Pas en cache : on tente le réseau, et à défaut la page d'accueil
      // (cas d'une navigation vers une URL inconnue hors ligne).
      return reseau.then((rep) => rep || caches.match('./index.html'));
    })
  );
});

// Permet à la page de forcer l'activation d'une nouvelle version.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
