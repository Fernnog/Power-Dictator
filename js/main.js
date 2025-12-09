import { GeminiService } from './gemini-service.js';
import { SpeechManager } from './speech-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // CONFIG E UI REFERÊNCIAS
    // =========================================================================
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
        
        // Elementos da Barra de Progresso Whisper (Novos)
        loadingBar: document.getElementById('modelLoadingBar'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        
        btnCopy: document.getElementById('copyBtn'),
        btnClear: document.getElementById('clearBtn'),
        btnAiFix: document.getElementById('aiFixBtn'),
        btnAiLegal: document.getElementById('aiLegalBtn'),
        fileInput: document.getElementById('fileInput')
    };

    // =========================================================================
    // HELPER: STATUS BAR
    // =========================================================================
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
            case 'processing': ui.statusMsg.classList.add('status-processing'); break; // Novo Estado
            case 'success': ui.statusMsg.classList.add('status-success'); break;
            case 'error': ui.statusMsg.classList.add('status-error'); break;
        }
    }

    // =========================================================================
    // INSTANCIAÇÃO DOS SERVIÇOS
    // =========================================================================
    
    const gemini = new GeminiService();
    
    let isMachineTyping = false; // Flag para evitar loop de evento 'input'

    // Callback para lidar com resultados do ditado (Whisper retorna texto consolidado)
    const handleSpeechResult = (finalText, interimText) => {
        isMachineTyping = true;
        
        // Se houver texto final (Whisper)
        if (finalText) {
            // Lógica simples: adiciona espaço se necessário
            const currentVal = ui.textarea.value;
            const separator = (currentVal.length > 0 && !currentVal.endsWith(' ') && !currentVal.endsWith('\n')) ? ' ' : '';
            
            ui.textarea.value = currentVal + separator + finalText;
        }
        
        ui.textarea.scrollTop = ui.textarea.scrollHeight;
        updateCharCount();
        saveToCache();
        
        // Pequeno delay para liberar a flag
        setTimeout(() => { isMachineTyping = false; }, 50);
    };

    // Callback para lidar com status do microfone e modelo
    const handleSpeechStatus = (status, data) => {
        switch (status) {
            case 'loading':
                // Modelo baixando
                ui.micBtn.disabled = true;
                ui.micSpan.textContent = "Baixando IA...";
                ui.loadingBar.style.display = 'block';
                break;
            
            case 'ready':
                // Modelo pronto
                ui.micBtn.disabled = false;
                ui.micSpan.textContent = "Gravar";
                ui.loadingBar.style.display = 'none';
                setStatus('success', "IA Pronta");
                setTimeout(() => setStatus('idle'), 2000);
                break;

            case 'rec':
                // Gravando Audio Raw
                ui.micBtn.classList.add('recording');
                ui.micSpan.textContent = "Parar";
                setStatus('rec', "Ouvindo...");
                break;
            
            case 'processing':
                // Whisper transcrevendo
                setStatus('processing', "Transcrevendo...");
                break;

            case 'idle':
                ui.micBtn.classList.remove('recording');
                ui.micSpan.textContent = "Gravar";
                setStatus('idle');
                saveToCache();
                break;
        }
    };

    // Callback para progresso de download do modelo
    const handleModelProgress = (data) => {
        if (data.status === 'progress') {
            const pct = data.progress.toFixed(0) + '%';
            ui.progressFill.style.width = pct;
            ui.progressText.textContent = pct;
        } else if (data.status === 'initiate') {
            ui.progressText.textContent = `Iniciando: ${data.file}`;
        }
    };

    const handleSpeechError = (msg) => {
        setStatus('error', msg);
        ui.micBtn.classList.remove('recording');
        ui.micBtn.disabled = false;
    };

    // Instanciação atualizada com novos callbacks para o Whisper
    const speechManager = new SpeechManager(
        ui.canvas, 
        { 
            onResult: handleSpeechResult, 
            onStatus: handleSpeechStatus,
            onError: handleSpeechError,
            onModelProgress: handleModelProgress // Novo callback
        }
    );

    // =========================================================================
    // LÓGICA DE DADOS (CACHE)
    // =========================================================================
    function saveToCache() {
        localStorage.setItem(STORAGE_KEY_TEXT, ui.textarea.value);
        ui.saveStatus.textContent = "Salvo";
        ui.saveStatus.style.color = "var(--c-copy)";
    }

    function loadFromCache() {
        const saved = localStorage.getItem(STORAGE_KEY_TEXT);
        if (saved) {
            ui.textarea.value = saved;
            // Whisper não precisa de "updateContext" prévio da mesma forma que WebSpeech
            updateCharCount();
        }
    }

    function updateCharCount() {
        ui.charCount.textContent = `${ui.textarea.value.length} caracteres`;
    }

    // Carrega dados ao iniciar
    loadFromCache();

    // =========================================================================
    // EVENTOS DE INTERFACE
    // =========================================================================

    // 1. Microfone
    ui.micBtn.addEventListener('click', () => {
        speechManager.toggle();
    });

    // 2. Edição Manual
    ui.textarea.addEventListener('input', () => {
        if (isMachineTyping) return;
        ui.saveStatus.textContent = "Digitando...";
        updateCharCount();
        saveToCache();
    });

    // 3. Funções de IA (Gemini)
    const runAiTool = async (promptInstruction) => {
        const text = ui.textarea.value;
        if (!text) return alert("Digite ou dite algo primeiro.");
        
        // Pega contexto dos últimos 3000 caracteres para economizar tokens
        const context = text.slice(-3000); 
        const prompt = `ATUE COMO UM ASSISTENTE DE REDAÇÃO. INSTRUÇÃO: ${promptInstruction} TEXTO PARA ANÁLISE: "${context}" SAÍDA: Retorne APENAS o texto reescrito/corrigido.`;
        
        try {
            setStatus('ai', "IA Pensando...");
            const result = await gemini.generate({ contents: [{ parts: [{ text: prompt }] }] });
            
            if (result) {
                // Substitui a parte processada no texto original
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

    // 4. Upload de Arquivo (Multimodal)
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
                    const newContent = ui.textarea.value + sep + result;
                    ui.textarea.value = newContent;
                    saveToCache();
                    updateCharCount();
                    setStatus('success', "Transcrito!");
                }
            } catch (error) {
                setStatus('error', "Falha no Upload");
            }
            ui.fileInput.value = ''; // Reset input
        };
    });

    // 5. Utilitários (Copiar/Limpar)
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

    // 6. Docking / Janela (Lógica de Widget)
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
        
        // Força redesenho do canvas após transição CSS
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 350);
    });
});
