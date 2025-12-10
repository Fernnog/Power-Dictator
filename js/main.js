import { changelogData } from './changelog.js';
import { GeminiService } from './gemini-service.js';
import { SpeechManager } from './speech-manager.js';
import { CONFIG } from './config.js'; // Arquivo novo da v1.0.1
import { HotkeyManager } from './hotkeys.js'; // Arquivo novo da v1.0.1

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 0. INICIALIZAÇÃO DE UI & VARIAVEIS GLOBAIS
    // =========================================================================
    const latestVersion = changelogData[0] ? changelogData[0].version : '1.0.0';
    let tempBackupText = ''; // Backup para o Undo
    let undoTimeout = null;  // Timer do Toast

    const ui = {
        container: document.getElementById('appContainer'),
        toggleSizeBtn: document.getElementById('toggleSizeBtn'),
        iconMinimize: document.getElementById('iconMinimize'),
        iconMaximize: document.getElementById('iconMaximize'),
        versionBtn: document.getElementById('versionBtn'),
        
        // NOVO: Referência ao botão de Ajuda
        helpBtn: document.getElementById('helpBtn'),
        
        // Modais (Agora Universal)
        modal: document.getElementById('changelogModal'),
        modalList: document.getElementById('changelogList'),
        modalTitle: document.querySelector('.modal-header h2'), // Para alterar título dinamicamente
        closeModalBtn: document.getElementById('closeModalBtn'),
        
        // NOVO: Container de Toast
        toastContainer: document.getElementById('toastContainer'),

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

    if (ui.versionBtn) ui.versionBtn.textContent = `v${latestVersion}`;

    // Helper de Status
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
            case 'warning': ui.statusMsg.classList.add('status-warning'); break;
        }
    }

    // =========================================================================
    // 1. SISTEMA DE AJUDA & MODAIS (PRIORIDADE)
    // =========================================================================
    
    // Conteúdo HTML da Tabela de Ajuda
    const helpContentHTML = `
        <div class="help-section">
            <p style="color: #666; margin-bottom: 1.5rem;">
                Domine o Ditado Digital com atalhos de teclado para máxima velocidade.
            </p>
            <table class="help-table">
                <thead>
                    <tr>
                        <th>Ação</th>
                        <th>Atalho</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><span class="help-desc">🎤 Gravar / Parar</span></td>
                        <td><kbd>Alt</kbd> + <kbd>G</kbd></td>
                    </tr>
                    <tr>
                        <td><span class="help-desc">🧹 Limpar Texto</span></td>
                        <td><kbd>Alt</kbd> + <kbd>L</kbd></td>
                    </tr>
                    <tr>
                        <td><span class="help-desc">📋 Copiar Tudo</span></td>
                        <td><kbd>Alt</kbd> + <kbd>C</kbd></td>
                    </tr>
                    <tr>
                        <td><span class="help-desc">↩️ Desfazer Limpeza</span></td>
                        <td><kbd>Alt</kbd> + <kbd>Z</kbd></td>
                    </tr>
                </tbody>
            </table>
            <div style="margin-top: 2rem; padding: 1rem; background: #f9fafb; border-radius: 8px;">
                <strong style="display:block; margin-bottom:0.5rem; font-size:0.9rem;">Dicas Pro:</strong>
                <ul style="font-size: 0.85rem; color: #4b5563; padding-left: 1.2rem; margin:0;">
                    <li style="margin-bottom:4px">Use <strong>Win + Ctrl + T</strong> (PowerToys) para fixar janela no topo.</li>
                    <li>O texto é salvo automaticamente no seu navegador.</li>
                </ul>
            </div>
        </div>
    `;

    // Listener: Abrir Ajuda
    if (ui.helpBtn) {
        ui.helpBtn.addEventListener('click', () => {
            ui.modalTitle.textContent = "Central de Ajuda";
            ui.modalList.innerHTML = helpContentHTML;
            ui.modal.style.display = 'flex';
        });
    }

    // Listener: Abrir Changelog
    if (ui.versionBtn) {
        ui.versionBtn.addEventListener('click', () => {
            ui.modalTitle.textContent = "Histórico de Versões";
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

    // Fechar Modal
    if (ui.closeModalBtn) {
        ui.closeModalBtn.addEventListener('click', () => ui.modal.style.display = 'none');
    }
    window.addEventListener('click', (e) => {
        if (e.target === ui.modal) ui.modal.style.display = 'none';
    });

    // =========================================================================
    // 2. LÓGICA DE UNDO / REDE DE SEGURANÇA (Necessário para a Ajuda fazer sentido)
    // =========================================================================
    const performUndo = () => {
        if (!tempBackupText) return;
        ui.textarea.value = tempBackupText;
        speechManager.updateContext(tempBackupText);
        saveToCache();
        updateCharCount();
        ui.toastContainer.innerHTML = ''; 
        setStatus('success', 'Restaurado!');
    };

    const showUndoToast = () => {
        ui.toastContainer.innerHTML = `
            <div class="toast">
                <span>Texto apagado.</span>
                <button id="undoBtn" class="btn-undo">Desfazer (Alt+Z)</button>
            </div>
        `;
        document.getElementById('undoBtn').onclick = performUndo;
        
        if (undoTimeout) clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            ui.toastContainer.innerHTML = '';
            tempBackupText = ''; 
        }, CONFIG.UI.TOAST_DURATION || 5000);
    };

    const handleClearAction = () => {
        if (!ui.textarea.value) return;
        tempBackupText = ui.textarea.value; 
        ui.textarea.value = '';
        speechManager.updateContext('');
        saveToCache();
        updateCharCount();
        ui.textarea.focus();
        showUndoToast(); 
    };

    // Sobrescreve Listener Original de Limpar
    // Clonagem para remover listener antigo v1.0.0
    const oldClearBtn = ui.btnClear;
    const newClearBtn = oldClearBtn.cloneNode(true);
    oldClearBtn.parentNode.replaceChild(newClearBtn, oldClearBtn);
    ui.btnClear = newClearBtn; // Atualiza referência
    ui.btnClear.addEventListener('click', handleClearAction);

    // Inicializar Gerenciador de Atalhos (v1.0.1)
    new HotkeyManager(ui, {
        triggerClear: handleClearAction,
        triggerUndo: performUndo
    });

    // =========================================================================
    // 3. CORE SERVICES (Audio, AI, Persistência)
    // =========================================================================
    const gemini = new GeminiService();
    let isMachineTyping = false;

    // Callbacks do SpeechManager
    const handleSpeechResult = (finalText, interimText) => {
        isMachineTyping = true;
        ui.textarea.value = finalText + interimText;
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
        updateCharCount();
        if (!interimText) saveToCache();
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

    // Gerenciamento de Dispositivos e Cache
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

            const savedMic = localStorage.getItem(CONFIG.STORAGE_KEYS.MIC);
            if (savedMic) {
                const exists = Array.from(ui.audioSelect.options).some(opt => opt.value === savedMic);
                if (exists) {
                    ui.audioSelect.value = savedMic;
                    speechManager.setDeviceId(savedMic);
                }
            }
        } catch (e) {
            console.warn("Dispositivos não listados:", e);
        }
    }
    loadAudioDevices();

    if (ui.audioSelect) {
        ui.audioSelect.addEventListener('change', () => {
            if (speechManager.isRecording) {
                alert("Pare a gravação antes de trocar o microfone.");
                return;
            }
            const selectedMic = ui.audioSelect.value;
            speechManager.setDeviceId(selectedMic);
            localStorage.setItem(CONFIG.STORAGE_KEYS.MIC, selectedMic);
        });
    }

    // Funções de Cache
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

    // Eventos de Interface Restantes
    ui.micBtn.addEventListener('click', () => speechManager.toggle(ui.textarea.value));

    ui.textarea.addEventListener('input', () => {
        if (isMachineTyping) return;
        ui.saveStatus.textContent = "Digitando...";
        updateCharCount();
        speechManager.updateContext(ui.textarea.value);
        saveToCache();
    });

    // Funções IA e Upload
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

    ui.btnCopy.addEventListener('click', () => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            const originalText = ui.btnCopy.querySelector('span').textContent;
            ui.btnCopy.querySelector('span').textContent = "Copiado!";
            setTimeout(() => { ui.btnCopy.querySelector('span').textContent = originalText; }, 2000);
        });
    });

    // Window Docking (Widget Mode)
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
});
