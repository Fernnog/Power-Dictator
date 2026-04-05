/**
 * LlamaTextService - Arquiteto de Produto Front-end
 * Versão: 1.1.0 (Refatoração Arquitetural e Padronização de Motor)
 * Finalidade: Processamento de texto via LLM com saída estrita.
 */

class LlamaTextService {
    constructor() {
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        this.storageKey = 'dd_groq_token'; 
        
        // CORREÇÃO: Utilizando o modelo mais robusto e obediente a instruções restritas
        this.model = 'llama-3.3-70b-versatile'; 
    }

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

    async generate(systemPrompt, userText) {
        const token = this.getToken();
        
        const payload = {
            model: this.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            temperature: 0.0, // CORREÇÃO: Temperatura ZERO para bloquear qualquer criatividade/alucinação
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

            if (!response.ok) {
                let errorDetail = `Erro HTTP ${response.status}`;
                try {
                    const errData = await response.json();
                    errorDetail = errData.error?.message || errorDetail;
                } catch (e) { }
                
                if (response.status === 401) localStorage.removeItem(this.storageKey);
                throw new Error(errorDetail);
            }

            const data = await response.json();
            const content = data.choices[0].message.content.trim();

            return content.replace(/^"|"$/g, '').trim();

        } catch (error) {
            console.error("Llama Service Error:", error);
            throw error;
        }
    }

    async fixGrammar(text) {
        // CORREÇÃO: Restauração do prompt longo e absoluto para forçar comportamento de máquina
        const systemPrompt = "Você é um algoritmo de processamento de texto automatizado. Sua única função é corrigir erros gramaticais, ortográficos e de pontuação em Português do Brasil. REGRA CRÍTICA E ABSOLUTA: Retorne EXCLUSIVAMENTE o texto corrigido. Sob nenhuma circunstância adicione saudações, introduções, explicações, aspas ou notas. A sua saída será inserida diretamente em um banco de dados, portanto, qualquer palavra extra causará erro no sistema.";
        return this.generate(systemPrompt, text);
    }

    async convertToLegal(text) {
        // Nova abordagem: Prompt arquitetado para precisão máxima na linguagem processual,
        // herdando a temperatura 0.0 da função generate para evitar alucinações.
        const systemPrompt = `Você é um assistente de formatação jurídica avançado operando no ecossistema do direito processual brasileiro. 
Sua única função é reescrever o texto fornecido adotando o jargão jurídico formal, impessoal e técnico (Juridiquês).
REGRA CRÍTICA E ABSOLUTA: Retorne EXCLUSIVAMENTE o texto reescrito. Sob nenhuma circunstância adicione saudações, introduções, aspas, notas explicativas ou quebras de linha desnecessárias. A saída deve ser pronta para ser colada em documentos oficiais.`;
        
        return this.generate(systemPrompt, text);
    }
}

export const aiService = new LlamaTextService();
