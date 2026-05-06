const CACHE_NAME = 'power-dictator-cache-v1.1.2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',       // Novo nome do arquivo principal
  './style.css',
  './js/main.js',
  './js/config.js',
  './js/llm-service.js',
  './js/hf-service.js',
  './js/speech-manager.js',
  './js/hotkeys.js',
  './js/glossary.js',
  './js/changelog.js',
  './manifest.json'
  // app.html removido — não existe mais
];

// Instalação do motor e armazenamento em cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Estratégia: Tenta pegar da rede, se falhar, pega do cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
