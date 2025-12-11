import { SpeechManager } from './speech-manager.js';
import { CONFIG } from './config.js';
import { aiService } from './gemini-service.js';
import { setupHotkeys } from './hotkeys.js';

// ========================================================
// 1. MÓDULO GLOSSÁRIO (PRIORIDADE 3)
// ========================================================
const Glossary = {
    terms: JSON.parse(localStorage.getItem('dd_glossary')) || [],

    add(from, to) {
        if (!from || !to) return;
        this.terms.push({ from: from.toLowerCase().trim(), to: to.trim() });
        this.save();
        this.render();
    },

    remove(index) {
        this.terms.splice(index, 1);
        this.save();
        this.render();
    },

    save() {
        localStorage.setItem('dd_glossary', JSON.stringify(this.terms));
    },

    // Aplica substituições no texto recebido
    process(text) {
        let processed = text;
        this.terms.forEach(term => {
            // Regex com borda de palavra (\b) para evitar substituições parciais indesejadas
            // Ex: trocar 'lei' não deve afetar 'leite'
            try {
                const regex = new RegExp(`\\b${term.from}\\b`, 'gi');
                processed = processed.replace(regex, term.to);
            } catch (e) {
                console.warn(`Termo inválido no glossário: ${term.from}`);
            }
        });
        return processed;
    },

    render() {
        const listEl = document.getElementById('glossaryList');
        if (!listEl) return;

        listEl.innerHTML = '';
        this.terms.forEach((term, index) => {
            const item = document.createElement('div');
            item.className = 'glossary-item';
            item.innerHTML = `
                <span><strong>"${term.from}"</strong> ➝ ${term.to}</span>
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

// ========================================================
// 2. REFERÊNCIAS DE UI
// ========================================================
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
    // Glossário UI
    glossaryBtn: document.getElementById('glossaryBtn'),
    glossaryModal: document.getElementById('glossaryModal'),
    closeGlossaryBtn: document.getElementById('closeGlossaryBtn'),
    addTermBtn: document.getElementById('addTermBtn'),
    termInput: document.getElementById('termInput'),
    replaceInput: document.getElementById('replaceInput'),
    // Toast Container (Sistema de Undo da v1.0.1)
    toastContainer: document.getElementById('toastContainer')
};

// Estado Local
let undoStack = null; 

// ========================================================
// 3. FLUXO SEGURO - AUTO STOP (PRIORIDADE 1)
// ========================================================

/**
 * Wrapper que garante que o microfone esteja desligado antes de executar uma ação.
 * Evita conflitos de estado e feedback de áudio.
 */
async function executeSafely(actionCallback) {
    if (speechManager.isRecording) {
        // Feedback visual de "Parando..."
        const originalColor = ui.micBtn.style.backgroundColor;
        ui.micBtn.style.backgroundColor = '#f59e0b'; // Amber
        ui.micBtn.querySelector('span').innerText = 'Parando...';
        
        speechManager.stop();
        
        // Pequeno delay para garantir que o evento 'onend' do reconhecimento processe
        // e o último fragmento de áudio seja descartado ou processado.
        await new Promise(resolve => setTimeout(resolve, 300));
        
        ui.micBtn.style.backgroundColor = originalColor; // Reseta (o updateStatus fará o resto)
    }
    
    // Executa a ação solicitada
    actionCallback();
}

// ========================================================
// 4. CONFIGURAÇÃO DO SPEECH MANAGER
// ========================================================
const speechManager = new SpeechManager(
    'audioVisualizer',
    // Callback de Resultado
    (finalText, interimText) => {
        // Processa texto final pelo GLOSSÁRIO antes de exibir
        if (finalText) {
            const processedFinal = Glossary.process(finalText);
            
            // Lógica de pontuação inteligente (básica)
            const currentContent = ui.textarea.value;
            let prefix = "";
            if (currentContent.length > 0 && !currentContent.endsWith(' ') && !currentContent.endsWith('\n')) {
                prefix = " ";
            }
            
            ui.textarea.value += prefix + processedFinal;
            updateStats();
            saveToStorage();
            
            // Rolar para o fim
            ui.textarea.scrollTop = ui.textarea.scrollHeight;
        }
        // Texto interino não passa pelo glossário para performance, apenas visualização
        // (Poderia implementar, mas pode causar "flicker")
    },
    // Callback de Status
    (status) => {
        updateStatusUI(status);
    }
);

// ========================================================
// 5. FUNÇÕES AUXILIARES DE UI & STORAGE
// ========================================================
function updateStatusUI(status) {
    ui.statusMsg.className = 'status-bar'; // Reset
    
    switch(status) {
        case 'recording':
            ui.statusMsg.textContent = "GRAVANDO";
            ui.statusMsg.classList.add('status-recording', 'active');
            ui.micBtn.classList.add('recording');
            ui.micBtn.querySelector('span').textContent = 'Parar';
            break;
        case 'stopped':
            ui.statusMsg.textContent = "AGUARDANDO";
            ui.statusMsg.classList.remove('active'); // Oculta a barra
            ui.micBtn.classList.remove('recording');
            ui.micBtn.querySelector('span').textContent = 'Gravar';
            break;
        case 'error':
            ui.statusMsg.textContent = "ERRO / MICROFONE";
            ui.statusMsg.classList.add('status-error', 'active');
            ui.micBtn.classList.remove('recording');
            break;
        case 'processing': // Usado pelas funções de IA
            ui.statusMsg.textContent = "PROCESSANDO IA...";
            ui.statusMsg.classList.add('status-ai', 'active');
            break;
    }
}

function updateStats() {
    ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
}

function saveToStorage() {
    localStorage.setItem(CONFIG.STORAGE_KEY, ui.textarea.value);
    ui.saveStatus.textContent = "Salvo";
    setTimeout(() => ui.saveStatus.textContent = "Sincronizado", 2000);
}

// Lógica de Toast + Undo (Mantido da v1.0.1)
function showToast(message, isUndoable = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let html = `<span>${message}</span>`;
    if (isUndoable) {
        html += `<button id="undoActionBtn" class="btn-undo">Desfazer (5s)</button>`;
    }
    toast.innerHTML = html;
    
    ui.toastContainer.appendChild(toast);

    let undoTimeout;

    if (isUndoable) {
        const btn = toast.querySelector('#undoActionBtn');
        btn.addEventListener('click', () => {
            if (undoStack !== null) {
                ui.textarea.value = undoStack;
                saveToStorage();
                undoStack = null;
                toast.remove();
                clearTimeout(undoTimeout);
            }
        });
        
        // Auto-remove após 5s
        undoTimeout = setTimeout(() => {
            if (toast.parentNode) toast.remove();
            undoStack = null; // Expira o undo
        }, 5000);
    } else {
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }
}

// ========================================================
// 6. EVENT LISTENERS (PROTEGIDOS POR executeSafely)
// ========================================================

// Botão de Microfone (Toggle)
ui.micBtn.addEventListener('click', () => {
    if (speechManager.isRecording) {
        speechManager.stop();
    } else {
        speechManager.start();
    }
});

// Botão Limpar (Com Undo e Fluxo Seguro)
ui.clearBtn.addEventListener('click', () => {
    executeSafely(() => {
        if (ui.textarea.value.trim().length === 0) return;
        
        undoStack = ui.textarea.value; // Salva para backup
        ui.textarea.value = '';
        updateStats();
        saveToStorage();
        showToast("Texto limpo.", true);
    });
});

// Botão Copiar (Fluxo Seguro)
ui.copyBtn.addEventListener('click', () => {
    executeSafely(() => {
        if (!ui.textarea.value) return;
        navigator.clipboard.writeText(ui.textarea.value).then(() => {
            showToast("Texto copiado para a área de transferência!");
        });
    });
});

// Funções de IA (Corrigir e Jurídico) - Wrapper
async function handleAiAction(promptType) {
    const text = ui.textarea.value;
    if (text.length < 5) {
        showToast("Texto muito curto para processar.");
        return;
    }

    updateStatusUI('processing');
    
    try {
        const result = await aiService.processText(text, promptType);
        if (result) {
            ui.textarea.value = result;
            saveToStorage();
            updateStats();
            showToast("Processamento IA concluído!");
        }
    } catch (error) {
        showToast("Erro na IA: " + error.message);
    } finally {
        updateStatusUI('stopped');
    }
}

// Botões IA
ui.aiFixBtn.addEventListener('click', () => {
    executeSafely(() => handleAiAction('grammar'));
});

ui.aiLegalBtn.addEventListener('click', () => {
    executeSafely(() => handleAiAction('legal'));
});

// ========================================================
// 7. GERENCIAMENTO DE MODAIS E GLOSSÁRIO
// ========================================================

// Abrir Modal Glossário
if (ui.glossaryBtn) {
    ui.glossaryBtn.addEventListener('click', () => {
        Glossary.render(); // Atualiza a lista
        ui.glossaryModal.style.display = 'flex';
    });
}

// Fechar Modal Glossário
if (ui.closeGlossaryBtn) {
    ui.closeGlossaryBtn.addEventListener('click', () => {
        ui.glossaryModal.style.display = 'none';
    });
}

// Adicionar Termo
if (ui.addTermBtn) {
    ui.addTermBtn.addEventListener('click', () => {
        const from = ui.termInput.value;
        const to = ui.replaceInput.value;
        if (from && to) {
            Glossary.add(from, to);
            ui.termInput.value = '';
            ui.replaceInput.value = '';
            ui.termInput.focus();
        }
    });
}

// Fechar modais ao clicar fora
window.onclick = (event) => {
    if (event.target == ui.glossaryModal) {
        ui.glossaryModal.style.display = "none";
    }
    // Suporte ao modal de changelog existente
    const changelogModal = document.getElementById('changelogModal');
    if (event.target == changelogModal) {
        changelogModal.style.display = "none";
    }
};

// ========================================================
// 8. INICIALIZAÇÃO
// ========================================================
window.addEventListener('DOMContentLoaded', () => {
    // Carrega texto salvo
    const savedText = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (savedText) {
        ui.textarea.value = savedText;
        updateStats();
    }

    // Inicializa Atalhos (Passando as referências protegidas)
    setupHotkeys({
        toggleMic: () => ui.micBtn.click(),
        clear: () => ui.clearBtn.click(), // Já chama o executeSafely
        copy: () => ui.copyBtn.click(),   // Já chama o executeSafely
        undo: () => {
            const undoBtn = document.getElementById('undoActionBtn');
            if (undoBtn) undoBtn.click();
        }
    });

    // Toggle de Tamanho (Código legado da v1.0.0 mantido para funcionalidade)
    const toggleSizeBtn = document.getElementById('toggleSizeBtn');
    const container = document.getElementById('appContainer');
    const iconMinimize = document.getElementById('iconMinimize');
    const iconMaximize = document.getElementById('iconMaximize');

    toggleSizeBtn.addEventListener('click', () => {
        container.classList.toggle('minimized');
        const isMin = container.classList.contains('minimized');
        
        if (isMin) {
            iconMinimize.style.display = 'none';
            iconMaximize.style.display = 'block';
            window.resizeTo(450, 600);
        } else {
            iconMinimize.style.display = 'block';
            iconMaximize.style.display = 'none';
            window.resizeTo(920, 800);
        }
    });
    
    // Inicialização da lista do glossário para garantir eventos
    Glossary.render();
});
