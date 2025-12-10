# Ditado Digital Pro v1.0.1 🎙️
> **Engenharia de Áudio DSP + Inteligência Artificial + Fluxo "Mouse-Free".**
> *A ferramenta definitiva para transcrição de alta performance com Zero Latência.*

![Status](https://img.shields.io/badge/status-stable-success.svg)
![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)
![Technology](https://img.shields.io/badge/tech-Vanilla_JS_%7C_Web_Audio_API_%7C_Gemini_Flash-indigo.svg)

## 📑 Visão Geral do Produto

O **Ditado Digital Pro** é uma aplicação de engenharia de voz Client-Side. Diferente de ditadores comuns, ele roda um **Pipeline DSP (Digital Signal Processing)** local no navegador, limpando frequências graves e comprimindo o áudio antes do reconhecimento.

Na versão **1.0.1**, o foco mudou de "Qualidade de Áudio" para **"Produtividade Extrema"**. Introduzimos um sistema robusto de atalhos de teclado e mecanismos de segurança (Undo), permitindo operar a ferramenta profissionalmente sem tocar no mouse.

---

## 🚀 Novidades da Versão 1.0.1 (Speed & Safety)

### 1. Navegação "Mouse-Free" (Atalhos via `Alt`)
Para evitar conflitos com o navegador (onde `Ctrl` fecha abas), mapeamos as funções críticas para a tecla `Alt`.
* **Benefício:** Inicie gravações, limpe o texto ou copie o conteúdo instantaneamente via teclado.

### 2. Rede de Segurança (Undo Toast)
Acidentes acontecem. Se você limpar o texto sem querer (via botão ou atalho):
* Uma notificação flutuante ("Toast") aparece no rodapé.
* Você tem **5 segundos** para desfazer a ação (clicando ou usando `Alt + Z`).

### 3. Central de Ajuda On-Demand
* Adicionamos um botão **(?)** na interface.
* Abre um guia rápido visual com todos os atalhos e dicas de uso, sem sair da tela de ditado.

### 4. Arquitetura Modular
O código foi refatorado para suportar escalabilidade:
* **`config.js`:** Centraliza constantes de áudio e configurações de UI.
* **`hotkeys.js`:** Gerencia a captura de eventos de teclado isoladamente.

---

## 🎹 Guia de Atalhos (Keyboard Shortcuts)

| Ação | Atalho | Detalhes Técnicos |
| :--- | :--- | :--- |
| **Gravar / Parar** | <kbd>Alt</kbd> + <kbd>G</kbd> | Alterna o estado do microfone e processamento DSP. |
| **Limpar Texto** | <kbd>Alt</kbd> + <kbd>L</kbd> | Limpa a tela e aciona o sistema de backup temporário. |
| **Copiar Tudo** | <kbd>Alt</kbd> + <kbd>C</kbd> | Copia todo o conteúdo para a Área de Transferência. |
| **Desfazer** | <kbd>Alt</kbd> + <kbd>Z</kbd> | Restaura o texto apagado (disponível por 5s após limpar). |

---

## 🛠️ Arquitetura Técnica

O projeto segue a filosofia **"Vanilla Performance"**: zero frameworks, zero build steps.

### Estrutura de Arquivos (Atualizada v1.0.1)
```bash
/
├── index.html       # Launcher (Cálculo de posicionamento Smart Docking)
├── app.html         # Aplicação Principal (UI, Canvas, Modais)
├── style.css        # Design System (Variáveis, KBD styles, Toasts)
├── js/
│   ├── main.js      # Core Controller (Events, UI Logic, Undo System)
│   ├── config.js    # [NOVO] Constantes globais e configurações
│   ├── hotkeys.js   # [NOVO] Gerenciador de eventos de teclado
│   ├── changelog.js # Dados do histórico de versões
│   ├── speech-manager.js # AudioEngine DSP + Web Speech API
│   └── gemini-service.js # Integração com Google AI
└── README.md        # Documentação
```
### O Motor de Áudio (AudioEngine)
O fluxo de sinal permanece inalterado na v1.0.1 devido à sua estabilidade:
`Microfone` ➔ `High-Pass Filter (85Hz)` ➔ `Dynamics Compressor` ➔ `Analyser (Visualizador)` ➔ `Speech API`

---

## ⚡ Como Usar

### Instalação
Não requer instalação (Client-Side Only).
1. Baixe a pasta do projeto.
2. Abra o arquivo `index.html` no Google Chrome ou Edge.
3. Clique em **"Iniciar Widget"**.

### Configuração da IA (Gemini)
Para usar as funções de "Correção Gramatical" ou "Modo Jurídico":
1. O sistema pedirá sua **API Key** na primeira tentativa.
2. Obtenha gratuitamente no [Google AI Studio](https://aistudio.google.com/app/apikey).
3. A chave é salva encriptada no `localStorage` do seu navegador.

### Dica Pro: Janela "Always on Top"
Navegadores bloqueiam janelas "Sempre no Topo" por segurança.
* **Solução:** Use o **Microsoft PowerToys**. Com a janela selecionada, pressione `Win + Ctrl + T` para fixá-la sobre outros programas (Word, Docs, PDF).

---

## 🔒 Privacidade e Segurança

* **Processamento Local:** O reconhecimento de voz ocorre no motor do navegador.
* **Dados da IA:** Seus textos são enviados para a API do Google Gemini **apenas** quando você clica nos botões de IA.
* **Persistência:** O texto é salvo no `localStorage`. Se fechar a janela, o texto volta quando reabrir.
* **Backup Temporário:** O sistema de "Undo" mantém o texto apagado na memória RAM apenas por 5 segundos.

---

> **Desenvolvido com foco em Engenharia de Produto.**
> *Versão 1.0.1 - Speed & Safety Build*
