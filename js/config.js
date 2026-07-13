export const CONFIG = {
    STORAGE_KEYS: {
        TEXT: 'ditado_backup_text',
        MIC: 'ditado_pref_mic',
        GLOSSARY: 'dd_glossary',
        HF_TOKEN: 'dd_hf_token',
        ENGINE: 'dd_engine_pref'
    },
    AUDIO: {
        HIGHPASS_FREQ: 85,
        COMPRESSOR_THRESHOLD: -50,
        // [v1.0.7-patch] Configurações de Hardware (Relaxadas para evitar erros)
        CONSTRAINTS: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            // Usamos 'ideal' em vez de valor bruto. 
            // Se o hardware não suportar 48kHz ou Mono, o navegador negociará 
            // o melhor valor disponível em vez de lançar OverconstrainedError.
            channelCount: { ideal: 1 },        
            sampleRate: { ideal: 48000 }       
        }
    },
    SHORTCUTS: {
        REC: 'KeyG',
        CLEAR: 'KeyL',
        COPY: 'KeyC',
        UNDO: 'KeyZ',
        TOGGLE_MODE: 'KeyM'
    },
    UI: {
        TOAST_DURATION: 5000,
        WINDOW: {
            MIC_W: 100,
            MIC_H: 100,
            ACTION_W: 380,
            ACTION_H: 450,
            PIP_W: 380,
            PIP_H: 450
        }
    },
    LLM: {
        // Modelo intermediário (Qwen 32B). Mantém alta capacidade analítica para peças 
        // jurídicas sem esbarrar no consumo excessivo de tokens de um modelo 70B.
        MODEL_ID: "qwen-2.5-32b", 
        
        // [REFATORADO] Renomeado de MAX_COMPLETION_TOKENS para o padrão correto.
        // Reduzido para 4096 para garantir que (Input + Output) fique < 8000 TPM.
        MAX_TOKENS: 4096, 
        
        TEMPERATURE: 0.0,
        TOP_P: 1
    }
};
