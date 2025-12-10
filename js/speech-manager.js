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
        
        // Variáveis para detecção de sinal fraco
        this.lowSignalCount = 0;
        this.onSignalQuality = null; // Callback armazenado
        
        // Ajuste inicial de DPI
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.ctx.scale(dpr, dpr);
        }
    }

    async start(stream, onSignalQualityCallback) {
        if (this.isActive) return;
        
        this.onSignalQuality = onSignalQualityCallback; // Registra callback
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(stream);
            
            // --- CADEIA DSP ---
            
            // 1. Filtro Passa-Alta
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 85;

            // 2. Compressor
            const compressor = this.audioContext.createDynamicsCompressor();
            compressor.threshold.value = -50;
            compressor.knee.value = 40;
            compressor.ratio.value = 12;

            // 3. Analisador
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.5;

            // Conexões
            source.connect(filter);
            filter.connect(compressor);
            compressor.connect(this.analyser);

            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            this.isActive = true;
            this.lowSignalCount = 0; // Reset contador
            
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

        // --- LÓGICA DE SINAL FRACO ---
        // Calcula a média de "volume" atual
        let sum = 0;
        for(let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        
        // Limiar de detecção (Ajustável)
        // Se average for muito baixo, mas não zero (0 geralmente indica mute total ou erro)
        if (average < 8 && average > 0) {
            this.lowSignalCount++;
        } else {
            this.lowSignalCount = 0;
        }

        // Aproximadamente 3 segundos a 60fps (180 frames)
        if (this.lowSignalCount > 180) {
            if (this.onSignalQuality) this.onSignalQuality('weak');
            this.lowSignalCount = 0; // Reseta para evitar spam de alertas
        }
        // ------------------------------

        // Configuração das barras
        const barWidth = (width / this.dataArray.length) * 2.5;
        let x = 0;

        for (let i = 0; i < this.dataArray.length; i++) {
            const value = this.dataArray[i];
            const percent = value / 255;
            
            const barHeight = height * percent * 1.0; 
            const hue = 220 + (percent * 40); 
            this.ctx.fillStyle = `hsl(${hue}, 80%, ${50 + (percent * 10)}%)`;

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
        this.callbacks = callbacks; // { onResult, onStatus, onError, onSignalQuality }
        
        this.recognition = null;
        this.isRecording = false;
        this.stream = null;
        this.manualStop = false;
        this.currentText = ""; 
        
        // Configuração de Dispositivo (Default: Padrão do Sistema)
        this.selectedDeviceId = 'default';

        this.initSpeechAPI();
    }

    setDeviceId(deviceId) {
        this.selectedDeviceId = deviceId;
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
        this.currentText = currentFullText; 
        if (this.isRecording) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        this.manualStop = false;
        try {
            // 1. Configuração de Alta Fidelidade
            const constraints = {
                audio: {
                    echoCancellation: true, 
                    noiseSuppression: true, 
                    autoGainControl: true,  
                    channelCount: 1,        
                    sampleRate: 48000       
                }
            };

            if (this.selectedDeviceId && this.selectedDeviceId !== 'default') {
                constraints.audio.deviceId = { exact: this.selectedDeviceId };
            }

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            // 2. Inicia o visualizador passando o callback de qualidade de sinal
            await this.visualizer.start(this.stream, this.callbacks.onSignalQuality);

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
            const formattedChunk = this.formatText(finalTranscriptChunk, this.currentText);
            this.currentText += formattedChunk;
            this.callbacks.onResult(this.currentText, interimTranscript);
        } else {
            this.callbacks.onResult(this.currentText, interimTranscript);
        }
    }

    formatText(newText, previousText) {
        let clean = newText.trim();
        if (!clean) return '';
        
        const lastChar = previousText.trim().slice(-1);
        const needsCap = previousText.length === 0 || ['.', '!', '?', '\n'].includes(lastChar);
        
        if (needsCap) {
            clean = clean.charAt(0).toUpperCase() + clean.slice(1);
        }
        
        const needsSpace = previousText.length > 0 && !['\n'].includes(previousText.slice(-1));
        return (needsSpace ? ' ' : '') + clean;
    }

    updateContext(text) {
        this.currentText = text;
    }
}
