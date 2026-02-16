// CSS styles injection module
// Injects custom styles for the analytics panel

export function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* ===== General ===== */
        html.dark .aa-dialog-dialog, html.dark #sb-aa-panel-wrapper-main  {
            color-scheme: dark;
        }
        
        /* ===== Components ===== */
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

        .aa-dropdown-menu {
            min-width: 100%;
        }

        .aa-dialog-dialog {
            overflow: hidden;
        }

        .aa-dialog-dialog:has(.aa-dialog-dialog) {
            overflow: visible;
        }

        #sb-aa-panel-wrapper .aa-table {
            height: 100%;
        }
    `;
    document.head.appendChild(style);
}
