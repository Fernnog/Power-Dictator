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
        statusMsg: document.getElementById('statusMsg')
    };

    // Configurações do Gemini
    const GEMINI_CONFIG = {
        model: 'gemini-flash-latest', // Modelo rápido e multimodal (aceita áudio)
        keyStorage: 'ditado_digital_gemini_key'
    };

    // --- FUNÇÕES AUXILIARES ---

    function updateStatus(msg) {
        elements.statusMsg.textContent = msg;
    }

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

        updateStatus("🤖 Processando com Inteligência Artificial... Aguarde.");
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 400 || response.status === 403) {
                    localStorage.removeItem(GEMINI_CONFIG.keyStorage); // Remove chave se inválida
                    throw new Error("Chave API inválida ou expirada.");
                }
                throw new Error(`Erro API: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0].content) {
                throw new Error("A IA não retornou conteúdo válido.");
            }

            updateStatus(""); // Limpa status em caso de sucesso
            return data.candidates[0].content.parts[0].text.trim();

        } catch (error) {
            console.error(error);
            updateStatus(`❌ Erro: ${error.message}`);
            alert(`Ocorreu um erro: ${error.message}`);
            return null;
        }
    }

    // --- FUNCIONALIDADE 1: WEB SPEECH API (Microfone em tempo real) ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert("Seu navegador não suporta a API de reconhecimento de voz nativa.");
        elements.micBtn.disabled = true;
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
                // Captura o que já existe para não sobrescrever
                finalTranscript = elements.transcriptionArea.value; 
                // Se não terminar com espaço ou quebra de linha, adiciona espaço
                if (finalTranscript && !/[\s\n]$/.test(finalTranscript)) {
                    finalTranscript += ' ';
                }
                
                recognition.start();
                elements.micBtn.classList.add('recording');
                elements.micBtn.querySelector('span').textContent = 'Parar';
                updateStatus("🎙️ Ouvindo...");
            } else {
                recognition.stop();
                elements.micBtn.classList.remove('recording');
                elements.micBtn.querySelector('span').textContent = 'Gravar';
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
            
            // Auto-scroll para o final
            elements.transcriptionArea.scrollTop = elements.transcriptionArea.scrollHeight;
        };

        recognition.onend = () => {
            // Se a gravação parar por silêncio, mas o botão ainda estiver ativo (estado lógico), reinicia?
            // Neste design simples, apenas resetamos o botão se ele parou sozinho.
            if (isRecording) {
                isRecording = false;
                elements.micBtn.classList.remove('recording');
                elements.micBtn.querySelector('span').textContent = 'Gravar';
                updateStatus("");
            }
        };
        
        recognition.onerror = (event) => {
            console.error("Erro no reconhecimento de fala:", event.error);
            updateStatus(`Erro no microfone: ${event.error}`);
        };
    }

    // --- FUNCIONALIDADE 2: UPLOAD DE ARQUIVO (MP3 via Gemini) ---
    elements.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Verifica tamanho (Limite grosseiro para Base64/API gratuita ~20MB safe zone)
        if (file.size > 20 * 1024 * 1024) {
            alert("O arquivo é muito grande para este método de upload. Tente arquivos menores que 20MB.");
            elements.fileInput.value = '';
            return;
        }

        updateStatus("📂 Lendo arquivo de áudio...");

        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1]; // Remove o cabeçalho "data:audio/mp3;base64,"
            
            const payload = {
                contents: [{
                    parts: [
                        { text: "Transcreva este áudio fielmente para o Português do Brasil. Não adicione comentários, apenas o texto falado." },
                        { inlineData: { mimeType: file.type, data: base64Data } }
                    ]
                }]
            };

            const transcription = await callGemini(payload);
            
            if (transcription) {
                const currentText = elements.transcriptionArea.value;
                const separator = (currentText && !/[\s\n]$/.test(currentText)) ? '\n\n' : '';
                elements.transcriptionArea.value += separator + transcription;
            }
            
            elements.fileInput.value = ''; // Reseta o input para permitir enviar o mesmo arquivo novamente se necessário
        };
    });

    // --- FUNCIONALIDADE 3: CORREÇÃO E REFINAMENTO DE TEXTO (IA) ---
    async function applyAiCorrection(mode) {
        const text = elements.transcriptionArea.value;
        if (!text || !text.trim()) {
            alert("A área de texto está vazia. Dite ou escreva algo primeiro.");
            return;
        }

        let promptText = "";
        
        // Definição dos Prompts
        if (mode === 'fix') {
            promptText = `
            Atue como um editor de textos profissional.
            Sua tarefa é corrigir a gramática, pontuação e clareza do texto abaixo.
            Regras OBRIGATÓRIAS:
            1. Mantenha o tom original.
            2. Corrija erros de concordância e capitalize frases.
            3. NÃO adicione introduções. Retorne APENAS o conteúdo tratado.
            4. PROTEÇÃO DE CITAÇÕES: O que estiver entre aspas (" " ou ' ') DEVE ser mantido EXATAMENTE como está.
            
            Texto: "${text}"`;
        } else if (mode === 'legal') {
            promptText = `
            Atue como um advogado sênior e editor jurídico.
            Reescreva o texto abaixo utilizando linguagem jurídica culta, formal e precisa.
            Regras OBRIGATÓRIAS:
            1. Eleve o vocabulário para um padrão técnico-jurídico.
            2. Mantenha o sentido original da mensagem.
            3. NÃO adicione introduções. Retorne APENAS o conteúdo tratado.
            4. PROTEÇÃO DE CITAÇÕES: O que estiver entre aspas (" " ou ' ') DEVE ser mantido EXATAMENTE como está.
            
            Texto: "${text}"`;
        }

        const payload = {
            contents: [{ parts: [{ text: promptText }] }]
        };

        const result = await callGemini(payload);
        if (result) {
            elements.transcriptionArea.value = result;
        }
    }

    elements.aiFixBtn.addEventListener('click', () => applyAiCorrection('fix'));
    elements.aiLegalBtn.addEventListener('click', () => applyAiCorrection('legal'));

    // --- FUNCIONALIDADE 4: UTILITÁRIOS (Copiar e Apagar) ---
    
    // Copiar
    elements.copyBtn.addEventListener('click', () => {
        if (elements.transcriptionArea.value) {
            navigator.clipboard.writeText(elements.transcriptionArea.value)
                .then(() => {
                    const originalText = elements.copyBtn.textContent;
                    elements.copyBtn.textContent = 'Copiado!';
                    setTimeout(() => {
                        elements.copyBtn.textContent = originalText;
                    }, 2000);
                })
                .catch(err => {
                    console.error('Falha ao copiar texto: ', err);
                    alert('Não foi possível copiar o texto.');
                });
        }
    });

    // Apagar
    elements.clearBtn.addEventListener('click', () => {
        if (elements.transcriptionArea.value) {
            if (confirm("Tem certeza que deseja apagar todo o texto?")) {
                elements.transcriptionArea.value = ''; 
                elements.transcriptionArea.focus();
            }
        }
    });
});
