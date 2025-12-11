export class SpeechManager {
    constructor(visualizerCanvasId, onResultCallback, onStatusChange) {
        this.isRecording = false;
        this.recognition = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.analyser = null;
        this.canvas = document.getElementById(visualizerCanvasId);
        // Proteção caso o canvas não exista no DOM no momento da carga
        this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null; 
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
                try { 
                    this.recognition.start(); 
                } catch(e) {
                    // Ignora erros de restart muito rápido
                }
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
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                this.isRecording = false;
                this.onStatus('error');
            }
        };
    }

    /**
     * Escuta mudanças físicas de hardware (plug/unplug)
     */
    listenToDeviceChanges(callback) {
        if (navigator.mediaDevices && navigator.mediaDevices.ondevicechange !== undefined) {
            navigator.mediaDevices.ondevicechange = async () => {
                const devices = await this.getAudioDevices();
                callback(devices);
            };
        }
    }

    /**
     * Lista dispositivos com lógica "Trigger" para liberar labels ocultos pelo navegador
     */
    async getAudioDevices() {
        try {
            // 1. Tenta listar
            let devices = await navigator.mediaDevices.enumerateDevices();
            let audioDevices = devices.filter(d => d.kind === 'audioinput');

            // 2. Verifica se os labels estão vazios (Proteção de Privacidade do Browser)
            const hasLabels = audioDevices.some(d => d.label !== "");
            
            if (!hasLabels && audioDevices.length > 0) {
                try {
                    // 3. Trigger Relâmpago: Pede permissão rápida para desbloquear nomes
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    stream.getTracks().forEach(track => track.stop());
                    
                    // 4. Lista novamente com permissão
                    devices = await navigator.mediaDevices.enumerateDevices();
                    audioDevices = devices.filter(d => d.kind === 'audioinput');
                } catch (permErr) {
                    console.warn("Permissão para listar nomes negada.", permErr);
                }
            }

            return audioDevices;

        } catch (err) {
            console.error("Erro ao listar dispositivos:", err);
            return [];
        }
    }

    setDeviceId(deviceId) {
        this.selectedDeviceId = deviceId;
    }

    async start() {
        if (this.isRecording) return;
        
        try {
            // [CORREÇÃO VISUALIZADOR] 
            // Garante que o AudioContext exista e esteja rodando (resume)
            // Navegadores suspendem contextos criados sem interação do usuário.
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // 1. Configura Stream de Áudio
            const constraints = {
                audio: {
                    deviceId: this.selectedDeviceId && this.selectedDeviceId !== 'default' 
                        ? { exact: this.selectedDeviceId } 
                        : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Inicia visualizador IMEDIATAMENTE após obter o stream
            this.startAudioVisualization(this.mediaStream);

            // 2. Inicia reconhecimento de voz
            this.isRecording = true;
            this.recognition.start();

        } catch (err) {
            console.error("Erro ao iniciar áudio:", err);
            this.onStatus('error');
            alert("Erro ao acessar microfone. Verifique permissões e conexão.");
        }
    }

    stop() {
        this.isRecording = false;
        if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        this.stopAudioVisualization();
    }

    // --- Lógica do Visualizador (Osciloscópio) ---
    startAudioVisualization(stream) {
        if (!this.canvasCtx) return;

        // Garante conexão
        if (!this.audioContext) {
             this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            // Se parou de gravar, para o loop de desenho
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);

            this.analyser.getByteTimeDomainData(dataArray);

            this.canvasCtx.fillStyle = '#f9fafb'; // Limpa fundo
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.strokeStyle = '#4f46e5'; // Cor da onda
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
        // Nota: Não fechamos o audioContext para permitir reuso rápido no .resume()
    }
}
