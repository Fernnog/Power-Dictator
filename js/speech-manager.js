/**
 * Classe auxiliar para renderizar o Osciloscópio
 * (Mantida da versão anterior, mas desacoplada do controle de fluxo)
 */
class AudioVisualizer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.isActive = false;
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;
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

    setAnalyser(analyser) {
        this.analyser = analyser;
        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    start() {
        this.isActive = true;
        this.draw();
    }

    stop() {
        this.isActive = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        // Limpa o canvas
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        this.ctx.clearRect(0, 0, width, height);
    }

    draw() {
        if (!this.isActive || !this.analyser) return;
        this.animationId = requestAnimationFrame(() => this.draw());

        this.analyser.getByteFrequencyData(this.dataArray);
        
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        this.ctx.clearRect(0, 0, width, height);

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
}

/**
 * Gerenciador de Áudio e Comunicação com Whisper Worker
 */
export class SpeechManager {
    constructor(canvasElement, callbacks) {
        this.callbacks = callbacks; // { onResult, onStatus, onError }
        this.visualizer = new AudioVisualizer(canvasElement);
        
        // Estado do Worker e Modelo
        this.isModelReady = false;
        this.worker = new Worker('js/whisper.worker.js', { type: 'module' });
        this.initWorker();

        // Estado do Áudio
        this.audioContext = null;
        this.stream = null;
        this.processor = null;
        this.input = null;
        this.isRecording = false;

        // Buffers e VAD (Voice Activity Detection)
        this.audioBuffer = []; // Armazena floats de áudio
        this.bufferSize = 4096;
        this.sampleRate = 16000; // Whisper exige 16kHz
        this.silenceStart = null;
        this.vadThreshold = 0.015; // Sensibilidade do silêncio (ajustável)
        this.maxSilenceDuration = 1500; // 1.5s de silêncio encerra a frase
    }

    initWorker() {
        // Escuta mensagens do cérebro (Worker)
        this.worker.onmessage = (e) => {
            const { status, data, file, progress, text } = e.data;

            if (status === 'progress') {
                // Atualiza UI da barra de progresso
                const barContainer = document.getElementById('modelLoadingBar');
                const barFill = document.getElementById('progressFill');
                const textLabel = document.getElementById('progressText');
                
                if (barContainer) barContainer.style.display = 'block';
                if (data === 'Initiating') return; // Ignora msg inicial
                
                if (file && progress) {
                    const pct = Math.round(progress);
                    if (barFill) barFill.style.width = `${pct}%`;
                    if (textLabel) textLabel.textContent = `${pct}%`;
                }
            }
            
            if (status === 'ready') {
                this.isModelReady = true;
                const barContainer = document.getElementById('modelLoadingBar');
                if (barContainer) barContainer.style.display = 'none';
                console.log("Whisper pronto para ouvir.");
            }

            if (status === 'result') {
                if (text && text.trim().length > 0) {
                    this.callbacks.onResult(text.trim(), ''); // Envia texto final
                }
                this.callbacks.onStatus('rec'); // Volta status para "ouvindo" (remove 'pensando')
            }

            if (status === 'error') {
                this.callbacks.onError(data);
            }
        };

        // Solicita carregamento do modelo
        this.worker.postMessage({ type: 'load' });
    }

    async toggle(currentFullText) {
        if (!this.isModelReady) {
            this.callbacks.onError("Modelo carregando... aguarde.");
            return;
        }

        if (this.isRecording) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        try {
            this.callbacks.onStatus('rec'); // UI feedback
            this.audioBuffer = []; // Limpa buffer anterior

            // Inicializa AudioContext forçando 16kHz (requisito do Whisper)
            // Navegadores modernos fazem resampling automático aqui
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });

            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    channelCount: 1, 
                    echoCancellation: true, 
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });

            // Configuração do Grafo de Áudio
            const source = this.audioContext.createMediaStreamSource(this.stream);
            
            // Analisador para o Visualizador
            const analyser = this.audioContext.createAnalyser();
            source.connect(analyser);
            this.visualizer.setAnalyser(analyser);
            this.visualizer.start();

            // Processor para capturar dados crus (Raw Data)
            // ScriptProcessor é depreciado mas é a forma mais simples de fazer isso
            // num arquivo único sem carregar outro worklet file externo.
            this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
            
            // Loop de processamento de áudio
            this.processor.onaudioprocess = (e) => this.processAudio(e);

            // Conexões finais
            // source -> analyser -> processor -> destination (mudo, necessário para o processor rodar)
            analyser.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.isRecording = true;

        } catch (err) {
            console.error(err);
            this.callbacks.onError("Erro ao iniciar microfone: " + err.message);
        }
    }

    processAudio(event) {
        if (!this.isRecording) return;

        const inputData = event.inputBuffer.getChannelData(0);
        
        // 1. Detecção de Energia (RMS) para VAD
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
            // Acumula áudio no buffer geral
            this.audioBuffer.push(inputData[i]);
        }
        const rms = Math.sqrt(sum / inputData.length);

        // 2. Lógica de Silêncio
        if (rms > this.vadThreshold) {
            // Há voz
            this.silenceStart = null;
        } else {
            // Há silêncio
            if (!this.silenceStart) this.silenceStart = Date.now();
        }

        // 3. Verifica se deve enviar para transcrição (Chunking)
        if (this.silenceStart && (Date.now() - this.silenceStart > this.maxSilenceDuration)) {
            // Se o buffer tiver dados suficientes (evitar cliques vazios)
            if (this.audioBuffer.length > (this.sampleRate * 0.5)) { // Mínimo 0.5s de áudio
                this.sendToWorker();
            } else {
                // Apenas ruído curto, descarta mas mantem gravação
                this.audioBuffer = []; 
                this.silenceStart = null; 
            }
        }
        
        // Segurança de memória: Se buffer ficar muito grande (>30s) força envio
        if (this.audioBuffer.length > this.sampleRate * 30) {
            this.sendToWorker();
        }
    }

    sendToWorker() {
        if (this.audioBuffer.length === 0) return;

        // Feedback visual que está "pensando"
        this.callbacks.onStatus('ai'); 

        // Envia cópia do áudio para o Worker
        const audioToSend = new Float32Array(this.audioBuffer);
        this.worker.postMessage({
            type: 'transcribe',
            audio: audioToSend
        });

        // Limpa buffer e reseta VAD
        this.audioBuffer = [];
        this.silenceStart = null;
    }

    stop() {
        this.isRecording = false;
        
        // Envia o que sobrou no buffer
        if (this.audioBuffer.length > 0) {
            this.sendToWorker();
        }

        // Para visualizador e stream
        this.visualizer.stop();
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        // Desconecta nós de áudio
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.callbacks.onStatus('idle');
    }

    // Método mantido para compatibilidade, mas Whisper não usa contexto anterior para formatação interna
    updateContext(text) {
        // Placeholder
    }
}
