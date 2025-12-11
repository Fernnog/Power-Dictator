import { SpeechManager } from './speech-manager.js';
import { aiService } from './gemini-service.js';
import { changelogData, currentVersion } from './changelog.js';
import Glossary from './glossary.js';
import { CONFIG } from './config.js';

// ========================================================
// 1. REFERÊNCIAS DE UI (DOM Elements)
// ========================================================
const ui = {
    // Área Principal
    textarea: document.getElementById('transcriptionArea'),
    charCount: document.getElementById('charCount'),
    saveStatus: document.getElementById('saveStatus'),
    statusMsg: document.getElementById('statusMsg'),
    
    // Controles Principais
    micBtn: document.getElementById('micBtn'),
    audioSource: document.getElementById('audioSource'),
    fileInput: document.getElementById('fileInput'),
    
    // Botões de Ação
    btnUpload: document.querySelector('.btn-upload'),
    btnAiFix: document.getElementById('aiFixBtn'),
    btnAiLegal: document.getElementById('aiLegalBtn'),
    btnCopy: document.getElementById('copyBtn'),
    btnClear: document.getElementById('clearBtn'),
    
    // Modais e Auxiliares
    toggleSizeBtn: document.getElementById('toggleSizeBtn'),
    container: document.getElementById('appContainer'),
    versionBtn: document.getElementById('versionBtn'),
    helpBtn: document.getElementById('helpBtn'),
    changelogModal: document.getElementById('changelogModal'),
    changelogList: document.getElementById('changelogList'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    toastContainer: document.getElementById('toastContainer'),

    // Glossário UI
    glossaryBtn: document.getElementById('glossaryBtn'),
    glossaryModal: document.getElementById('glossaryModal'),
    closeGlossaryBtn: document.getElementById('closeGlossaryBtn'),
    glossaryList: document.getElementById('glossaryList'),
    termInput: document.getElementById('termInput'),
    replaceInput: document.getElementById('replaceInput'),
    addTermBtn: document.getElementById('addTermBtn')
};

// Variáveis de Estado
let undoTimeout = null;
let tempDeletedText = '';
let wakeLock = null;

// ========================================================
// 2. MÓDULO GLOSSÁRIO (Instância)
// ========================================================

// Instancia o Glossário passando a função de renderização como callback
const glossaryManager = new Glossary((terms) => {
    if (!ui.glossaryList) return;
    ui.glossaryList.innerHTML = '';
    
    if (terms.length === 0) {
        ui.glossaryList.innerHTML = '<p style="color:#9ca3af; text-align:center;">Nenhum termo cadastrado.</p>';
        return;
    }

    terms.forEach((term, index) => {
        const div = document.createElement('div');
        div.className = 'glossary-item';
        div.innerHTML = `
            <span><strong>${term.from}</strong> ➝ ${term.to}</span>
            <button class="btn-delete-term" data-index="${index}">&times;</button>
        `;
        ui.glossaryList.appendChild(div);
    });

    // Re-adiciona listeners para os botões de delete
    document.querySelectorAll('.btn-delete-term').forEach(btn => {
        btn.addEventListener('click', (e) => {
            glossaryManager.remove(parseInt(e.target.dataset.index));
        });
    });
});

// ========================================================
// 3. WAKE LOCK (MODO INSÔNIA)
// ========================================================

const toggleWakeLock = async (shouldLock) => {
    if ('wakeLock' in navigator) {
        try {
            if (shouldLock && !wakeLock) {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock ativo: Tela não desligará.');
            } else if (!shouldLock && wakeLock) {
                await wakeLock.release();
                wakeLock = null;
                console.log('Wake Lock liberado.');
            }
        } catch (err) {
            console.warn('Wake Lock não disponível ou bloqueado:', err);
        }
    }
};

// Recupera o Wake Lock se a aba perder e recuperar a visibilidade
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
    }
});

// ========================================================
// 4. FLUXO SEGURO (AUTO-STOP)
// ========================================================

const executeSafely = async (actionCallback) => {
    if (speechManager && speechManager.isRecording) {
        speechManager.stop();
        toggleWakeLock(false); // Libera a tela
        
        // Feedback visual
        const originalColor = ui.micBtn.style.backgroundColor;
        ui.micBtn.style.backgroundColor = '#f59e0b';
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        ui.micBtn.style.backgroundColor = '';
    }
    actionCallback();
};

// ========================================================
// 5. GERENCIAMENTO DE ÁUDIO & DISPOSITIVOS
// ========================================================

const handleTranscriptionResult = (finalText, interimText) => {
    if (finalText) {
        // Usa o método da classe importada
        const processedText = glossaryManager.process(finalText);
        
        const start = ui.textarea.selectionStart;
        const end = ui.textarea.selectionEnd;
        const text = ui.textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        
        const prefix = (before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n')) ? ' ' : '';
        
        ui.textarea.value = before + prefix + processedText + after;
        
        const newCursorPos = start + prefix.length + processedText.length;
        ui.textarea.setSelectionRange(newCursorPos, newCursorPos);
        
        saveContent();
        updateCharCount();
    }
};

const updateStatus = (status) => {
    ui.statusMsg.className = 'status-bar'; 
    
    if (status === 'recording') {
        ui.statusMsg.textContent = "GRAVANDO";
        ui.statusMsg.classList.add('active', 'status-recording');
        ui.micBtn.classList.add('recording');
    } else if (status === 'processing') {
        ui.statusMsg.textContent = "PROCESSANDO IA...";
        ui.statusMsg.classList.add('active', 'status-ai');
    } else if (status === 'error') {
        ui.statusMsg.textContent = "ERRO / MICROFONE BLOQUEADO";
        ui.statusMsg.classList.add('active', 'status-error');
        ui.micBtn.classList.remove('recording');
        toggleWakeLock(false); // Garante liberação em erro
    } else {
        ui.statusMsg.textContent = "";
        ui.statusMsg.classList.remove('active');
        ui.micBtn.classList.remove('recording');
    }
};

// Instancia o Gerenciador de Áudio
const speechManager = new SpeechManager('audioVisualizer', handleTranscriptionResult, updateStatus);

// Inicializa o Seletor de Dispositivos (Persistente)
async function initDeviceSelector() {
    const populateSelector = (devices) => {
        ui.audioSource.innerHTML = '';
        
        // Opção Default
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'default';
        defaultOpt.text = 'Padrão do Sistema';
        ui.audioSource.appendChild(defaultOpt);
        
        // Recupera ID salvo
        const savedId = localStorage.getItem(CONFIG.STORAGE_KEYS.MIC);

        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            // Fallback visual para labels vazios
            option.text = device.label || `Microfone USB/Interno (${device.deviceId.slice(0,5)}...)`;
            
            if (device.deviceId === savedId) {
                option.selected = true;
            }
            ui.audioSource.appendChild(option);
        });

        // Aplica o ID salvo no speechManager se existir
        if (savedId) {
            speechManager.setDeviceId(savedId);
        }
    };

    // 1. Carga Inicial
    const devices = await speechManager.getAudioDevices();
    populateSelector(devices);

    // 2. Listener para mudanças de hardware (Plug & Play)
    speechManager.listenToDeviceChanges((updatedDevices) => {
        populateSelector(updatedDevices);
    });

    // 3. Listener para salvar preferência do usuário
    ui.audioSource.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        speechManager.setDeviceId(selectedId);
        localStorage.setItem(CONFIG.STORAGE_KEYS.MIC, selectedId);
        
        // Feedback visual
        ui.audioSource.style.borderColor = '#4f46e5';
        setTimeout(() => ui.audioSource.style.borderColor = '', 300);
    });
}

// ========================================================
// 6. EVENT LISTENERS & AÇÕES
// ========================================================

// Botão Gravar (Toggle + Wake Lock)
ui.micBtn.addEventListener('click', () => {
    if (speechManager.isRecording) {
        speechManager.stop();
        toggleWakeLock(false);
    } else {
        speechManager.start();
        toggleWakeLock(true);
    }
});

// Botão Upload (Aviso)
ui.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        executeSafely(() => {
            alert("Upload de áudio para transcrição offline requer processamento server-side pesado.\n\nNa versão Client-Side, suportamos apenas leitura de arquivos .txt para edição.");
        });
    }
});

// Botão Corrigir Gramática (AI)
ui.btnAiFix.addEventListener('click', () => {
    const text = ui.textarea.value.trim();
    if (!text) return alert("Digite ou dite algo primeiro.");

    executeSafely(async () => {
        updateStatus('processing');
        try {
            const result = await aiService.fixGrammar(text);
            ui.textarea.value = result;
            saveContent();
            updateStatus('success'); 
        } catch (error) {
            alert("Erro na IA: " + error.message);
            updateStatus('error');
        } finally {
            setTimeout(() => updateStatus('idle'), 2000);
        }
    });
});

// Botão Jurídico (AI)
ui.btnAiLegal.addEventListener('click', () => {
    const text = ui.textarea.value.trim();
    if (!text) return alert("Digite ou dite algo primeiro.");

    executeSafely(async () => {
        updateStatus('processing');
        try {
            const result = await aiService.convertToLegal(text);
            ui.textarea.value = result;
            saveContent();
            updateStatus('success');
        } catch (error) {
            alert("Erro na IA: " + error.message);
            updateStatus('error');
        } finally {
            setTimeout(() => updateStatus('idle'), 2000);
        }
    });
});

// Botão Copiar
ui.btnCopy.addEventListener('click', () => {
    executeSafely(() => {
        ui.textarea.select();
        document.execCommand('copy'); 
        navigator.clipboard.writeText(ui.textarea.value);
        
        const originalText = ui.btnCopy.querySelector('span').textContent;
        ui.btnCopy.querySelector('span').textContent = "Copiado!";
        ui.btnCopy.classList.add('status-success');
        
        setTimeout(() => {
            ui.btnCopy.querySelector('span').textContent = originalText;
            ui.btnCopy.classList.remove('status-success');
        }, 2000);
    });
});

// Botão Limpar com Undo (Toast)
ui.btnClear.addEventListener('click', () => {
    executeSafely(() => handleClearAction());
});

function handleClearAction() {
    if (!ui.textarea.value) return;

    tempDeletedText = ui.textarea.value;
    ui.textarea.value = '';
    saveContent();
    updateCharCount();

    showUndoToast();
}

function showUndoToast() {
    ui.toastContainer.innerHTML = '';
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span>Texto limpo.</span>
        <button id="undoBtn" class="btn-undo">Desfazer (Alt+Z)</button>
    `;
    
    ui.toastContainer.appendChild(toast);

    document.getElementById('undoBtn').addEventListener('click', performUndo);

    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
        tempDeletedText = ''; 
    }, 5000);
}

function performUndo() {
    if (tempDeletedText) {
        ui.textarea.value = tempDeletedText;
        saveContent();
        updateCharCount();
        ui.toastContainer.innerHTML = ''; 
        tempDeletedText = '';
        if (undoTimeout) clearTimeout(undoTimeout);
    }
}

// ========================================================
// 7. UTILITÁRIOS & PERSISTÊNCIA
// ========================================================

function updateCharCount() {
    const count = ui.textarea.value.length;
    ui.charCount.textContent = `${count} caracteres`;
}

function saveContent() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TEXT, ui.textarea.value);
    ui.saveStatus.textContent = "Salvo agora";
    setTimeout(() => ui.saveStatus.textContent = "Sincronizado", 2000);
}

function loadContent() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.TEXT);
    if (saved) {
        ui.textarea.value = saved;
        updateCharCount();
    }
}

ui.toggleSizeBtn.addEventListener('click', () => {
    ui.container.classList.toggle('minimized');
    const isMin = ui.container.classList.contains('minimized');
    
    document.getElementById('iconMinimize').style.display = isMin ? 'none' : 'block';
    document.getElementById('iconMaximize').style.display = isMin ? 'block' : 'none';
});

// ========================================================
// 8. MODAIS
// ========================================================

ui.versionBtn.addEventListener('click', () => {
    renderChangelog();
    ui.changelogModal.style.display = 'flex';
});

ui.closeModalBtn.addEventListener('click', () => {
    ui.changelogModal.style.display = 'none';
});

function renderChangelog() {
    ui.changelogList.innerHTML = changelogData.map(item => `
        <div class="version-item">
            <div class="version-header">
                <span class="v-num">v${item.version}</span>
                <span class="v-date">${item.date}</span>
            </div>
            <ul class="v-changes">
                ${item.changes.map(c => `<li>${c}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

// Lógica de Glossário (Listeners)
if (ui.glossaryBtn && ui.glossaryModal) {
    ui.glossaryBtn.addEventListener('click', () => {
        // Renderiza com os termos atuais do manager
        glossaryManager.renderCallback(glossaryManager.getTerms());
        ui.glossaryModal.style.display = 'flex';
    });
    
    ui.closeGlossaryBtn.addEventListener('click', () => {
        ui.glossaryModal.style.display = 'none';
    });
    
    ui.addTermBtn.addEventListener('click', () => {
        glossaryManager.add(ui.termInput.value, ui.replaceInput.value);
        ui.termInput.value = '';
        ui.replaceInput.value = '';
    });
}

window.addEventListener('click', (e) => {
    if (e.target === ui.changelogModal) ui.changelogModal.style.display = 'none';
    if (e.target === ui.glossaryModal) ui.glossaryModal.style.display = 'none';
});

// ========================================================
// 9. ATALHOS DE TECLADO
// ========================================================
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.code === 'KeyG') {
        e.preventDefault();
        ui.micBtn.click();
    }
    if (e.altKey && e.code === 'KeyL') {
        e.preventDefault();
        executeSafely(() => handleClearAction());
    }
    if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        ui.btnCopy.click();
    }
    if (e.altKey && e.code === 'KeyZ') {
        e.preventDefault();
        performUndo();
    }
});

// ========================================================
// 10. INICIALIZAÇÃO
// ========================================================
window.addEventListener('DOMContentLoaded', () => {
    loadContent();
    ui.versionBtn.textContent = `v${currentVersion}`;
    initDeviceSelector();
    
    window.speechManager = speechManager;
});
