export const currentVersion = "1.1.0";

export const changelogData = [
    {
        version: "1.1.0",
        date: "05 de Abril de 2026",
        changes: [
            "Refatoração Arquitetural: Renomeação do serviço de IA (de gemini-service.js para llm-service.js) consolidando a estrutura em torno do motor LLaMA/Groq.",
            "Aprimoramento do Botão Jurídico: Nova engenharia de prompt com regras estritas para garantir linguagem processual precisa, impessoal e sem alucinações.",
            "Limpeza de Sistema: Remoção de chaves e dependências obsoletas (API Google Gemini) do arquivo de configuração.",
            "Atualização do Service Worker para a versão 1.1.0, garantindo o registro correto dos novos arquivos para pleno funcionamento offline."
        ]
    },
    {
        version: "1.0.9",
        date: "04 de Abril de 2026",
        changes: [
            "Unificação da Inteligência Artificial: Botões 'Corrigir' e 'Jurídico' agora utilizam a API ultrarrápida da Groq (modelo LLaMA 3).",
            "Chave de Acesso Única: Fim da necessidade de gerenciar chaves diferentes. O sistema passa a compartilhar a mesma credencial (gsk_) para transcrição de voz (Whisper) e correção de texto (LLaMA).",
            "Aprimoramento de Performance: Respostas de correção gramatical e formatação jurídica agora são entregues de forma quase instantânea.",
            "Refatoração: Tratamento de erros refinado para gerenciar falhas de autenticação com a nova API de texto."
        ]
    },
    {
        version: "1.0.8",
        date: "Março de 2026",
        changes: [
            "Migração do motor de transcrição de áudio Whisper para a API da Groq.",
            "Resolução definitiva de problemas de CORS e bloqueios de rede no processamento de voz."
        ]
    },
    {
        version: "1.0.7",
        date: "Março de 2026",
        changes: [
            "Introdução do Smart Undo Widget (botão flutuante de 'Desfazer' projetado para o Modo Compacto).",
            "Hardware: Relaxamento das restrições de captura de áudio (48kHz/Mono) para evitar falhas e travamentos em microfones mais simples."
        ]
    },
    {
        version: "1.0.6",
        date: "Fevereiro de 2026",
        changes: [
            "UX/UI: Novas animações de feedback visual (efeito 'Pulsing') implementadas nos botões de ação.",
            "Visualizador de ondas sonoras remodelado (versão 'Slim'), otimizado perfeitamente para não poluir o modo Widget.",
            "Adição de atalho de teclado (Alt+M) para alternar rapidamente entre os modos Janela e Compacto."
        ]
    },
    {
        version: "1.0.4",
        date: "Fevereiro de 2026",
        changes: [
            "Lançamento do Modo Minimizável (Widget Vertical), transformando a interface em um bloco de notas flutuante e discreto.",
            "Reestruturação profunda do CSS para garantir que o Dock de Controle se adapte de forma fluida à mudança de layout."
        ]
    },
    {
        version: "1.0.2",
        date: "Fevereiro de 2026",
        changes: [
            "Integração do recurso Glossário Pessoal: substituição automática de palavras, gírias ou jargões durante o ditado.",
            "Adição da 'Status Pill' na interface para acompanhamento visual claro (conectando, gravando, processando)."
        ]
    },
    {
        version: "1.0.0",
        date: "Janeiro de 2026",
        changes: [
            "Lançamento inicial do projeto Ditado Digital Pro.",
            "Integração de transcrição de voz nativa via Web Speech API.",
            "Suporte a persistência local (LocalStorage) para salvar textos em tempo real.",
            "Implementação dos primeiros atalhos de produtividade (Gravar, Limpar, Copiar, Desfazer)."
        ]
    }
];
