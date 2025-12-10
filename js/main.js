import { GeminiService } from './gemini-service.js';
import { SpeechManager } from './speech-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY_TEXT = 'ditado_backup_text';
    
    const ui = {
        container: document.getElementById('appContainer'),
        toggleSizeBtn: document.getElementById('toggleSizeBtn'),
        iconMinimize: document.getElementById('iconMinimize'),
        iconMaximize: document.getElementById('iconMaximize'),
        
        textarea: document.getElementById('transcriptionArea'),
        canvas: document.getElementById('audioVisualizer'),
        
        micBtn: document.getElementById('micBtn'), 
        micSpan: document.querySelector('#micBtn span'), 
        
        charCount: document.getElementById('charCount'),
        statusMsg: document.getElementById('statusMsg'),
        saveStatus: document.getElementById('saveStatus'),
        
        // Progress Bar Elements
        loadingBar: document.getElementById('modelLoadingBar'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        
        btnCopy: document.getElementById('copyBtn'),
        btnClear: document.getElementById('clearBtn'),
        btnAiFix: document.getElementById('aiFixBtn'),
        btnAiLegal: document.getElementById('aiLegalBtn'),
        fileInput: document.getElementById('fileInput')
    };

    const gemini = new GeminiService();

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
        }
    }

    // --- WHISPER CALLBACKS ---

    // 1. Recebe Texto Final do Whisper
    const handleSpeechResult = (text) => {
        if (!text || text.trim() === '') return;
        
        const currentContent = ui.textarea.value;
        // Adiciona espaço se necessário
        const separator = (currentContent.length > 0 && !currentContent.endsWith('\n')) ? ' ' : '';
        
        ui.textarea.value = currentContent + separator + text.trim();
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
        updateCharCount();
        saveToCache();
    };

    // 2. Monitora Status do Sistema
    const handleSpeechStatus = (status) => {
        if (status === 'rec') {
            ui.micBtn.classList.add('recording');
            ui.micSpan.textContent = "Parar";
            setStatus('rec', "Ouvindo...");
        } 
        else if (status === 'thinking') {
            ui.micBtn.classList.remove('recording');
            ui.micSpan.textContent = "Pensando...";
            ui.micBtn.disabled = true; // Bloqueia enquanto processa
            setStatus('ai', "Transcrevendo...");
        }
        else if (status === 'idle') {
            ui.micBtn.classList.remove('recording');
            ui.micSpan.textContent = "Gravar";
            ui.micBtn.disabled = false;
            setStatus('idle');
        }
        else if (status === 'ready') {
            // Modelo carregado!
            ui.loadingBar.style.display = 'none';
            ui.textarea.placeholder = "Modelo Whisper pronto. Toque no microfone.";
            ui.textarea.disabled = false;
            ui.micBtn.disabled = false;
            ui.micSpan.textContent = "Gravar";
        }
    };

    // 3. Monitora Progresso de Carregamento (Load inicial)
    const handleProgress = (data) => {
        // data.status pode ser 'initiate', 'download', 'progress', 'done'
        if (data.status === 'progress') {
            ui.loadingBar.style.display = 'block';
            const percent = data.progress.toFixed(1) + '%';
            ui.progressFill.style.width = percent;
            ui.progressText.textContent = percent;
        }
    };

    const handleSpeechError = (msg) => {
        setStatus('error', msg);
        ui.micBtn.classList.remove('recording');
        ui.micBtn.disabled = false;
        ui.micSpan.textContent = "Gravar";
    };

    // Instancia o Manager
    const speechManager = new SpeechManager(
        ui.canvas, 
        { 
            onResult: handleSpeechResult, 
            onStatus: handleSpeechStatus,
            onError: handleSpeechError,
            onProgress: handleProgress
        }
    );

    // --- Cache e UI Utils ---
    function saveToCache() {
        localStorage.setItem(STORAGE_KEY_TEXT, ui.textarea.value);
        ui.saveStatus.textContent = "Salvo";
        ui.saveStatus.style.color = "var(--c-copy)";
    }

    function loadFromCache() {
        const saved = localStorage.getItem(STORAGE_KEY_TEXT);
        if (saved) {
            ui.textarea.value = saved;
            updateCharCount();
        }
    }

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }

    loadFromCache();

    // --- Event Listeners ---

    ui.micBtn.addEventListener('click', () => {
        speechManager.toggle();
    });

    ui.textarea.addEventListener('input', () => {
        ui.saveStatus.textContent = "Digitando...";
        updateCharCount();
        saveToCache();
    });

    // IA (Gemini) e Uploads continuam iguais...
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
                    ui.textarea.value += sep + result;
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

    ui.btnClear.addEventListener('click', () => {
        if (ui.textarea.value.length === 0) return;
        if (confirm("Deseja apagar tudo?")) {
            ui.textarea.value = '';
            saveToCache();
            updateCharCount();
            ui.textarea.focus();
        }
    });

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
        setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 350);
    });
});
