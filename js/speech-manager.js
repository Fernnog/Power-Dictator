import { CONFIG } from './config.js';
import { hfService } from './hf-service.js';

export class SpeechManager {
    constructor(visualizerCanvasId, onResultCallback, onStatusChange) {
        this.isRecording = false;
        this.useWhisper = false; // [NOVO] Flag de controle do motor
        this.recognition = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.analyser = null;
        
        // Atributos do MediaRecorder (Whisper)
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        // Referência ao Canvas com proteção contra nulo
        this.canvas = document.getElementById(visualizerCanvasId);
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
            if (this.isRecording && !this.useWhisper) {
                try { 
                    this.recognition.start(); 
                } catch(e) {
                    // Ignora erros de restart muito rápido
                }
            } else if (!this.useWhisper) {
                this.onStatus('idle');
                this.stopAudioVisualization();
            }
        };

        this.recognition.onresult = (event) => {
            if (this.useWhisper) return; // Ignora se o motor Whisper estiver ativo

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
            let devices = await navigator.mediaDevices.enumerateDevices();
            let audioDevices = devices.filter(d => d.kind === 'audioinput');

            const hasLabels = audioDevices.some(d => d.label !== "");
            
            if (!hasLabels && audioDevices.length > 0) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    stream.getTracks().forEach(track => track.stop());
                    
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
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            let stream;
            
            try {
                const constraints = {
                    audio: {
                        deviceId: this.selectedDeviceId && this.selectedDeviceId !== 'default' 
                            ? { exact: this.selectedDeviceId } 
                            : undefined,
                        ...CONFIG.AUDIO.CONSTRAINTS
                    }
                };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                
            } catch (deviceErr) {
                console.warn("Microfone específico falhou ou não suporta configs avançadas. Usando padrão.", deviceErr);
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            this.mediaStream = stream;
            this.isRecording = true; 
            
            this.startAudioVisualization(this.mediaStream);

            // [NOVO] Lógica de Ramificação do Motor
            if (this.useWhisper) {
                this.audioChunks = [];
                this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: 'audio/webm' });
                
                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) this.audioChunks.push(event.data);
                };

                this.mediaRecorder.onstop = async () => {
                    this.onStatus('processing'); 
                    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                    
                    try {
                        const text = await hfService.transcribe(audioBlob);
                        if (text) this.onResult(text, ''); 
                        this.onStatus('idle');
                    } catch (error) {
                        this.onStatus('error');
                        setTimeout(() => alert("Erro na transcrição Whisper: " + error.message), 100);
                    }
                };

                this.mediaRecorder.start();
                this.onStatus('recording');
            } else {
                try {
                    this.recognition.start();
                } catch (recognitionErr) {
                    if (recognitionErr.name === 'InvalidStateError') {
                        console.warn("Speech Manager: A API de voz já estava ativa. Ignorando dupla inicialização.");
                    } else {
                        throw recognitionErr; 
                    }
                }
            }

        } catch (err) {
            console.error("Erro CRÍTICO ao iniciar áudio:", err);
            this.onStatus('error');
            alert("Erro ao acessar microfone. Verifique se o dispositivo está conectado.");
            this.isRecording = false;
        }
    }

    stop() {
        this.isRecording = false;
        
        // [NOVO] Desliga o motor apropriado
        if (this.useWhisper && this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
        } else if (this.recognition) {
            try { this.recognition.stop(); } catch(e) {}
        }
        
        this.stopAudioVisualization();
    }

    async startAudioVisualization(stream) {
        if (!this.canvasCtx) return;

        if (!this.audioContext) {
             this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048; 
        source.connect(this.analyser);

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        let isSignalStrong = false;
        const feedbackTarget = document.querySelector('.editor-area'); 
        const canvasTarget = this.canvas;

        const draw = () => {
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);

            this.analyser.getByteTimeDomainData(dataArray);

            this.canvasCtx.fillStyle = '#f9fafb'; 
            this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const centerY = this.canvas.height / 2;
            const threshold = this.canvas.height * 0.15; 

            this.canvasCtx.beginPath();
            this.canvasCtx.setLineDash([4, 4]); 
            this.canvasCtx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
            this.canvasCtx.lineWidth = 1;
            
            this.canvasCtx.moveTo(0, centerY - threshold);
            this.canvasCtx.lineTo(this.canvas.width, centerY - threshold);
            this.canvasCtx.moveTo(0, centerY + threshold);
            this.canvasCtx.lineTo(this.canvas.width, centerY + threshold);
            this.canvasCtx.stroke();

            this.canvasCtx.setLineDash([]); 
            this.canvasCtx.lineWidth = 2;
            this.canvasCtx.strokeStyle = '#4f46e5'; 
            this.canvasCtx.beginPath();

            const sliceWidth = this.canvas.width * 1.0 / bufferLength;
            let x = 0;
            let maxAmplitude = 0; 

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0; 
                const y = v * centerY;
                
                const amplitude = Math.abs(y - centerY);
                if (amplitude > maxAmplitude) maxAmplitude = amplitude;

                if (i === 0) this.canvasCtx.moveTo(x, y);
                else this.canvasCtx.lineTo(x, y);

                x += sliceWidth;
            }

            this.canvasCtx.lineTo(this.canvas.width, centerY);
            this.canvasCtx.stroke();
            
            const currentSignalStrong = maxAmplitude > threshold;
            
            if (currentSignalStrong !== isSignalStrong) {
                isSignalStrong = currentSignalStrong;
                
                if (isSignalStrong) {
                    canvasTarget.classList.add('audio-detected');
                    if (feedbackTarget) feedbackTarget.classList.add('audio-detected');
                } else {
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
        
        if (this.canvas) this.canvas.classList.remove('audio-detected');
        const feedbackTarget = document.querySelector('.editor-area');
        if (feedbackTarget) feedbackTarget.classList.remove('audio-detected');
    }
}
