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
        container: document.getElementById('appContainer'),
        toggleSizeBtn: document.getElementById('toggleSizeBtn'),
        iconMinimize: document.getElementById('iconMinimize'),
        iconMaximize: document.getElementById('iconMaximize'),
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
    // LÓGICA DE UI: MODO COMPACTO
    // =========================================================================
    ui.toggleSizeBtn.addEventListener('click', () => {
        ui.container.classList.toggle('minimized');
        const isMinimized = ui.container.classList.contains('minimized');
        
        if (isMinimized) {
            ui.iconMinimize.style.display = 'none';
            ui.iconMaximize.style.display = 'block';
            ui.toggleSizeBtn.title = "Expandir";
        } else {
            ui.iconMinimize.style.display = 'block';
            ui.iconMaximize.style.display = 'none';
            ui.toggleSizeBtn.title = "Modo Compacto";
        }
    });

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
            this.isMachineTyping = false; 

            this.initSpeechAPI();
            this.loadFromCache(); 
        }

        initSpeechAPI() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                this.showError("Navegador incompatível. Use Chrome ou Edge.");
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
            this.finalText = ui.textarea.value; 
            try { 
                this.recognition.start(); 
                ui.statusMsg.classList.remove('error');
            } catch (e) { console.warn(e); }
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
            ui.statusMsg.textContent = "🎙️ Ouvindo com atenção...";
            ui.statusMsg.style.color = "var(--primary)";
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

            this.isMachineTyping = true; 
            
            ui.textarea.value = this.finalText + interimTranscript;
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
            updateCharCount();
            
            setTimeout(() => { this.isMachineTyping = false; }, 50); 
            
            if (!interimTranscript) this.saveToCache(); 
        }

        handleError(event) {
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            if (event.error === 'not-allowed') {
                this.showError("Permissão de microfone negada! Verifique seu navegador.");
                this.shouldRestart = false;
            } else {
                console.error(event.error);
            }
        }

        showError(msg) {
            ui.statusMsg.textContent = `⚠️ ${msg}`;
            ui.statusMsg.classList.add('error');
        }

        formatText(text) {
            let clean = text.trim();
            if (!clean) return '';
            // Capitalização básica
            if (this.finalText.length > 0 && ['.', '!', '?'].includes(this.finalText.trim().slice(-1))) {
                clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            } else if (this.finalText.length === 0) {
                clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            }
            return ' ' + clean;
        }

        saveToCache() {
            localStorage.setItem(CONFIG.storageKeyText, ui.textarea.value);
            this.finalText = ui.textarea.value; 
            this.updateSaveStatus(true);
        }

        updateSaveStatus(isSaved) {
            if(isSaved) {
                ui.saveStatus.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Salvo`;
                ui.saveStatus.classList.add('saved');
            } else {
                ui.saveStatus.textContent = "Salvando...";
                ui.saveStatus.classList.remove('saved');
            }
        }

        loadFromCache() {
            const saved = localStorage.getItem(CONFIG.storageKeyText);
            if (saved) {
                ui.textarea.value = saved;
                this.finalText = saved;
                updateCharCount();
                this.updateSaveStatus(true);
            }
        }

        manualUpdate(newText) {
            ui.textarea.value = newText;
            this.finalText = newText;
            updateCharCount();
            this.saveToCache();
        }

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
                    // Normalização ajustada para ser mais responsiva
                    const normalize = (val) => Math.max(4, Math.min(16, val / 8));
                    
                    ui.visualizerBars[0].style.height = `${normalize(dataArray[4])}px`;
                    ui.visualizerBars[1].style.height = `${normalize(dataArray[12])}px`;
                    ui.visualizerBars[2].style.height = `${normalize(dataArray[20])}px`;
                    ui.visualizerBars[3].style.height = `${normalize(dataArray[28])}px`;
                    
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
            key = prompt("🔑 Insira sua Google Gemini API Key para habilitar a IA:");
            if (key) localStorage.setItem(CONFIG.storageKeyApi, key.trim());
        }
        return key;
    }

    async function callGemini(payload) {
        const apiKey = getApiKey();
        if (!apiKey) return null;
        ui.statusMsg.textContent = "🤖 Processando com IA...";
        ui.statusMsg.classList.remove('error');
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.error) throw new Error(data.error.message);

            ui.statusMsg.textContent = "✅ Concluído!";
            setTimeout(() => ui.statusMsg.textContent = "", 2000);
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        } catch (error) {
            dictation.showError(`Erro na IA: ${error.message}`);
            return null;
        }
    }

    // --- EVENTOS DE UI ---

    ui.micBtn.addEventListener('click', () => dictation.toggle());

    ui.textarea.addEventListener('input', () => {
        if (dictation.isMachineTyping) return;
        dictation.manualUpdate(ui.textarea.value);
        dictation.updateSaveStatus(false);
        // Debounce para salvar 'final' no storage
        clearTimeout(window.saveTimer);
        window.saveTimer = setTimeout(() => dictation.saveToCache(), 800);
    });

    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const original = ui.btnCopy.innerHTML;
            ui.btnCopy.innerHTML = `<span style="color:var(--success)">Copiado!</span>`;
            setTimeout(() => ui.btnCopy.innerHTML = original, 2000);
        });
    });

    ui.btnClear.addEventListener('click', () => {
        if (ui.textarea.value.length === 0) return;
        if (confirm("⚠️ Tem certeza que deseja apagar todo o texto?")) {
            dictation.manualUpdate('');
            ui.textarea.focus();
        }
    });

    ui.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validação simples de tamanho (ex: 10MB limit para free tier API)
        if (file.size > 10 * 1024 * 1024) {
             dictation.showError("Arquivo muito grande. Tente arquivos menores que 10MB.");
             return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        ui.statusMsg.textContent = "📂 Lendo áudio e enviando...";
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

    ui.btnAiFix.addEventListener('click', () => runAiTool("Corrija gramática, pontuação e melhore a fluidez mantendo o sentido original:"));
    ui.btnAiLegal.addEventListener('click', () => runAiTool("Reescreva o texto abaixo em linguagem jurídica formal (juridiquês), adequada para petições:"));

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }
});
