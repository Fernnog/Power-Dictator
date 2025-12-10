import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

// =========================================================
// CONFIGURAÇÃO CRÍTICA PARA USO LOCAL
// =========================================================
// Desabilita download remoto (evita CORS e firewall)
env.allowRemoteModels = false;
env.allowLocalModels = true;
// Caminho para a pasta models relativo a este arquivo worker
env.localModelPath = '../models/';

let transcriber = null;

self.addEventListener('message', async (event) => {
    const { type, audio } = event.data;

    // --- CARREGAMENTO DO MODELO ---
    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', data: 'Buscando modelo local...' });
            
            // Instancia o pipeline. 
            // Ele vai procurar em: ../models/Xenova/whisper-tiny/
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                quantized: true, // Importante: força uso dos arquivos _quantized.onnx que você baixou
                progress_callback: (data) => {
                    // Repassa o progresso do carregamento para a UI
                    self.postMessage({ status: 'progress', data });
                }
            });
            
            self.postMessage({ status: 'ready' });
        } catch (error) {
            console.error(error);
            self.postMessage({ status: 'error', data: error.message });
        }
    }

    // --- TRANSCRIÇÃO (INFERÊNCIA) ---
    if (type === 'transcribe' && transcriber) {
        try {
            // Whisper espera float32 e taxa de amostragem de 16kHz
            const output = await transcriber(audio, {
                language: 'portuguese',
                task: 'transcribe',
                chunk_length_s: 30,
                stride_length_s: 5
            });
            
            // Retorna o texto transcrito
            self.postMessage({ status: 'result', text: output.text });
        } catch (err) {
            self.postMessage({ status: 'error', data: err.message });
        }
    }
});
