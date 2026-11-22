// Permet d'installer l'app sur l'écran d'accueil du téléphone. Pas de cache hors ligne : les données restent toujours à jour.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
