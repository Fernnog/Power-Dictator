document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // CONFIGURAÇÕES GERAIS
    // =========================================================================
    const CONFIG = {
        geminiModel: 'gemini-1.5-flash', // Atualizado para modelo mais recente e rápido
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
    // HELPER: STATUS PILL SYSTEM
    // =========================================================================
    function setStatus(type, message) {
        ui.statusMsg.className = 'status-bar';
        if (!type) {
            ui.statusMsg.textContent = '';
            ui.statusMsg.classList.remove('active');
            return;
        }
        ui.statusMsg.textContent = message;
        ui.statusMsg.classList.add('active');
        switch(type) {
            case 'rec': ui.statusMsg.classList.add('status-recording'); break;
            case 'ai': ui.statusMsg.classList.add('status-ai'); break;
            case 'success': ui.statusMsg.classList.add('status-success'); break;
            case 'error': ui.statusMsg.classList.add('status-error'); break;
        }
    }

    // =========================================================================
    // MÓDULO DE ÁUDIO 3.0 (FILTROS DSP + VISUALIZADOR)
    // =========================================================================
    class AudioEngine {
        constructor() {
            this.audioContext = null;
            this.analyser = null;
            this.dataArray = null;
            this.stream = null;
            this.animationId = null;
            this.isInitialized = false;
            
            // Nós de Processamento (DSP)
            this.filterNode = null;     // Filtro Passa-Alta
            this.compressorNode = null; // Compressor Dinâmico
            
            this.canvasCtx = ui.canvas.getContext('2d');
            this.resizeCanvas();
            window.addEventListener('resize', () => this.resizeCanvas());
        }

        resizeCanvas() {
            const dpr = window.devicePixelRatio || 1;
            const rect = ui.canvas.getBoundingClientRect();
            ui.canvas.width = rect.width * dpr;
            ui.canvas.height = rect.height * dpr;
            this.canvasCtx.scale(dpr, dpr);
        }

        async init() {
            if (this.isInitialized) return;
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: { 
                        echoCancellation: true, 
                        noiseSuppression: true, 
                        autoGainControl: false // Vamos controlar o ganho via compressor
                    } 
                });
                
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                
                // --- DSP CHAIN BUILDUP ---
                const source = this.audioContext.createMediaStreamSource(this.stream);
                
                // 1. High-Pass Filter (Remove ruídos graves < 85Hz como ar-condicionado)
                this.filterNode = this.audioContext.createBiquadFilter();
                this.filterNode.type = 'highpass';
                this.filterNode.frequency.value = 85;

                // 2. Dynamics Compressor (Nivela o volume da voz)
                this.compressorNode = this.audioContext.createDynamicsCompressor();
                this.compressorNode.threshold.value = -50;
                this.compressorNode.knee.value = 40;
                this.compressorNode.ratio.value = 12;
                this.compressorNode.attack.value = 0;
                this.compressorNode.release.value = 0.25;

                // 3. Analyser (Para visualização e VAD)
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
                this.analyser.smoothingTimeConstant = 0.7; // Mais responsivo
                
                // Conecta os nós: Source -> Filter -> Compressor -> Analyser -> Destination(Mudo)
                source.connect(this.filterNode);
                this.filterNode.connect(this.compressorNode);
                this.compressorNode.connect(this.analyser);
                // Não conectamos ao destination para evitar feedback de áudio (eco)
                
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                this.isInitialized = true;
                this.draw();
                
            } catch (err) {
                console.error("Erro DSP Audio:", err);
                setStatus('error', "Erro no Microfone");
            }
        }

        // Retorna se há voz ativa (Energia acima de um threshold)
        hasVoiceActivity() {
            if (!this.analyser) return false;
            this.analyser.getByteFrequencyData(this.dataArray);
            // Calcula RMS simples
            let sum = 0;
            for(let i=0; i < this.dataArray.length; i++) sum += this.dataArray[i];
            const avg = sum / this.dataArray.length;
            return avg > 10; // Threshold de silêncio (ajustável)
        }

        draw() {
            if (!this.isInitialized) return;
            this.animationId = requestAnimationFrame(() => this.draw());

            this.analyser.getByteFrequencyData(this.dataArray);
            
            const width = ui.canvas.clientWidth;
            const height = ui.canvas.clientHeight;
            const ctx = this.canvasCtx;

            ctx.clearRect(0, 0, width, height);

            // Desenha barras mais suaves
            const barWidth = (width / this.dataArray.length) * 2.5;
            let x = 0;

            for (let i = 0; i < this.dataArray.length; i++) {
                const value = this.dataArray[i];
                const percent = value / 255;
                const barHeight = height * percent * 0.9; // Altura relativa
                
                // Gradiente baseado na intensidade
                const hue = 220 + (percent * 60); // Azul (220) a Roxo (280)
                ctx.fillStyle = `hsl(${hue}, 80%, ${50 + (percent * 20)}%)`;

                // Barras arredondadas
                if (barHeight > 2) {
                    this.roundRect(ctx, x, height - barHeight, barWidth - 1, barHeight, 3);
                }
                x += barWidth;
            }
        }

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
                this.canvasCtx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
                // Não fechamos o contexto para permitir reinício rápido, apenas paramos a draw loop
            }
        }
    }

    const audioEngine = new AudioEngine();

    // =========================================================================
    // MOTOR DE DITADO (Speech API + VAD Protection)
    // =========================================================================
    class DictationEngine {
        constructor() {
            this.recognition = null;
            this.isRecording = false;
            this.manualStop = false; 
            
            this.finalText = ui.textarea.value || '';
            this.isMachineTyping = false; 

            this.initSpeechAPI();
            this.loadFromCache(); 
        }

        initSpeechAPI() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                setStatus('error', "Navegador Incompatível");
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
            
            await audioEngine.init();
            
            try { 
                this.recognition.start(); 
            } catch (e) { 
                // Se já estiver rodando, ignora
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
            setStatus('rec', "Ouvindo...");
        }

        handleEnd() {
            this.isRecording = false;
            
            // --- VAD PROTECTION LOGIC ---
            // Se o motor parou, mas o usuário NÃO clicou em parar E ainda há som no ambiente:
            if (!this.manualStop) {
                if (audioEngine.hasVoiceActivity()) {
                    console.log("Reinício forçado por VAD (Voz detectada durante corte)");
                    try { this.recognition.start(); } catch(e){}
                } else {
                    // Reinício padrão para modo 'contínuo' infinito
                    setTimeout(() => { if(!this.manualStop) this.recognition.start(); }, 100);
                }
            } else {
                ui.micBtn.classList.remove('recording');
                ui.micSpan.textContent = "Gravar";
                setStatus(null, "");
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
            
            // Auto-scroll inteligente
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
            updateCharCount();
            
            setTimeout(() => { this.isMachineTyping = false; }, 50); 
            if (!interimTranscript) this.saveToCache(); 
        }

        handleError(event) {
            if (event.error === 'not-allowed') {
                setStatus('error', "Microfone Bloqueado");
                this.manualStop = true;
            }
            // Ignora erro 'no-speech' se VAD estiver detectando algo (será reiniciado no onEnd)
        }

        formatText(text) {
            let clean = text.trim();
            if (!clean) return '';
            
            // Capitalização inteligente baseada no último caractere do texto final
            const lastChar = this.finalText.trim().slice(-1);
            const needsCap = this.finalText.length === 0 || ['.', '!', '?', '\n'].includes(lastChar);
            
            if (needsCap) {
                clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            }
            
            // Espaçamento inteligente
            return (this.finalText.length > 0 && !['\n'].includes(lastChar) ? ' ' : '') + clean;
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
    // DOCKING (JANELA BOTTOM-RIGHT) & RESIZE
    // =========================================================================
    function dockWindowBottomRight(targetWidth, targetHeight) {
        // Tenta mover a janela para o canto inferior direito
        const availW = window.screen.availWidth;
        const availH = window.screen.availHeight;
        
        const posX = availW - targetWidth;
        const posY = availH - targetHeight;

        try {
            window.resizeTo(targetWidth, targetHeight);
            window.moveTo(posX, posY);
        } catch (e) {
            console.warn("Navegador impediu resize/move:", e);
        }
    }

    ui.toggleSizeBtn.addEventListener('click', () => {
        ui.container.classList.toggle('minimized');
        const isMinimized = ui.container.classList.contains('minimized');
        
        if (isMinimized) {
            ui.iconMinimize.style.display = 'none';
            ui.iconMaximize.style.display = 'block';
            ui.toggleSizeBtn.title = "Expandir";
            // Modo Widget Compacto (380x300)
            dockWindowBottomRight(380, 300);
        } else {
            ui.iconMinimize.style.display = 'block';
            ui.iconMaximize.style.display = 'none';
            ui.toggleSizeBtn.title = "Compactar";
            // Modo Normal Expandido (920x800)
            dockWindowBottomRight(920, 800);
        }
    });

    // Ao iniciar, garante posição se possível
    window.addEventListener('load', () => {
       // Se abriu via launcher, já deve estar posicionado, mas reforçamos
       if (!ui.container.classList.contains('minimized')) {
           // dockWindowBottomRight(920, 800); // Opcional: pode ser intrusivo no refresh
       }
    });

    // =========================================================================
    // INTEGRAÇÃO GEMINI IA (COM CONTEXTO)
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
        
        setStatus('ai', "IA Pensando...");
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.error) throw new Error(data.error.message);
            
            setStatus('success', "Pronto!");
            setTimeout(() => setStatus(null, ""), 2000);
            
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        } catch (error) {
            setStatus('error', `Erro IA: ${error.message}`);
            return null;
        }
    }

    // Ferramenta de IA com Contexto Deslizante
    const runAiTool = async (promptInstruction) => {
        const text = ui.textarea.value;
        if (!text) return alert("Digite ou dite algo primeiro.");
        
        // Pega os últimos 2000 caracteres para contexto
        const context = text.slice(-2000); 
        
        const prompt = `
        ATUE COMO UM ASSISTENTE DE REDAÇÃO JURÍDICA E CULTA.
        INSTRUÇÃO: ${promptInstruction}
        
        TEXTO PARA ANÁLISE:
        "${context}"
        
        SAÍDA:
        Retorne APENAS o texto reescrito/corrigido. Mantenha o tom profissional.
        `;

        const result = await callGemini({
            contents: [{ parts: [{ text: prompt }] }]
        });
        
        if (result) {
            // Se analisamos apenas um trecho, precisamos substituir apenas esse trecho
            if (text.length > 2000) {
                 const prefix = text.slice(0, text.length - 2000);
                 dictation.manualUpdate(prefix + result);
            } else {
                 dictation.manualUpdate(result);
            }
        }
    };

    // Eventos de Botões IA
    ui.btnAiFix.addEventListener('click', () => runAiTool("Corrija pontuação, crase, concordância e melhore a clareza sem alterar o sentido legal."));
    ui.btnAiLegal.addEventListener('click', () => runAiTool("Reescreva este texto em linguagem jurídica formal (juridiquês moderado), adequado para petições judiciais."));

    // Eventos Utilitários
    ui.micBtn.addEventListener('click', () => dictation.toggle());
    
    ui.textarea.addEventListener('input', () => {
        if (dictation.isMachineTyping) return;
        dictation.manualUpdate(ui.textarea.value);
        ui.saveStatus.textContent = "Digitando...";
    });

    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const originalText = ui.btnCopy.querySelector('span').textContent;
            ui.btnCopy.querySelector('span').textContent = "Copiado!";
            setTimeout(() => { ui.btnCopy.querySelector('span').textContent = originalText; }, 2000);
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
        
        setStatus('ai', "Processando Áudio...");
        
        reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1];
            // Para áudio, enviamos como prompt multimodal
            const result = await callGemini({
                contents: [{ parts: [
                    { text: "Transcreva este áudio em português com precisão técnica e jurídica:" }, 
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

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }
});
