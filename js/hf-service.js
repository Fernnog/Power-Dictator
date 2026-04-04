import { CONFIG } from './config.js';

class HuggingFaceService {
    constructor() {
        this.modelUrl = 'https://api-inference.huggingface.co/models/openai/whisper-small';
        this.storageKey = 'dd_hf_token'; // Usado para manter o token na máquina do usuário
    }

    getToken() {
        let token = localStorage.getItem(this.storageKey);
        if (!token) {
            token = prompt("🔑 Configuração Whisper:\n\nInsira seu Access Token do Hugging Face para usar a IA de alta precisão.\n(Inicie com 'hf_')");
            if (token && token.startsWith('hf_')) {
                localStorage.setItem(this.storageKey, token);
            } else {
                alert("Token inválido ou não fornecido. O motor nativo será mantido.");
                return null;
            }
        }
        return token;
    }

    async transcribe(audioBlob) {
        const token = this.getToken();
        if (!token) throw new Error("Token ausente ou cancelado pelo usuário.");

        try {
            const response = await fetch(this.modelUrl, {
                headers: { Authorization: `Bearer ${token}` },
                method: "POST",
                body: audioBlob,
            });
            const result = await response.json();
            
            if (result.error) throw new Error(result.error);
            return result.text;
        } catch (error) {
            console.error("HF API Error:", error);
            throw error;
        }
    }
}
export const hfService = new HuggingFaceService();
