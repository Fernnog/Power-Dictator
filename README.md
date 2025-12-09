# Ditado Digital Pro v2.1 (Enhanced Audio Engine) 🎙️
> **Sua voz, textualizada. Agora com VAD (Detecção de Voz) e Visualização Espectral Real.**

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Technology](https://img.shields.io/badge/tech-AudioContext_API_%7C_Web_Speech_%7C_Gemini_AI-green.svg)
![Cost](https://img.shields.io/badge/license-MIT_%7C_Free_Forever-orange.svg)

## 📑 Visão Geral do Produto

O **Ditado Digital Pro** evoluiu de um simples wrapper de API para uma ferramenta de produtividade robusta para profissionais de **Direito** e **Teologia**. 

Nesta versão 2.1, abandonamos as animações cosméticas em favor de uma engenharia de áudio real. Implementamos um **Osciloscópio Espectral** e um sistema de **"Blindagem de Fluxo"**, que impede que o reconhecimento de voz seja interrompido prematuramente enquanto você ainda está falando. Tudo isso rodando localmente no navegador, garantindo privacidade e custo zero.

---

## 🚀 Novas Funcionalidades (Engenharia de Áudio)

### 1. Sistema Híbrido de Escuta (VAD Baseado em Energia)
O maior problema dos ditadores web é o corte do microfone em momentos de pausa para respiração.
* **A Solução:** Implementamos uma classe `AudioEngine` proprietária que analisa a energia RMS (Root Mean Square) do seu áudio em tempo real.
* **Como funciona:** Se a API de reconhecimento do Google tentar desligar (`onend`), nosso sistema verifica matematicamente se ainda há entrada de voz no microfone. Se houver energia sonora, ele força o reinício imediato da transcrição, criando um fluxo contínuo "à prova de falhas".

### 2. True VUI (Visual User Interface)
Substituímos a animação CSS "fake" por um **Analisador de Espectro Real** (`AnalyserNode`) via HTML5 Canvas.
* **Visualização:** 30 barras de frequência reagem instantaneamente aos graves e agudos da sua voz.
* **Benefício:** Feedback visual absoluto. Se as barras se movem, o sistema *está* te ouvindo. Isso elimina a ansiedade de "falar para o nada".

### 3. Engenharia de Prompt Contextual (Gemini 1.5 Flash)
A integração com IA foi reescrita para ser "Context-Aware" (Ciente do Contexto).
* **Jurídico:** O modo "Jurídico" agora instrui a IA a atuar como um revisor de petições, convertendo linguagem coloquial em "Juridiquês Leve" e formal.
* **Correção:** A IA analisa o texto completo para corrigir concordância e pontuação sem alterar o sentido teológico ou legal da frase.

---

## 🛠️ Arquitetura Técnica

O projeto utiliza uma abordagem *Vanilla JS* moderna, sem dependências de frameworks (React/Vue), garantindo que a aplicação carregue em milissegundos.

### Stack Tecnológica
* **Core:** HTML5, CSS3 (Grid/Flexbox), JavaScript (ES6+ Classes).
* **Audio Processing:** `window.AudioContext` (Processamento de Sinal Digital - DSP).
* **Visualização:** `HTML5 Canvas API` (Renderização gráfica a 60fps).
* **Reconhecimento:** `window.SpeechRecognition` (Motor Nativo do Chrome/Edge).
* **Inteligência:** Google Gemini API (via REST).

### Estrutura de Arquivos Otimizada
```text
/
├── index.html    # Launcher (Página de boas-vindas)
├── app.html      # Aplicação Principal (Com Canvas e UI Responsiva)
├── style.css     # Design System (Inclui estilos do Visualizer)
├── script.js     # Lógica de Negócios (AudioEngine + DictationEngine)
└── README.md     # Documentação Técnica
