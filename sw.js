// Apenas garanta que o CACHE_NAME seja absurdamente específico.
// Como sugeri no plano anterior, 'ditado-digital-v1.0.9' está seguro.
// Mas para eliminar 100% de risco, vamos prefixar com o nome do repositório:

// Atualize a versão do cache para forçar os navegadores a baixarem as novidades
const CACHE_NAME = 'power-dictator-cache-v1.1.0';

// Na lista de arquivos, garanta o uso de caminhos relativos explícitos
const ASSETS_TO_CACHE = [
  './',
  './app.html',
  './style.css',
  './js/main.js',
  './js/config.js',
  './js/llm-service.js', // <-- Atualizado: antigo gemini-service.js
  './js/hf-service.js',
  './js/speech-manager.js',
  './js/hotkeys.js',
  './js/glossary.js',
  './manifest.json'
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
