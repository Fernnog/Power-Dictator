import { SpeechManager } from './speech-manager.js';
import { aiService } from './llm-service.js';
import Glossary from './glossary.js';
import { CONFIG } from './config.js';
import { HotkeyManager } from './hotkeys.js';

// Referência à janela flutuante (somente para o caminho window.open/fallback)
let activeExternalWindow = null;

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
    
    // Controle de Motor
    engineToggle: document.getElementById('engineToggle'),
    engineLabel: document.getElementById('engineLabel'),
    
    // Botões de Ação
    btnUpload: document.querySelector('.btn-upload'),
    btnAiFix: document.getElementById('aiFixBtn'),
    btnAiLegal: document.getElementById('aiLegalBtn'),
    btnCopy: document.getElementById('copyBtn'),
    btnClear: document.getElementById('clearBtn'),
    
    // Modais e Auxiliares
    toggleSizeBtn: document.getElementById('toggleSizeBtn'),
    container: document.getElementById('appContainer'),
    helpBtn: document.getElementById('helpBtn'),
    toastContainer: document.getElementById('toastContainer'),

    // Glossário
    glossaryBtn: document.getElementById('glossaryBtn'),
    glossaryModal: document.getElementById('glossaryModal'),
    closeGlossaryBtn: document.getElementById('closeGlossaryBtn'),
    glossaryList: document.getElementById('glossaryList'),
    termInput: document.getElementById('termInput'),
    replaceInput: document.getElementById('replaceInput'),
    addTermBtn: document.getElementById('addTermBtn'),

   // [NOVO] Modo Foco e PWA
    focusModeBtn: document.getElementById('focusModeBtn'),
    installPwaBtn: document.getElementById('installPwaBtn'),
    popOutBtn: document.getElementById('popOutBtn'),

    // [INSERIR] Elemento fantasma para o Drag & Drop
    dragImage:      document.getElementById('dragImage'),

    // [INSERIR] Placeholder de estado do modo PiP
    pipPlaceholder: document.getElementById('pipPlaceholder')
};

// Variáveis de Estado
let undoTimeout = null;
let tempDeletedText = '';

// ============================================================
// GERENCIADOR DE ESTADOS DA JANELA FLUTUANTE
// Controla as transições entre Estado Mic e Estado Ação.
// ============================================================

/**
 * Retorna true se o container estiver atualmente dentro de
 * uma janela flutuante (PiP ou popup window.open).
 */
function isInFloatingWindow() {
    // Verifica PiP: o container foi movido para o documento da janela PiP
    const pipWin = (typeof documentPictureInPicture !== 'undefined')
        ? documentPictureInPicture?.window
        : null;
    if (pipWin && pipWin.document === ui.container.ownerDocument) return true;
    // Verifica popup: esta página foi aberta pelo fallback window.open
    if (activeExternalWindow) return true;
    return false;
}

/**
 * Estado Mic → Estado Ação.
 * Ativado quando a transcrição retorna texto.
 * No Caminho B (window.open), redimensiona a janela popup para 360×500.
 * No Caminho A (PiP), apenas troca as classes — sem resizeTo().
 */
function transitionToActionState() {
    if (!ui.container.classList.contains('minimalist-mode')) return;

    ui.container.classList.remove('minimalist-mode');
    ui.container.classList.add('minimized');

    // Redimensionamento apenas para o Caminho B (window.open)
    // O Document PiP não suporta resizeTo() — transição é 100% CSS
    if (activeExternalWindow) {
        try {
            const W = 360, H = 500;
            activeExternalWindow.resizeTo(W, H);
            const screenLeft = activeExternalWindow.screen.availLeft || 0;
            const screenTop  = activeExternalWindow.screen.availTop  || 0;
            const left = (screenLeft + activeExternalWindow.screen.availWidth)  - W - 16;
            const top  = (screenTop  + activeExternalWindow.screen.availHeight) - H - 16;
            activeExternalWindow.moveTo(left, top);
        } catch (e) {
            console.warn('resizeTo para Estado Ação bloqueado:', e);
        }
    }

    requestAnimationFrame(() => {
        if (ui.textarea) ui.textarea.scrollTop = ui.textarea.scrollHeight;
    });
}

/**
 * Estado Ação → Estado Mic.
 * Ativado pelo botão "Limpar". Só executa dentro de uma janela flutuante.
 * No Caminho B, encolhe a janela de volta para 140×140.
 */
function transitionToMicState() {
    if (!isInFloatingWindow()) return;
    if (!ui.container.classList.contains('minimized')) return;

    ui.container.classList.remove('minimized');
    ui.container.classList.add('minimalist-mode');

    // Redimensionamento apenas para o Caminho B (window.open)
    if (activeExternalWindow) {
        try {
            const W = 140, H = 140;
            activeExternalWindow.resizeTo(W, H);
            const screenLeft = activeExternalWindow.screen.availLeft || 0;
            const screenTop  = activeExternalWindow.screen.availTop  || 0;
            const left = (screenLeft + activeExternalWindow.screen.availWidth)  - W - 16;
            const top  = (screenTop  + activeExternalWindow.screen.availHeight) - H - 16;
            activeExternalWindow.moveTo(left, top);
        } catch (e) {
            console.warn('resizeTo para Estado Mic bloqueado:', e);
        }
    }
}

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

        transitionToActionState();
    }
};

const updateStatus = (status) => {
    ui.statusMsg.className = 'status-bar';
    ui.micBtn.style.backgroundColor = ''; 

    if (status === 'starting') {
        ui.statusMsg.textContent = "CONECTANDO...";
        ui.statusMsg.classList.add('active', 'status-starting');
        ui.micBtn.style.backgroundColor = '#eab308'; 
        ui.micBtn.classList.add('pulsing');
    } else if (status === 'recording') {
        ui.statusMsg.textContent = "GRAVANDO";
        ui.statusMsg.classList.add('active', 'status-recording');
        ui.micBtn.classList.add('recording', 'pulsing');
    } else if (status === 'processing') {
        ui.statusMsg.textContent = "PROCESSANDO IA...";
        ui.statusMsg.classList.add('active', 'status-ai');
    } else if (status === 'error') {
        ui.statusMsg.textContent = "ERRO / BLOQUEADO";
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
        updateStatus('starting'); 
        speechManager.start();
        toggleWakeLock(true);
    }
});

// [NOVO] Toggle do Modo Foco
if (ui.focusModeBtn) {
    ui.focusModeBtn.addEventListener('click', () => {
        ui.container.classList.toggle('focus-mode');
        // Rola para o fim do texto ao expandir
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
    });
}

if (ui.engineToggle) {
    ui.engineToggle.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        localStorage.setItem('dd_engine_pref', isChecked ? 'whisper' : 'native');
        if (ui.engineLabel) ui.engineLabel.textContent = isChecked ? 'Whisper AI' : 'Nativo';
        speechManager.useWhisper = isChecked;
    });
}

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
            showPopoverIfMinimalist();
        } catch (error) {
            alert("Erro na IA (Llama/Groq): " + error.message);
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
            alert("Erro na transcrição Jurídica (Groq): " + error.message);
            updateStatus('error');
        } finally {
            ui.btnAiLegal.classList.remove('pulsing'); 
            setTimeout(() => updateStatus('idle'), 2000);
        }
    });
});

ui.btnCopy.addEventListener('click', () => {
    executeSafely(async () => {

        stopVisualEffects();

        const textToCopy = ui.textarea.value;

        // ── RESOLUÇÃO DE CONTEXTO ─────────────────────────────────────────
        const targetWindow = ui.textarea.ownerDocument.defaultView;

        try {
            await targetWindow.navigator.clipboard.writeText(textToCopy);
        } catch (primaryError) {
            const targetDocument = ui.textarea.ownerDocument;
            const tempArea = targetDocument.createElement('textarea');

            tempArea.value = textToCopy;
            tempArea.style.cssText = [
                'position:fixed',
                'top:0',
                'left:0',
                'width:1px',
                'height:1px',
                'opacity:0',
                'pointer-events:none',
            ].join(';');

            targetDocument.body.appendChild(tempArea);
            tempArea.focus();
            tempArea.select();

            try {
                targetDocument.execCommand('copy');
            } catch (fallbackError) {
                console.warn('[Clipboard] Fallback também falhou:', fallbackError);
            } finally {
                targetDocument.body.removeChild(tempArea);
            }
        }

        // ── FEEDBACK VISUAL ────────────────────────────────────────
        const span = ui.btnCopy.querySelector('span');
        const originalText = span ? span.textContent : 'Copiar';

        if (span) span.textContent = 'Copiado!';
        ui.btnCopy.classList.add('status-success', 'pulsing');

        setTimeout(() => {
            if (span) span.textContent = originalText;
            ui.btnCopy.classList.remove('status-success', 'pulsing');
        }, 1500);

    });
});

// -------------------------------------------------------
// DRAG & DROP — Transferência de texto para apps externos
// Ativado apenas em dispositivos com suporte a ponteiro
// (desktops). Desativado silenciosamente em touch/mobile.
// -------------------------------------------------------
const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

if (supportsHover) {
    // Habilita o arraste apenas onde faz sentido
    ui.btnCopy.setAttribute('draggable', 'true');

    ui.btnCopy.addEventListener('dragstart', (e) => {
        const textToDrag = ui.textarea.value.trim();

        // Aborta silenciosamente se não houver conteúdo
        if (!textToDrag) {
            e.preventDefault();
            return;
        }

        // Define o dado a ser transferido ao sistema operacional
        e.dataTransfer.setData('text/plain', textToDrag);

        // Sinaliza ao app de destino que esta é uma operação de cópia
        e.dataTransfer.effectAllowed = 'copy';

        // Substitui a imagem fantasma padrão (miniatura do botão)
        // por um elemento invisível (1x1px), tornando o arraste discreto
        e.dataTransfer.setDragImage(ui.dragImage, 0, 0);
    });

    ui.btnCopy.addEventListener('dragend', (e) => {
        // dropEffect === 'none' significa que o usuário soltou
        // em um destino que não aceitou o drop (ou cancelou com Esc)
        if (e.dataTransfer.dropEffect === 'none') {
            // Informa o usuário de forma não invasiva, se desejar (opcional)
        }
        // Nenhum reset de opacity necessário — o CSS :active trata o feedback visual
    });
}

ui.btnClear.addEventListener('click', () => executeSafely(() => handleClearAction()));

function handleClearAction() {
    if (!ui.textarea.value) return;
    tempDeletedText = ui.textarea.value;
    ui.textarea.value = '';
    saveContent();
    updateCharCount();

    // Toast de desfazer apenas no modo normal
    // (no modo flutuante não há como exibi-lo de forma confiável)
    if (!isInFloatingWindow()) {
        showUndoToast();
    }

    // Gatilho do ciclo: retorna ao Estado Mic
    transitionToMicState();
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
        const btn = document.createElement('button');
        btn.className = 'btn-undo-float';
        btn.setAttribute('data-tooltip', 'Desfazer (Alt+Z)');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 7"/></svg>`;
        btn.addEventListener('click', performUndo);
        ui.toastContainer.appendChild(btn);
    } else {
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
        
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
        ui.textarea.focus();

        ui.toastContainer.innerHTML = '';
        tempDeletedText = '';
        if (undoTimeout) clearTimeout(undoTimeout);
    }
}

// ========================================================
// 8. REDIMENSIONAMENTO E ESTADO DA JANELA
// ========================================================

/**
 * Define o estado visual da interface de forma centralizada.
 * Deve ser a ÚNICA função a manipular o modo compacto/completo da UI.
 *
 * @param {boolean} isMinimized - true para modo compacto, false para modo completo.
 */
function setUIMode(isMinimized) {
    // 1. Controla a classe de layout no container principal
    if (isMinimized) {
        ui.container.classList.add('minimized');
    } else {
        ui.container.classList.remove('minimized');
    }

    // 2. Controla a visibilidade dos ícones via classList (nunca inline style)
    const iconMinimize = ui.container.querySelector('#iconMinimize');
    const iconMaximize = ui.container.querySelector('#iconMaximize');

    if (iconMinimize) {
        iconMinimize.classList.toggle('icon-hidden', isMinimized);
    }
    if (iconMaximize) {
        iconMaximize.classList.toggle('icon-hidden', !isMinimized);
    }

    // 3. Redimensionamento da Janela (Aba ou Standalone)
    //    Ignora se estivermos dentro de um contexto PiP, onde o tamanho é fixo.
    const isPip = !!window.documentPictureInPicture?.window;
    // Evita que setUIMode redimensione quando esta página É o popup flutuante
    const isOwnPopup = (activeExternalWindow === window);
    
    if (window.outerWidth && !isPip && !isOwnPopup) {
        const targetWidth = isMinimized ? 360 : 1080; 
        const targetHeight = isMinimized ? 500 : 800; 

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
    
    if (isMinimized) {
        setTimeout(() => {
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
        }, 100);
    }
}

ui.toggleSizeBtn.addEventListener('click', () => {
    // Verificação de Contexto PiP
    const pipWindow = window.documentPictureInPicture?.window;
    if (pipWindow && ui.toggleSizeBtn.ownerDocument === pipWindow.document) {
        pipWindow.close();
        return;
    }

    // Delegação para a fonte de verdade centralizada
    const isCurrentlyMinimized = ui.container.classList.contains('minimized');
    setUIMode(!isCurrentlyMinimized);
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
    initDeviceSelector();

    if (ui.engineToggle) {
        const savedEngine = localStorage.getItem('dd_engine_pref') || 'native';
        const isWhisper = savedEngine === 'whisper';
        ui.engineToggle.checked = isWhisper;
        if (ui.engineLabel) ui.engineLabel.textContent = isWhisper ? 'Whisper AI' : 'Nativo';
        if (speechManager) speechManager.useWhisper = isWhisper;
    }

    new HotkeyManager(ui, {
        triggerClear: () => executeSafely(() => handleClearAction()),
        triggerUndo: performUndo
    });

    const _isMobile     = window.matchMedia('(max-width: 768px)').matches;
    const _isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const _isPopup      = !!window.opener;
    const _canUsePiP    = 'documentPictureInPicture' in window;

    if (!_isMobile && !_isStandalone && !_isPopup) {
        document.body.classList.add('is-desktop-tab');
    }

    // ============================================================
    // MODO COMPACTO — Ponto de entrada único (popOutBtn)
    // Caminho A: Document Picture-in-Picture (Chrome 116+)
    // Caminho B: window.open (fallback Firefox/Safari/Edge)
    // ============================================================
    if (ui.popOutBtn) {

        if (_canUsePiP) {
            // ── CAMINHO A: Document PiP ──────────────────────────
            ui.popOutBtn.addEventListener('click', async () => {
                try {
                    // Abre no tamanho do Estado Ação (360×500).
                    // A API PiP não suporta resizeTo(), então o tamanho é fixo.
                    // No Estado Mic, o CSS .minimalist-mode centraliza apenas o
                    // botão de microfone, preenchendo o restante com --bg-app.
                    const pipWindow = await documentPictureInPicture.requestWindow({
                        width: 360,
                        height: 500,
                        disallowReturnToOpener: false
                    });

                    // Clona todos os estilos da aba principal
                    [...document.styleSheets].forEach((sheet) => {
                        try {
                            const rules = [...sheet.cssRules].map(r => r.cssText).join('');
                            const style = pipWindow.document.createElement('style');
                            style.textContent = rules;
                            pipWindow.document.head.appendChild(style);
                        } catch (_e) {
                            if (sheet.href) {
                                const link = pipWindow.document.createElement('link');
                                link.rel  = 'stylesheet';
                                link.href = sheet.href;
                                pipWindow.document.head.appendChild(link);
                            }
                        }
                    });

                    pipWindow.document.body.classList.add('is-pip-mode');

                    // Inicia no Estado Mic (apenas microfone visível)
                    ui.container.classList.remove('minimized');
                    ui.container.classList.add('minimalist-mode');

                    pipWindow.document.body.appendChild(ui.container);

                    if (ui.pipPlaceholder) ui.pipPlaceholder.style.display = 'flex';

                    // Restauração ao fechar a janela PiP
                    pipWindow.addEventListener('pagehide', () => {
                        if (ui.pipPlaceholder) ui.pipPlaceholder.style.display = 'none';
                        document.body.appendChild(ui.container);
                        ui.container.classList.remove('minimalist-mode', 'minimized');
                        setUIMode(false); // Retorna ao Modo Expandido
                        requestAnimationFrame(() => {
                            if (ui.textarea) ui.textarea.scrollTop = ui.textarea.scrollHeight;
                        });
                    });

                } catch (err) {
                    console.warn('Document PiP bloqueado:', err);
                    ui.statusMsg.textContent = 'Permissão de janela negada pelo navegador.';
                    ui.statusMsg.className   = 'status-bar active status-warning';
                    setTimeout(() => {
                        ui.statusMsg.textContent = '';
                        ui.statusMsg.className   = 'status-bar';
                    }, 4000);
                }
            });

        } else {
            // ── CAMINHO B: window.open (fallback) ────────────────
            // Abre pequeno (140×140). resizeTo() funciona em popups convencionais.
            ui.popOutBtn.addEventListener('click', () => {
                const W = 140, H = 140;
                const screenLeft = window.screen.availLeft || 0;
                const screenTop  = window.screen.availTop  || 0;
                const left = (screenLeft + window.screen.availWidth)  - W - 16;
                const top  = (screenTop  + window.screen.availHeight) - H - 16;

                window.open(
                    window.location.pathname + '?mode=compact-mic',
                    'DitadoWidget',
                    `width=${W},height=${H},left=${left},top=${top},popup=yes,` +
                    `resizable=yes,scrollbars=no,toolbar=no,menubar=no,status=no`
                );
            });
        }
    }

    // ── Detecção de contexto via parâmetro URL ────────────────────
    const urlParams = new URLSearchParams(window.location.search);

    // Modo Compacto (antigo): abre como widget com texto + botões
    if (urlParams.get('mode') === 'compact') {
        setTimeout(() => {
            if (!ui.container.classList.contains('minimized')) {
                ui.toggleSizeBtn.click();
            }
        }, 100);
    }

    // Modo Compacto Mic: popup do Caminho B, inicia no Estado Mic
    if (urlParams.get('mode') === 'compact-mic') {
        document.body.classList.add('is-pip-mode');
        // Define que esta página É a janela flutuante (habilita resizeTo no popup)
        activeExternalWindow = window;
        setTimeout(() => {
            ui.container.classList.remove('minimized');
            ui.container.classList.add('minimalist-mode');
        }, 150);
    }
});

// ========================================================
// 10. LÓGICA DE INSTALAÇÃO PWA
// ========================================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.body.classList.add('show-install-btn');
});

if (ui.installPwaBtn) {
    ui.installPwaBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                document.body.classList.remove('show-install-btn');
            }
            deferredPrompt = null;
        }
    });
}
