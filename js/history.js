import { CONFIG } from './config.js';

export class HistoryManager {
    /**
     * @param {HTMLElement} listContainer - Elemento DOM onde a lista será renderizada.
     * @param {Function} onRestoreCallback - Função chamada ao selecionar um item.
     */
    constructor(listContainer, onRestoreCallback) {
        this.container = listContainer;
        this.onRestore = onRestoreCallback;
        this.limit = 10;
        this.storageKey = CONFIG.STORAGE_KEYS.HISTORY;
    }

    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Ditado Digital: Erro ao carregar histórico.", e);
            return [];
        }
    }

    saveSnapshot(text) {
        if (!text || text.trim().length < 5) return;
        
        const cleanText = text.trim();
        const history = this.load();
        
        // Anti-Redundância: Ignora se o texto for idêntico ao último salvo
        if (history.length > 0 && history[0].text === cleanText) return;

        const now = new Date();
        const entry = {
            id: Date.now(),
            date: now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
            text: cleanText
        };

        history.unshift(entry);
        if (history.length > this.limit) history.pop();

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(history));
        } catch (e) {
            console.error("Ditado Digital: Falha ao salvar no localStorage.", e);
        }
    }

    render() {
        if (!this.container) return;
        const history = this.load();
        this.container.innerHTML = '';

        if (history.length === 0) {
            this.container.innerHTML = '<p class="history-empty">Nenhum histórico salvo ainda.</p>';
            return;
        }

        // Uso de DocumentFragment para evitar múltiplos reflows de renderização
        const fragment = document.createDocumentFragment();

        history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-date">${item.date}</div>
                <div class="history-preview">${item.text}</div>
            `;
            
            div.addEventListener('click', () => {
                if (typeof this.onRestore === 'function') {
                    this.onRestore(item.text);
                }
            });
            fragment.appendChild(div);
        });

        this.container.appendChild(fragment);
    }
}