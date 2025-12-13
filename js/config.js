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
        // [v1.0.6] Configurações de Hardware Centralizadas
        CONSTRAINTS: {
            echoCancellation: true, // Remove eco
            noiseSuppression: true, // Remove ruído de fundo
            autoGainControl: true,  // Nivela o volume automaticamente
            channelCount: 1,        // FORÇA MONO: Evita cancelamento de fase na voz
            sampleRate: 48000       // ALTA FIDELIDADE: Solicita 48kHz (Qualidade de DVD)
        }
    },
    SHORTCUTS: {
        REC: 'KeyG',
        CLEAR: 'KeyL',
        COPY: 'KeyC',
        UNDO: 'KeyZ',
        TOGGLE_MODE: 'KeyM'     // [v1.0.6] Novo Atalho: Alternar Modo Widget (Minimizar/Maximizar)
    },
    UI: {
        TOAST_DURATION: 5000
    }
};
