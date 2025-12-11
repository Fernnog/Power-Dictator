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

    // Glossário
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

// ========================================================
// 2. WAKE LOCK (Modo Insônia)
// ========================================================
let wakeLock = null;
const toggleWakeLock = async (shouldLock) => {
    if ('wakeLock' in navigator) {
        try {
            if (shouldLock && !wakeLock) {
                wakeLock = await navigator.wakeLock.request('screen');
            } else if (!shouldLock && wakeLock) {
                await wakeLock.release();
                wakeLock = null;
            }
        } catch (err) {
            console.warn('Wake Lock não disponível:', err);
        }
    }
};

// Recupera o lock se a aba perder e recuperar visibilidade
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
    }
});

// ========================================================
// 3. GLOSSÁRIO (Instanciação do Módulo)
// ========================================================
const glossaryManager = new Glossary((terms) => {
    // Callback de renderização
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
            <span class="term-pair">
                <span class="term-from">${term.from}</span>
                <span class="term-arrow">➜</span>
                <span class="term-to">${term.to}</span>
            </span>
            <button class="btn-delete-term" data-index="${index}">&times;</button>
        `;
        ui.glossaryList.appendChild(div);
    });

    // Event listeners para deletar
    document.querySelectorAll('.btn-delete-term').forEach(btn => {
        btn.addEventListener('click', (e) => {
            glossaryManager.remove(parseInt(e.target.dataset.index));
        });
    });
});

// ========================================================
// 4. AUTO-STOP & SEGURANÇA
// ========================================================
const executeSafely = async (actionCallback) => {
    if (speechManager && speechManager.isRecording) {
        speechManager.stop();
        toggleWakeLock(false);
        
        // Feedback visual
        const originalColor = ui.micBtn.style.backgroundColor;
        ui.micBtn.style.backgroundColor = '#f59e0b'; // Amber warning
        
        await new Promise(resolve => setTimeout(resolve, 300));
        ui.micBtn.style.backgroundColor = '';
    }
    actionCallback();
};

// ========================================================
// 5. CALLBACKS DO SPEECH MANAGER
// ========================================================
const handleTranscriptionResult = (finalText, interimText) => {
    if (finalText) {
        // Processa texto com Glossário
        const processedText = glossaryManager.process(finalText);
        
        // Insere no cursor
        const start = ui.textarea.selectionStart;
        const end = ui.textarea.selectionEnd;
        const text = ui.textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        
        // Adiciona espaço inteligente
        const prefix = (before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n')) ? ' ' : '';
        
        ui.textarea.value = before + prefix + processedText + after;
        
        // Move cursor
        const newCursorPos = start + prefix.length + processedText.length;
        ui.textarea.setSelectionRange(newCursorPos, newCursorPos);
        
        saveContent();
        updateCharCount();
    }
};

const updateStatus = (status) => {
    ui.statusMsg.className = 'status-bar'; // Reset
    
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
        toggleWakeLock(false);
    } else {
        ui.statusMsg.textContent = "";
        ui.statusMsg.classList.remove('active');
        ui.micBtn.classList.remove('recording');
    }
};

const speechManager = new SpeechManager('audioVisualizer', handleTranscriptionResult, updateStatus);

// ========================================================
// 6. SELETOR DE DISPOSITIVOS (Com Persistência)
// ========================================================
async function initDeviceSelector() {
    const populate = (devices) => {
        ui.audioSource.innerHTML = '<option value="default">Padrão do Sistema</option>';
        const savedId = localStorage.getItem(CONFIG.STORAGE_KEYS.MIC);
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microfone (${device.deviceId.slice(0,5)}...)`;
            if (device.deviceId === savedId) option.selected = true;
            ui.audioSource.appendChild(option);
        });
        
        if (savedId) speechManager.setDeviceId(savedId);
    };

    // 1. Carrega inicial
    const devices = await speechManager.getAudioDevices();
    populate(devices);

    // 2. Listener de Hotplug (USB conecta/desconecta)
    speechManager.listenToDeviceChanges((updatedDevices) => populate(updatedDevices));

    // 3. Salva preferência
    ui.audioSource.addEventListener('change', (e) => {
        const val = e.target.value;
        speechManager.setDeviceId(val);
        localStorage.setItem(CONFIG.STORAGE_KEYS.MIC, val);
        
        ui.audioSource.style.borderColor = '#4f46e5';
        setTimeout(() => ui.audioSource.style.borderColor = '', 300);
    });
}

// ========================================================
// 7. EVENT LISTENERS
// ========================================================

// Botão Gravar
ui.micBtn.addEventListener('click', () => {
    if (speechManager.isRecording) {
        speechManager.stop();
        toggleWakeLock(false);
    } else {
        speechManager.start();
        toggleWakeLock(true);
    }
});

// Upload
ui.fileInput.addEventListener('change', () => {
    executeSafely(() => {
        alert("Upload de áudio requer backend. Suporte apenas para arquivos de texto no momento.");
    });
});

// IA: Gramática
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

// IA: Jurídico
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

// Copiar
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

// Limpar com Undo
ui.btnClear.addEventListener('click', () => executeSafely(() => handleClearAction()));

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
    toast.innerHTML = `<span>Texto limpo.</span><button id="undoBtn" class="btn-undo">Desfazer (Alt+Z)</button>`;
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
// 8. REDIMENSIONAMENTO DE JANELA (Widget Mode)
// ========================================================
ui.toggleSizeBtn.addEventListener('click', () => {
    ui.container.classList.toggle('minimized');
    const isMin = ui.container.classList.contains('minimized');
    
    // Troca ícones
    document.getElementById('iconMinimize').style.display = isMin ? 'none' : 'block';
    document.getElementById('iconMaximize').style.display = isMin ? 'block' : 'none';
    
    // Dimensões Alvo (Normal vs Widget Compacto)
    const targetWidth = isMin ? 380 : 920; 
    const targetHeight = isMin ? 120 : 800;

    // Se estiver rodando como popup (janela independente)
    if (window.outerWidth) {
        try {
            const screenLeft = window.screen.availLeft || 0;
            const screenTop = window.screen.availTop || 0;
            const screenW = window.screen.availWidth;
            const screenH = window.screen.availHeight;

            // Calcula posição: Canto Inferior Direito com margem
            const left = (screenLeft + screenW) - targetWidth - 20;
            const top = (screenTop + screenH) - targetHeight - 20;

            window.resizeTo(targetWidth, targetHeight);
            window.moveTo(left, top);
        } catch (e) {
            console.warn("Navegador bloqueou resizeTo.", e);
        }
    }
});

// ========================================================
// 9. AUXILIARES & STARTUP
// ========================================================
function updateCharCount() {
    ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
}

function saveContent() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TEXT, ui.textarea.value);
    ui.saveStatus.textContent = "Salvo";
    setTimeout(() => ui.saveStatus.textContent = "Sincronizado", 2000);
}

function loadContent() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.TEXT);
    if (saved) {
        ui.textarea.value = saved;
        updateCharCount();
    }
}

// Modais (Versão / Glossário)
ui.versionBtn.addEventListener('click', () => {
    renderChangelog();
    ui.changelogModal.style.display = 'flex';
});
ui.closeModalBtn.addEventListener('click', () => ui.changelogModal.style.display = 'none');

function renderChangelog() {
    ui.changelogList.innerHTML = changelogData.map(item => `
        <div class="version-item">
            <div class="version-header"><span class="v-num">v${item.version}</span><span class="v-date">${item.date}</span></div>
            <ul class="v-changes">${item.changes.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
    `).join('');
}

// Glossário Modal
if (ui.glossaryBtn && ui.glossaryModal) {
    ui.glossaryBtn.addEventListener('click', () => {
        glossaryManager.renderCallback(glossaryManager.getTerms()); // Força render
        ui.glossaryModal.style.display = 'flex';
    });
    ui.closeGlossaryBtn.addEventListener('click', () => ui.glossaryModal.style.display = 'none');
    ui.addTermBtn.addEventListener('click', () => {
        glossaryManager.add(ui.termInput.value, ui.replaceInput.value);
        ui.termInput.value = '';
        ui.replaceInput.value = '';
    });
}

// Atalhos Globais
document.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.code === 'KeyG') { e.preventDefault(); ui.micBtn.click(); }
    if (e.code === 'KeyL') { e.preventDefault(); executeSafely(() => handleClearAction()); }
    if (e.code === 'KeyC') { e.preventDefault(); ui.btnCopy.click(); }
    if (e.code === 'KeyZ') { e.preventDefault(); performUndo(); }
});

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    loadContent();
    ui.versionBtn.textContent = `v${currentVersion}`;
    initDeviceSelector();
});
