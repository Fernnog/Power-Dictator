export const CONFIG = {
    STORAGE_KEYS: {
        TEXT: 'ditado_backup_text',
        MIC: 'ditado_pref_mic',
        API: 'ditado_digital_gemini_key',
        GLOSSARY: 'dd_glossary'
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
        TOAST_DURATION: 5000
    }
};
