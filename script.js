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
        canvas: document.getElementById('audioVisualizer'),
        
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
    // MÓDULO DE ÁUDIO (VISUALIZADOR + VAD)
    // =========================================================================
    class AudioEngine {
        constructor() {
            this.audioContext = null;
            this.analyser = null;
            this.dataArray = null;
            this.source = null;
            this.stream = null;
            this.animationId = null;
            this.isInitialized = false;
            
            // Contexto do Canvas
            this.canvasCtx = ui.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }

        resizeCanvas() {
            // Ajusta o tamanho interno do canvas para alta resolução (Retina display)
            const dpr = window.devicePixelRatio || 1;
            const rect = ui.canvas.getBoundingClientRect();
            ui.canvas.width = rect.width * dpr;
            ui.canvas.height = rect.height * dpr;
            this.canvasCtx.scale(dpr, dpr);
        }

        async init() {
            if (this.isInitialized) return;
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                
                // Configuração para melhor visualização da voz humana
                this.analyser.fftSize = 256; 
                this.analyser.smoothingTimeConstant = 0.8; // Suavização
                
                this.source = this.audioContext.createMediaStreamSource(this.stream);
                this.source.connect(this.analyser);
                
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                this.isInitialized = true;
                this.draw();
            } catch (err) {
                console.error("Erro no AudioContext:", err);
                ui.statusMsg.textContent = "Erro: Microfone bloqueado.";
            }
        }

        draw() {
            if (!this.isInitialized) return;
            this.animationId = requestAnimationFrame(() => this.draw());

            this.analyser.getByteFrequencyData(this.dataArray);
            
            const width = ui.canvas.clientWidth;
            const height = ui.canvas.clientHeight;
            const ctx = this.canvasCtx;

            ctx.clearRect(0, 0, width, height);

            const barWidth = (width / this.dataArray.length) * 2.5;
            let barHeight;
            let x = 0;

            // Desenha as barras
            for (let i = 0; i < this.dataArray.length; i++) {
                barHeight = this.dataArray[i] / 2; // Escala

                // Gradiente de cor baseado na altura (volume)
                const hue = 240 + (barHeight * 0.5); // De Azul (240) para Roxo
                ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;

                // Desenha barra arredondada
                this.roundRect(ctx, x, height - barHeight, barWidth, barHeight, 2);

                x += barWidth + 2;
            }
        }

        // Função auxiliar para barras arredondadas
        roundRect(ctx, x, y, w, h, r) {
            if (w < 2 * r) r = w / 2;
            if (h < 2 * r) r = h / 2;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            ctx.fill();
        }

        stop() {
            if (this.audioContext && this.audioContext.state !== 'closed') {
                cancelAnimationFrame(this.animationId);
                // Não fechamos o context para permitir reuso rápido
                // apenas limpamos o canvas
                this.canvasCtx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
            }
        }
    }

    const audioEngine = new AudioEngine();

    // =========================================================================
    // MOTOR DE DITADO (Speech API + Lógica de Restart)
    // =========================================================================
    class DictationEngine {
        constructor() {
            this.recognition = null;
            this.isRecording = false;
            this.manualStop = false; // Flag para saber se foi o usuário que parou
            
            this.finalText = ui.textarea.value || '';
            this.isMachineTyping = false; 

            this.initSpeechAPI();
            this.loadFromCache(); 
        }

        initSpeechAPI() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                ui.statusMsg.textContent = "Navegador incompatível. Use Chrome/Edge.";
                ui.statusMsg.classList.add('error');
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

        async toggle() {
            if (this.isRecording) {
                this.stop();
            } else {
                await this.start();
            }
        }

        async start() {
            this.manualStop = false;
            this.finalText = ui.textarea.value; 
            
            // Inicializa áudio visual primeiro (precisa de gesto do usuário)
            await audioEngine.init();
            
            try { 
                this.recognition.start(); 
                ui.statusMsg.classList.remove('error');
            } catch (e) { 
                console.warn("API já iniciada ou erro:", e); 
            }
        }

        stop() {
            this.manualStop = true;
            this.recognition.stop();
            audioEngine.stop();
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
            
            // Lógica "Infinity Stream": Se não foi stop manual, reinicia
            if (!this.manualStop) {
                console.log("Reiniciando fluxo...");
                try { 
                    this.recognition.start(); 
                } catch(e) { 
                    setTimeout(() => { if(!this.manualStop) this.recognition.start() }, 300);
                }
            } else {
                ui.micBtn.classList.remove('recording');
                ui.micSpan.textContent = "Gravar";
                ui.statusMsg.textContent = "";
                audioEngine.stop();
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
            
            // Salva se for final
            if (!interimTranscript) this.saveToCache(); 
        }

        handleError(event) {
            console.warn("Erro Speech API:", event.error);
            if (event.error === 'not-allowed') {
                ui.statusMsg.textContent = "Permissão de microfone negada!";
                ui.statusMsg.classList.add('error');
                this.manualStop = true;
            }
            // Ignora erros 'no-speech' e tenta reiniciar via onend
        }

        formatText(text) {
            let clean = text.trim();
            if (!clean) return '';
            // Capitalização inteligente básica
            if (this.finalText.length === 0 || ['.', '!', '?', '\n'].includes(this.finalText.trim().slice(-1))) {
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
    // REDIMENSIONAMENTO DE JANELA
    // =========================================================================
    ui.toggleSizeBtn.addEventListener('click', () => {
        ui.container.classList.toggle('minimized');
        const isMinimized = ui.container.classList.contains('minimized');
        
        // Compacto: Quadrado para controles
        const compactW = 420; const compactH = 400; 
        // Expandido: Widescreen
        const normalW = 920; const normalH = 800;

        if (isMinimized) {
            ui.iconMinimize.style.display = 'none';
            ui.iconMaximize.style.display = 'block';
            ui.toggleSizeBtn.title = "Expandir";
            try { window.resizeTo(compactW, compactH); } catch(e){}
        } else {
            ui.iconMinimize.style.display = 'block';
            ui.iconMaximize.style.display = 'none';
            ui.toggleSizeBtn.title = "Compactar";
            try { window.resizeTo(normalW, normalH); } catch(e){}
        }
    });

    // =========================================================================
    // INTEGRAÇÃO COM IA (GEMINI) - PROMPTS OTIMIZADOS
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
        
        ui.statusMsg.textContent = "🤖 Inteligência Artificial trabalhando...";
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.error) throw new Error(data.error.message);
            
            ui.statusMsg.textContent = "✅ Texto Processado!";
            setTimeout(() => ui.statusMsg.textContent = "", 2000);
            
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        } catch (error) {
            ui.statusMsg.textContent = `Erro IA: ${error.message}`;
            ui.statusMsg.classList.add('error');
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
        ui.statusMsg.textContent = "📂 Processando áudio...";
        reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1];
            const result = await callGemini({
                contents: [{ parts: [
                    { text: "Transcreva este áudio em português com precisão jurídica:" }, 
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

    // Ferramentas de IA com Contexto
    const runAiTool = async (promptPrefix) => {
        const text = ui.textarea.value;
        if (!text) return alert("Digite ou dite algo primeiro.");
        
        // Contexto para IA ser mais assertiva
        const prompt = `
        ATUE COMO UM ESPECIALISTA EM LÍNGUA PORTUGUESA E DIREITO.
        
        TAREFA: ${promptPrefix}
        
        TEXTO ORIGINAL:
        "${text}"
        
        IMPORTANTE: Mantenha o sentido original. Retorne APENAS o texto revisado.
        `;

        const result = await callGemini({
            contents: [{ parts: [{ text: prompt }] }]
        });
        if (result) dictation.manualUpdate(result);
    };

    ui.btnAiFix.addEventListener('click', () => runAiTool("Corrija pontuação, crase e concordância. Ajuste para norma culta."));
    ui.btnAiLegal.addEventListener('click', () => runAiTool("Reescreva em linguagem jurídica formal (juridiquês leve), adequado para petições."));

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }
});
