export class SpeechManager {
    constructor(visualizerCanvasId, onResultCallback, onStatusChange) {
        this.isRecording = false;
        this.recognition = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.analyser = null;
        this.canvas = document.getElementById(visualizerCanvasId);
        this.canvasCtx = this.canvas.getContext('2d');
        this.onResult = onResultCallback;
        this.onStatus = onStatusChange;
        
        // ID do dispositivo selecionado
        this.selectedDeviceId = 'default';

        this.initRecognition();
    }

    initRecognition() {
        // Verifica suporte
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Seu navegador não suporta Web Speech API. Use Chrome ou Edge.");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'pt-BR';

        this.recognition.onstart = () => this.onStatus('recording');
        this.recognition.onend = () => {
            // Reinicia automaticamente se ainda deveria estar gravando (loop de segurança)
            if (this.isRecording) {
                try { this.recognition.start(); } catch(e) {}
            } else {
                this.onStatus('idle');
                this.stopAudioVisualization();
            }
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            this.onResult(finalTranscript, interimTranscript);
        };
        
        this.recognition.onerror = (event) => {
            console.warn("Speech Error:", event.error);
            if (event.error === 'not-allowed') {
                this.isRecording = false;
                this.onStatus('error');
            }
        };
    }

    /**
     * Escuta mudanças físicas nos dispositivos (ex: plugar USB)
     */
    listenToDeviceChanges(callback) {
        navigator.mediaDevices.ondevicechange = async () => {
            const devices = await this.getAudioDevices();
            callback(devices);
        };
    }

    /**
     * Lista os dispositivos de áudio de forma robusta.
     * Se os labels estiverem vazios (bloqueio de privacidade), força um pedido de permissão.
     */
    async getAudioDevices() {
        try {
            // 1. Tenta listagem inicial
            let devices = await navigator.mediaDevices.enumerateDevices();
            let audioDevices = devices.filter(d => d.kind === 'audioinput');

            // 2. Verifica se temos dispositivos mas sem nomes (Fingerprinting Protection)
            const hasLabels = audioDevices.some(d => d.label !== "");
            
            // Se encontrou devices mas todos estão sem nome, força o desbloqueio
            if (!hasLabels && audioDevices.length > 0) {
                try {
                    // Abre um stream relâmpago apenas para liberar os labels
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    stream.getTracks().forEach(t => t.stop()); // Fecha imediatamente
                    
                    // 3. Tenta listar novamente, agora com permissão concedida
                    devices = await navigator.mediaDevices.enumerateDevices();
                    audioDevices = devices.filter(d => d.kind === 'audioinput');
                } catch (permErr) {
                    console.warn("Permissão para listar nomes de dispositivos negada pelo usuário.", permErr);
                }
            }
            
            return audioDevices;
        } catch (err) {
            console.error("Erro crítico ao listar dispositivos:", err);
            return [];
        }
    }

    setDeviceId(deviceId) {
        this.selectedDeviceId = deviceId;
    }

    async start() {
        if (this.isRecording) return;
        
        try {
            // 1. Inicia o fluxo de áudio para Visualização (Canvas)
            // Aqui usamos o ID ESPECÍFICO do dispositivo
            const constraints = {
                audio: {
                    deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            };
            
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.startAudioVisualization(this.mediaStream);

            // 2. Inicia o reconhecimento de texto
            this.isRecording = true;
            this.recognition.start();

        } catch (err) {
            console.error("Erro ao iniciar áudio:", err);
            this.onStatus('error');
            alert("Erro ao acessar microfone. Verifique as permissões.");
        }
    }

    stop() {
        this.isRecording = false;
        if (this.recognition) this.recognition.stop();
        this.stopAudioVisualization();
    }

    // --- Lógica do Visualizador (Osciloscópio) ---
    startAudioVisualization(stream) {
        if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!this.isRecording) return;
            requestAnimationFrame(draw);

            this.analyser.getByteTimeDomainData(dataArray);

            this.canvasCtx.fillStyle = '#f9fafb'; // Limpa com a cor de fundo
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.strokeStyle = '#4f46e5'; // Cor da onda (Indigo)
            this.canvasCtx.beginPath();

            const sliceWidth = this.canvas.width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * this.canvas.height / 2;

                if (i === 0) this.canvasCtx.moveTo(x, y);
                else this.canvasCtx.lineTo(x, y);

                x += sliceWidth;
            }

            this.canvasCtx.lineTo(this.canvas.width, this.canvas.height / 2);
            this.canvasCtx.stroke();
        };

        draw();
    }

    stopAudioVisualization() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
    }
}
