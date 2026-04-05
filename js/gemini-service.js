      /**
 * LlamaTextService - Arquiteto de Produto Front-end
 * Versão: 1.0.9 (Migração Groq/LLaMA)
 * Finalidade: Processamento de texto via LLM com saída estrita.
 */

class LlamaTextService {
    constructor() {
        // Endpoint compatível com OpenAI fornecido pela Groq
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        // Compartilha o mesmo token gsk_ do serviço Whisper
        this.storageKey = 'dd_groq_token'; 
        // Modelo LLaMA 3 8B: Equilíbrio ideal entre velocidade extrema e precisão
        this.model = 'llama3-8b-8192'; 
    }

    /**
     * Recupera o token do LocalStorage ou solicita ao usuário.
     */
    getToken() {
        let token = localStorage.getItem(this.storageKey);
        if (!token) {
            token = prompt("🔑 Chave da Groq necessária:\n\nInsira sua API Key da Groq (Inicia com 'gsk_'):");
            if (token && token.startsWith('gsk_')) {
                localStorage.setItem(this.storageKey, token);
            } else {
                throw new Error("Token inválido ou não fornecido. Ação cancelada.");
            }
        }
        return token;
    }

    /**
     * Motor de execução genérico para chamadas à API.
     */
    async generate(systemPrompt, userText) {
        const token = this.getToken();
        
        const payload = {
            model: this.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            temperature: 0.1, // Reduzido para 0.1 para máxima previsibilidade
            max_tokens: 2048,
            stream: false
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

            // Tratamento de Erro Robusto (Seção 1.c do plano anterior)
            if (!response.ok) {
                let errorDetail = `Erro HTTP ${response.status}`;
                try {
                    const errData = await response.json();
                    errorDetail = errData.error?.message || errorDetail;
                } catch (e) { /* Fallback para status numérico */ }
                
                if (response.status === 401) localStorage.removeItem(this.storageKey);
                throw new Error(errorDetail);
            }

            const data = await response.json();
            const content = data.choices[0].message.content.trim();

            // Limpeza de segurança (Regex): Remove aspas extras se a IA falhar no prompt
            return content.replace(/^"|"$/g, '').trim();

        } catch (error) {
            console.error("Llama Service Error:", error);
            throw error;
        }
    }

    /**
     * Funcionalidade do botão "Corrigir".
     */
    async fixGrammar(text) {
        const systemPrompt = "Você é um algoritmo de processamento de texto. Sua única função é corrigir erros gramaticais, ortográficos e de pontuação em Português do Brasil. REGRA CRÍTICA: Retorne EXCLUSIVAMENTE o texto corrigido. Proibido adicionar saudações, explicações ou aspas. Se o texto estiver correto, retorne-o exatamente como recebeu.";
        return this.generate(systemPrompt, text);
    }

    /**
     * Funcionalidade do botão "Jurídico".
     */
    async convertToLegal(text) {
        const systemPrompt = "Você é um algoritmo de tradução jurídica. Converta o texto para linguagem jurídica formal (juridiquês). REGRA CRÍTICA: Retorne EXCLUSIVAMENTE o texto convertido. Proibido adicionar comentários, notas ou aspas.";
        return this.generate(systemPrompt, text);
    }
}

// Exportação da instância para uso no main.js
export const aiService = new LlamaTextService();
      
                
