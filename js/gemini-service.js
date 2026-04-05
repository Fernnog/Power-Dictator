/**
 * Serviço de Integração de Texto via API Groq (LLaMA 3)
 * Substitui o antigo motor Gemini mantendo a mesma interface exportada.
 */

import { CONFIG } from './config.js';

class LlamaTextService {
    constructor() {
        // Endpoint padrão OpenAI compatível com Groq
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        // Reutilizamos a mesma chave do Whisper para simplificar a UX
        this.storageKey = 'dd_groq_token'; 
                // Atualizado para o modelo Llama 3.1 mais recente (o anterior foi descontinuado pela Groq)
        this.model = 'llama-3.1-8b-instant'; 
    }

    getToken() {
        let token = localStorage.getItem(this.storageKey);
        if (!token) {
            token = prompt("🔑 Chave da Groq necessária para a IA de texto:\n\nInsira sua API Key da Groq (Inicia com 'gsk_'):");
            if (token && token.startsWith('gsk_')) {
                localStorage.setItem(this.storageKey, token);
            } else {
                throw new Error("Token inválido. Ação cancelada.");
            }
        }
        return token;
    }

    async generate(systemPrompt, userText) {
        const token = this.getToken();
        
        const payload = {
            model: this.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            temperature: 0.2, // Temperatura baixa para focar em precisão gramatical
            max_tokens: 2048
        };

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // Tenta extrair o corpo do erro em JSON enviado pela Groq
                let errorDetail = `Erro HTTP ${response.status}`;
                try {
                    const errData = await response.json();
                    errorDetail = errData.error?.message || errorDetail;
                } catch (parseError) {
                    // Se não conseguir converter em JSON, mantém o status numérico
                }
                
                if (response.status === 401) {
                    localStorage.removeItem(this.storageKey);
                }
                
                throw new Error(errorDetail);
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();

        } catch (error) {
            console.error("Llama Service Error:", error);
            throw error;
        }
    }

    // =================================================================
    // Métodos Específicos da Aplicação (Chamados pelo main.js)
    // =================================================================

    async fixGrammar(text) {
        const systemPrompt = "Você é um revisor profissional de textos em Português do Brasil. Sua função é corrigir erros gramaticais, ortográficos e de pontuação do texto fornecido pelo usuário. Mantenha a estrutura original, o tom formal e preserve integralmente termos técnicos e jargões. Retorne APENAS o texto corrigido, sem comentários adicionais.";
        return this.generate(systemPrompt, text);
    }

    async convertToLegal(text) {
        const systemPrompt = "Atue como um advogado especialista. Reescreva o texto em linguagem jurídica formal (Juridiquês), corrigindo erros de ditado e aplicando terminologia técnica adequada. Retorne APENAS o texto reescrito.";
        return this.generate(systemPrompt, text);
    }
}

// Mantemos o nome da instância exportada para não quebrar o main.js
export const aiService = new LlamaTextService();
