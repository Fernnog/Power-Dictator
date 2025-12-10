import { CONFIG } from './config.js';
import { changelogData } from './changelog.js';
import { GeminiService } from './gemini-service.js';
import { SpeechManager } from './speech-manager.js';
import { HotkeyManager } from './hotkeys.js';

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 0. INICIALIZAÇÃO DE VERSÃO E DADOS
    // =========================================================================
    // Nota: Mantemos o fallback para 1.0.0 caso o changelog não tenha a 1.0.1 ainda
    const latestVersion = changelogData[0] ? changelogData[0].version : '1.0.1';
    
    // UI REFERÊNCIAS
    const ui = {
        container: document.getElementById('appContainer'),
        toggleSizeBtn: document.getElementById('toggleSizeBtn'),
        iconMinimize: document.getElementById('iconMinimize'),
        iconMaximize: document.getElementById('iconMaximize'),
        versionBtn: document.getElementById('versionBtn'),
        
        // Modais e Toasts
        modal: document.getElementById('changelogModal'),
        modalList: document.getElementById('changelogList'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        toastContainer: document.getElementById('toastContainer'), // Novo container para Toast

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
        fileInput: document.getElementById('fileInput')
    };

    // Define a versão no botão da UI dinamicamente
    if (ui.versionBtn) ui.versionBtn.textContent = `v${latestVersion}`;

    // =========================================================================
    // 1. HELPER: STATUS BAR
    // =========================================================================
    function setStatus(type, message) {
        ui.statusMsg.className = 'status-bar'; // Reset classes
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
            case 'warning': ui.statusMsg.classList.add('status-warning'); break;
        }
    }

    // =========================================================================
    // 2. LOGICA DO CHANGELOG
    // =========================================================================
    if (ui.versionBtn) {
        ui.versionBtn.addEventListener('click', () => {
            ui.modalList.innerHTML = changelogData.map(v => `
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
            ui.modal.style.display = 'flex';
        });
    }

    if (ui.closeModalBtn) {
        ui.closeModalBtn.addEventListener('click', () => {
            ui.modal.style.display = 'none';
        });
    }

    // Fecha modal ao clicar fora
    window.addEventListener('click', (e) => {
        if (e.target === ui.modal) ui.modal.style.display = 'none';
    });

    // =========================================================================
    // 3. INSTANCIAÇÃO DOS SERVIÇOS
    // =========================================================================
    const gemini = new GeminiService();
    let isMachineTyping = false;

    // Callbacks do SpeechManager
    const handleSpeechResult = (finalText, interimText) => {
        isMachineTyping = true;
        ui.textarea.value = finalText + interimText;
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
        updateCharCount();
        
        if (!interimText) {
            saveToCache();
        }
        
        // Pequeno delay para liberar a flag e evitar conflito com evento de input manual
        setTimeout(() => { isMachineTyping = false; }, 50);
    };

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

    const handleSignalQuality = (quality) => {
        if (quality === 'weak' && speechManager.isRecording) {
            setStatus('warning', "Fale mais perto 🎤");
        }
    };

    const speechManager = new SpeechManager(
        ui.canvas, 
        { 
            onResult: handleSpeechResult, 
            onStatus: handleSpeechStatus,
            onError: handleSpeechError,
            onSignalQuality: handleSignalQuality
        }
    );

    // =========================================================================
    // 4. DISPOSITIVOS DE ÁUDIO (Com Persistência)
    // =========================================================================
    async function loadAudioDevices() {
        if (!ui.audioSelect) return;

        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            
            ui.audioSelect.innerHTML = ''; 
            
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default';
            defaultOption.text = 'Padrão do Sistema';
            ui.audioSelect.appendChild(defaultOption);

            audioInputs.forEach(device => {
                if (device.deviceId !== 'default' && device.deviceId !== 'communications') {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.text = device.label || `Microfone ${ui.audioSelect.length}`;
                    ui.audioSelect.appendChild(option);
                }
            });

            // Restaura preferência salva usando CONFIG
            const savedMic = localStorage.getItem(CONFIG.STORAGE_KEYS.MIC);
            if (savedMic) {
                const exists = Array.from(ui.audioSelect.options).some(opt => opt.value === savedMic);
                if (exists) {
                    ui.audioSelect.value = savedMic;
                    speechManager.setDeviceId(savedMic);
                }
            }

        } catch (e) {
            console.warn("Não foi possível listar dispositivos:", e);
        }
    }

    loadAudioDevices();

    if (ui.audioSelect) {
        ui.audioSelect.addEventListener('change', () => {
            if (speechManager.isRecording) {
                alert("Por favor, pare a gravação antes de trocar o microfone.");
                return;
            }
            const selectedMic = ui.audioSelect.value;
            speechManager.setDeviceId(selectedMic);
            localStorage.setItem(CONFIG.STORAGE_KEYS.MIC, selectedMic); 
        });
    }

    // =========================================================================
    // 5. GERENCIAMENTO DE DADOS (CACHE)
    // =========================================================================
    function saveToCache() {
        localStorage.setItem(CONFIG.STORAGE_KEYS.TEXT, ui.textarea.value);
        ui.saveStatus.textContent = "Salvo";
        ui.saveStatus.style.color = "var(--c-copy)";
    }

    function loadFromCache() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.TEXT);
        if (saved) {
            ui.textarea.value = saved;
            speechManager.updateContext(saved);
            updateCharCount();
        }
    }

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }

    loadFromCache();

    // =========================================================================
    // 6. LÓGICA DE SEGURANÇA (UNDO / DESFAZER) - NOVO v1.0.1
    // =========================================================================
    let tempBackupText = '';
    let undoTimeout = null;

    const showUndoToast = () => {
        if (!ui.toastContainer) return;

        ui.toastContainer.innerHTML = `
            <div class="toast">
                <span>Texto apagado.</span>
                <button id="undoBtn" class="btn-undo">Desfazer (Alt+Z)</button>
            </div>
        `;
        
        // Adiciona evento ao botão criado dinamicamente
        const btnUndoDOM = document.getElementById('undoBtn');
        if (btnUndoDOM) btnUndoDOM.onclick = performUndo;
        
        // Timer de auto-fechamento
        if (undoTimeout) clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            ui.toastContainer.innerHTML = '';
            tempBackupText = ''; // Limpa backup por segurança
        }, CONFIG.UI.TOAST_DURATION);
    };

    const performUndo = () => {
        if (!tempBackupText) return;
        ui.textarea.value = tempBackupText;
        speechManager.updateContext(tempBackupText);
        saveToCache();
        updateCharCount();
        
        if (ui.toastContainer) ui.toastContainer.innerHTML = ''; // Fecha toast
        
        setStatus('success', 'Restaurado!');
        tempBackupText = ''; // Reseta backup para evitar reuso
    };

    const handleClearAction = () => {
        if (!ui.textarea.value) return;
        tempBackupText = ui.textarea.value; // Salva estado
        ui.textarea.value = '';
        speechManager.updateContext('');
        saveToCache();
        updateCharCount();
        ui.textarea.focus();
        showUndoToast(); // Exibe a rede de segurança
    };

    // =========================================================================
    // 7. EVENTOS DE INTERFACE
    // =========================================================================

    // Microfone
    ui.micBtn.addEventListener('click', () => {
        speechManager.toggle(ui.textarea.value);
    });

    // Edição Manual
    ui.textarea.addEventListener('input', () => {
        if (isMachineTyping) return;
        ui.saveStatus.textContent = "Digitando...";
        updateCharCount();
        speechManager.updateContext(ui.textarea.value);
        saveToCache();
    });

    // IA (Gemini) - Wrapper Genérico
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

    // Upload Multimodal
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

    // Copiar
    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const originalText = ui.btnCopy.querySelector('span').textContent;
            ui.btnCopy.querySelector('span').textContent = "Copiado!";
            setTimeout(() => { ui.btnCopy.querySelector('span').textContent = originalText; }, 2000);
        });
    });

    // Limpar (SUBSTITUÍDO PELA NOVA LÓGICA SAFE)
    ui.btnClear.addEventListener('click', handleClearAction);

    // Widget Mode / Docking
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
    // 8. GERENCIAMENTO DE ATALHOS (HOTKEYS) - NOVO v1.0.1
    // =========================================================================
    new HotkeyManager(ui, {
        triggerRec: () => ui.micBtn.click(), // Dispara o clique no botão para manter feedback visual
        triggerClear: handleClearAction,     // Usa a função segura com Undo
        triggerCopy: () => ui.btnCopy.click(),
        triggerUndo: performUndo
    });
});
