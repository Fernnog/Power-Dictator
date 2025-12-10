import { GeminiService } from './gemini-service.js';
import { SpeechManager } from './speech-manager.js';
import { changelogData } from './changelog.js'; // Importação do novo arquivo de dados

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // CONFIG E UI REFERÊNCIAS
    // =========================================================================
    const STORAGE_KEY_TEXT = 'ditado_backup_text';
    const STORAGE_KEY_MIC = 'ditado_pref_mic'; // Nova chave para persistência
    
    const ui = {
        container: document.getElementById('appContainer'),
        toggleSizeBtn: document.getElementById('toggleSizeBtn'),
        iconMinimize: document.getElementById('iconMinimize'),
        iconMaximize: document.getElementById('iconMaximize'),
        
        textarea: document.getElementById('transcriptionArea'),
        canvas: document.getElementById('audioVisualizer'),
        
        micBtn: document.getElementById('micBtn'), 
        micSpan: document.querySelector('#micBtn span'), 
        
        audioSelect: document.getElementById('audioSource'),

        charCount: document.getElementById('charCount'),
        statusMsg: document.getElementById('statusMsg'),
        saveStatus: document.getElementById('saveStatus'),
        
        btnCopy: document.getElementById('copyBtn'),
        btnClear: document.getElementById('clearBtn'),
        btnAiFix: document.getElementById('aiFixBtn'),
        btnAiLegal: document.getElementById('aiLegalBtn'),
        fileInput: document.getElementById('fileInput'),

        // Referências do Changelog
        versionBtn: document.getElementById('versionBtn'),
        changelogModal: document.getElementById('changelogModal'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        changelogList: document.getElementById('changelogList')
    };

    // =========================================================================
    // HELPER: STATUS BAR
    // =========================================================================
    function setStatus(type, message) {
        ui.statusMsg.className = 'status-bar';
        if (!type || type === 'idle') {
            ui.statusMsg.textContent = '';
            ui.statusMsg.classList.remove('active');
            return;
        }
        ui.statusMsg.textContent = message;
        ui.statusMsg.classList.add('active');
        
        switch(type) {
            case 'rec': ui.statusMsg.classList.add('status-recording'); break;
            case 'ai': ui.statusMsg.classList.add('status-ai'); break;
            case 'success': ui.statusMsg.classList.add('status-success'); break;
            case 'error': ui.statusMsg.classList.add('status-error'); break;
            case 'warning': ui.statusMsg.classList.add('status-warning'); break; // Novo status
        }
    }

    // =========================================================================
    // INSTANCIAÇÃO DOS SERVIÇOS
    // =========================================================================
    
    const gemini = new GeminiService();
    
    let isMachineTyping = false; // Flag para evitar loop de evento 'input'

    // Callback para lidar com resultados do ditado
    const handleSpeechResult = (finalText, interimText) => {
        isMachineTyping = true;
        ui.textarea.value = finalText + interimText;
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
        updateCharCount();
        
        if (!interimText) {
            saveToCache();
        }
        
        // Pequeno delay para liberar a flag
        setTimeout(() => { isMachineTyping = false; }, 50);
    };

    // Callback para lidar com status do microfone
    const handleSpeechStatus = (status) => {
        if (status === 'rec') {
            ui.micBtn.classList.add('recording');
            ui.micSpan.textContent = "Parar";
            setStatus('rec', "Ouvindo...");
        } else if (status === 'idle') {
            ui.micBtn.classList.remove('recording');
            ui.micSpan.textContent = "Gravar";
            setStatus('idle');
            saveToCache();
        }
    };

    const handleSpeechError = (msg) => {
        setStatus('error', msg);
        ui.micBtn.classList.remove('recording');
    };

    // Callback para lidar com sinal fraco (Nova Funcionalidade)
    const handleSignalQuality = (quality) => {
        if (quality === 'weak' && speechManager.isRecording) {
            setStatus('warning', "Fale mais perto 🎤");
            // Remove o aviso automaticamente após 3 segundos se a pessoa não falar
            setTimeout(() => {
                if(ui.statusMsg.classList.contains('status-warning')) {
                    setStatus('rec', "Ouvindo...");
                }
            }, 3000);
        }
    };

    const speechManager = new SpeechManager(
        ui.canvas, 
        { 
            onResult: handleSpeechResult, 
            onStatus: handleSpeechStatus,
            onError: handleSpeechError,
            onSignalQuality: handleSignalQuality // Passando novo callback
        }
    );

    // =========================================================================
    // LÓGICA DE SELEÇÃO DE DISPOSITIVOS & PERSISTÊNCIA
    // =========================================================================
    async function loadAudioDevices() {
        if (!ui.audioSelect) return;

        try {
            // Solicita permissão brevemente para obter os Rótulos
            await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            ui.audioSelect.innerHTML = ''; // Limpa lista atual
            
            // Opção Padrão
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default';
            defaultOption.text = 'Padrão do Sistema';
            ui.audioSelect.appendChild(defaultOption);

            // Popula com dispositivos reais
            audioInputs.forEach(device => {
                if (device.deviceId !== 'default' && device.deviceId !== 'communications') {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || `Microfone ${ui.audioSelect.length}`;
                    ui.audioSelect.appendChild(option);
                }
            });

            // Recupera preferência salva (Persistência)
            const savedMic = localStorage.getItem(STORAGE_KEY_MIC);
            if (savedMic) {
                // Verifica se o dispositivo salvo ainda existe na lista
                const deviceExists = Array.from(ui.audioSelect.options).some(opt => opt.value === savedMic);
                if (deviceExists) {
                    ui.audioSelect.value = savedMic;
                    speechManager.setDeviceId(savedMic);
                }
            }

        } catch (e) {
            console.warn("Não foi possível listar dispositivos de áudio detalhados:", e);
        }
    }

    // Carrega a lista ao iniciar
    loadAudioDevices();

    // Listener para troca de microfone com Persistência
    if (ui.audioSelect) {
        ui.audioSelect.addEventListener('change', () => {
            if (speechManager.isRecording) {
                alert("Por favor, pare a gravação antes de trocar o microfone.");
                // Reverte seleção visualmente se necessário, ou força stop
                return;
            }
            const selectedMic = ui.audioSelect.value;
            speechManager.setDeviceId(selectedMic);
            localStorage.setItem(STORAGE_KEY_MIC, selectedMic); // Salva preferência
        });
    }

    // =========================================================================
    // LÓGICA DE DADOS (CACHE)
    // =========================================================================
    function saveToCache() {
        localStorage.setItem(STORAGE_KEY_TEXT, ui.textarea.value);
        ui.saveStatus.textContent = "Salvo";
        ui.saveStatus.style.color = "var(--c-copy)";
    }

    function loadFromCache() {
        const saved = localStorage.getItem(STORAGE_KEY_TEXT);
        if (saved) {
            ui.textarea.value = saved;
            speechManager.updateContext(saved);
            updateCharCount();
        }
    }

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }

    // Carrega dados ao iniciar
    loadFromCache();

    // =========================================================================
    // EVENTOS DE INTERFACE
    // =========================================================================

    // 1. Microfone
    ui.micBtn.addEventListener('click', () => {
        speechManager.toggle(ui.textarea.value);
    });

    // 2. Edição Manual
    ui.textarea.addEventListener('input', () => {
        if (isMachineTyping) return;
        ui.saveStatus.textContent = "Digitando...";
        updateCharCount();
        speechManager.updateContext(ui.textarea.value); 
        saveToCache();
    });

    // 3. Funções de IA (Gemini)
    const runAiTool = async (promptInstruction) => {
        const text = ui.textarea.value;
        if (!text) return alert("Digite ou dite algo primeiro.");
        
        const context = text.slice(-3000); 
        const prompt = `ATUE COMO UM ASSISTENTE DE REDAÇÃO. INSTRUÇÃO: ${promptInstruction} TEXTO PARA ANÁLISE: "${context}" SAÍDA: Retorne APENAS o texto reescrito/corrigido.`;
        
        try {
            setStatus('ai', "IA Pensando...");
            const result = await gemini.generate({ contents: [{ parts: [{ text: prompt }] }] });
            
            if (result) {
                if (text.length > 3000) {
                     const prefix = text.slice(0, text.length - 3000);
                     ui.textarea.value = prefix + result;
                } else { 
                    ui.textarea.value = result; 
                }
                
                speechManager.updateContext(ui.textarea.value);
                saveToCache();
                updateCharCount();
                setStatus('success', "Feito!");
                setTimeout(() => setStatus(null), 2000);
            }
        } catch (error) {
            setStatus('error', "Erro IA");
        }
    };

    ui.btnAiFix.addEventListener('click', () => runAiTool("Corrija pontuação, crase e concordância mantendo o tom original."));
    ui.btnAiLegal.addEventListener('click', () => runAiTool("Reescreva em linguagem jurídica formal adequada para petições."));

    // 4. Upload de Arquivo
    ui.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        setStatus('ai', "Lendo Áudio...");
        
        reader.onloadend = async () => {
            try {
                const base64Data = reader.result.split(',')[1];
                const result = await gemini.generate({
                    contents: [{ parts: [
                        { text: "Transcreva este áudio em português do Brasil fielmente:" }, 
                        { inlineData: { mimeType: file.type, data: base64Data } }
                    ] }]
                });

                if (result) {
                    const sep = (ui.textarea.value) ? '\n\n' : '';
                    const newContent = ui.textarea.value + sep + result;
                    ui.textarea.value = newContent;
                    speechManager.updateContext(newContent);
                    saveToCache();
                    updateCharCount();
                    setStatus('success', "Transcrito!");
                }
            } catch (error) {
                setStatus('error', "Falha no Upload");
            }
            ui.fileInput.value = ''; 
        };
    });

    // 5. Utilitários (Copiar/Limpar)
    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const originalText = ui.btnCopy.querySelector('span').textContent;
            ui.btnCopy.querySelector('span').textContent = "Copiado!";
            setTimeout(() => { ui.btnCopy.querySelector('span').textContent = originalText; }, 2000);
        });
    });

    // BOTÃO LIMPAR: Confirmação removida conforme solicitado
    ui.btnClear.addEventListener('click', () => {
        if (ui.textarea.value.length === 0) return;
        
        ui.textarea.value = '';
        speechManager.updateContext('');
        saveToCache();
        updateCharCount();
        ui.textarea.focus();
        
        // Feedback visual rápido
        setStatus('success', "Limpo!");
        setTimeout(() => setStatus('idle'), 1500);
    });

    // 6. Docking / Janela
    function dockWindowBottomRight(targetWidth, targetHeight) {
        const screenLeft = window.screen.availLeft || 0;
        const screenTop = window.screen.availTop || 0;
        const posX = (screenLeft + window.screen.availWidth) - targetWidth - 10;
        const posY = (screenTop + window.screen.availHeight) - targetHeight - 10;

        try {
            window.resizeTo(targetWidth, targetHeight);
            window.moveTo(posX, posY);
        } catch (e) {
            console.warn("Resize bloqueado pelo navegador", e);
        }
    }

    ui.toggleSizeBtn.addEventListener('click', () => {
        ui.container.classList.toggle('minimized');
        const isMinimized = ui.container.classList.contains('minimized');
        
        if (isMinimized) {
            ui.iconMinimize.style.display = 'none';
            ui.iconMaximize.style.display = 'block';
            ui.toggleSizeBtn.title = "Expandir";
            dockWindowBottomRight(380, 300);
        } else {
            ui.iconMinimize.style.display = 'block';
            ui.iconMaximize.style.display = 'none';
            ui.toggleSizeBtn.title = "Compactar";
            dockWindowBottomRight(920, 800);
        }
        
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 350);
    });

    // =========================================================================
    // 7. CHANGELOG (NOVA FUNCIONALIDADE)
    // =========================================================================
    if (ui.versionBtn && ui.changelogModal) {
        // Abrir Modal
        ui.versionBtn.addEventListener('click', () => {
            // Renderiza a lista dinamicamente baseada nos dados importados
            ui.changelogList.innerHTML = changelogData.map(v => `
                <div class="version-item">
                    <div class="version-header">
                        <span class="v-num">v${v.version}</span>
                        <span class="v-date">${v.date}</span>
                    </div>
                    <ul class="v-changes">
                        ${v.changes.map(c => `<li>${c}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
            
            ui.changelogModal.style.display = 'flex';
        });

        // Fechar Modal (Botão X)
        ui.closeModalBtn.addEventListener('click', () => {
            ui.changelogModal.style.display = 'none';
        });

        // Fechar Modal (Clique fora)
        ui.changelogModal.addEventListener('click', (e) => {
            if (e.target === ui.changelogModal) {
                ui.changelogModal.style.display = 'none';
            }
        });
    }
});
