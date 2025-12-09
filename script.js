document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // CONFIGURAÇÕES GERAIS
    // =========================================================================
    const CONFIG = {
        geminiModel: 'gemini-1.5-flash', 
        storageKeyText: 'ditado_backup_text', // Chave para salvar texto
        storageKeyApi: 'ditado_digital_gemini_key' // Chave para salvar API Key
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
        // Botões de Ação
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
            this.shouldRestart = false; // "Infinity Mode" flag
            this.audioContext = null;
            this.analyser = null;
            this.mediaStream = null;
            this.finalText = ui.textarea.value || '';
            
            // Inicialização
            this.initSpeechAPI();
            this.loadFromCache(); 
        }

        // Configura a API nativa do navegador
        initSpeechAPI() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                alert("Seu navegador não suporta a Web Speech API nativa. Recomendamos usar o Google Chrome.");
                ui.micBtn.disabled = true;
                ui.micLabel.textContent = "Navegador incompatível";
                return;
            }

            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'pt-BR';
            this.recognition.continuous = true; // Permite fluxo contínuo
            this.recognition.interimResults = true; // Resultados parciais (streaming de texto)

            // Bindings de eventos
            this.recognition.onstart = () => this.handleStart();
            this.recognition.onend = () => this.handleEnd();
            this.recognition.onresult = (e) => this.handleResult(e);
            this.recognition.onerror = (e) => this.handleError(e);
        }

        // Alterna entre gravar e parar
        toggle() {
            if (this.isRecording) {
                this.stop();
            } else {
                this.start();
            }
        }

        start() {
            this.shouldRestart = true; // Ativa modo infinito
            try {
                this.recognition.start();
            } catch (e) {
                console.warn("Tentativa de iniciar com motor já ativo:", e);
            }
            this.startAudioVisualizer(); // Inicia visualizador de ondas
        }

        stop() {
            this.shouldRestart = false; // Desativa modo infinito (parada manual)
            this.recognition.stop();
            this.stopAudioVisualizer();
            this.saveToCache(); // Force save
        }

        // --- HANDLERS DE EVENTOS DO SPEECH API ---

        handleStart() {
            this.isRecording = true;
            ui.micBtn.classList.add('recording');
            ui.micLabel.textContent = "Parar Gravação";
            ui.badge.classList.remove('hidden');
            ui.statusMsg.textContent = "🎙️ Motor ativo. Pode falar continuamente.";
            ui.statusMsg.style.color = "var(--primary)";
        }

        handleEnd() {
            this.isRecording = false;
            
            // LÓGICA CRÍTICA: AUTO-RESTART (INFINITY LOOP)
            // Se o navegador cortar o áudio (comum no Chrome após 60s), mas o usuário
            // não clicou em parar, nós reiniciamos imediatamente.
            if (this.shouldRestart) {
                console.log("Reiniciando fluxo de reconhecimento (Infinity Mode)...");
                try {
                    this.recognition.start();
                } catch(e) {
                    setTimeout(() => { if(this.shouldRestart) this.recognition.start() }, 500);
                }
            } else {
                // Parada real solicitada pelo usuário
                ui.micBtn.classList.remove('recording');
                ui.micLabel.textContent = "Iniciar Gravação";
                ui.badge.classList.add('hidden');
                ui.statusMsg.textContent = "Gravação finalizada.";
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

            // Atualiza textarea: Texto Consolidado + Texto Provisório (em itálico visualmente se quisesse, aqui é texto puro)
            ui.textarea.value = this.finalText + interimTranscript;
            
            // Auto-scroll para o final
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
            updateCharCount();
            
            // Salva no cache apenas quando temos um resultado parcial ou final
            // Se for final, salva com certeza.
            this.saveToCache(); 
        }

        handleError(event) {
            console.error("Erro VUI:", event.error);
            
            // Ignora erros comuns que não impedem o uso
            if (event.error === 'no-speech') return; // Apenas silêncio
            if (event.error === 'aborted') return;   // Parada manual
            
            if (event.error === 'not-allowed') {
                alert("Permissão de microfone negada. Verifique as configurações do navegador.");
                this.shouldRestart = false;
                this.handleEnd();
            } else {
                ui.statusMsg.textContent = `Erro no motor: ${event.error}`;
                ui.statusMsg.style.color = "var(--danger)";
            }
        }

        // --- FORMATADORES & HELPERS ---

        formatText(text) {
            let clean = text.trim();
            if (!clean) return '';
            
            // Lógica simples de capitalização baseada no fim do texto anterior
            // Se o texto anterior termina em . ! ou ?, o próximo começa maiúsculo
            if (this.finalText.length > 0) {
                const lastChar = this.finalText.trim().slice(-1);
                if (['.', '!', '?'].includes(lastChar)) {
                    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
                }
            } else {
                // Primeira frase do documento
                clean = clean.charAt(0).toUpperCase() + clean.slice(1);
            }
            return ' ' + clean;
        }

        // --- PERSISTÊNCIA (LOCALSTORAGE) ---

        saveToCache() {
            localStorage.setItem(CONFIG.storageKeyText, ui.textarea.value);
            // Atualiza estado interno se o textarea foi modificado externamente (ex: digitação)
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

        // Método para atualizar o estado quando a IA ou Upload modificam o texto
        manualUpdate(newText) {
            ui.textarea.value = newText;
            this.finalText = newText;
            updateCharCount();
            this.saveToCache();
        }

        // --- VISUALIZADOR DE ÁUDIO (WEB AUDIO API) ---
        
        async startAudioVisualizer() {
            try {
                // Solicita stream de áudio SOMENTE para visualização (não interfere no reconhecimento)
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                const source = this.audioContext.createMediaStreamSource(this.mediaStream);
                
                source.connect(this.analyser);
                this.analyser.fftSize = 64; // Tamanho pequeno para performance (32 bins)
                
                const bufferLength = this.analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                const updateBars = () => {
                    if (!this.isRecording) return;
                    
                    this.analyser.getByteFrequencyData(dataArray);
                    
                    // Mapeia frequências para as 4 barras
                    // Índices arbitrários para pegar graves, médios e agudos
                    const v1 = dataArray[2]; 
                    const v2 = dataArray[6];
                    const v3 = dataArray[12];
                    const v4 = dataArray[20];

                    // Aplica altura com limite máximo de 14px (altura do container) e mínimo de 4px
                    const normalize = (val) => Math.max(4, Math.min(14, val / 10));

                    ui.visualizerBars[0].style.height = `${normalize(v1)}px`;
                    ui.visualizerBars[1].style.height = `${normalize(v2)}px`;
                    ui.visualizerBars[2].style.height = `${normalize(v3)}px`;
                    ui.visualizerBars[3].style.height = `${normalize(v4)}px`;

                    requestAnimationFrame(updateBars);
                };
                
                updateBars();

            } catch (err) {
                console.warn("Visualizador de áudio falhou ao iniciar (possível restrição de permissão):", err);
            }
        }

        stopAudioVisualizer() {
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
            }
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close();
            }
            // Reseta visual das barras
            ui.visualizerBars.forEach(bar => bar.style.height = '4px');
        }
    }

    // Instancia o motor
    const dictation = new DictationEngine();

    // =========================================================================
    // SERVIÇOS DE IA (GEMINI)
    // =========================================================================

    function getApiKey() {
        let key = localStorage.getItem(CONFIG.storageKeyApi);
        if (!key) {
            key = prompt("🔑 Para usar recursos de IA, insira sua Google Gemini API Key:");
            if (key && key.trim().length > 10) {
                localStorage.setItem(CONFIG.storageKeyApi, key.trim());
            } else {
                alert("Chave API necessária.");
                return null;
            }
        }
        return key;
    }

    async function callGemini(payload) {
        const apiKey = getApiKey();
        if (!apiKey) return null;

        ui.statusMsg.textContent = "🤖 IA Processando...";
        ui.statusMsg.style.color = "var(--primary)";
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 400 || response.status === 403) {
                    localStorage.removeItem(CONFIG.storageKeyApi); // Remove chave inválida
                    throw new Error("Chave API inválida/expirada. Tente novamente.");
                }
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0].content) {
                throw new Error("Resposta da IA vazia.");
            }

            ui.statusMsg.textContent = "✅ IA Concluída!";
            setTimeout(() => ui.statusMsg.textContent = "", 2000);
            
            return data.candidates[0].content.parts[0].text.trim();

        } catch (error) {
            console.error(error);
            ui.statusMsg.textContent = `❌ Erro IA: ${error.message}`;
            ui.statusMsg.style.color = "var(--danger)";
            alert(`Falha na IA: ${error.message}`);
            return null;
        }
    }

    // --- AÇÕES DE BOTÕES E LISTENERS ---

    // 1. Gravação
    ui.micBtn.addEventListener('click', () => dictation.toggle());

    // 2. Digitação Manual (Sincroniza com a classe)
    ui.textarea.addEventListener('input', () => {
        dictation.manualUpdate(ui.textarea.value);
    });

    // 3. Upload de Arquivo
    ui.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) {
            alert("Limite de arquivo excedido (Máx 20MB).");
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        ui.statusMsg.textContent = "📂 Lendo áudio...";
        
        reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1];
            const payload = {
                contents: [{
                    parts: [
                        { text: "Transcreva este áudio fielmente para Português. Sem comentários extras." },
                        { inlineData: { mimeType: file.type, data: base64Data } }
                    ]
                }]
            };

            const transcription = await callGemini(payload);
            if (transcription) {
                // Adiciona ao texto existente com quebra de linha
                const current = ui.textarea.value;
                const separator = (current && !/[\s\n]$/.test(current)) ? '\n\n' : '';
                dictation.manualUpdate(current + separator + transcription);
            }
            ui.fileInput.value = ''; 
        };
    });

    // 4. IA: Gramática
    ui.btnAiFix.addEventListener('click', async () => {
        const text = ui.textarea.value;
        if (!text) return alert("Nada para corrigir.");

        const payload = {
            contents: [{ parts: [{ text: `Atue como editor profissional. Corrija gramática/pontuação do texto abaixo. Mantenha o tom original. Retorne APENAS o texto corrigido:\n\n"${text}"` }] }]
        };

        const result = await callGemini(payload);
        if (result) dictation.manualUpdate(result);
    });

    // 5. IA: Juridiquês
    ui.btnAiLegal.addEventListener('click', async () => {
        const text = ui.textarea.value;
        if (!text) return alert("Nada para converter.");

        const payload = {
            contents: [{ parts: [{ text: `Atue como advogado sênior. Reescreva o texto abaixo em linguagem jurídica formal, adequada para petições. Retorne APENAS o texto reescrito:\n\n"${text}"` }] }]
        };

        const result = await callGemini(payload);
        if (result) dictation.manualUpdate(result);
    });

    // 6. Utilitários (Copiar e Limpar)
    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const original = ui.btnCopy.innerHTML;
            ui.btnCopy.innerHTML = `<span style="color:green">Copiado!</span>`;
            setTimeout(() => ui.btnCopy.innerHTML = original, 2000);
        });
    });

    ui.btnClear.addEventListener('click', () => {
        if (ui.textarea.value && confirm("Apagar todo o texto? Isso limpará o backup também.")) {
            dictation.manualUpdate('');
            ui.textarea.focus();
        }
    });

    // Helper de contagem
    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }
});
