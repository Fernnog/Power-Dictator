# Ditado Digital Pro v3.1 🎙️
> **Engenharia de Áudio DSP + Inteligência Artificial Contextual.**
> *A ferramenta definitiva para transcrição jurídica e teológica com Zero Latência.*

![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)
![Status](https://img.shields.io/badge/status-stable-success.svg)
![Technology](https://img.shields.io/badge/tech-Web_Audio_API_%7C_Vanilla_JS_%7C_Gemini_Flash-indigo.svg)

## 📑 Visão Geral do Produto

O **Ditado Digital Pro v3.1** não é apenas um "wrapper" de API. É uma aplicação de engenharia de voz completa que roda localmente no navegador. 

Nesta versão, abandonamos a captação de áudio crua em favor de um **Pipeline DSP (Digital Signal Processing)** profissional. O som da sua voz é limpo, comprimido e normalizado *antes* de chegar ao motor de reconhecimento, garantindo precisão superior mesmo em ambientes com ruído de ar-condicionado ou eco.

Além disso, introduzimos o **Smart Docking**, transformando a aplicação em um Widget flutuante que respeita a área de trabalho do seu monitor.

---

## 🚀 Novidades da Versão 3.1

### 1. Cadeia de Tratamento de Áudio (Audio Graph)
Diferente de ditadores comuns que aceitam qualquer ruído, implementamos nós de áudio nativos (`AudioContext`):
* **High-Pass Filter (85Hz):** Um filtro passa-alta que corta frequências subgraves (hum elétrico, vibração de mesa, ar-condicionado), limpando o espectro para a IA.
* **Dynamics Compressor:** Nivela automaticamente o volume da voz. Sussurros ganham ganho, gritos são atenuados. Isso entrega um sinal constante para o reconhecimento.

### 2. Smart Docking (Bottom-Right)
A interface agora calcula matematicamente a posição da janela baseada na resolução disponível do seu monitor (`screen.availWidth` e `screen.availLeft`).
* **Benefício:** A janela sempre "nasce" ou se minimiza no canto inferior direito, atuando como um assistente discreto que não bloqueia sua visão central.
* **Multi-Monitor Ready:** Lógica corrigida para funcionar corretamente mesmo em setups com múltiplos monitores.

### 3. Modo Widget Compacto
Ao clicar em "Compactar", a aplicação se transforma:
* Reduz para **380x300px**.
* Remove distrações visuais (título, rodapé, botões secundários).
* Foca exclusivamente no Microfone e no Visualizador Espectral.

### 4. IA com "Contexto Deslizante"
Ao solicitar correções (Gramática ou Juridiquês), o sistema envia os últimos 2000 caracteres como contexto para o Google Gemini.
* **Resultado:** A IA entende se você está falando de "manga" (fruta) ou "manga" (camisa) baseada na frase anterior, além de manter a coerência terminológica em textos longos.

---

## 🛠️ Arquitetura Técnica

O projeto segue a filosofia **"Vanilla Performance"**: zero frameworks, zero build steps, velocidade máxima.

### Estrutura de Arquivos
```text
/
├── index.html    # Launcher (Calcula posição e abre o App)
├── app.html      # Aplicação Principal (Container da UI e Canvas)
├── style.css     # Design System (Variáveis CSS + Modo Widget)
├── script.js     # Core Logic (AudioEngine + DictationEngine + Gemini)
└── README.md     # Documentação Técnica
