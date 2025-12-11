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
            // Ignora erro de 'no-speech' para manter a gravação ativa em silêncio
            if (event.error === 'no-speech') return;

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
            // 1. Inicia visualizador IMEDIATAMENTE.
            // Isso garante que o AudioContext seja criado/resumido dentro do gesto do usuário (clique).
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // 2. Configura Stream de Áudio
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
            
            // Conecta o stream ao visualizador
            this.startAudioVisualization(this.mediaStream);

            // 3. Inicia reconhecimento de voz
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

    // --- Lógica do Visualizador (Osciloscópio OTIMIZADO v1.0.4) ---
    async startAudioVisualization(stream) {
        if (!this.canvasCtx) return;

        // Garante robustez do AudioContext
        if (!this.audioContext) {
             this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Configuração do Analisador
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048; 
        source.connect(this.analyser);

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Variáveis para otimização de renderização (evitar Layout Thrashing)
        let isSignalStrong = false;
        // Tenta pegar a área de texto para feedback no modo widget, caso exista
        const feedbackTarget = document.querySelector('.editor-area'); 
        const canvasTarget = this.canvas;

        const draw = () => {
            // Se parou de gravar, encerra o loop de animação
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);

            this.analyser.getByteTimeDomainData(dataArray);

            // Limpa Canvas
            this.canvasCtx.fillStyle = '#f9fafb'; // Cor de fundo do app
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const centerY = this.canvas.height / 2;
            // Define limite de "sinal útil" (15% da altura)
            const threshold = this.canvas.height * 0.15; 

            // 1. Desenha Linha de Threshold (Pontilhada Vermelha)
            this.canvasCtx.beginPath();
            this.canvasCtx.setLineDash([4, 4]); // Padrão tracejado
            this.canvasCtx.strokeStyle = 'rgba(239, 68, 68, 0.3)'; // Vermelho suave
            this.canvasCtx.lineWidth = 1;
            
            // Linha Superior
            this.canvasCtx.moveTo(0, centerY - threshold);
            this.canvasCtx.lineTo(this.canvas.width, centerY - threshold);
            
            // Linha Inferior
            this.canvasCtx.moveTo(0, centerY + threshold);
            this.canvasCtx.lineTo(this.canvas.width, centerY + threshold);
            this.canvasCtx.stroke();

            // 2. Desenha Onda de Áudio
            this.canvasCtx.setLineDash([]); // Restaura linha sólida
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.strokeStyle = '#4f46e5'; // Cor Indigo
            this.canvasCtx.beginPath();

            const sliceWidth = this.canvas.width * 1.0 / bufferLength;
            let x = 0;
            let maxAmplitude = 0; // Para calcular força do sinal

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0; // Normaliza byte (0..255) para float
                const y = v * centerY;
                
                // Calcula o pico de volume atual
                const amplitude = Math.abs(y - centerY);
                if (amplitude > maxAmplitude) maxAmplitude = amplitude;

                if (i === 0) this.canvasCtx.moveTo(x, y);
                else this.canvasCtx.lineTo(x, y);

                x += sliceWidth;
            }

            this.canvasCtx.lineTo(this.canvas.width, centerY);
            this.canvasCtx.stroke();
            
            // 3. Feedback Visual OTIMIZADO
            // Verifica se o sinal ultrapassou o threshold (alguém está falando)
            const currentSignalStrong = maxAmplitude > threshold;
            
            // Só altera classes CSS se o estado mudou (Performance Saver)
            if (currentSignalStrong !== isSignalStrong) {
                isSignalStrong = currentSignalStrong;
                
                if (isSignalStrong) {
                    // Adiciona brilho verde
                    canvasTarget.classList.add('audio-detected');
                    if (feedbackTarget) feedbackTarget.classList.add('audio-detected');
                } else {
                    // Remove brilho
                    canvasTarget.classList.remove('audio-detected');
                    if (feedbackTarget) feedbackTarget.classList.remove('audio-detected');
                }
            }
        };

        draw();
    }

    stopAudioVisualization() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        // Remove feedback visual ao parar
        if (this.canvas) this.canvas.classList.remove('audio-detected');
        const feedbackTarget = document.querySelector('.editor-area');
        if (feedbackTarget) feedbackTarget.classList.remove('audio-detected');

        // Nota: Não fechamos o audioContext para permitir reuso rápido
    }
}
