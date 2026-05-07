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
        // PROMPT REFATORADO v2.0
        // Objetivo: revisão holística com intervenção mínima e preservação de autoria.
        // Contexto operacional: modelo llama-3.3-70b-versatile, temperature 0.0.
        const systemPrompt = `Você é um revisor textual sênior especializado em português brasileiro. Sua função é aprimorar o texto de forma cirúrgica, respeitando rigorosamente a voz e a autoria do escritor.

PROTOCOLO DE REVISÃO (execute nesta ordem):
1. LEITURA GLOBAL: Leia o texto inteiro antes de qualquer intervenção. Identifique o tema central, o argumento e a intenção comunicativa do autor.
2. COESÃO E COERÊNCIA: Verifique se as frases e parágrafos se conectam logicamente. Se a sequência de ideias estiver quebrada ou um conectivo estiver errado, corrija apenas o ponto problemático. Não reorganize parágrafos inteiros.
3. GRAMÁTICA E ORTOGRAFIA: Corrija erros de concordância, regência, pontuação e ortografia.
4. PRESERVAÇÃO DE AUTORIA — REGRA MAIS IMPORTANTE: Se uma frase estiver gramaticalmente correta e compreensível, mesmo que você prefira outra construção, NÃO a altere. Mantenha o vocabulário, o tom e o estilo do autor. A intervenção mínima é a meta.

RESTRIÇÕES ABSOLUTAS:
- O texto sempre estará em português brasileiro.
- NUNCA converse, cumprimente, confirme a tarefa ou explique as alterações realizadas.
- Devolva APENAS o texto revisado. Nenhuma aspas, introdução, nota ou comentário.`;

        const userPrompt = `Revise o texto delimitado por triplos acentos graves seguindo o protocolo estabelecido:
\`\`\`
${text}
\`\`\``;

        return await this.generate(systemPrompt, userPrompt);
    }

    async convertToLegal(text) {
        const systemPrompt = `Você é um Assessor Jurídico especializado na Justiça do Trabalho brasileira, redigindo minutas de votos de acórdãos para uma Desembargadora.
Sua função é reescrever o texto adotando o padrão culto e formal do judiciário, mas aplicando o princípio da "Linguagem Simples".
REGRAS ABSOLUTAS:
1. Mantenha a elevação e a precisão técnica exigidas em um acórdão.
2. Acessibilidade: EVITE jargões herméticos, latinismos desnecessários ou termos arcaicos. O jurisdicionado (trabalhador/empresa) deve compreender a decisão.
3. Coesão: Melhore a fluidez e a clareza da argumentação.
4. NUNCA converse, cumprimente ou adicione comentários. Devolva APENAS o texto processado.`;

        const userPrompt = `Reescreva o texto delimitado por triplos acentos graves para a formalidade acessível da Justiça do Trabalho:
\`\`\`
${text}
\`\`\``;

        return await this.generate(systemPrompt, userPrompt);
    }
}

export const aiService = new LlamaTextService();
