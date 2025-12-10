# Ditado Digital Pro 🎙️
> **Engenharia de Áudio DSP + Inteligência Artificial Contextual.**
> *A ferramenta definitiva para transcrição jurídica e teológica com Zero Latência.*

![Status](https://img.shields.io/badge/status-stable-success.svg)
![Technology](https://img.shields.io/badge/tech-Web_Audio_API_%7C_Vanilla_JS_%7C_Gemini_Flash-indigo.svg)

## 📑 Visão Geral do Produto

O **Ditado Digital Pro** evoluiu de um simples wrapper de API para uma aplicação de engenharia de voz completa que roda localmente no navegador. 

Nesta versão, abandonamos a captação de áudio crua em favor de um **Pipeline DSP (Digital Signal Processing)** profissional. O som da sua voz é limpo, comprimido e normalizado *antes* de chegar ao motor de reconhecimento, garantindo precisão superior mesmo em ambientes com ruído de ar-condicionado ou eco.

Além disso, introduzimos o **Smart Docking**, transformando a aplicação em um Widget flutuante que respeita a área de trabalho do seu monitor e se posiciona automaticamente.

---

## 🚀 Novidades

### 1. Cadeia de Tratamento de Áudio (Audio Graph)
Utilizamos nós de áudio nativos (`AudioContext`) para tratar o sinal em tempo real:
* **High-Pass Filter (85Hz):** Um filtro passa-alta que corta frequências subgraves (hum elétrico, vibração de mesa, ar-condicionado), limpando o espectro para a IA.
* **Dynamics Compressor:** Nivela automaticamente o volume da voz. Sussurros ganham ganho, gritos são atenuados. Isso entrega um sinal constante para o reconhecimento.

### 2. Smart Docking (Bottom-Right)
A interface calcula matematicamente a posição da janela baseada na resolução disponível do seu monitor (`screen.availWidth`, `screen.availHeight` e `screen.availLeft`).
* **Benefício:** A janela sempre "nasce" ou se minimiza no canto inferior direito.
* **Multi-Monitor Ready:** Lógica corrigida para funcionar corretamente mesmo em setups com múltiplos monitores, respeitando a barra de tarefas.

### 3. Modo Widget Compacto
Ao clicar em "Compactar", a aplicação se transforma:
* Reduz para **380x300px**.
* Remove distrações visuais (título, rodapé, botões secundários).
* Foca exclusivamente no Microfone e no Visualizador Espectral.

### 4. IA com "Contexto Deslizante"
Ao solicitar correções (Gramática ou Juridiquês), o sistema envia os últimos 2000 caracteres como contexto para o Google Gemini.
* **Resultado:** A IA entende o contexto da frase anterior, mantendo a coerência terminológica em textos longos.

---

## 🛠️ Arquitetura Técnica

O projeto segue a filosofia **"Vanilla Performance"**: zero frameworks, zero build steps, velocidade máxima.

### Estrutura de Arquivos
```
/
├── index.html    # Launcher (Calcula posição e abre o App com segurança)
├── app.html      # Aplicação Principal (Container da UI e Canvas)
├── style.css     # Design System (Variáveis CSS + Modo Widget Minimizado)
├── script.js     # Core Logic (AudioEngine DSP + DictationEngine + Gemini)
└── README.md     # Documentação Técnica

```

### O Motor de Áudio (`AudioEngine Class`)
O fluxo de dados segue o seguinte grafo:
`Microfone` ➔ `Filtro Biquad (HighPass)` ➔ `Compressor Dinâmico` ➔ `Analyser (Visualizador/VAD)`

### Proteção VAD (Voice Activity Detection)
O sistema monitora a energia RMS (Root Mean Square) do áudio. Se a API de reconhecimento do navegador tentar desligar o microfone enquanto você ainda está falando, o VAD detecta a energia sonora e força o reinício imediato, criando um fluxo de ditado contínuo.

---

## ⚡ Como Usar

### Instalação
Não requer instalação. Como é uma aplicação Web Client-Side:
1. Baixe a pasta do projeto.
2. Abra o arquivo `index.html` no Google Chrome ou Microsoft Edge.
3. Clique em **"Iniciar Widget"**.

### Configuração da IA
Na primeira vez que utilizar uma função de IA (Correção ou Jurídico):
1. O sistema pedirá sua **API Key do Google Gemini**.
2. Você pode obter uma chave gratuita em: [Google AI Studio](https://aistudio.google.com/app/apikey).
3. A chave será salva localmente no seu navegador.

### Dica Pro: Janela Sempre no Topo
Devido a restrições de segurança dos navegadores, sites não podem forçar "Always on Top" nativamente.
* **Solução Recomendada:** Utilize o **Microsoft PowerToys** e pressione `Win + Ctrl + T` com a janela do ditado selecionada para fixá-la sobre as outras aplicações.

---

## 🎹 Atalhos e Funcionalidades

| Botão | Função | Detalhes Técnicos |
| :--- | :--- | :--- |
| **Microfone** | Gravar / Parar | Aciona o `SpeechRecognition` + `AudioEngine`. |
| **Upload** | Transcrever Áudio | Envia arquivo para o Gemini Vision (Multimodal). |
| **Corrigir** | Gramática Culta | Revisa pontuação e crase mantendo o estilo. |
| **Jurídico** | "Juridiquês" | Reescreve o texto com formalidade para petições. |
| **Compactar** | Modo Widget | Redimensiona e ancora no canto inferior direito. |

---

## 🔒 Privacidade e Segurança

* **Processamento Local:** O reconhecimento de voz em tempo real ocorre dentro do motor do seu navegador.
* **Dados da IA:** Seus textos são enviados para a API do Google Gemini apenas quando você clica nos botões de correção ou upload.
* **Persistência:** O texto é salvo automaticamente no `localStorage` do navegador. Se fechar a janela acidentalmente, o texto estará lá quando voltar.

---

> **Desenvolvido com foco em Engenharia de Produto.**
> *Versão 3.1 - Stable Build*
