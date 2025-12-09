import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

// ==========================================
// CONFIGURAÇÃO DE AMBIENTE (Forçando Remoto)
// ==========================================

// Desativa busca local para evitar erros 404
env.allowLocalModels = false;

// Permite busca remota (Hugging Face Hub)
env.allowRemoteModels = true;

// Usa o cache do navegador (IndexedDB) para não baixar 40MB toda vez
// Na primeira vez é lento, nas próximas é instantâneo.
env.useBrowserCache = true;

// Opcional: Configura o local onde o cache do WASM é guardado
// env.cacheDir = '/custom-cache'; // Deixe comentado por enquanto

// ==========================================
// LÓGICA DO WORKER
// ==========================================
let transcriber = null;

self.addEventListener('message', async (event) => {
    const { type, audio } = event.data;

    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', data: 'Iniciando download do modelo (40MB)...' });

            // Carrega o modelo Tiny Quantizado diretamente da nuvem
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                quantized: true, // Importante: baixa a versão leve (~40MB) em vez da full (~150MB)
                progress_callback: (data) => {
                    // Envia porcentagem de download para a barra de progresso
                    if (data.status === 'progress') {
                        self.postMessage({ 
                            status: 'progress', 
                            data: data 
                        });
                    }
                }
            });

            self.postMessage({ status: 'ready' });
            console.log("Whisper carregado com sucesso!");

        } catch (error) {
            console.error("Erro no Worker:", error);
            self.postMessage({ 
                status: 'error', 
                data: `Falha ao baixar modelo: ${error.message}. Verifique sua conexão ou Firewall.`
            });
        }
    }

    if (type === 'transcribe' && transcriber) {
        try {
            const output = await transcriber(audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'portuguese',
                task: 'transcribe',
                return_timestamps: false // Simplifica o retorno
            });

            // O output.text contém a transcrição completa
            let text = output.text;
            
            // Pequena limpeza se necessário
            if(text) text = text.trim();

            self.postMessage({ status: 'result', text: text });
            
        } catch (error) {
            self.postMessage({ status: 'error', data: "Erro na transcrição: " + error.message });
        }
    }
});
