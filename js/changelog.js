/**
 * Constante de Versão Atual
 * Usada para exibir no badge do Header (app.html)
 */
export const currentVersion = "1.0.9";

/**
 * Histórico de Versões
 * Array de objetos contendo versão, data e lista de mudanças.
 * A ordem deve ser decrescente (mais recente primeiro).
 */
export const changelog = [
    {
        version: "1.0.9",
        date: "04/04/2026",
        changes: [
            "🚀 Migração para Groq Cloud: Transcrição via Whisper Large V3 com performance ultrarrápida.",
            "📐 Layout Adaptativo: Janela expandida para 1080px, garantindo visibilidade total dos controles.",
            "🤖 Automação: Versionamento dinâmico alimentado exclusivamente por este arquivo."
        ]
    },
    {
        version: "1.0.8",
        date: "02/04/2026",
        changes: [
            "🔧 Ajustes no Speech Manager para melhor captura de áudio.",
            "🎨 Refinamentos visuais no modo compacto."
        ]
   },
    {
        version: "1.0.7",
        date: "13/12/2025",
        changes: [
            "↩️ <strong>Smart Undo (Widget):</strong> No modo compacto, o aviso de 'Texto Limpo' agora é um botão flutuante discreto que não bloqueia o dock de ferramentas.",
            "🏷️ <strong>Tooltip Contextual:</strong> Adicionada etiqueta explicativa ao passar o mouse sobre o botão de desfazer ('Hover').",
            "🧹 <strong>Auto-Cleanup:</strong> O botão de desfazer desaparece automaticamente assim que você inicia uma nova gravação ou copia o texto, mantendo o foco na ação atual."
        ]
    },
    {
        version: "1.0.6",
        date: "01/11/2023",
        changes: [
            "🔮 <strong>Feedback Visual Ativo (Pulse):</strong> Nova linguagem visual onde os botões 'respiram' cores (Vermelho/Gravando, Azul/IA, Verde/Sucesso). Isso permite saber o status exato do app mesmo no modo Widget, onde não há espaço para textos.",
            "⌨️ <strong>Alternância Rápida (Alt+M):</strong> Novo atalho de teclado para expandir ou contrair o 'Modo Widget' instantaneamente, permitindo um fluxo de trabalho 100% sem mouse.",
            "🏗️ <strong>Arquitetura de Áudio:</strong> Centralização das configurações de hardware (DSP) no arquivo de configuração global, garantindo maior estabilidade e facilidade de manutenção nas frequências de captura."
        ]
    },
    {
        version: "1.0.5",
        date: "30/10/2023",
        changes: [
            "📱 <strong>Produtividade no Widget:</strong> O modo compacto agora exibe os botões <strong>Jurídico</strong> e <strong>Copiar</strong> na barra inferior, permitindo fluxo completo de trabalho sem expandir a janela.",
            "🎙️ <strong>Audio Tuning (DSP):</strong> Refinamento do motor de captura para forçar gravação em canal <strong>Mono @ 48kHz</strong>. Isso reduz interferências de fase em headsets e melhora a precisão do reconhecimento de voz.",
            "🎨 <strong>Layout Adaptativo:</strong> Ajustes de CSS para garantir que os ícones circulares se acomodem harmonicamente na dock reduzida."
        ]
    },
    {
        version: "1.0.4",
        date: "29/10/2023",
        changes: [
            "📱 <strong>Smart Widget Vertical:</strong> Redesign completo do modo compacto. Agora funciona como um 'Bloco de Notas' lateral (estilo Post-it), mantendo o texto visível e com rolagem automática enquanto você fala.",
            "📊 <strong>Feedback Visual de Limiar:</strong> Adicionada uma linha pontilhada vermelha no visualizador. Se a onda de áudio não ultrapassar essa linha, você sabe visualmente que precisa falar mais alto.",
            "🟢 <strong>Glow de Atividade:</strong> A borda da janela (ou do editor no modo widget) brilha suavemente em verde quando a voz é detectada, permitindo monitorar o funcionamento 'de canto de olho'.",
            "🐛 <strong>Correção de 'Onda Morta':</strong> Resolvido um problema técnico (Race Condition) que impedia o gráfico de ondas de iniciar corretamente em computadores rápidos.",
            "🛡️ <strong>Fallback de Hardware:</strong> Se o microfone salvo não estiver conectado, o sistema agora alterna automaticamente para o padrão em vez de falhar."
        ]
    },
    {
        version: "1.0.3",
        date: "27/10/2023",
        changes: [
            "🔌 <strong>Memória de Hardware:</strong> O sistema agora lembra qual microfone você usou por último e corrige o bug de 'nomes invisíveis' na lista de dispositivos.",
            "☕ <strong>Modo Insônia (Wake Lock):</strong> A tela do seu computador não bloqueará mais automaticamente enquanto a gravação estiver ativa.",
            "🪟 <strong>Widget Compacto Real:</strong> O botão de minimizar agora redimensiona fisicamente a janela, transformando o app em uma barra flutuante discreta.",
            "🏗️ <strong>Refatoração:</strong> O módulo de Glossário foi isolado para maior estabilidade e performance."
        ]
    },
    {
        version: "1.0.2",
        date: "26/10/2023",
        changes: [
            "✨ <strong>Glossário Pessoal:</strong> Ensine o sistema! Substituição automática de termos (ex: 'artigo quinto' → 'Art. 5º').",
            "🛡️ <strong>Fluxo Seguro (Auto-Stop):</strong> O microfone desliga automaticamente ao acionar Copiar, Limpar ou Ferramentas de IA, prevenindo erros de sobreposição.",
            "🎧 <strong>Supressão de Ruído Nativa:</strong> Ativação forçada dos filtros de hardware do navegador para isolar a voz (Noise Suppression & Echo Cancellation).",
            "⚙️ <strong>Nova Interface:</strong> Modal dedicado para gerenciamento de termos do dicionário pessoal."
        ]
    },
    {
        version: "1.0.1",
        date: "24/10/2023",
        changes: [
            "🚀 <strong>Produtividade Mouse-Free:</strong> Novos atalhos de teclado (Alt+G para Gravar, Alt+C para Copiar, Alt+L para Limpar).",
            "↩️ <strong>Rede de Segurança (Undo):</strong> Apagou sem querer? Agora você tem 5 segundos para desfazer a limpeza da tela.",
            "❓ <strong>Central de Ajuda:</strong> Novo botão (?) com mapa visual de atalhos e dicas de uso.",
            "🔧 <strong>Refatoração:</strong> Melhoria na estabilidade de eventos de teclado."
        ]
    },
    {
        version: "1.0.0",
        date: "20/10/2023",
        changes: [
            "🎉 <strong>Lançamento Inicial:</strong> Versão estável do Ditado Digital Pro.",
            "🧠 <strong>Integração IA:</strong> Conexão com Google Gemini para correção gramatical e conversão jurídica.",
            "📊 <strong>Visualizador de Áudio:</strong> Osciloscópio em tempo real para feedback visual da voz.",
            "💾 <strong>Auto-Save:</strong> Persistência local de dados para evitar perda de trabalho."
        ]
    }
];
