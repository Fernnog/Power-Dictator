/**
 * Classe interna para gerenciar o Canvas (Visualizer)
 */
class AudioVisualizer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.analyser = null;
        this.dataArray = null;
        this.isActive = false;
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

    attach(analyser) {
        this.analyser = analyser;
        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.isActive = true;
        this.draw();
    }

    draw() {
        if (!this.isActive) return;
        requestAnimationFrame(() => this.draw());
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

    stop() {
        this.isActive = false;
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        this.ctx.clearRect(0, 0, width, height);
    }
}

/**
 * Classe Principal de Gerenciamento de Voz (VERSÃO WHISPER LOCAL)
 */
export class SpeechManager {
    constructor(canvasElement, callbacks) {
        this.visualizer = new AudioVisualizer(canvasElement);
        this.callbacks = callbacks; // { onResult, onStatus, onError, onProgress }
        
        this.isRecording = false;
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.audioInput = null;
        this.audioData = []; // Buffer acumulador
        
        // Inicializa o Worker do Whisper
        this.worker = new Worker('js/whisper.worker.js', { type: 'module' });
        
        // Escuta mensagens do Worker
        this.worker.onmessage = (e) => {
            const { status, data, text } = e.data;
            
            if (status === 'progress') {
                if (this.callbacks.onProgress) this.callbacks.onProgress(data);
            }
            else if (status === 'ready') {
                this.callbacks.onStatus('ready');
            }
            else if (status === 'loading') {
                // Log opcional
            }
            else if (status === 'result') {
                // Whisper terminou de pensar
                this.callbacks.onResult(text);
                this.callbacks.onStatus('idle'); // Volta a ficar pronto
            }
            else if (status === 'error') {
                this.callbacks.onError(data);
            }
        };

        // Dispara carregamento assim que a classe nasce
        this.worker.postMessage({ type: 'load' });
    }

    async toggle() {
        if (this.isRecording) {
            await this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        try {
            // Configura AudioContext em 16kHz (requisito do Whisper)
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true, 
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });

            this.audioInput = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Conecta ao Visualizer
            const analyser = this.audioContext.createAnalyser();
            this.audioInput.connect(analyser);
            this.visualizer.attach(analyser);

            // Processador para capturar áudio cru (ScriptProcessor é antigo mas funciona em arquivo único sem worklet extra)
            // BufferSize 4096 dá ~0.25s de latência por chunk em 16kHz
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            this.audioData = []; // Limpa buffer anterior

            this.processor.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                const inputData = e.inputBuffer.getChannelData(0);
                // Copia os dados para nosso array acumulador
                this.audioData.push(new Float32Array(inputData));
            };

            // Conecta a cadeia: Mic -> Analyser -> Processor -> Destination (mudo)
            analyser.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.isRecording = true;
            this.callbacks.onStatus('rec');

        } catch (err) {
            this.callbacks.onError("Erro ao abrir microfone: " + err.message);
        }
    }

    async stop() {
        if (!this.isRecording) return;
        this.isRecording = false;

        this.callbacks.onStatus('thinking'); // Novo status: Processando

        // 1. Para o hardware
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (this.processor) {
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
        }
        if (this.audioContext) {
            await this.audioContext.close();
        }
        this.visualizer.stop();

        // 2. Prepara o áudio para o Worker
        // Junta todos os pedacinhos (Float32Array) em um só
        const totalLength = this.audioData.reduce((acc, chunk) => acc + chunk.length, 0);
        const fullAudio = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this.audioData) {
            fullAudio.set(chunk, offset);
            offset += chunk.length;
        }

        // 3. Envia para o Whisper
        if (totalLength > 0) {
            this.worker.postMessage({ 
                type: 'transcribe', 
                audio: fullAudio 
            });
        } else {
            this.callbacks.onStatus('idle');
        }
    }
}
