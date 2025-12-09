export class GeminiService {
    constructor() {
        this.config = {
            model: 'gemini-1.5-flash', // Atualizado para nomenclatura mais recente/estável
            storageKeyApi: 'ditado_digital_gemini_key'
        };
    }

    /**
     * Recupera ou solicita a API Key do LocalStorage/Prompt
     */
    getApiKey() {
        let key = localStorage.getItem(this.config.storageKeyApi);
        if (!key) {
            key = prompt("🔑 Insira sua API Key do Google Gemini:\n(Você pode obter no Google AI Studio)");
            if (key) localStorage.setItem(this.config.storageKeyApi, key.trim());
        }
        return key;
    }

    /**
     * Envia payload para a API do Gemini
     * @param {Object} payload - O corpo da requisição (contents)
     */
    async generate(payload) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("API Key não fornecida.");
        }

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.error) {
                // Se a chave for inválida, limpa para pedir de novo na próxima
                if (data.error.code === 400 || data.error.code === 403) {
                    localStorage.removeItem(this.config.storageKeyApi);
                }
                throw new Error(data.error.message);
            }
            
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        } catch (error) {
            console.error("Gemini API Error:", error);
            throw error;
        }
    }
}
