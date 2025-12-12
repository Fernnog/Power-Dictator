/**
 * Serviço de Integração com Google Gemini (AI)
 * Estrutura baseada em Classe (OOP) com modelo 'gemini-1.5-flash-latest'.
 */

import { CONFIG } from './config.js';

class GeminiService {
    constructor() {
        this.config = {
            // Modelo Flash Latest (Rápido e econômico)
            model: 'gemini-1.5-flash-latest', 
            // Usa a constante do config.js ou fallback para string
            storageKeyApi: CONFIG?.STORAGE_KEYS?.API || 'ditado_digital_gemini_key'
        };
    }

    /**
     * Recupera ou solicita a API Key do LocalStorage/Prompt
     */
    getApiKey() {
        let key = localStorage.getItem(this.config.storageKeyApi);
        
        // Fluxo de Primeira Utilização
        if (!key) {
            key = prompt("🔑 Configuração Inicial:\n\nInsira sua API Key do Google Gemini para ativar a IA.\n(Obtenha gratuitamente em: aistudio.google.com)");
            if (key) {
                key = key.trim();
                // Validação básica para evitar lixo no storage
                if (key.startsWith('AIza')) {
                    localStorage.setItem(this.config.storageKeyApi, key);
                } else {
                    alert("A chave parece inválida (deve começar com AIza). Tente novamente.");
                    return null;
                }
            }
        }
        return key;
    }

    /**
     * Método Core: Envia payload para a API
     * @param {Object} payload - O corpo JSON da requisição
     */
    async generate(payload) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error("Ação cancelada: API Key não fornecida.");
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            // Tratamento de Erros da API
            if (data.error) {
                // Se a chave for inválida/expirada (400 ou 403), limpa para pedir de novo
                if (data.error.code === 400 || data.error.code === 403) {
                    console.warn("Chave inválida removida. O usuário será solicitado novamente.");
                    localStorage.removeItem(this.config.storageKeyApi);
                }
                throw new Error(`Google API Error: ${data.error.message}`);
            }

            // Validação de Segurança e Retorno
            if (!data.candidates || data.candidates.length === 0) {
                if (data.promptFeedback?.blockReason) {
                    throw new Error(`Bloqueado pela IA: ${data.promptFeedback.blockReason}`);
                }
                throw new Error("A IA não retornou texto. Tente novamente.");
            }
            
            return data.candidates[0].content.parts[0].text.trim();

        } catch (error) {
            console.error("Gemini Service Error:", error);
            throw error;
        }
    }

    /**
     * Método Auxiliar: Monta o payload padrão de texto
     */
    async generateFromText(promptText) {
        return this.generate({
            contents: [{ parts: [{ text: promptText }] }]
        });
    }

    // =================================================================
    // Métodos Específicos da Aplicação (Chamados pelo main.js)
    // =================================================================

    async fixGrammar(text) {
        const prompt = `Atue como um revisor profissional. Corrija gramática, pontuação e coesão do texto abaixo (Português Brasil). Mantenha o tom original, sem comentários extras:\n\n"${text}"`;
        return this.generateFromText(prompt);
    }

    async convertToLegal(text) {
        const prompt = `Atue como um advogado. Reescreva o texto abaixo em linguagem jurídica formal (Juridiquês), corrigindo erros fonéticos de ditado. Use termos como 'data venia' quando apropriado. Retorne APENAS o texto reescrito:\n\n"${text}"`;
        return this.generateFromText(prompt);
    }
}

// Exporta uma INSTÂNCIA da classe para manter compatibilidade com o main.js
// O main.js importa como "aiService", então aiService.fixGrammar() funcionará.
export const aiService = new GeminiService();
