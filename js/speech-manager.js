import { CONFIG } from './config.js';

export class SpeechManager {
    constructor(visualizerCanvasId, onResultCallback, onStatusChange) {
        this.isRecording = false;
        this.recognition = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.analyser = null;
        this.source = null;
        this.visualizerCanvas = document.getElementById(visualizerCanvasId);
        this.canvasCtx = this.visualizerCanvas.getContext("2d");
        this.animationId = null;

        // Callbacks para comunicação com a UI (main.js)
        this.onResult = onResultCallback;
        this.onStatusChange = onStatusChange;

        this.initRecognition();
    }

    initRecognition() {
        // Verifica suporte à API Web Speech
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'pt-BR';

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.onStatusChange('recording');
            };

            this.recognition.onend = () => {
                // Se o status interno ainda for 'gravando', tenta reiniciar (conexão caiu)
                // Se foi parado manualmente, mantém parado.
                if (this.isRecording) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        this.stop();
                    }
                } else {
                    this.onStatusChange('stopped');
                    this.stopMediaStream(); // Garante liberação do microfone
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

                // Envia para o callback (que será processado pelo Glossário no main.js)
                this.onResult(finalTranscript, interimTranscript);
            };

            this.recognition.onerror = (event) => {
                console.error("Speech Recognition Error:", event.error);
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    this.stop();
                    this.onStatusChange('error');
                }
            };
        } else {
            alert("Seu navegador não suporta Web Speech API. Use o Chrome ou Edge.");
        }
    }

    async start() {
        if (this.isRecording) return;

        try {
            // PRIORIDADE 2: Configuração de Constraints para Supressão de Ruído Nativa
            // Isso força o navegador a aplicar filtros de DSP antes de entregar o áudio
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true, // O "Noise Gate" nativo
                    autoGainControl: true
                }
            });

            // Inicializa AudioContext para o Visualizador
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            
            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.source.connect(this.analyser);

            // Inicia Visualização e Reconhecimento
            this.visualize();
            this.recognition.start();
            
        } catch (err) {
            console.error("Erro ao iniciar microfone:", err);
            this.onStatusChange('error');
            alert("Erro ao acessar microfone. Verifique as permissões.");
        }
    }

    stop() {
        this.isRecording = false;
        if (this.recognition) {
            this.recognition.stop();
        }
        this.stopMediaStream();
    }

    stopMediaStream() {
        // Encerra faixas de áudio para liberar hardware e desligar luz de gravação do OS
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        // Limpa visualizador
        this.canvasCtx.clearRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
    }

    visualize() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!this.isRecording) return;
            
            this.animationId = requestAnimationFrame(draw);
            this.analyser.getByteTimeDomainData(dataArray);

            this.canvasCtx.fillStyle = '#f9fafb'; // Cor de fundo do canvas (igual ao CSS)
            this.canvasCtx.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);

            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.strokeStyle = '#4f46e5'; // Cor da onda (Indigo)

            this.canvasCtx.beginPath();
            const sliceWidth = this.visualizerCanvas.width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * this.visualizerCanvas.height / 2;

                if (i === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }
                x += sliceWidth;
            }

            this.canvasCtx.lineTo(this.visualizerCanvas.width, this.visualizerCanvas.height / 2);
            this.canvasCtx.stroke();
        };

        draw();
    }
}
