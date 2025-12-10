// ATUALIZAÇÃO: Mudamos para a versão 2.17.2 que corrige o erro de "Unsupported model type"
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// =========================================================
// CONFIGURAÇÃO CRÍTICA PARA USO LOCAL
// =========================================================
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false; // Força ler do arquivo fresco, evita cache antigo

// Caminho relativo: O worker está na pasta /js, então sobe um nível (..) para achar models
env.localModelPath = '../models/';

let transcriber = null;

self.addEventListener('message', async (event) => {
    const { type, audio } = event.data;

    // --- CARREGAMENTO DO MODELO ---
    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', data: 'Carregando arquivos locais...' });
            
            // Instancia o pipeline
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                quantized: true,
                progress_callback: (data) => {
                    self.postMessage({ status: 'progress', data });
                }
            });
            
            // Teste de sanidade para garantir que carregou
            if(!transcriber) throw new Error("Falha ao inicializar o Transcriber");

            self.postMessage({ status: 'ready' });
        } catch (error) {
            console.error("Erro fatal no Worker:", error);
            // Mensagem de erro mais detalhada para te ajudar
            self.postMessage({ 
                status: 'error', 
                data: `Erro no Modelo: ${error.message}. Verifique se os arquivos .json e .onnx estão na pasta models/Xenova/whisper-tiny/` 
            });
        }
    }

    // --- TRANSCRIÇÃO (INFERÊNCIA) ---
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
            console.error("Erro na transcrição:", err);
            self.postMessage({ status: 'error', data: err.message });
        }
    }
});
