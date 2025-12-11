import { SpeechManager } from './speech-manager.js';
import { GeminiService } from './gemini-service.js';
import { setupHotkeys } from './hotkeys.js';
import { CONFIG } from './config.js';

// ======================================================
// 1. GLOSSÁRIO (Dicionário Pessoal)
// ======================================================
const Glossary = {
    terms: JSON.parse(localStorage.getItem('dd_glossary')) || [],

    // Adicionar novo termo
    add(from, to) {
        if (!from || !to) return false;
        // Evita duplicatas do termo "gatilho"
        const exists = this.terms.some(t => t.from.toLowerCase() === from.toLowerCase());
        if (exists) return false;

        this.terms.push({ from: from.toLowerCase(), to });
        this.save();
        return true;
    },

    // Remover termo por índice
    remove(index) {
        this.terms.splice(index, 1);
        this.save();
    },

    // Salvar no LocalStorage e atualizar UI
    save() {
        localStorage.setItem('dd_glossary', JSON.stringify(this.terms));
        this.render();
    },

    // Processar texto (Substituição Inteligente)
    process(text) {
        let processed = text;
        this.terms.forEach(term => {
            // Regex: \b garante que substitua apenas palavras inteiras (ex: evita trocar "art" em "partir")
            // 'gi': Global + Case Insensitive
            try {
                const regex = new RegExp(`\\b${term.from}\\b`, 'gi');
                processed = processed.replace(regex, term.to);
            } catch (e) {
                console.warn('Erro no Regex do Glossário:', e);
            }
        });
        return processed;
    },

    // Renderizar a lista no Modal (se existir na DOM)
    render() {
        const listEl = document.getElementById('glossaryList');
        if (!listEl) return;

        listEl.innerHTML = '';
        if (this.terms.length === 0) {
            listEl.innerHTML = '<div style="padding:10px; color:#9ca3af; text-align:center;">Nenhum termo cadastrado.</div>';
            return;
        }

        this.terms.forEach((term, index) => {
            const item = document.createElement('div');
            item.className = 'glossary-item';
            item.innerHTML = `
                <span><strong>"${term.from}"</strong> &rarr; ${term.to}</span>
                <button class="btn-delete-term" data-index="${index}">&times;</button>
            `;
            listEl.appendChild(item);
        });

        // Reatribuir eventos de delete
        document.querySelectorAll('.btn-delete-term').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                this.remove(idx);
            });
        });
    }
};

// ======================================================
// 2. VARIÁVEIS DE ESTADO E UI
// ======================================================
const ui = {
    textarea: document.getElementById('transcriptionArea'),
    charCount: document.getElementById('charCount'),
    saveStatus: document.getElementById('saveStatus'),
    statusMsg: document.getElementById('statusMsg'),
    micBtn: document.getElementById('micBtn'),
    clearBtn: document.getElementById('clearBtn'),
    copyBtn: document.getElementById('copyBtn'),
    aiFixBtn: document.getElementById('aiFixBtn'),
    aiLegalBtn: document.getElementById('aiLegalBtn'),
    fileInput: document.getElementById('fileInput'),
    audioSource: document.getElementById('audioSource'),
    toggleSizeBtn: document.getElementById('toggleSizeBtn'),
    appContainer: document.getElementById('appContainer'),
    visualizer: document.getElementById('audioVisualizer'),
    // Glossário UI
    glossaryBtn: document.getElementById('glossaryBtn'), // Botão no Header (Novo)
    glossaryModal: document.getElementById('glossaryModal'),
    closeGlossaryBtn: document.getElementById('closeGlossaryBtn'),
    addTermBtn: document.getElementById('addTermBtn'),
    termInput: document.getElementById('termInput'),
    replaceInput: document.getElementById('replaceInput'),
    // Modais existentes
    helpBtn: document.getElementById('helpBtn'),
    changelogModal: document.getElementById('changelogModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    versionBtn: document.getElementById('versionBtn')
};

// Undo System State
let undoStack = null;
let undoTimeout = null;

// ======================================================
// 3. FUNÇÃO DE SEGURANÇA (AUTO-STOP) - PRIORIDADE 1
// ======================================================
/**
 * Garante que nenhuma ação crítica ocorra enquanto o microfone
 * está aberto, evitando conflitos de áudio e erros de estado.
 */
const executeSafely = async (actionCallback) => {
    // Se estiver gravando, para tudo primeiro
    if (window.speechManager && window.speechManager.isRecording) {
        console.log('[SafeGuard] Parando gravação antes da ação...');
        
        // Feedback visual de transição
        ui.micBtn.style.backgroundColor = '#f59e0b'; // Amber warning
        
        window.speechManager.stop();

        // Pequeno delay para garantir que o evento 'end' da API disparou
        // e o último buffer de áudio foi processado.
        await new Promise(resolve => setTimeout(resolve, 400));
        
        ui.micBtn.style.backgroundColor = ''; // Restaura cor
    }

    // Executa a ação desejada
    actionCallback();
};

// ======================================================
// 4. SPEECH MANAGER & PROCESSAMENTO
// ======================================================

// Instancia o Gerenciador de Áudio
window.speechManager = new SpeechManager(
    // Callback de Transcrição
    (text, isFinal) => {
        if (isFinal) {
            // APLICAÇÃO DO GLOSSÁRIO AQUI
            const processedText = Glossary.process(text);
            insertTextAtCursor(processedText + ' ');
            saveToLocal();
        } else {
            // Texto provisório (interino) não passa pelo glossário para performance
            // e para não confundir o usuário enquanto ele fala
            showInterimText(text);
        }
    },
    // Callback de Status
    (status, type) => {
        ui.statusMsg.textContent = status;
        ui.statusMsg.className = `status-bar status-${type} active`;
        
        if (type === 'recording') {
            ui.micBtn.classList.add('recording');
        } else {
            ui.micBtn.classList.remove('recording');
            // Oculta status após 3s se não for erro
            if (type !== 'error') {
                setTimeout(() => {
                    if (!window.speechManager.isRecording) {
                        ui.statusMsg.classList.remove('active');
                    }
                }, 3000);
            }
        }
    }
);

// Função auxiliar para inserir texto onde o cursor está
function insertTextAtCursor(text) {
    const start = ui.textarea.selectionStart;
    const end = ui.textarea.selectionEnd;
    const currentText = ui.textarea.value;
    
    ui.textarea.value = currentText.substring(0, start) + text + currentText.substring(end);
    ui.textarea.selectionStart = ui.textarea.selectionEnd = start + text.length;
    ui.textarea.focus();
    updateCharCount();
}

function showInterimText(text) {
    // Visualmente poderia ser um overlay, mas aqui mantemos simples
    ui.statusMsg.textContent = `Ouvindo: ${text}...`;
    ui.statusMsg.className = 'status-bar status-ai active';
}

// ======================================================
// 5. EVENT LISTENERS (USANDO executeSafely)
// ======================================================

// Botão Microfone (Toggle)
ui.micBtn.addEventListener('click', () => {
    window.speechManager.toggle();
});

// Botão Limpar (Com Undo e Safety)
ui.clearBtn.addEventListener('click', () => {
    executeSafely(() => {
        handleClearAction();
    });
});

function handleClearAction() {
    if (ui.textarea.value.trim() === '') return;

    // Salva estado para Undo
    undoStack = ui.textarea.value;
    ui.textarea.value = '';
    saveToLocal();
    updateCharCount();

    // Mostra Toast
    showUndoToast();
}

// Botão Copiar (Safety)
ui.copyBtn.addEventListener('click', () => {
    executeSafely(async () => {
        if (!ui.textarea.value) return;
        try {
            await navigator.clipboard.writeText(ui.textarea.value);
            ui.statusMsg.textContent = 'Texto copiado!';
            ui.statusMsg.className = 'status-bar status-success active';
            setTimeout(() => ui.statusMsg.classList.remove('active'), 2000);
        } catch (err) {
            ui.statusMsg.textContent = 'Erro ao copiar';
            ui.statusMsg.className = 'status-bar status-error active';
        }
    });
});

// Botão IA: Corrigir Gramática (Safety)
ui.aiFixBtn.addEventListener('click', () => {
    executeSafely(() => {
        handleAiAction('fix');
    });
});

// Botão IA: Jurídico (Safety)
ui.aiLegalBtn.addEventListener('click', () => {
    executeSafely(() => {
        handleAiAction('legal');
    });
});

// Lógica de IA (Gemini)
async function handleAiAction(mode) {
    const text = ui.textarea.value;
    if (!text || text.length < 5) {
        alert('Digite ou dite algo primeiro.');
        return;
    }

    ui.statusMsg.textContent = 'IA Processando...';
    ui.statusMsg.className = 'status-bar status-ai active';

    try {
        const result = await GeminiService.processText(text, mode);
        if (result) {
            ui.textarea.value = result;
            saveToLocal();
            updateCharCount();
            ui.statusMsg.textContent = 'Processado com sucesso!';
            ui.statusMsg.className = 'status-bar status-success active';
        }
    } catch (error) {
        console.error(error);
        ui.statusMsg.textContent = 'Erro na IA. Verifique a chave API.';
        ui.statusMsg.className = 'status-bar status-error active';
    }
}

// ======================================================
// 6. GESTÃO DO MODAL DE GLOSSÁRIO
// ======================================================

if (ui.glossaryBtn) {
    ui.glossaryBtn.addEventListener('click', () => {
        Glossary.render(); // Atualiza lista ao abrir
        ui.glossaryModal.style.display = 'flex';
        ui.termInput.focus();
    });
}

if (ui.closeGlossaryBtn) {
    ui.closeGlossaryBtn.addEventListener('click', () => {
        ui.glossaryModal.style.display = 'none';
    });
}

if (ui.addTermBtn) {
    ui.addTermBtn.addEventListener('click', () => {
        const added = Glossary.add(ui.termInput.value, ui.replaceInput.value);
        if (added) {
            ui.termInput.value = '';
            ui.replaceInput.value = '';
            ui.termInput.focus();
        } else {
            alert('Erro: Termos inválidos ou já existentes.');
        }
    });
}

// Fechar modal ao clicar fora
window.addEventListener('click', (e) => {
    if (e.target === ui.glossaryModal) ui.glossaryModal.style.display = 'none';
    if (e.target === ui.changelogModal) ui.changelogModal.style.display = 'none';
});


// ======================================================
// 7. UTILITÁRIOS GERAIS (Persistência e UI)
// ======================================================

// Salvar no LocalStorage
function saveToLocal() {
    localStorage.setItem(CONFIG.STORAGE_KEY, ui.textarea.value);
    ui.saveStatus.textContent = 'Salvo agora';
    setTimeout(() => ui.saveStatus.textContent = 'Sincronizado', 2000);
}

// Carregar do LocalStorage
function loadFromLocal() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (saved) {
        ui.textarea.value = saved;
        updateCharCount();
    }
}

// Contador de Caracteres
function updateCharCount() {
    const count = ui.textarea.value.length;
    ui.charCount.textContent = `${count} caracteres`;
}

ui.textarea.addEventListener('input', () => {
    updateCharCount();
    saveToLocal();
});

// Toast de Undo
function showUndoToast() {
    const container = document.getElementById('toastContainer');
    container.innerHTML = `
        <div class="toast">
            <span>Texto apagado.</span>
            <button id="undoBtn" class="btn-undo">Desfazer (5s)</button>
        </div>
    `;

    document.getElementById('undoBtn').addEventListener('click', performUndo);

    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
        container.innerHTML = '';
        undoStack = null;
    }, 5000);
}

// Função pública para ser chamada via botão ou atalho (Hotkeys)
window.performUndo = function() {
    if (undoStack !== null) {
        ui.textarea.value = undoStack;
        saveToLocal();
        updateCharCount();
        undoStack = null;
        document.getElementById('toastContainer').innerHTML = '';
        
        ui.statusMsg.textContent = 'Texto restaurado!';
        ui.statusMsg.className = 'status-bar status-success active';
    }
};

// Widget Mode Toggle
ui.toggleSizeBtn.addEventListener('click', () => {
    ui.appContainer.classList.toggle('minimized');
    const isMin = ui.appContainer.classList.contains('minimized');
    
    document.getElementById('iconMinimize').style.display = isMin ? 'none' : 'block';
    document.getElementById('iconMaximize').style.display = isMin ? 'block' : 'none';

    if (isMin) {
        window.resizeTo(400, 600); 
    } else {
        window.resizeTo(920, 800);
    }
});

// Upload de Arquivo
ui.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        ui.statusMsg.textContent = 'Carregando áudio...';
        ui.statusMsg.className = 'status-bar status-ai active';
        // Simulação - Feature futura de transcrição de arquivo
        setTimeout(() => {
            alert('Transcrição de arquivo requer Backend ou API avançada (Whisper).');
            ui.statusMsg.classList.remove('active');
        }, 1000);
    }
});

// Carregar Lista de Dispositivos (Microfones)
navigator.mediaDevices.enumerateDevices().then(devices => {
    ui.audioSource.innerHTML = '<option value="default">Padrão do Sistema</option>';
    devices.filter(d => d.kind === 'audioinput').forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Microfone ${ui.audioSource.length + 1}`;
        ui.audioSource.appendChild(option);
    });
});

// Inicialização
window.addEventListener('DOMContentLoaded', () => {
    loadFromLocal();
    setupHotkeys(); // Inicializa atalhos (Alt+G, Alt+L, etc)
});

// Expõe funções necessárias para o módulo de Hotkeys
window.triggerMic = () => ui.micBtn.click();
window.triggerClear = () => ui.clearBtn.click();
window.triggerCopy = () => ui.copyBtn.click();
