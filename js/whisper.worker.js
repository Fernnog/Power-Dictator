import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

// Configurações para forçar o uso de cache e evitar recarregamentos desnecessários
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;

self.addEventListener('message', async (event) => {
    const { type, audio } = event.data;

    // 1. Inicialização e Download do Modelo
    if (type === 'load') {
        try {
            self.postMessage({ status: 'loading', data: 'Iniciando Whisper...' });
            
            // Carrega o pipeline de ASR (Automatic Speech Recognition)
            // Usa a versão "quantizada" (menor e mais rápida) do modelo Tiny
            transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
                quantized: true,
                progress_callback: (data) => {
                    // Repassa o progresso do download para a UI
                    if (data.status === 'progress') {
                        self.postMessage({ 
                            status: 'progress', 
                            file: data.file, 
                            progress: data.progress 
                        });
                    }
                }
            });

            self.postMessage({ status: 'ready' });
        } catch (error) {
            self.postMessage({ status: 'error', data: error.message });
        }
    }

    // 2. Transcrição de Áudio
    if (type === 'transcribe' && transcriber) {
        try {
            // Roda a inferência. O Whisper espera float32 audio array (16kHz)
            const output = await transcriber(audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'portuguese',
                task: 'transcribe',
                return_timestamps: false 
            });

            // Envia o texto resultante
            let text = output.text;
            if (Array.isArray(text)) text = text[0]; // Tratamento de segurança
            
            self.postMessage({ status: 'result', text: text });
        } catch (error) {
            console.error(error);
            self.postMessage({ status: 'error', data: "Erro na inferência" });
        }
    }
});
