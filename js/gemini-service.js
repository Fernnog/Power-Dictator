/**
 * Serviço de Integração com Google Gemini (AI)
 * Responsável pela comunicação com a API para correção e formatação.
 */

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export const aiService = {
    
    // Recupera a chave salva ou retorna null
    getApiKey() {
        return localStorage.getItem('dd_gemini_key');
    },

    // Salva a chave e testa (simples)
    saveApiKey(key) {
        if (!key.startsWith('AIza')) {
            alert('A chave parece inválida. Ela geralmente começa com "AIza".');
            return false;
        }
        localStorage.setItem('dd_gemini_key', key);
        return true;
    },

    // Método genérico para chamar a API
    async generateText(promptText) {
        const key = this.getApiKey();
        if (!key) {
            const newKey = prompt("Insira sua Google Gemini API Key (Obtenha em aistudio.google.com):");
            if (newKey && this.saveApiKey(newKey)) {
                return this.generateText(promptText); // Tenta de novo recursivamente
            }
            throw new Error("API Key não configurada.");
        }

        try {
            const response = await fetch(`${API_URL}?key=${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: promptText }]
                    }]
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message);
            }

            // Extrai o texto da resposta complexa do Gemini
            return data.candidates[0].content.parts[0].text;

        } catch (error) {
            console.error("Erro Gemini:", error);
            throw error;
        }
    },

    // Wrapper: Corrigir Gramática
    async fixGrammar(text) {
        const prompt = `Corrija a gramática e pontuação do seguinte texto (pt-BR), mantendo o tom original e sem adicionar comentários ou aspas: \n\n"${text}"`;
        return await this.generateText(prompt);
    },

    // Wrapper: Converter para Jurídico
    async convertToLegal(text) {
        const prompt = `Reescreva o seguinte texto em linguagem jurídica formal (advocacia), corrigindo erros de fonética comuns em ditados, sem adicionar comentários extras: \n\n"${text}"`;
        return await this.generateText(prompt);
    }
};
