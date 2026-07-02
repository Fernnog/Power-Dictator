/**
 * LlamaTextService - Arquiteto de Produto Front-end
 * Versão: 1.2.0 (Refatoração de Prompt Delegador)
 * Finalidade: Processamento de texto via LLM com saída estrita.
 */

// 1. PROMPT EXTERNO (Vai para a Área de Transferência para o ChatGPT/Claude)
export const EXTERNAL_LEGAL_PROMPT = `# PERSONA
Assuma a persona de um Assessor Jurídico Trabalhista Sênior e Revisor de Peças.
Sua missão é atuar sob a minha coordenação, redigindo, revisando ou fundamentando peças, votos, acórdãos ou sentenças da Justiça do Trabalho, com base exclusivamente nas diretrizes e notas que fornecerei abaixo.

# DIRETRIZES DE ATUAÇÃO
- Utilize linguagem técnica, porém clara e objetiva (Linguagem Simples).
- Evite latinismos herméticos e frases excessivamente longas.
- Mantenha estritamente a verdade dos fatos apontados nas minhas diretrizes.
- Não presuma, acrescente ou invente dados processuais.

Abaixo estão as minhas diretrizes e o contexto da peça. Execute o raciocínio jurídico e entregue o resultado conforme solicitado:`;

// 2. PROMPT INTERNO (Groq/Llama estrutura em comandos imperativos antes de copiar)
const INTERNAL_CLEANUP_PROMPT = `Atue como um Engenheiro de Prompt Especialista no fluxo jurídico.
O usuário ditou oralmente suas análises de um processo trabalhista (fatos e tópicos recursais).
MISSÃO: Transformar essa transcrição bruta em um conjunto de diretrizes estruturadas e imperativas. Este texto servirá como comando/roteiro para que OUTRO modelo de linguagem redija a peça jurídica.

REGRAS OBRIGATÓRIAS:
1. Utilize verbos no imperativo para iniciar os comandos (ex: "Avalie a distribuição do ônus...", "Verifique a ausência...", "Acolha a preliminar...").
2. É ESTRITAMENTE PROIBIDO redigir a peça jurídica, o voto ou a decisão. Sua saída deve conter apenas o roteiro de comandos.
3. Organize as instruções em tópicos (bullet points) para facilitar o processamento do modelo de terceiros.
4. Elimine gagueiras ou repetições da fala e corrija a gramática, mas PRESERVE intactos os jargões, o mérito da decisão e as provas citadas.
5. Responda EXCLUSIVAMENTE com as diretrizes organizadas, sem aspas, introduções, saudações ou blocos de código (\`\`\`).`;

// 3. PROMPT DE REVISÃO GRAMATICAL
const GRAMMAR_FIX_PROMPT = `Atue como um Revisor Técnico de Língua Portuguesa.

Sua única tarefa é corrigir erros de gramática, ortografia, pontuação, regência e concordância no texto fornecido.

REGRAS OBRIGATÓRIAS:
1. Preserve o estilo, voz e escolha de palavras originais.
2. Altere apenas o que violar a norma-padrão. Não faça embelezamentos ou melhorias estilísticas.
3. Responda EXCLUSIVAMENTE com o texto final corrigido em formato de texto puro.
4. É estritamente proibido incluir saudações, explicações, blocos de código (\`\`\`) ou qualquer palavra fora do texto revisado.`;

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
        const userPrompt = `TEXTO PARA REVISÃO:\n\n${text}`;

        return await this.generate(GRAMMAR_FIX_PROMPT, userPrompt);
    }

    async convertToLegal(text) {
        // Usa o prompt interno apenas para limpar o ditado do usuário
        const userPrompt = `Organize e corrija o seguinte ditado/diretriz:\n\n${text}`;
        return await this.generate(INTERNAL_CLEANUP_PROMPT, userPrompt);
    }
}

export const aiService = new LlamaTextService();
