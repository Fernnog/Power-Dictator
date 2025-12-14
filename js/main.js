import { SpeechManager } from './speech-manager.js';
import { aiService } from './gemini-service.js';
import { changelogData, currentVersion } from './changelog.js';
import Glossary from './glossary.js';
import { CONFIG } from './config.js';
import { HotkeyManager } from './hotkeys.js';

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

    document.querySelectorAll('.btn-delete-term').forEach(btn => {
        btn.addEventListener('click', (e) => {
            glossaryManager.remove(parseInt(e.target.dataset.index));
        });
    });
});

// ========================================================
// 4. AUXILIARES VISUAIS & SEGURANÇA
// ========================================================

const stopVisualEffects = () => {
    [ui.micBtn, ui.btnAiLegal, ui.btnAiFix, ui.btnCopy, ui.btnClear].forEach(btn => {
        if(btn) btn.classList.remove('pulsing');
    });
};

const executeSafely = async (actionCallback) => {
    // AUTO-CLEANUP: Limpa botão undo ao iniciar outra ação
    ui.toastContainer.innerHTML = ''; 
    if (undoTimeout) clearTimeout(undoTimeout);

    if (speechManager && speechManager.isRecording) {
        speechManager.stop();
        toggleWakeLock(false);
        const originalColor = ui.micBtn.style.backgroundColor;
        ui.micBtn.style.backgroundColor = '#f59e0b'; 
        await new Promise(resolve => setTimeout(resolve, 300));
        ui.micBtn.style.backgroundColor = '';
    }
    stopVisualEffects();
    actionCallback();
};

// ========================================================
// 5. CALLBACKS DO SPEECH MANAGER
// ========================================================
const handleTranscriptionResult = (finalText, interimText) => {
    if (finalText) {
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

        if (ui.container.classList.contains('minimized')) {
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
        }
    }
};

const updateStatus = (status) => {
    ui.statusMsg.className = 'status-bar';
    if (status === 'recording') {
        ui.statusMsg.textContent = "GRAVANDO";
        ui.statusMsg.classList.add('active', 'status-recording');
        ui.micBtn.classList.add('recording', 'pulsing');
    } else if (status === 'processing') {
        ui.statusMsg.textContent = "PROCESSANDO IA...";
        ui.statusMsg.classList.add('active', 'status-ai');
    } else if (status === 'error') {
        ui.statusMsg.textContent = "ERRO / MICROFONE BLOQUEADO";
        ui.statusMsg.classList.add('active', 'status-error');
        ui.micBtn.classList.remove('recording');
        stopVisualEffects(); 
        toggleWakeLock(false);
    } else {
        ui.statusMsg.textContent = "";
        ui.statusMsg.classList.remove('active');
        ui.micBtn.classList.remove('recording', 'pulsing'); 
    }
};

const speechManager = new SpeechManager('audioVisualizer', handleTranscriptionResult, updateStatus);

// ========================================================
// 6. SELETOR DE DISPOSITIVOS
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

    const devices = await speechManager.getAudioDevices();
    populate(devices);
    speechManager.listenToDeviceChanges((updatedDevices) => populate(updatedDevices));

    ui.audioSource.addEventListener('change', (e) => {
        const val = e.target.value;
        speechManager.setDeviceId(val);
        localStorage.setItem(CONFIG.STORAGE_KEYS.MIC, val);
    });
}

// ========================================================
// 7. EVENT LISTENERS
// ========================================================

ui.micBtn.addEventListener('click', () => {
    if (speechManager.isRecording) {
        speechManager.stop();
        toggleWakeLock(false);
    } else {
        ui.toastContainer.innerHTML = ''; 
        if (undoTimeout) clearTimeout(undoTimeout);
        stopVisualEffects(); 
        speechManager.start();
        toggleWakeLock(true);
    }
});

ui.fileInput.addEventListener('change', () => {
    executeSafely(() => {
        alert("Upload de áudio requer backend.");
    });
});

ui.btnAiFix.addEventListener('click', () => {
    const text = ui.textarea.value.trim();
    if (!text) return alert("Digite ou dite algo primeiro.");

    executeSafely(async () => {
        stopVisualEffects();
        ui.btnAiFix.classList.add('pulsing'); 
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
            ui.btnAiFix.classList.remove('pulsing'); 
            setTimeout(() => updateStatus('idle'), 2000);
        }
    });
});

ui.btnAiLegal.addEventListener('click', () => {
    const text = ui.textarea.value.trim();
    if (!text) return alert("Digite ou dite algo primeiro.");

    executeSafely(async () => {
        stopVisualEffects();
        ui.btnAiLegal.classList.add('pulsing'); 
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
            ui.btnAiLegal.classList.remove('pulsing'); 
            setTimeout(() => updateStatus('idle'), 2000);
        }
    });
});

ui.btnCopy.addEventListener('click', () => {
    executeSafely(() => {
        stopVisualEffects(); 
        ui.textarea.select();
        document.execCommand('copy');
        navigator.clipboard.writeText(ui.textarea.value);
        
        const originalText = ui.btnCopy.querySelector('span').textContent;
        ui.btnCopy.querySelector('span').textContent = "Copiado!";
        ui.btnCopy.classList.add('status-success', 'pulsing');
        
        setTimeout(() => {
            ui.btnCopy.querySelector('span').textContent = originalText;
            ui.btnCopy.classList.remove('status-success', 'pulsing');
        }, 1500); 
    });
});

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
    const isCompact = ui.container.classList.contains('minimized');
    
    if (isCompact) {
        ui.toastContainer.classList.add('compact-mode');
    } else {
        ui.toastContainer.classList.remove('compact-mode');
    }

    if (isCompact) {
        // Botão Flutuante
        const btn = document.createElement('button');
        btn.className = 'btn-undo-float';
        btn.setAttribute('data-tooltip', 'Desfazer (Alt+Z)');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 7"/></svg>`;
        btn.addEventListener('click', performUndo);
        ui.toastContainer.appendChild(btn);
    } else {
        // Toast Texto Normal
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>Texto limpo.</span><button id="undoBtn" class="btn-undo">Desfazer (Alt+Z)</button>`;
        ui.toastContainer.appendChild(toast);
        document.getElementById('undoBtn').addEventListener('click', performUndo);
    }

    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
        const element = ui.toastContainer.firstElementChild;
        if (element) {
            element.style.opacity = '0';
            element.style.transform = isCompact ? 'scale(0)' : 'translateY(20px)';
            setTimeout(() => ui.toastContainer.innerHTML = '', 300);
        }
        tempDeletedText = '';
    }, 5000);
}

function performUndo() {
    if (tempDeletedText) {
        ui.textarea.value = tempDeletedText;
        saveContent();
        updateCharCount();
        
        // CORREÇÃO CRÍTICA: Rola até o fim para mostrar o texto restaurado e foca
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
        ui.textarea.focus();

        // Limpa o botão imediatamente
        ui.toastContainer.innerHTML = '';
        tempDeletedText = '';
        if (undoTimeout) clearTimeout(undoTimeout);
    }
}

// ========================================================
// 8. REDIMENSIONAMENTO DE JANELA
// ========================================================
ui.toggleSizeBtn.addEventListener('click', () => {
    ui.container.classList.toggle('minimized');
    const isMin = ui.container.classList.contains('minimized');
    
    document.getElementById('iconMinimize').style.display = isMin ? 'none' : 'block';
    document.getElementById('iconMaximize').style.display = isMin ? 'block' : 'none';
    
    const targetWidth = isMin ? 360 : 920; 
    const targetHeight = isMin ? 500 : 800; 

    if (window.outerWidth) {
        try {
            const screenLeft = window.screen.availLeft || 0;
            const screenTop = window.screen.availTop || 0;
            const screenW = window.screen.availWidth;
            const screenH = window.screen.availHeight;

            const left = (screenLeft + screenW) - targetWidth - 20;
            const top = (screenTop + screenH) - targetHeight - 20;

            window.resizeTo(targetWidth, targetHeight);
            window.moveTo(left, top);
        } catch (e) {
            console.warn("Navegador bloqueou resizeTo.", e);
        }
    }
    
    if (isMin) {
        setTimeout(() => {
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
        }, 100);
    }
});

// ========================================================
// 9. STARTUP
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

if (ui.glossaryBtn && ui.glossaryModal) {
    ui.glossaryBtn.addEventListener('click', () => {
        glossaryManager.renderCallback(glossaryManager.getTerms()); 
        ui.glossaryModal.style.display = 'flex';
    });
    ui.closeGlossaryBtn.addEventListener('click', () => ui.glossaryModal.style.display = 'none');
    ui.addTermBtn.addEventListener('click', () => {
        glossaryManager.add(ui.termInput.value, ui.replaceInput.value);
        ui.termInput.value = '';
        ui.replaceInput.value = '';
    });
}

window.addEventListener('DOMContentLoaded', () => {
    loadContent();
    ui.versionBtn.textContent = `v${currentVersion}`;
    initDeviceSelector();

    new HotkeyManager(ui, {
        triggerClear: () => executeSafely(() => handleClearAction()),
        triggerUndo: performUndo
    });
});
