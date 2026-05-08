import { SpeechManager } from './speech-manager.js';
import { aiService } from './llm-service.js';
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
    addTermBtn: document.getElementById('addTermBtn'),

   // [NOVO] Modo Foco e PWA
    focusModeBtn: document.getElementById('focusModeBtn'),
    installPwaBtn: document.getElementById('installPwaBtn'),
    popOutBtn: document.getElementById('popOutBtn'),

    // [INSERIR] Elemento fantasma para o Drag & Drop
    dragImage:      document.getElementById('dragImage'),

    // [INSERIR] Placeholder de estado do modo PiP
    pipPlaceholder: document.getElementById('pipPlaceholder'),

    // [NOVO] Elementos do Modo Minimalista
    toggleMinimalistBtn: document.getElementById('toggleMinimalistBtn'),
    minimalistPopover:   document.getElementById('minimalistPopover'),
    closePopoverBtn:     document.getElementById('closePopoverBtn'),
    popoverTextArea:     document.getElementById('popoverTextArea'),
    popoverCopyBtn:      document.getElementById('popoverCopyBtn'),
    popoverClearBtn:     document.getElementById('popoverClearBtn'),
    popoverLegalBtn:     document.getElementById('popoverLegalBtn'),  // [NOVO]
    exitMinimalistBtn:   document.getElementById('exitMinimalistBtn') // [NOVO]
};

// Variáveis de Estado
let undoTimeout = null;
let tempDeletedText = '';

// ============================================================
// MODO MINIMALISTA — Configuração e lógica de estado visual
// ============================================================
const minimalistButtons = {
  mic:   ui.micBtn,
  aifix: ui.btnAiFix,
};

function updateMinimalistButtonStates(activeKey = null) {
  const isMinimalist = ui.container.classList.contains('minimalist-mode');
  Object.entries(minimalistButtons).forEach(([key, btn]) => {
    if (!btn) return;
    btn.classList.remove('state-muted', 'state-active');
    if (isMinimalist) {
      if (activeKey === key) btn.classList.add('state-active');
      else btn.classList.add('state-muted');
    }
  });
}

/**
 * Atualiza a direção do popover com base na posição vertical do widget.
 * Inverte para baixo se o widget estiver na metade superior da tela,
 * evitando que o balão saia do viewport.
 * @param {number} widgetTop - Coordenada Y do topo do widget (em px)
 */
function updatePopoverFlip(widgetTop) {
    if (!ui.minimalistPopover || ui.minimalistPopover.hidden) return;
    const isNearTop = widgetTop < window.innerHeight / 2;
    ui.minimalistPopover.classList.toggle('popover-flipped', isNearTop);
}

/**
 * Exibe o popover com o texto atual, mas somente no modo ultra compacto.
 * Usa style.display diretamente para contornar a regra CSS
 * `.container.minimalist-mode > * { display: none }` que tem
 * especificidade maior que a classe .minimalist-popover.
 */
function showPopoverIfMinimalist() {
    if (!ui.container.classList.contains('minimalist-mode')) return;
    const content = ui.textarea.value.trim();
    if (!content) return;

    ui.popoverTextArea.value = content;
    ui.popoverTextArea.style.height = 'auto';
    ui.popoverTextArea.style.height = Math.min(ui.popoverTextArea.scrollHeight, 200) + 'px';

    // Forçamos display via style inline (especificidade máxima) para sobrepor
    // o seletor > * { display: none } do modo minimalist.
    ui.minimalistPopover.hidden = false;
    ui.minimalistPopover.style.display = 'flex';
    ui.minimalistPopover.setAttribute('aria-hidden', 'false');

    // Reaplica a animação de entrada
    ui.minimalistPopover.style.animation = 'none';
    void ui.minimalistPopover.offsetWidth; // reflow
    ui.minimalistPopover.style.animation = '';

    // Verifica se deve inverter a direção do popover
    const rect = ui.container.getBoundingClientRect();
    updatePopoverFlip(rect.top);
}

/**
 * Fecha o popover e devolve o foco a um elemento opcional.
 */
function closePopover(returnFocusTo = null) {
    ui.minimalistPopover.hidden = true;
    ui.minimalistPopover.style.display = ''; // Limpa o forçamento inline
    ui.minimalistPopover.setAttribute('aria-hidden', 'true');
    ui.minimalistPopover.classList.remove('popover-flipped');
    if (returnFocusTo) returnFocusTo.focus();
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

        showPopoverIfMinimalist();
    }
};

const updateStatus = (status) => {
    ui.statusMsg.className = 'status-bar';
    ui.micBtn.style.backgroundColor = ''; 

    if (status === 'starting') {
        updateMinimalistButtonStates('mic');
        ui.statusMsg.textContent = "CONECTANDO...";
        ui.statusMsg.classList.add('active', 'status-starting');
        ui.micBtn.style.backgroundColor = '#eab308'; 
        ui.micBtn.classList.add('pulsing');
    } else if (status === 'recording') {
        updateMinimalistButtonStates('mic');
        ui.statusMsg.textContent = "GRAVANDO";
        ui.statusMsg.classList.add('active', 'status-recording');
        ui.micBtn.classList.add('recording', 'pulsing');
    } else if (status === 'processing') {
        updateMinimalistButtonStates('aifix');
        ui.statusMsg.textContent = "PROCESSANDO IA...";
        ui.statusMsg.classList.add('active', 'status-ai');
    } else if (status === 'error') {
        updateMinimalistButtonStates(null);
        ui.statusMsg.textContent = "ERRO / BLOQUEADO";
        ui.statusMsg.classList.add('active', 'status-error');
        ui.micBtn.classList.remove('recording');
        stopVisualEffects(); 
        toggleWakeLock(false);
    } else {
        updateMinimalistButtonStates(null);
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
    
    if (window.outerWidth && !isPip) {
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

    // POP-OUT WIDGET
    if (ui.popOutBtn) {
        if (_canUsePiP) {
            ui.popOutBtn.addEventListener('click', async () => {
                try {
                    const pipWindow = await documentPictureInPicture.requestWindow({
                        width: 360,
                        height: 500
                    });

                    [...document.styleSheets].forEach((sheet) => {
                        try {
                            const rules = [...sheet.cssRules].map(r => r.cssText).join('');
                            const style = pipWindow.document.createElement('style');
                            style.textContent = rules;
                            pipWindow.document.head.appendChild(style);
                        } catch (_e) {
                            if (sheet.href) {
                                const link = pipWindow.document.createElement('link');
                                link.rel = 'stylesheet';
                                link.href = sheet.href;
                                pipWindow.document.head.appendChild(link);
                            }
                        }
                    });

                    pipWindow.document.body.classList.add('is-pip-mode');
                    pipWindow.document.body.appendChild(ui.container);

                    if (!ui.container.classList.contains('minimized')) {
                        ui.container.classList.add('minimized');
                    }

                    // [INSERIR] Exibe a tela de descanso na aba original
                    if (ui.pipPlaceholder) {
                        ui.pipPlaceholder.style.display = 'flex';
                    }

                    // RESTAURAÇÃO DE ESTADO AO FECHAR PiP
                    pipWindow.addEventListener('pagehide', () => {
                        // [INSERIR] Remove a tela de descanso ao retornar
                        if (ui.pipPlaceholder) {
                            ui.pipPlaceholder.style.display = 'none';
                        }
                        
                        // 1. Reattacha o container à janela principal
                        document.body.appendChild(ui.container);

                        // 2. Força o retorno ao modo completo via fonte de verdade
                        setUIMode(false);

                        // 3. Rola para o final do texto após reflow
                        requestAnimationFrame(() => {
                            if (ui.textarea) {
                                ui.textarea.scrollTop = ui.textarea.scrollHeight;
                            }
                        });
                    });

                } catch (err) {
                    console.warn('Document PiP bloqueado:', err);
                    ui.statusMsg.textContent = 'Permissão de janela negada pelo navegador.';
                    ui.statusMsg.className = 'status-bar active status-warning';
                    setTimeout(() => {
                        ui.statusMsg.textContent = '';
                        ui.statusMsg.className = 'status-bar';
                    }, 4000);
                }
            });

        } else {
            ui.popOutBtn.addEventListener('click', () => {
                const W = 360;
                const H = 500;
                const screenLeft = window.screen.availLeft || 0;
                const screenTop  = window.screen.availTop  || 0;
                const left = (screenLeft + window.screen.availWidth)  - W - 10;
                const top  = (screenTop  + window.screen.availHeight) - H - 10;

                window.open(
                    window.location.pathname + '?mode=compact',
                    'DitadoWidget',
                    `width=${W},height=${H},left=${left},top=${top},popup=yes`
                );
            });
        }
    }

    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('mode') === 'compact') {
        setTimeout(() => {
            if (!ui.container.classList.contains('minimized')) {
                ui.toggleSizeBtn.click();
            }
        }, 100);
    }

    // Fallback window.open: ativa o modo ultra compacto quando aberto como popup
    if (urlParams.get('mode') === 'minimalist') {
        document.body.classList.add('is-pip-mode');
        setTimeout(() => {
            ui.container.classList.remove('minimized');
            ui.container.classList.add('minimalist-mode');

            // O botão de sair fecha a janela popup diretamente
            const exitBtn = document.getElementById('exitMinimalistBtn');
            if (exitBtn) {
                exitBtn.addEventListener('click', () => window.close());
            }
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

// ============================================================
// MODO ULTRA COMPACTO — Janela Flutuante (fora do navegador)
// Usa a mesma infraestrutura do modo compacto (popOutBtn):
// Document Picture-in-Picture API (Chrome 116+) com fallback
// para window.open em navegadores sem suporte.
// ============================================================

if (ui.toggleMinimalistBtn) {
    ui.toggleMinimalistBtn.addEventListener('click', async () => {

        const _canUsePiP = 'documentPictureInPicture' in window;

        // ── CAMINHO 1: Document Picture-in-Picture (Chrome 116+) ──────────
        if (_canUsePiP) {
            try {
                // Dimensões compactas para o widget minimalista
                // Largura suficiente para 2 botões + drag handle + exit btn
                const pipWindow = await documentPictureInPicture.requestWindow({
                    width:  260,
                    height: 80,
                    disallowReturnToOpener: false
                });

                // 1. Clona todos os estilos da aba principal para a janela PiP
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

                // 2. Prepara o body da janela PiP
                pipWindow.document.body.classList.add('is-pip-mode');
                pipWindow.document.body.style.cssText =
                    'margin:0; padding:0; background:var(--bg-app,#ffffff); overflow:hidden; display:flex; align-items:center; justify-content:center;';

                // 3. Garante que o modo compacto (.minimized) NÃO esteja ativo
                //    e aplica somente o modo ultra compacto
                ui.container.classList.remove('minimized');
                ui.container.classList.add('minimalist-mode');

                // 4. Move o container para a janela PiP
                pipWindow.document.body.appendChild(ui.container);

                // 5. Exibe o placeholder na aba principal (reaproveitando o existente)
                if (ui.pipPlaceholder) {
                    ui.pipPlaceholder.style.display = 'flex';
                }

                // 6. Marca o botão como ativo
                ui.toggleMinimalistBtn.setAttribute('aria-pressed', 'true');

                // ── Restauração ao fechar a janela PiP ──────────────────────
                pipWindow.addEventListener('pagehide', () => {
                    // Oculta o placeholder
                    if (ui.pipPlaceholder) {
                        ui.pipPlaceholder.style.display = 'none';
                    }

                    // Devolve o container à aba principal
                    document.body.appendChild(ui.container);

                    // Remove o modo ultra compacto e garante retorno ao Expandido
                    ui.container.classList.remove('minimalist-mode');
                    closePopover();
                    setUIMode(false); // Força modo expandido (mesma lógica do popOutBtn)

                    ui.toggleMinimalistBtn.setAttribute('aria-pressed', 'false');

                    // Rola para o final do texto após reflow
                    requestAnimationFrame(() => {
                        if (ui.textarea) ui.textarea.scrollTop = ui.textarea.scrollHeight;
                    });
                });

                // ── Botão "Sair" dentro da janela PiP (exitMinimalistBtn) ───
                //    Como o container foi movido para outra window, o listener
                //    precisa ser registrado depois do appendChild.
                const exitBtn = pipWindow.document.getElementById('exitMinimalistBtn');
                if (exitBtn) {
                    exitBtn.addEventListener('click', () => {
                        // Fechar a janela PiP dispara o evento 'pagehide' acima,
                        // que cuida de toda a limpeza de estado.
                        pipWindow.close();
                    });
                }

            } catch (err) {
                console.warn('Document PiP (minimalist) bloqueado:', err);
                ui.statusMsg.textContent = 'Permissão de janela flutuante negada pelo navegador.';
                ui.statusMsg.className   = 'status-bar active status-warning';
                setTimeout(() => {
                    ui.statusMsg.textContent = '';
                    ui.statusMsg.className   = 'status-bar';
                }, 4000);
            }

        // ── CAMINHO 2: window.open (Firefox, Safari, Edge legado) ────────
        } else {
            // O popup abre a mesma página com o parâmetro ?mode=minimalist.
            // A página detecta o parâmetro no DOMContentLoaded e ativa o modo.
            const W = 260;
            const H = 90;
            // Posiciona no canto inferior direito do monitor disponível
            const screenLeft = window.screen.availLeft || 0;
            const screenTop  = window.screen.availTop  || 0;
            const left = (screenLeft + window.screen.availWidth)  - W - 16;
            const top  = (screenTop  + window.screen.availHeight) - H - 16;

            window.open(
                window.location.pathname + '?mode=minimalist',
                'DitadoMiniWidget',
                `width=${W},height=${H},left=${left},top=${top},popup=yes,` +
                `resizable=no,scrollbars=no,toolbar=no,menubar=no,status=no`
            );
        }
    });
}

// ============================================================
// POPOVER — Listeners de interação
// ============================================================

// Fechar o popover pelo botão X
if (ui.closePopoverBtn) {
    ui.closePopoverBtn.addEventListener('click', () => {
        closePopover(ui.toggleMinimalistBtn);
    });
}

// Fechar o popover com Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.minimalistPopover && !ui.minimalistPopover.hidden) {
        closePopover(ui.toggleMinimalistBtn);
    }
});

// Sincronização bidirecional: edição no popover atualiza a textarea principal
if (ui.popoverTextArea) {
    ui.popoverTextArea.addEventListener('input', () => {
        ui.textarea.value = ui.popoverTextArea.value;
        ui.popoverTextArea.style.height = 'auto';
        ui.popoverTextArea.style.height = Math.min(ui.popoverTextArea.scrollHeight, 200) + 'px';
    });
}

// Copiar texto via popover
if (ui.popoverCopyBtn) {
    ui.popoverCopyBtn.addEventListener('click', () => {
        if (ui.btnCopy) ui.btnCopy.click();
        ui.popoverCopyBtn.classList.add('pulsing');
        setTimeout(() => ui.popoverCopyBtn.classList.remove('pulsing'), 1200);
    });
}

// Limpar texto via popover
if (ui.popoverClearBtn) {
    ui.popoverClearBtn.addEventListener('click', () => {
        if (ui.btnClear) ui.btnClear.click();
        ui.popoverTextArea.value = '';
        closePopover(ui.toggleMinimalistBtn);
    });
}

// ============================================================
// POPOVER — Ação Jurídica com ciclo assíncrono completo
// Não usa ui.btnAiLegal.click() para evitar efeitos colaterais
// do executeSafely (como parar gravação). Chama o serviço diretamente.
// ============================================================
if (ui.popoverLegalBtn) {
    ui.popoverLegalBtn.addEventListener('click', async () => {
        // 1. Sincroniza a edição do popover de volta à textarea principal
        ui.textarea.value = ui.popoverTextArea.value;
        const text = ui.textarea.value.trim();
        if (!text) return;

        // 2. Feedback visual de início do processamento
        ui.popoverLegalBtn.classList.add('pulsing');
        ui.popoverLegalBtn.disabled = true;
        updateStatus('processing');

        try {
            // 3. Chama o serviço de IA diretamente
            const result = await aiService.convertToLegal(text);

            // 4. Atualiza AMBAS as áreas de texto com o resultado
            ui.textarea.value        = result;
            ui.popoverTextArea.value = result;

            // Recalcula a altura do textarea do popover para o novo conteúdo
            ui.popoverTextArea.style.height = 'auto';
            ui.popoverTextArea.style.height = Math.min(ui.popoverTextArea.scrollHeight, 200) + 'px';

            saveContent();
            updateStatus('success');
            setTimeout(() => updateStatus('idle'), 2000);

        } catch (error) {
            alert('Erro na conversão jurídica (Groq): ' + error.message);
            updateStatus('error');
        } finally {
            // 5. Feedback visual de fim — sempre executado
            ui.popoverLegalBtn.classList.remove('pulsing');
            ui.popoverLegalBtn.disabled = false;
        }
    });
}
