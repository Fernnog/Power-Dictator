import { SpeechManager } from './speech-manager.js';
import { aiService } from './gemini-service.js';
import { changelogData, currentVersion } from './changelog.js';

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

    // Novo: Glossário
    glossaryBtn: document.getElementById('glossaryBtn'), // Botão precisa ser criado no HTML
    glossaryModal: document.getElementById('glossaryModal'), // Modal precisa ser criado no HTML
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
// 2. MÓDULO GLOSSÁRIO (Novidade v1.0.2)
// ========================================================
const Glossary = {
    terms: JSON.parse(localStorage.getItem('dd_glossary')) || [],

    add(from, to) {
        if (!from || !to) return;
        this.terms.push({ from: from.toLowerCase(), to });
        this.save();
        this.render();
        ui.termInput.value = '';
        ui.replaceInput.value = '';
    },

    remove(index) {
        this.terms.splice(index, 1);
        this.save();
        this.render();
    },

    save() {
        localStorage.setItem('dd_glossary', JSON.stringify(this.terms));
    },

    // Aplica as substituições no texto recebido
    process(text) {
        let processed = text;
        this.terms.forEach(term => {
            // Regex global, case-insensitive, palavra inteira ou fronteira
            const regex = new RegExp(`\\b${term.from}\\b`, 'gi');
            processed = processed.replace(regex, term.to);
        });
        return processed;
    },

    render() {
        if (!ui.glossaryList) return;
        ui.glossaryList.innerHTML = '';
        if (this.terms.length === 0) {
            ui.glossaryList.innerHTML = '<p style="color:#9ca3af; text-align:center;">Nenhum termo cadastrado.</p>';
            return;
        }

        this.terms.forEach((term, index) => {
            const div = document.createElement('div');
            div.className = 'glossary-item'; // Classe definida no CSS
            div.innerHTML = `
                <span><strong>${term.from}</strong> ➝ ${term.to}</span>
                <button class="btn-delete-term" data-index="${index}">&times;</button>
            `;
            ui.glossaryList.appendChild(div);
        });

        // Event listeners para deletar
        document.querySelectorAll('.btn-delete-term').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.remove(parseInt(e.target.dataset.index));
            });
        });
    }
};

// ========================================================
// 3. FLUXO SEGURO (AUTO-STOP) (Novidade v1.0.2)
// ========================================================

/**
 * Garante que o microfone seja desligado antes de executar ações críticas.
 * Evita conflitos de áudio e erros de estado.
 */
const executeSafely = async (actionCallback) => {
    if (speechManager && speechManager.isRecording) {
        // 1. Para a gravação
        speechManager.stop();
        
        // 2. Feedback visual de transição (Laranja)
        const originalColor = ui.micBtn.style.backgroundColor;
        ui.micBtn.style.backgroundColor = '#f59e0b'; // Amber
        
        // 3. Aguarda o encerramento do stream (pequeno delay técnico)
        await new Promise(resolve => setTimeout(resolve, 300));
        
        ui.micBtn.style.backgroundColor = ''; // Restaura cor original
    }
    // 4. Executa a ação
    actionCallback();
};

// ========================================================
// 4. GERENCIAMENTO DE ÁUDIO & DISPOSITIVOS
// ========================================================

const handleTranscriptionResult = (finalText, interimText) => {
    if (finalText) {
        // Processa o texto com o Glossário antes de inserir
        const processedText = Glossary.process(finalText);
        
        // Insere o texto onde o cursor está ou no final
        const start = ui.textarea.selectionStart;
        const end = ui.textarea.selectionEnd;
        const text = ui.textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        
        // Adiciona espaço automático se necessário
        const prefix = (before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n')) ? ' ' : '';
        
        ui.textarea.value = before + prefix + processedText + after;
        
        // Move o cursor para o final do novo texto
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
    } else {
        ui.statusMsg.textContent = "";
        ui.statusMsg.classList.remove('active');
        ui.micBtn.classList.remove('recording');
    }
};

// Instancia o Gerenciador de Áudio
const speechManager = new SpeechManager('audioVisualizer', handleTranscriptionResult, updateStatus);

// Inicializa o Seletor de Dispositivos (Headsets)
async function initDeviceSelector() {
    // Tenta obter dispositivos. O navegador pode pedir permissão aqui.
    const devices = await speechManager.getAudioDevices();
    
    ui.audioSource.innerHTML = '<option value="default">Padrão do Sistema</option>';
    
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        // Se label vazio (permissão negada/pendente), usa nome genérico
        option.text = device.label || `Microfone ${ui.audioSource.length}`;
        ui.audioSource.appendChild(option);
    });

    ui.audioSource.addEventListener('change', (e) => {
        speechManager.setDeviceId(e.target.value);
        // Feedback visual
        ui.audioSource.style.borderColor = '#4f46e5';
        setTimeout(() => ui.audioSource.style.borderColor = '', 300);
    });
}

// ========================================================
// 5. EVENT LISTENERS & AÇÕES
// ========================================================

// Botão Gravar (Toggle)
ui.micBtn.addEventListener('click', () => {
    if (speechManager.isRecording) {
        speechManager.stop();
    } else {
        speechManager.start();
    }
});

// Botão Upload (Leitura de Arquivo Texto/Áudio Simulado)
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
            updateStatus('success'); // Implementar feedback temporário se desejar
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
        document.execCommand('copy'); // Fallback ou Clipboard API
        navigator.clipboard.writeText(ui.textarea.value);
        
        const originalText = ui.btnCopy.querySelector('span').textContent;
        ui.btnCopy.querySelector('span').textContent = "Copiado!";
        ui.btnCopy.classList.add('status-success'); // Classe visual se existir
        
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

    // 1. Salva estado para Undo
    tempDeletedText = ui.textarea.value;
    ui.textarea.value = '';
    saveContent();
    updateCharCount();

    // 2. Cria/Mostra Toast
    showUndoToast();
}

function showUndoToast() {
    // Remove anterior se existir
    ui.toastContainer.innerHTML = '';
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span>Texto limpo.</span>
        <button id="undoBtn" class="btn-undo">Desfazer (Alt+Z)</button>
    `;
    
    ui.toastContainer.appendChild(toast);

    // Lógica do Botão Desfazer
    document.getElementById('undoBtn').addEventListener('click', performUndo);

    // Timer para sumir (5s)
    if (undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
        tempDeletedText = ''; // Limpa memória
    }, 5000);
}

function performUndo() {
    if (tempDeletedText) {
        ui.textarea.value = tempDeletedText;
        saveContent();
        updateCharCount();
        ui.toastContainer.innerHTML = ''; // Remove Toast
        tempDeletedText = '';
        if (undoTimeout) clearTimeout(undoTimeout);
    }
}

// ========================================================
// 6. UTILITÁRIOS & PERSISTÊNCIA
// ========================================================

function updateCharCount() {
    const count = ui.textarea.value.length;
    ui.charCount.textContent = `${count} caracteres`;
}

function saveContent() {
    localStorage.setItem('dd_autosave', ui.textarea.value);
    ui.saveStatus.textContent = "Salvo agora";
    setTimeout(() => ui.saveStatus.textContent = "Sincronizado", 2000);
}

function loadContent() {
    const saved = localStorage.getItem('dd_autosave');
    if (saved) {
        ui.textarea.value = saved;
        updateCharCount();
    }
}

// Toggle Widget Mode (Minimizar/Maximizar)
ui.toggleSizeBtn.addEventListener('click', () => {
    ui.container.classList.toggle('minimized');
    const isMin = ui.container.classList.contains('minimized');
    
    document.getElementById('iconMinimize').style.display = isMin ? 'none' : 'block';
    document.getElementById('iconMaximize').style.display = isMin ? 'block' : 'none';
    
    // Resize da janela (se possível/permitido pelo browser)
    if (window.opener && !window.opener.closed) {
        // Lógica opcional de resize da janela popup
    }
});

// ========================================================
// 7. MODAIS (Versão, Changelog, Glossário, Ajuda)
// ========================================================

// --- Modal de Versão / Changelog ---
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

// --- Modal de Glossário (Lógica de UI) ---
if (ui.glossaryBtn && ui.glossaryModal) {
    ui.glossaryBtn.addEventListener('click', () => {
        Glossary.render();
        ui.glossaryModal.style.display = 'flex';
    });
    
    ui.closeGlossaryBtn.addEventListener('click', () => {
        ui.glossaryModal.style.display = 'none';
    });
    
    ui.addTermBtn.addEventListener('click', () => {
        Glossary.add(ui.termInput.value, ui.replaceInput.value);
    });
}

// Fechar modais ao clicar fora
window.addEventListener('click', (e) => {
    if (e.target === ui.changelogModal) ui.changelogModal.style.display = 'none';
    if (e.target === ui.glossaryModal) ui.glossaryModal.style.display = 'none';
});

// ========================================================
// 8. ATALHOS DE TECLADO (v1.0.1)
// ========================================================
document.addEventListener('keydown', (e) => {
    // Alt + G: Gravar
    if (e.altKey && e.code === 'KeyG') {
        e.preventDefault();
        ui.micBtn.click();
    }
    // Alt + L: Limpar
    if (e.altKey && e.code === 'KeyL') {
        e.preventDefault();
        executeSafely(() => handleClearAction());
    }
    // Alt + C: Copiar
    if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        ui.btnCopy.click();
    }
    // Alt + Z: Undo
    if (e.altKey && e.code === 'KeyZ') {
        e.preventDefault();
        performUndo();
    }
});

// ========================================================
// 9. INICIALIZAÇÃO
// ========================================================
window.addEventListener('DOMContentLoaded', () => {
    loadContent();
    ui.versionBtn.textContent = `v${currentVersion}`;
    initDeviceSelector(); // Carrega lista de microfones
    
    // Expor SpeechManager globalmente para debug (opcional)
    window.speechManager = speechManager;
});
