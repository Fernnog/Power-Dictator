# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [1.1.1] - 2026-04-06

### Adicionado
- **Botão de Instalação PWA:** Implementação de gatilho manual (`installPwaBtn`) utilizando o evento `beforeinstallprompt` para garantir visibilidade no Chrome/Android.
- **Modo Foco (Leitura Expandida):** Nova funcionalidade para maximizar a área de transcrição no mobile, ocultando elementos de UI não essenciais.
- **Controles de Rodapé:** Adicionado botão de alternância de modo foco com suporte a ícones SVG.

### Melhorado
- **Responsividade Mobile:** Refatoração do `control-dock` para se adaptar dinamicamente ao Modo Foco, transformando botões em ícones compactos.
- **Arquitetura de UI:** Centralização das referências de elementos de interface no objeto `ui` dentro do `main.js`.

### Corrigido
- Problema de visibilidade da sugestão de instalação nativa do navegador em dispositivos Android.
