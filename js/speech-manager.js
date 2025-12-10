/**
 * Classe interna para gerenciar o Canvas e o AudioContext (DSP)
 */
class AudioVisualizer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;
        this.isActive = false;
        
        // Ajuste inicial de DPI
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        // Verifica se o elemento está visível antes de redimensionar
        if (rect.width > 0 && rect.height > 0) {
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.ctx.scale(dpr, dpr);
        }
    }

    async start(stream) {
        if (this.isActive) return;
        
        try {
            // Cria contexto de áudio. O navegador geralmente ajusta a sampleRate para casar com o stream,
            // mas podemos tentar sugerir alta qualidade.
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const source = this.audioContext.createMediaStreamSource(stream);
            
            // --- CADEIA DSP ---
            
            // 1. Filtro Passa-Alta (Remove ruídos graves/hum elétrico)
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 85;

            // 2. Compressor (Nivela volume da voz)
            const compressor = this.audioContext.createDynamicsCompressor();
            compressor.threshold.value = -50;
            compressor.knee.value = 40;
            compressor.ratio.value = 12;

            // 3. Analisador (Para o visualizador)
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.5; // Resposta mais rápida visualmente

            // Conexões
            source.connect(filter);
            filter.connect(compressor);
            compressor.connect(this.analyser);
            // Nota: Não conectamos ao destination para evitar feedback de áudio (eco)

            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.isActive = true;
            this.draw();
            
        } catch (e) {
            console.error("Erro ao iniciar AudioVisualizer:", e);
        }
    }

    draw() {
        if (!this.isActive) return;
        this.animationId = requestAnimationFrame(() => this.draw());

        // Pega dados de frequência
        this.analyser.getByteFrequencyData(this.dataArray);
        
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        this.ctx.clearRect(0, 0, width, height);

        // Configuração das barras
        const barWidth = (width / this.dataArray.length) * 2.5;
        let x = 0;

        for (let i = 0; i < this.dataArray.length; i++) {
            const value = this.dataArray[i];
            const percent = value / 255;
            
            // Ganho visual para tornar o efeito mais perceptível
            const barHeight = height * percent * 1.0; 
            
            // Cor baseada na amplitude (Azul -> Roxo)
            const hue = 220 + (percent * 40); 
            this.ctx.fillStyle = `hsl(${hue}, 80%, ${50 + (percent * 10)}%)`;

            // Desenha barra arredondada
            if (barHeight > 2) {
                this.ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
            }
            x += barWidth;
        }
    }

    stop() {
        this.isActive = false;
        cancelAnimationFrame(this.animationId);
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        this.ctx.clearRect(0, 0, width, height);
    }
}

/**
 * Classe Principal de Gerenciamento de Voz
 */
export class SpeechManager {
    constructor(canvasElement, callbacks) {
        this.visualizer = new AudioVisualizer(canvasElement);
        this.callbacks = callbacks; // { onResult, onStatus, onError }
        
        this.recognition = null;
        this.isRecording = false;
        this.stream = null;
        this.manualStop = false;
        this.currentText = ""; // Armazena o texto atual para formatação
        
        // Configuração de Dispositivo (Default: Padrão do Sistema)
        this.selectedDeviceId = 'default';

        this.initSpeechAPI();
    }

    // Método para definir qual dispositivo físico usar
    setDeviceId(deviceId) {
        this.selectedDeviceId = deviceId;
        // Se estiver gravando, a mudança só terá efeito na próxima gravação
        // O main.js já previne a troca durante a gravação.
    }

    initSpeechAPI() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.callbacks.onError("Navegador incompatível (Sem Speech API)");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'pt-BR';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;

        this.recognition.onstart = () => {
            this.isRecording = true;
            this.callbacks.onStatus('rec');
        };

        this.recognition.onend = () => {
            // Lógica de resiliência: se não foi parada manual, tenta reiniciar
            if (!this.manualStop && this.isRecording) {
                try {
                    this.recognition.start();
                } catch (e) {
                    console.log("Tentativa de reinício rápido ignorada.");
                }
            } else {
                this.isRecording = false;
                this.visualizer.stop();
                this.stopStream();
                this.callbacks.onStatus('idle');
            }
        };

        this.recognition.onresult = (event) => this.handleResult(event);
        
        this.recognition.onerror = (event) => {
            if (event.error === 'not-allowed') {
                this.manualStop = true;
                this.callbacks.onError("Acesso ao microfone negado.");
            } else if (event.error !== 'no-speech') {
                console.warn("Speech API Warning:", event.error);
            }
        };
    }

    async toggle(currentFullText) {
        this.currentText = currentFullText; // Atualiza contexto
        if (this.isRecording) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        this.manualStop = false;
        try {
            // 1. Configuração de Alta Fidelidade (Prioridade 3)
            // Aqui definimos explicitamente como queremos que o navegador capture o áudio
            const constraints = {
                audio: {
                    echoCancellation: true, // Remove eco
                    noiseSuppression: true, // Remove ruído de fundo
                    autoGainControl: true,  // Nivela o volume automaticamente
                    channelCount: 1,        // Mono é ideal para reconhecimento de voz
                    sampleRate: 48000       // Solicita qualidade de estúdio (48kHz)
                }
            };

            // Se o usuário selecionou um dispositivo específico, usamos o 'exact'
            if (this.selectedDeviceId && this.selectedDeviceId !== 'default') {
                constraints.audio.deviceId = { exact: this.selectedDeviceId };
            }

            // Obtém o Stream com as configurações aplicadas
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            // 2. Inicia o visualizador com o stream tratado
            await this.visualizer.start(this.stream);

            // 3. Inicia o reconhecimento
            this.recognition.start();

        } catch (err) {
            this.callbacks.onError("Erro ao acessar áudio: " + err.message);
        }
    }

    stop() {
        this.manualStop = true;
        if (this.recognition) this.recognition.stop();
        this.visualizer.stop();
        this.stopStream();
    }

    stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    handleResult(event) {
        let interimTranscript = '';
        let finalTranscriptChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscriptChunk += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscriptChunk) {
            // Aplica formatação básica (Capitalização) baseada no texto anterior
            const formattedChunk = this.formatText(finalTranscriptChunk, this.currentText);
            this.currentText += formattedChunk;
            
            // Envia texto final consolidado + interim
            this.callbacks.onResult(this.currentText, interimTranscript);
        } else {
            // Apenas visualização do que está sendo dito agora
            this.callbacks.onResult(this.currentText, interimTranscript);
        }
    }

    formatText(newText, previousText) {
        let clean = newText.trim();
        if (!clean) return '';
        
        // Verifica o último caractere do texto existente
        const lastChar = previousText.trim().slice(-1);
        
        // Decide se precisa de maiúscula (Início ou após pontuação)
        const needsCap = previousText.length === 0 || ['.', '!', '?', '\n'].includes(lastChar);
        
        if (needsCap) {
            clean = clean.charAt(0).toUpperCase() + clean.slice(1);
        }
        
        // Adiciona espaço se necessário
        const needsSpace = previousText.length > 0 && !['\n'].includes(previousText.slice(-1));
        return (needsSpace ? ' ' : '') + clean;
    }

    // Permite atualizar o texto base caso o usuário digite manualmente
    updateContext(text) {
        this.currentText = text;
    }
}
