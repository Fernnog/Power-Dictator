// ATUALIZAÇÃO: Mudamos para a versão 2.17.2 que corrige o erro de "Unsupported model type"
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// =========================================================
// CONFIGURAÇÃO CRÍTICA PARA USO LOCAL
// =========================================================

// 1. Define o caminho base de forma absoluta usando a localização deste worker
// Isso evita erros de "../" que variam dependendo de onde o script é chamado
const BASE_URL = new URL('../models/', import.meta.url).href;

env.allowRemoteModels = true; // ALTERADO: Permite baixar config.json da internet se o local falhar (Safety Net)
env.allowLocalModels = true;
env.useBrowserCache = false;  // Força ler do arquivo fresco
env.localModelPath = BASE_URL; 

console.log("Worker: Caminho dos Modelos definido para:", env.localModelPath);

let transcriber = null;

self.addEventListener('message', async (event) => {
    const { type, audio } = event.data;

    // --- CARREGAMENTO DO MODELO ---
    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', data: 'Carregando arquivos (Local/Remoto)...' });
            
            // Instancia o pipeline
            // 'Xenova/whisper-tiny' é o ID do modelo. A biblioteca buscará primeiro em localModelPath
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                quantized: true,
                progress_callback: (data) => {
                    self.postMessage({ status: 'progress', data });
                }
            });
            
            // Teste de sanidade para garantir que carregou
            if(!transcriber) throw new Error("Falha ao inicializar o Transcriber (Objeto nulo)");

            self.postMessage({ status: 'ready' });
        } catch (error) {
            console.error("Erro fatal no Worker:", error);
            
            // Mensagem de erro detalhada
            let msg = `Erro no Modelo: ${error.message}.`;
            if (error.message.includes("Unsupported model type")) {
                msg += " Verifique se o arquivo 'config.json' está presente na pasta models/Xenova/whisper-tiny/ e se é válido.";
            }
            
            self.postMessage({ 
                status: 'error', 
                data: msg
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
