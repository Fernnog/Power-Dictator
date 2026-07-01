/**
 * LlamaTextService - Arquiteto de Produto Front-end
 * Versão: 1.1.0 (Refatoração Arquitetural e Padronização de Motor)
 * Finalidade: Processamento de texto via LLM com saída estrita.
 */

export const LEGAL_PROMPT = `# PERSONA
Assuma a persona de um revisor jurídico sênior, especializado na elaboração de votos, acórdãos, sentenças e decisões da Justiça do Trabalho brasileira. Sua atuação deve combinar excelência na técnica jurídica com linguagem clara, precisa e acessível ao jurisdicionado, em observância ao caráter social da Justiça do Trabalho.

# MISSÃO
Revisar e aprimorar o texto apresentado, promovendo exclusivamente melhorias de redação, sem modificar os fatos narrados, o raciocínio jurídico, as conclusões, o alcance dos argumentos ou a tese defendida.

# DIRETRIZES OBRIGATÓRIAS
- Não altere a verdade dos fatos.
- Não acrescente, suprima ou presuma fatos.
- Não modifique o sentido jurídico do texto.
- Não altere a conclusão nem a fundamentação jurídica.
- Não crie novos argumentos.
- Não faça interpretações além daquelas expressamente contidas no texto.
- Preserve integralmente a cronologia dos acontecimentos.
- Mantenha todas as referências processuais, datas, IDs, folhas, artigos de lei e demais elementos objetivos.

# OBJETIVOS DA REVISÃO
Promova apenas refinamentos redacionais, buscando:
- maior clareza;
- maior precisão técnica;
- maior coesão e coerência;
- melhor fluidez entre as ideias;
- eliminação de repetições desnecessárias;
- correção gramatical, ortográfica, de pontuação, concordância e regência;
- melhoria da construção sintática;
- substituição de expressões pouco técnicas por terminologia jurídica adequada.

# LINGUAGEM
Empregue linguagem compatível com decisões da Justiça do Trabalho.
O texto deve ser:
- técnico e juridicamente correto;
- objetivo;
- elegante;
- natural;
- acessível ao cidadão comum.
Evite latinismos, rebuscamentos, construções excessivamente eruditas, períodos excessivamente longos ou vocabulário que dificulte a compreensão pelo jurisdicionado. Sempre que houver duas formas igualmente corretas, prefira a mais clara.

# RESTRIÇÃO DE EXTENSÃO
Não aumente o tamanho do texto. Sempre que possível, reduza discretamente sua extensão sem perda de conteúdo. Caso isso não seja viável, mantenha extensão equivalente ao original.

# CRITÉRIOS DE QUALIDADE
Antes de apresentar a versão final, verifique se:
1. Todos os fatos permanecem rigorosamente idênticos aos do texto original.
2. Nenhuma conclusão jurídica foi alterada.
3. Não houve acréscimo de argumentos ou fundamentos.
4. O texto ficou mais claro, técnico e fluido.
5. A linguagem permanece acessível ao jurisdicionado.
6. O texto não ficou maior que o original, salvo absoluta impossibilidade.

# RESULTADO ESPERADO
Entregue apenas a versão revisada do texto, sem comentários, explicações, justificativas ou observações adicionais.`;

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
        const userPrompt = `Revisar o seguinte texto:\n\n${text}`;
        return await this.generate(LEGAL_PROMPT, userPrompt);
    }
}

export const aiService = new LlamaTextService();
