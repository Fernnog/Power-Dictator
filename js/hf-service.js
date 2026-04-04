import { CONFIG } from './config.js';

class HuggingFaceService {
    constructor() {
        this.modelUrl = 'https://api-inference.huggingface.co/models/openai/whisper-small';
        this.storageKey = 'dd_hf_token'; 
    }

    getToken() {
        let token = localStorage.getItem(this.storageKey);
        if (!token) {
            token = prompt("🔑 Configuração Whisper:\n\nInsira seu Access Token 'Fine-grained' do Hugging Face.\n(Inicie com 'hf_')");
            if (token && token.startsWith('hf_')) {
                localStorage.setItem(this.storageKey, token);
            } else {
                alert("Token inválido. Ação cancelada.");
                return null;
            }
        }
        return token;
    }

    async transcribe(audioBlob) {
        const token = this.getToken();
        if (!token) throw new Error("Token ausente");

        try {
            // Requisição simplificada: Deixamos o navegador inferir o Content-Type nativamente
            // Isso evita que o Hugging Face bloqueie regras estritas no Preflight (OPTIONS)
            const response = await fetch(this.modelUrl, {
                headers: { 
                    "Authorization": `Bearer ${token}`
                },
                method: "POST",
                body: audioBlob,
            });

            if (response.status === 503) {
                const data = await response.json();
                throw new Error(`Modelo acordando. Tempo estimado: ${Math.round(data.estimated_time || 20)} segundos. Aguarde um instante e grave novamente.`);
            }

            const result = await response.json();
            
            if (result.error) throw new Error(result.error);
            return result.text;

        } catch (error) {
            console.error("HF API Error Detalhado:", error);
            
            if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                throw new Error("Erro de CORS ou Modelo Dormindo. A Hugging Face rejeitou a conexão. Certifique-se de que inseriu o Token Novo (Fine-grained) e aguarde 20s para o modelo acordar.");
            }
            
            throw error;
        }
    }
}

export const hfService = new HuggingFaceService();
