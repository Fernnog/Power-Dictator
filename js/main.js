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
// 4. AUXILIARES VISUAIS & SEGURANÇA (v1.0.6)
// ========================================================

/**
 * Remove o efeito de pulso de todos os botões de ação.
 * Usado para limpar o estado visual antes de iniciar uma nova ação ou ao finalizar.
 */
const stopVisualEffects = () => {
    [ui.micBtn, ui.btnAiLegal, ui.btnAiFix, ui.btnCopy, ui.btnClear].forEach(btn => {
        if(btn) btn.classList.remove('pulsing');
    });
};

const executeSafely = async (actionCallback) => {
    // [MODIFICADO] Prioridade 2: Auto-destruição do botão Desfazer
    // Se o usuário iniciar qualquer outra ação, removemos a chance de desfazer para limpar a tela
    ui.toastContainer.innerHTML = '';
    if (undoTimeout) clearTimeout(undoTimeout);

    if (speechManager && speechManager.isRecording) {
        speechManager.stop();
        toggleWakeLock(false);
        
        // Feedback visual de interrupção
        const originalColor = ui.micBtn.style.backgroundColor;
        ui.micBtn.style.backgroundColor = '#f59e0b'; // Amber warning
        
        await new Promise(resolve => setTimeout(resolve, 300));
        ui.micBtn.style.backgroundColor = '';
    }
    // Garante limpeza visual antes da ação
    stopVisualEffects();
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

        // [v1.0.4] Auto-Scroll Inteligente
        if (ui.container.classList.contains('minimized')) {
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
        }
    }
};

const updateStatus = (status) => {
    ui.statusMsg.className = 'status-bar'; // Reset texto
    
    // [v1.0.6] Lógica de Feedback Visual (Pulso)
    
    if (status === 'recording') {
        ui.statusMsg.textContent = "GRAVANDO";
        ui.statusMsg.classList.add('active', 'status-recording');
        ui.micBtn.classList.add('recording');
        ui.micBtn.classList.add('pulsing'); 
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
        // IDLE
        ui.statusMsg.textContent = "";
        ui.statusMsg.classList.remove('active');
        ui.micBtn.classList.remove('recording');
        ui.micBtn.classList.remove('pulsing'); 
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
        stopVisualEffects(); // Garante que nenhum outro botão esteja pulsando
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
        stopVisualEffects();
        ui.btnAiFix.classList.add('pulsing'); // [v1.0.6] Feedback Visual
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
            ui.btnAiFix.classList.remove('pulsing'); // [v1.0.6] Limpa Feedback
            setTimeout(() => updateStatus('idle'), 2000);
        }
    });
});

// IA: Jurídico
ui.btnAiLegal.addEventListener('click', () => {
    const text = ui.textarea.value.trim();
    if (!text) return alert("Digite ou dite algo primeiro.");

    executeSafely(async () => {
        stopVisualEffects();
        ui.btnAiLegal.classList.add('pulsing'); // [v1.0.6] Feedback Visual
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
            ui.btnAiLegal.classList.remove('pulsing'); // [v1.0.6] Limpa Feedback
            setTimeout(() => updateStatus('idle'), 2000);
        }
    });
});

// Copiar
ui.btnCopy.addEventListener('click', () => {
    executeSafely(() => {
        stopVisualEffects(); // Limpa outros
        
        // Lógica de Cópia
        ui.textarea.select();
        document.execCommand('copy');
        navigator.clipboard.writeText(ui.textarea.value);
        
        // Feedback de Texto
        const originalText = ui.btnCopy.querySelector('span').textContent;
        ui.btnCopy.querySelector('span').textContent = "Copiado!";
        ui.btnCopy.classList.add('status-success');
        
        // [v1.0.6] Feedback Visual (Flash Verde)
        ui.btnCopy.classList.add('pulsing'); 
        
        setTimeout(() => {
            ui.btnCopy.querySelector('span').textContent = originalText;
            ui.btnCopy.classList.remove('status-success');
            ui.btnCopy.classList.remove('pulsing'); // Remove pulso
        }, 1500); // 1.5s = Tempo da animação CSS
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

// [MODIFICADO] Prioridade 1: Lógica do botão flutuante com Tooltip no modo compacto
function showUndoToast() {
    ui.toastContainer.innerHTML = '';
    
    // Verifica se está no modo Widget (minimized)
    const isCompact = ui.container.classList.contains('minimized');
    
    // Ajusta posição do container
    if (isCompact) {
        ui.toastContainer.classList.add('compact-mode');
    } else {
        ui.toastContainer.classList.remove('compact-mode');
    }

    if (isCompact) {
        // RENDERIZAÇÃO MODO COMPACTO (Botão Flutuante + Tooltip)
        const btn = document.createElement('button');
        btn.className = 'btn-undo-float';
        
        // Adiciona o atributo que ativa o CSS de tooltip existente
        btn.setAttribute('data-tooltip', 'Desfazer (Alt+Z)');
        // Acessibilidade
        btn.setAttribute('aria-label', 'Desfazer última limpeza');
        
        // Ícone de Seta de Retorno
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 7"/></svg>`;
        
        btn.addEventListener('click', performUndo);
        ui.toastContainer.appendChild(btn);

    } else {
        // RENDERIZAÇÃO MODO NORMAL (Toast de Texto Original)
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>Texto limpo.</span><button id="undoBtn" class="btn-undo">Desfazer (Alt+Z)</button>`;
        ui.toastContainer.appendChild(toast);
        
        document.getElementById('undoBtn').addEventListener('click', performUndo);
    }

    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
        // Animação de saída
        const element = ui.toastContainer.firstElementChild;
        if (element) {
            element.style.opacity = '0';
            // Ajusta a direção da saída baseado no modo
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
        ui.toastContainer.innerHTML = '';
        tempDeletedText = '';
        if (undoTimeout) clearTimeout(undoTimeout);
    }
}

// ========================================================
// 8. REDIMENSIONAMENTO DE JANELA (Widget Mode v1.0.4)
// ========================================================
ui.toggleSizeBtn.addEventListener('click', () => {
    ui.container.classList.toggle('minimized');
    const isMin = ui.container.classList.contains('minimized');
    
    // Troca ícones
    document.getElementById('iconMinimize').style.display = isMin ? 'none' : 'block';
    document.getElementById('iconMaximize').style.display = isMin ? 'block' : 'none';
    
    // Dimensões Alvo (Normal vs Widget Vertical Post-it)
    const targetWidth = isMin ? 360 : 920; 
    const targetHeight = isMin ? 500 : 800; 

    // Se estiver rodando como popup
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

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    loadContent();
    ui.versionBtn.textContent = `v${currentVersion}`;
    initDeviceSelector();

    // Inicializa Gerenciador de Atalhos (incluindo Alt + M)
    new HotkeyManager(ui, {
        triggerClear: () => executeSafely(() => handleClearAction()),
        triggerUndo: performUndo
    });
});
