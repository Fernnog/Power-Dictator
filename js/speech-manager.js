export class SpeechManager {
    constructor(visualizerCanvasId, onResultCallback, onStatusChange) {
        this.isRecording = false;
        this.recognition = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.analyser = null;
        this.canvas = document.getElementById(visualizerCanvasId);
        this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null; // Proteção caso canvas não exista
        this.onResult = onResultCallback;
        this.onStatus = onStatusChange;
        
        // ID do dispositivo selecionado (persistência será tratada no main.js)
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
            // Reinicia automaticamente se ainda deveria estar gravando (loop de segurança para ditado contínuo)
            if (this.isRecording) {
                try { 
                    this.recognition.start(); 
                } catch(e) {
                    // Ignora erros de restart rápido
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
            // 'no-speech' é comum em silêncio, não paramos a gravação.
            // 'not-allowed' ou 'service-not-allowed' são erros fatais.
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                this.isRecording = false;
                this.onStatus('error');
            }
        };
    }

    /**
     * [NOVO v1.0.3] Escuta mudanças físicas de hardware (plug/unplug)
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
     * [ATUALIZADO v1.0.3] Lista dispositivos com lógica anti-fingerprinting.
     * Se os labels vierem vazios, pede permissão relâmpago para desbloqueá-los.
     */
    async getAudioDevices() {
        try {
            // 1. Tentativa inicial de listar
            let devices = await navigator.mediaDevices.enumerateDevices();
            let audioDevices = devices.filter(d => d.kind === 'audioinput');

            // 2. Verifica se temos dispositivos mas sem nomes (Bloqueio do Navegador)
            // Se d.label for string vazia, o usuário ainda não deu permissão nessa sessão.
            const hasLabels = audioDevices.some(d => d.label !== "");
            
            if (!hasLabels && audioDevices.length > 0) {
                try {
                    // 3. Trigger Relâmpago: Pede permissão apenas para liberar os metadados (labels)
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    
                    // Fecha imediatamente para não prender o hardware ou acender a luz de gravação por muito tempo
                    stream.getTracks().forEach(track => track.stop());
                    
                    // 4. Lista novamente, agora com permissão concedida e labels visíveis
                    devices = await navigator.mediaDevices.enumerateDevices();
                    audioDevices = devices.filter(d => d.kind === 'audioinput');
                } catch (permErr) {
                    console.warn("Permissão para listar nomes de dispositivos foi negada.", permErr);
                    // Retorna a lista sem nomes mesmo, melhor que nada.
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
        // Nota: A mudança efetiva ocorre na próxima vez que chamar start()
    }

    async start() {
        if (this.isRecording) return;
        
        try {
            // 1. Inicia o fluxo de áudio para Visualização (Canvas)
            // O AudioContext respeita rigorosamente o deviceId
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
            this.startAudioVisualization(this.mediaStream);

            // 2. Inicia o reconhecimento de texto
            // Nota: Web Speech API às vezes ignora deviceId e usa o padrão do SO,
            // mas forçamos o getUserMedia antes para garantir permissões e sinal.
            this.isRecording = true;
            this.recognition.start();

        } catch (err) {
            console.error("Erro ao iniciar áudio:", err);
            this.onStatus('error');
            alert("Erro ao acessar microfone. Verifique se o dispositivo está conectado e permitido.");
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
        if (!this.canvasCtx) return; // Se canvas não existir, aborta visualização

        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } else if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
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

            this.canvasCtx.fillStyle = '#f9fafb'; // Limpa com a cor de fundo (igual ao CSS)
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
        // Não fechamos o audioContext aqui para permitir reuso rápido
    }
}
