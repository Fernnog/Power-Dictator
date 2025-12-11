export const CONFIG = {
    STORAGE_KEYS: {
        TEXT: 'ditado_backup_text',
        MIC: 'ditado_pref_mic',
        API: 'ditado_digital_gemini_key',
        GLOSSARY: 'dd_glossary' // NOVA CHAVE: Centraliza o storage do glossário v1.0.3
    },
    AUDIO: {
        HIGHPASS_FREQ: 85,
        COMPRESSOR_THRESHOLD: -50
    },
    SHORTCUTS: {
        REC: 'KeyG',
        CLEAR: 'KeyL',
        COPY: 'KeyC',
        UNDO: 'KeyZ'
    },
    UI: {
        TOAST_DURATION: 5000
    }
};
