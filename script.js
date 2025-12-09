document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // CONFIGURAÇÕES GERAIS
    // =========================================================================
    const CONFIG = {
        geminiModel: 'gemini-flash-latest', 
        storageKeyText: 'ditado_backup_text',
        storageKeyApi: 'ditado_digital_gemini_key'
    };

    // Referências de UI
    const ui = {
        textarea: document.getElementById('transcriptionArea'),
        micBtn: document.getElementById('micBtn'),
        micLabel: document.querySelector('#micBtn span'),
        badge: document.getElementById('recordingIndicator'),
        visualizerBars: document.querySelectorAll('.audio-visualizer .bar'),
        charCount: document.getElementById('charCount'),
        statusMsg: document.getElementById('statusMsg'),
        saveStatus: document.getElementById('saveStatus'),
        btnCopy: document.getElementById('copyBtn'),
        btnClear: document.getElementById('clearBtn'),
        btnAiFix: document.getElementById('aiFixBtn'),
        btnAiLegal: document.getElementById('aiLegalBtn'),
        fileInput: document.getElementById('fileInput')
    };

    // =========================================================================
    // CLASSE DO MOTOR DE DITADO (VUI ENGINE)
    // =========================================================================
    class DictationEngine {
        constructor() {
            this.recognition = null;
            this.isRecording = false;
            this.shouldRestart = false; 
            this.audioContext = null;
            this.analyser = null;
            this.mediaStream = null;
            
            this.finalText = ui.textarea.value || '';
            
            // --- CORREÇÃO DO ECO: FLAG DE CONTROLE ---
            // Essa variável impede que o evento 'input' capture o texto enquanto a máquina escreve
            this.isMachineTyping = false; 

            this.initSpeechAPI();
            this.loadFromCache(); 
        }

        initSpeechAPI() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                alert("Navegador incompatível. Use o Google Chrome.");
                ui.micBtn.disabled = true;
                return;
            }

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'pt-BR';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onstart = () => this.handleStart();
            this.recognition.onend = () => this.handleEnd();
            this.recognition.onresult = (e) => this.handleResult(e);
            this.recognition.onerror = (e) => this.handleError(e);
        }

        toggle() {
            this.isRecording ? this.stop() : this.start();
        }

        start() {
            this.shouldRestart = true;
            // Ao iniciar, garantimos que o texto base é o que está na tela agora
            this.finalText = ui.textarea.value; 
            try { this.recognition.start(); } catch (e) { console.warn(e); }
            this.startAudioVisualizer();
        }

        stop() {
            this.shouldRestart = false;
            this.recognition.stop();
            this.stopAudioVisualizer();
            this.saveToCache();
        }

        handleStart() {
            this.isRecording = true;
            ui.micBtn.classList.add('recording');
            ui.micLabel.textContent = "Parar Gravação";
            ui.badge.classList.remove('hidden');
            ui.statusMsg.textContent = "🎙️ Ouvindo...";
        }

        handleEnd() {
            this.isRecording = false;
            if (this.shouldRestart) {
                try { this.recognition.start(); } catch(e) { 
                    setTimeout(() => { if(this.shouldRestart) this.recognition.start() }, 500);
                }
            } else {
                ui.micBtn.classList.remove('recording');
                ui.micLabel.textContent = "Iniciar Gravação";
                ui.badge.classList.add('hidden');
                ui.statusMsg.textContent = "";
                this.stopAudioVisualizer();
            }
        }

        handleResult(event) {
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    this.finalText += this.formatText(event.results[i][0].transcript);
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // --- BLOQUEIO DE ECO (CRÍTICO) ---
            this.isMachineTyping = true; // 1. Levanta a bandeira
            
            ui.textarea.value = this.finalText + interimTranscript;
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
            updateCharCount();
            
            // Pequeno delay para garantir que eventuais listeners síncronos sejam ignorados
            setTimeout(() => { this.isMachineTyping = false; }, 50); 
            
            if (!interimTranscript) this.saveToCache(); 
        }

        handleError(event) {
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            if (event.error === 'not-allowed') {
                alert("Permissão de microfone negada.");
                this.shouldRestart = false;
            }
            console.error(event.error);
        }

        formatText(text) {
            let clean = text.trim();
            if (!clean) return '';
            if (this.finalText.length > 0 && ['.', '!', '?'].includes(this.finalText.trim().slice(-1))) {
                clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            } else if (this.finalText.length === 0) {
                clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            }
            return ' ' + clean;
        }

        saveToCache() {
            localStorage.setItem(CONFIG.storageKeyText, ui.textarea.value);
            // Atualiza o finalText para garantir sincronia se houve edição manual
            this.finalText = ui.textarea.value; 
            ui.saveStatus.textContent = "Salvando...";
            setTimeout(() => ui.saveStatus.textContent = "Sincronizado", 800);
        }

        loadFromCache() {
            const saved = localStorage.getItem(CONFIG.storageKeyText);
            if (saved) {
                ui.textarea.value = saved;
                this.finalText = saved;
                updateCharCount();
            }
        }

        manualUpdate(newText) {
            ui.textarea.value = newText;
            this.finalText = newText;
            updateCharCount();
            this.saveToCache();
        }

        // --- VISUALIZADOR DE ÁUDIO ---
        async startAudioVisualizer() {
            try {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                const source = this.audioContext.createMediaStreamSource(this.mediaStream);
                source.connect(this.analyser);
                this.analyser.fftSize = 64;
                const bufferLength = this.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const updateBars = () => {
                    if (!this.isRecording) return;
                    this.analyser.getByteFrequencyData(dataArray);
                    const normalize = (val) => Math.max(4, Math.min(14, val / 10));
                    ui.visualizerBars[0].style.height = `${normalize(dataArray[2])}px`;
                    ui.visualizerBars[1].style.height = `${normalize(dataArray[6])}px`;
                    ui.visualizerBars[2].style.height = `${normalize(dataArray[12])}px`;
                    ui.visualizerBars[3].style.height = `${normalize(dataArray[20])}px`;
                    requestAnimationFrame(updateBars);
                };
                updateBars();
            } catch (err) { console.warn("Visualizador falhou:", err); }
        }

        stopAudioVisualizer() {
            if (this.mediaStream) this.mediaStream.getTracks().forEach(t => t.stop());
            if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close();
            ui.visualizerBars.forEach(bar => bar.style.height = '4px');
        }
    }

    const dictation = new DictationEngine();

    // =========================================================================
    // SERVIÇOS DE IA (GEMINI)
    // =========================================================================
    function getApiKey() {
        let key = localStorage.getItem(CONFIG.storageKeyApi);
        if (!key) {
            key = prompt("🔑 Insira sua Google Gemini API Key:");
            if (key) localStorage.setItem(CONFIG.storageKeyApi, key.trim());
        }
        return key;
    }

    async function callGemini(payload) {
        const apiKey = getApiKey();
        if (!apiKey) return null;
        ui.statusMsg.textContent = "🤖 Processando...";
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            ui.statusMsg.textContent = "✅ Concluído!";
            setTimeout(() => ui.statusMsg.textContent = "", 2000);
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        } catch (error) {
            ui.statusMsg.textContent = `Erro: ${error.message}`;
            return null;
        }
    }

    // --- EVENTOS DE UI ---

    ui.micBtn.addEventListener('click', () => dictation.toggle());

    // --- CORREÇÃO DO ECO: LISTENER INTELIGENTE ---
    ui.textarea.addEventListener('input', () => {
        // Se a máquina estiver escrevendo, IGNORA este evento.
        // Só processa se for o USUÁRIO digitando.
        if (dictation.isMachineTyping) return;
        
        dictation.manualUpdate(ui.textarea.value);
    });

    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const original = ui.btnCopy.innerHTML;
            ui.btnCopy.innerHTML = `<span style="color:green">Copiado!</span>`;
            setTimeout(() => ui.btnCopy.innerHTML = original, 2000);
        });
    });

    ui.btnClear.addEventListener('click', () => {
        if (confirm("Apagar tudo?")) {
            dictation.manualUpdate('');
            ui.textarea.focus();
        }
    });

    ui.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        ui.statusMsg.textContent = "📂 Lendo áudio...";
        reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1];
            const result = await callGemini({
                contents: [{ parts: [{ text: "Transcreva este áudio:" }, { inlineData: { mimeType: file.type, data: base64Data } }] }]
            });
            if (result) {
                const sep = (ui.textarea.value && !/[\s\n]$/.test(ui.textarea.value)) ? '\n\n' : '';
                dictation.manualUpdate(ui.textarea.value + sep + result);
            }
            ui.fileInput.value = '';
        };
    });

    const runAiTool = async (promptPrefix) => {
        const text = ui.textarea.value;
        if (!text) return alert("Digite ou dite algo primeiro.");
        const result = await callGemini({
            contents: [{ parts: [{ text: `${promptPrefix}\n"${text}"` }] }]
        });
        if (result) dictation.manualUpdate(result);
    };

    ui.btnAiFix.addEventListener('click', () => runAiTool("Corrija gramática e pontuação mantendo o tom:"));
    ui.btnAiLegal.addEventListener('click', () => runAiTool("Reescreva em linguagem jurídica formal:"));

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }
});
