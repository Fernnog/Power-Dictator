import { CONFIG } from './config.js';

class HuggingFaceService {
    constructor() {
        // Usando a versão small que carrega muito mais rápido em contas gratuitas
        this.modelUrl = 'https://api-inference.huggingface.co/models/openai/whisper-small';
        this.storageKey = 'dd_hf_token'; 
    }

    getToken() {
        let token = localStorage.getItem(this.storageKey);
        if (!token) {
            token = prompt("🔑 Configuração Whisper:\n\nInsira seu Access Token do Hugging Face.\n(Inicie com 'hf_')");
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
            const response = await fetch(this.modelUrl, {
                headers: { 
                    Authorization: `Bearer ${token}`
                    // Nota do Arquiteto: NÃO forçamos o Content-Type aqui. 
                    // O navegador infere automaticamente pelo Blob, evitando conflitos de preflight.
                },
                method: "POST",
                body: audioBlob,
            });

            // Se o servidor devolver 503, o modelo está acordando (Cold Start)
            if (response.status === 503) {
                const data = await response.json();
                throw new Error(`Modelo acordando. Tempo estimado: ${Math.round(data.estimated_time || 20)} segundos. Tente gravar novamente em instantes.`);
            }

            const result = await response.json();
            
            if (result.error) throw new Error(result.error);
            return result.text;

        } catch (error) {
            console.error("HF API Error Detalhado:", error);
            
            // Tratamento específico para o falso positivo de CORS / Falha de Rede
            if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                throw new Error("Conexão bloqueada (CORS/Rede). O modelo pode estar adormecido ou o token é inválido. Aguarde 20 segundos e tente de novo. Se persistir, recrie seu Token (Modo 'Read').");
            }
            
            throw error;
        }
    }
}
export const hfService = new HuggingFaceService();
