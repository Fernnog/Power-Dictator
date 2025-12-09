# Ditado Digital Pro 🎙️
> **Sua voz, textualizada. Sem interrupções, sem perda de dados.**

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Technology](https://img.shields.io/badge/tech-Web_Speech_API_%7C_Gemini_AI-green.svg)
![Status](https://img.shields.io/badge/status-stable-success.svg)

## 📑 Visão Geral do Produto

O **Ditado Digital Pro** é uma solução de *Speech-to-Text* (Fala para Texto) de alta disponibilidade, projetada para profissionais que produzem grandes volumes de texto — advogados, escritores, teólogos e estudantes.

Diferente das soluções nativas de navegadores que interrompem a gravação após breves períodos de silêncio, o **Ditado Digital Pro** utiliza uma arquitetura de *"Infinity Stream"* (Fluxo Infinito), garantindo que o motor de reconhecimento de voz permaneça ativo indefinidamente até que o usuário decida parar.

Aliado à Inteligência Artificial do Google Gemini, ele não apenas transcreve, mas atua como um assistente editorial capaz de corrigir gramática ou converter linguagem coloquial em termos jurídicos formais.

---

## 🚀 Diferenciais Competitivos (Key Features)

### 1. Motor de Voz "Infinity Stream"
A maioria dos ditadores online desliga o microfone após 60 segundos. Nossa engine monitora o estado da conexão (`onend`) e reinicia o fluxo automaticamente em milissegundos se a desconexão não for intencional.
* **Benefício:** Dite sermões inteiros, peças jurídicas ou capítulos de livros sem tocar no mouse.

### 2. Persistência de Dados (Anti-Crash)
Implementamos uma camada de persistência local (`LocalStorage`) que sincroniza cada caractere ditado ou digitado em tempo real.
* **Benefício:** Se a aba fechar, o navegador travar ou a luz acabar, seu texto estará lá intacto ao reabrir a página.

### 3. Feedback Visual de Áudio Real (VUI)
Não usamos animações falsas. A interface conecta-se à `AudioContext API` do navegador para analisar as frequências da sua voz e exibir barras que reagem ao volume real.
* **Benefício:** O usuário tem certeza absoluta de que o microfone está captando o áudio, eliminando a frustração de "falar para o nada".

### 4. IA Integrada (Gemini 1.5 Flash)
Integração direta via API para pós-processamento de texto.
* **Modo Editor:** Corrige pontuação, crase e concordância mantendo o estilo original.
* **Modo Jurídico:** Reescreve textos informais em linguagem culta/jurídica (ideal para petições e documentos oficiais).
* **Transcrição de Arquivos:** Upload de arquivos MP3/WAV para transcrição automática.

---

## 🛠️ Arquitetura Técnica

O projeto foi construído seguindo os princípios de *Vanilla JS* moderno, garantindo máxima performance sem dependência de frameworks pesados.

* **Core:** HTML5, CSS3 (Variáveis CSS), JavaScript (ES6+ Classes).
* **Speech API:** `window.SpeechRecognition` (Web Speech API nativa).
* **Audio Processing:** `window.AudioContext` + `AnalyserNode` (para o visualizador).
* **AI Backend:** Chamadas REST diretas à API `generativelanguage.googleapis.com`.
* **Design System:** Interface limpa baseada em *Inter font*, focado em legibilidade e acessibilidade.

### Estrutura de Arquivos
```text
/
├── app.html      # Aplicação principal (SPA - Single Page Application)
├── style.css     # Estilos modulares e responsivos
├── script.js     # Lógica de negócios (Classe DictationEngine)
└── index.html    # Launcher (Página de entrada/Boas-vindas)
