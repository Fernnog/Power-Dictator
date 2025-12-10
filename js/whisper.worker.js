import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// 1. Definição de Caminho Absoluto (Resolução de Problema de Path)
// Isso pega a URL atual do worker e calcula o caminho exato para a pasta models
const locationHref = self.location.href;
const directoryUrl = locationHref.substring(0, locationHref.lastIndexOf('/'));
const modelsPath = directoryUrl.replace('/js', '/models/'); // Troca a pasta JS pela MODELS

// 2. Configuração do Ambiente
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.localModelPath = modelsPath; // Usa o caminho absoluto calculado acima

console.log("Worker Caminho Configurado:", env.localModelPath);

let transcriber = null;

self.addEventListener('message', async (event) => {
    const { type, audio } = event.data;

    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', data: 'Carregando arquivos locais...' });
            
            // Instancia o pipeline
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                quantized: true,
                // Força a revisão 'main' para evitar que ele busque pastas de hash
                revision: 'main', 
                progress_callback: (data) => {
                    self.postMessage({ status: 'progress', data });
                }
            });
            
            self.postMessage({ status: 'ready' });
        } catch (error) {
            console.error("Erro Worker:", error);
            // Verifica se é erro de parsing (arquivo corrompido)
            if (error.name === 'SyntaxError') {
                 self.postMessage({ 
                    status: 'error', 
                    data: "Erro: O arquivo config.json ou tokenizer.json parece estar corrompido (contém HTML em vez de JSON)." 
                });
            } else {
                self.postMessage({ 
                    status: 'error', 
                    data: `Erro ao carregar modelo: ${error.message}. Verifique o console (F12) para detalhes.` 
                });
            }
        }
    }

    if (type === 'transcribe' && transcriber) {
        try {
            const output = await transcriber(audio, {
                language: 'portuguese',
                task: 'transcribe',
                chunk_length_s: 30,
                stride_length_s: 5
            });
            self.postMessage({ status: 'result', text: output.text });
        } catch (err) {
            self.postMessage({ status: 'error', data: err.message });
        }
    }
});
