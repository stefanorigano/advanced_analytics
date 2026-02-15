// CSS styles injection module
// Injects custom styles for the analytics panel

export function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* ===== General ===== */
        html.dark #aa-dialog-analytics, html.dark #sb-aa-panel-wrapper-main  {
            color-scheme: dark;
        }
        
        /* ===== Components ===== */
        /* Dialog */
        .aa-dialog-backdrop {
            z-index: 50;
        }
        
        .aa-dialog-dialog {
            z-index: 51;
        }
        
        /* Table styling inside dialog */
        #sb-aa-panel-wrapper-main {
            scrollbar-width: thin;
        }
        
        .aa-table thead tr,
        .aa-table th:first-child,
        .aa-table td:first-child {
            position: sticky;
            left: 0;
        }

        /* ===== Specific ===== */
        /* Toolbar checkbox styling */
        .aa-toolbar-checkbox {
            appearance: none;
            width: 0;
            height: 0;
            position: absolute;
        }
    `;
    document.head.appendChild(style);
}
