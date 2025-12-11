/**
 * Constante de Versão Atual
 * Usada para exibir no badge do Header (app.html)
 */
export const currentVersion = "1.0.4";

/**
 * Histórico de Versões
 * Array de objetos contendo versão, data e lista de mudanças.
 * A ordem deve ser decrescente (mais recente primeiro).
 */
export const changelogData = [
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
