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
            let content = data.choices[0].message.content.trim();

            // [NOVO] PIPELINE DE SANITIZAÇÃO ESTRUTURAL
            // 1. Limpa aspas indesejadas (legado mantido)
            content = content.replace(/^"|"$/g, '').trim();
            
            // 2. Extrai texto de dentro de blocos Markdown (```), descartando o lixo ao redor
            content = content.replace(/^```[\w]*\r?\n?([\s\S]*?)\r?\n?```[\s\S]*$/i, '$1').trim();

            return content;

        } catch (error) {
            console.error("Llama Service Error:", error);
            throw error;
        }
    }

    async fixGrammar(text) {
        // Prompt otimizado para velocidade (Groq/Flash)
        const systemPrompt = `Você é um revisor textual cirúrgico (pt-BR).
MISSÃO: Corrigir pontuação, concordância e ortografia.
REGRA DE OURO: Intervenção mínima. Preserve a voz do autor.
SAÍDA CRÍTICA: Devolva APENAS o texto revisado. Não use blocos de código (markdown), aspas, saudações ou notas.`;

        // Removidos os delimitadores \`\`\` para não estimular formatação de código
        const userPrompt = `Revise o texto a seguir: \n\n${text}`;

        return await this.generate(systemPrompt, userPrompt);
    }

    async convertToLegal(text) {
        const systemPrompt = `Você é um Assessor Jurídico Trabalhista.
MISSÃO: Elevar a formalidade do texto para o padrão judiciário.
REGRA DE OURO: Aplique "Linguagem Simples". Sem latinismos herméticos, foque na coesão argumentativa.
SAÍDA CRÍTICA: Devolva APENAS o texto revisado. Não use blocos de código (markdown), aspas, saudações ou notas.`;

        // Vulnerabilidade corrigida: delimitadores removidos
        const userPrompt = `Reescreva o texto a seguir: \n\n${text}`;

        return await this.generate(systemPrompt, userPrompt);
    }
}

export const aiService = new LlamaTextService();
