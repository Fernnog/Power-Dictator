import { CONFIG } from './config.js';

class HuggingFaceService {
    constructor() {
        // A URL base original do modelo
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

        // --- SOLUÇÃO DE CORS (PROXY) ---
        // Envolvemos a URL original no corsproxy.io para o navegador não bloquear a requisição
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(this.modelUrl)}`;

        try {
            // Fazemos a chamada para o Proxy, que repassará para a Hugging Face
            const response = await fetch(proxyUrl, {
                headers: { 
                    "Authorization": `Bearer ${token}`
                },
                method: "POST",
                body: audioBlob,
            });

            // Tratamento específico: Modelo "dormindo" (Cold Start)
            if (response.status === 503) {
                const data = await response.json();
                throw new Error(`Modelo acordando. Tempo estimado: ${Math.round(data.estimated_time || 20)} segundos. Aguarde um instante e grave novamente.`);
            }

            // Captura erros de status HTTP antes do parse final para não quebrar a aplicação
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Erro de Comunicação HTTP: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.error) throw new Error(result.error);
            return result.text;

        } catch (error) {
            console.error("HF API Error Detalhado:", error);
            
            // Tratamento de erro amigável para problemas de rede/proxy
            if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                throw new Error("Erro de CORS ou conexão. O Proxy ou a API rejeitou a comunicação. Verifique se o seu Token possui permissão de 'Inference'.");
            }
            
            throw error;
        }
    }
}

export const hfService = new HuggingFaceService();
