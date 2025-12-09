document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos do DOM
    const elements = {
        transcriptionArea: document.getElementById('transcriptionArea'),
        micBtn: document.getElementById('micBtn'),
        copyBtn: document.getElementById('copyBtn'),
        clearBtn: document.getElementById('clearBtn'),
        fileInput: document.getElementById('fileInput'),
        aiFixBtn: document.getElementById('aiFixBtn'),
        aiLegalBtn: document.getElementById('aiLegalBtn'),
        statusMsg: document.getElementById('statusMsg'),
        // Novos elementos da UI aprimorada
        recordingIndicator: document.getElementById('recordingIndicator'),
        charCount: document.getElementById('charCount')
    };

    // Configurações do Gemini
    const GEMINI_CONFIG = {
        model: 'gemini-flash-latest', 
        keyStorage: 'ditado_digital_gemini_key'
    };

    // --- FUNÇÕES AUXILIARES ---

    function updateStatus(msg) {
        elements.statusMsg.textContent = msg;
    }

    // Atualiza o contador de caracteres
    function updateCharCount() {
        const count = elements.transcriptionArea.value.length;
        elements.charCount.textContent = `${count} caracteres`;
    }

    // Listener para contar caracteres enquanto digita
    elements.transcriptionArea.addEventListener('input', updateCharCount);

    // Gerenciamento da API Key
    function getApiKey() {
        let key = localStorage.getItem(GEMINI_CONFIG.keyStorage);
        if (!key) {
            key = prompt("🔑 Para usar IA e Transcrição de Arquivos, insira sua Google Gemini API Key:");
            if (key && key.trim().length > 10) {
                localStorage.setItem(GEMINI_CONFIG.keyStorage, key.trim());
            } else {
                alert("Chave API necessária para esta funcionalidade.");
                updateStatus("Chave API não fornecida.");
                return null;
            }
        }
        return key;
    }

    // Chamada Genérica à API do Gemini
    async function callGemini(payload) {
        const apiKey = getApiKey();
        if (!apiKey) return null;

        updateStatus("🤖 Processando com Inteligência Artificial...");
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 400 || response.status === 403) {
                    localStorage.removeItem(GEMINI_CONFIG.keyStorage); 
                    throw new Error("Chave API inválida ou expirada.");
                }
                throw new Error(`Erro API: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0].content) {
                throw new Error("A IA não retornou conteúdo válido.");
            }

            updateStatus(""); 
            return data.candidates[0].content.parts[0].text.trim();

        } catch (error) {
            console.error(error);
            updateStatus(`❌ Erro: ${error.message}`);
            alert(`Ocorreu um erro: ${error.message}`);
            return null;
        }
    }

    // --- FUNCIONALIDADE 1: WEB SPEECH API (Microfone) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert("Seu navegador não suporta a API de reconhecimento de voz nativa.");
        elements.micBtn.disabled = true;
        elements.micBtn.textContent = "Não suportado";
    } else {
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = true;
        recognition.continuous = true;

        let isRecording = false;
        let finalTranscript = '';

        elements.micBtn.addEventListener('click', () => {
            isRecording = !isRecording;
            if (isRecording) {
                // Captura texto existente
                finalTranscript = elements.transcriptionArea.value; 
                if (finalTranscript && !/[\s\n]$/.test(finalTranscript)) {
                    finalTranscript += ' ';
                }
                
                recognition.start();
                
                // Atualiza UI para estado GRAVANDO
                elements.micBtn.classList.add('recording');
                elements.micBtn.querySelector('span').textContent = 'Parar Gravação';
                elements.recordingIndicator.classList.remove('hidden'); // Mostra badge
                updateStatus("🎙️ Ouvindo...");
            } else {
                recognition.stop();
                
                // Atualiza UI para estado PARADO
                elements.micBtn.classList.remove('recording');
                elements.micBtn.querySelector('span').textContent = 'Iniciar Gravação';
                elements.recordingIndicator.classList.add('hidden'); // Esconde badge
                updateStatus("");
            }
        });

        recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            elements.transcriptionArea.value = finalTranscript + interimTranscript;
            elements.transcriptionArea.scrollTop = elements.transcriptionArea.scrollHeight;
            updateCharCount(); // Atualiza contador em tempo real
        };

        recognition.onend = () => {
            if (isRecording) {
                isRecording = false;
                elements.micBtn.classList.remove('recording');
                elements.micBtn.querySelector('span').textContent = 'Iniciar Gravação';
                elements.recordingIndicator.classList.add('hidden'); // Garante que o badge suma
                updateStatus("");
            }
        };
        
        recognition.onerror = (event) => {
            console.error("Erro no reconhecimento de fala:", event.error);
            updateStatus(`Erro no microfone: ${event.error}`);
            elements.recordingIndicator.classList.add('hidden');
        };
    }

    // --- FUNCIONALIDADE 2: UPLOAD DE ARQUIVO (MP3) ---
    elements.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) {
            alert("Arquivo muito grande. Limite aprox: 20MB.");
            elements.fileInput.value = '';
            return;
        }

        updateStatus("📂 Lendo arquivo de áudio...");

        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1];
            
            const payload = {
                contents: [{
                    parts: [
                        { text: "Transcreva este áudio fielmente para o Português do Brasil. Não adicione comentários." },
                        { inlineData: { mimeType: file.type, data: base64Data } }
                    ]
                }]
            };

            const transcription = await callGemini(payload);
            
            if (transcription) {
                const currentText = elements.transcriptionArea.value;
                const separator = (currentText && !/[\s\n]$/.test(currentText)) ? '\n\n' : '';
                elements.transcriptionArea.value += separator + transcription;
                updateCharCount();
            }
            
            elements.fileInput.value = ''; 
        };
    });

    // --- FUNCIONALIDADE 3: CORREÇÃO IA ---
    async function applyAiCorrection(mode) {
        const text = elements.transcriptionArea.value;
        if (!text || !text.trim()) {
            alert("A área de texto está vazia.");
            return;
        }

        let promptText = "";
        
        if (mode === 'fix') {
            promptText = `
            Atue como um editor profissional. Corrija gramática e pontuação.
            Mantenha o tom original. Retorne APENAS o texto corrigido.
            Texto: "${text}"`;
        } else if (mode === 'legal') {
            promptText = `
            Atue como advogado sênior. Reescreva em linguagem jurídica formal.
            Retorne APENAS o texto reescrito.
            Texto: "${text}"`;
        }

        const payload = {
            contents: [{ parts: [{ text: promptText }] }]
        };

        const result = await callGemini(payload);
        if (result) {
            elements.transcriptionArea.value = result;
            updateCharCount();
        }
    }

    elements.aiFixBtn.addEventListener('click', () => applyAiCorrection('fix'));
    elements.aiLegalBtn.addEventListener('click', () => applyAiCorrection('legal'));

    // --- FUNCIONALIDADE 4: UTILITÁRIOS ---
    elements.copyBtn.addEventListener('click', () => {
        if (elements.transcriptionArea.value) {
            navigator.clipboard.writeText(elements.transcriptionArea.value)
                .then(() => {
                    const originalText = elements.copyBtn.textContent;
                    elements.copyBtn.textContent = 'Copiado!';
                    setTimeout(() => { elements.copyBtn.textContent = originalText; }, 2000);
                });
        }
    });

    elements.clearBtn.addEventListener('click', () => {
        if (elements.transcriptionArea.value) {
            if (confirm("Apagar todo o texto?")) {
                elements.transcriptionArea.value = ''; 
                updateCharCount();
                elements.transcriptionArea.focus();
            }
        }
    });
});
