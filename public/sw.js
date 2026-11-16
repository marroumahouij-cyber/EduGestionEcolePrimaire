// Service worker volontairement minimal : aucune mise en cache de données scolaires,
// de documents, de sessions ou de réponses /api.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
