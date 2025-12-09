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
        micSpan: document.querySelector('#micBtn span'), 
        
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
    // LÓGICA DE UI: REDIMENSIONAMENTO (CORREÇÃO DE ASPECTO)
    // =========================================================================
    ui.toggleSizeBtn.addEventListener('click', () => {
        ui.container.classList.toggle('minimized');
        const isMinimized = ui.container.classList.contains('minimized');
        
        // --- DIMENSÕES CORRIGIDAS ---
        
        // Compacto: Mais quadrado, menos "comprido"
        // Largura suficiente para 6 botões circulares lado a lado
        const compactW = 420; 
        const compactH = 350; 
        
        // Expandido: Mais largo para não cortar o botão "Limpar"
        const normalW = 920;
        const normalH = 800;

        if (isMinimized) {
            // --- MODO COMPACTO ---
            ui.iconMinimize.style.display = 'none';
            ui.iconMaximize.style.display = 'block';
            ui.toggleSizeBtn.title = "Expandir e Centralizar";
            
            try {
                window.resizeTo(compactW, compactH);
                // Move para canto inferior direito
                const xPos = window.screen.availWidth - compactW; 
                const yPos = window.screen.availHeight - compactH;
                window.moveTo(xPos, yPos);
            } catch(e) { console.log("Resize bloqueado pelo navegador/SO"); }

        } else {
            // --- MODO NORMAL ---
            ui.iconMinimize.style.display = 'block';
            ui.iconMaximize.style.display = 'none';
            ui.toggleSizeBtn.title = "Modo Compacto";

            try {
                window.resizeTo(normalW, normalH);
                const xCenter = (window.screen.availWidth - normalW) / 2;
                const yCenter = (window.screen.availHeight - normalH) / 2;
                window.moveTo(xCenter, yCenter);
            } catch(e) { console.log("Resize bloqueado pelo navegador/SO"); }
        }
    });

    // =========================================================================
    // MOTOR DE DITADO (Speech API)
    // =========================================================================
    class DictationEngine {
        constructor() {
            this.recognition = null;
            this.isRecording = false;
            this.shouldRestart = false; 
            
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
        }

        stop() {
            this.shouldRestart = false;
            this.recognition.stop();
            this.saveToCache();
        }

        handleStart() {
            this.isRecording = true;
            ui.micBtn.classList.add('recording');
            ui.micSpan.textContent = "Parar"; 
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
                ui.micSpan.textContent = "Gravar";
                ui.statusMsg.textContent = "";
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
                this.showError("Permissão de microfone negada!");
                this.shouldRestart = false;
            }
        }

        showError(msg) {
            ui.statusMsg.textContent = `⚠️ ${msg}`;
            ui.statusMsg.classList.add('error');
        }

        formatText(text) {
            let clean = text.trim();
            if (!clean) return '';
            if (this.finalText.length === 0 || ['.', '!', '?'].includes(this.finalText.trim().slice(-1))) {
                clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            }
            return ' ' + clean;
        }

        saveToCache() {
            localStorage.setItem(CONFIG.storageKeyText, ui.textarea.value);
            this.finalText = ui.textarea.value; 
            ui.saveStatus.textContent = "Salvo";
            ui.saveStatus.style.color = "var(--c-copy)"; 
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
    }

    const dictation = new DictationEngine();

    // =========================================================================
    // INTEGRAÇÃO COM IA (GEMINI)
    // =========================================================================
    function getApiKey() {
        let key = localStorage.getItem(CONFIG.storageKeyApi);
        if (!key) {
            key = prompt("🔑 Insira sua API Key do Google Gemini:");
            if (key) localStorage.setItem(CONFIG.storageKeyApi, key.trim());
        }
        return key;
    }

    async function callGemini(payload) {
        const apiKey = getApiKey();
        if (!apiKey) return null;
        
        ui.statusMsg.textContent = "🤖 Processando IA...";
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.error) throw new Error(data.error.message);
            
            ui.statusMsg.textContent = "✅ Pronto!";
            setTimeout(() => ui.statusMsg.textContent = "", 2000);
            
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        } catch (error) {
            dictation.showError(`Erro na IA: ${error.message}`);
            return null;
        }
    }

    // EVENTOS
    ui.micBtn.addEventListener('click', () => dictation.toggle());

    ui.textarea.addEventListener('input', () => {
        if (dictation.isMachineTyping) return;
        dictation.manualUpdate(ui.textarea.value);
        ui.saveStatus.textContent = "Digitando...";
        ui.saveStatus.style.color = "var(--text-muted)";
        clearTimeout(window.saveTimer);
        window.saveTimer = setTimeout(() => dictation.saveToCache(), 800);
    });

    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const originalText = ui.btnCopy.querySelector('span').textContent;
            ui.btnCopy.querySelector('span').textContent = "Copiado!";
            setTimeout(() => {
                ui.btnCopy.querySelector('span').textContent = originalText;
            }, 2000);
        });
    });

    ui.btnClear.addEventListener('click', () => {
        if (ui.textarea.value.length === 0) return;
        if (confirm("Deseja apagar todo o texto?")) {
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
                contents: [{ parts: [
                    { text: "Transcreva este áudio em português:" }, 
                    { inlineData: { mimeType: file.type, data: base64Data } }
                ] }]
            });
            if (result) {
                const sep = (ui.textarea.value) ? '\n\n' : '';
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

    ui.btnAiFix.addEventListener('click', () => runAiTool("Corrija estritamente a gramática e pontuação:"));
    ui.btnAiLegal.addEventListener('click', () => runAiTool("Reescreva em linguagem jurídica formal:"));

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }
});
