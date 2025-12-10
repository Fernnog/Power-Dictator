import { CONFIG } from './config.js';

export class HotkeyManager {
    constructor(uiRefs, actions) {
        this.ui = uiRefs;
        this.actions = actions; // Objeto com funções { rec, clear, copy, undo }
        this.init();
    }

    init() {
        document.addEventListener('keydown', (e) => {
            // Apenas processa se Alt estiver pressionado
            if (!e.altKey) return;

            // Mapeamento baseado em e.code (físico) para evitar problemas de layout ABNT/ANSI
            switch (e.code) {
                case CONFIG.SHORTCUTS.REC:
                    e.preventDefault(); // Impede menu do browser
                    this.ui.micBtn.click();
                    break;
                case CONFIG.SHORTCUTS.CLEAR:
                    e.preventDefault();
                    this.actions.triggerClear(); // Chama ação customizada com lógica de Undo
                    break;
                case CONFIG.SHORTCUTS.COPY:
                    e.preventDefault();
                    this.ui.btnCopy.click();
                    break;
                case CONFIG.SHORTCUTS.UNDO:
                    e.preventDefault();
                    this.actions.triggerUndo();
                    break;
            }
        });
    }
}
