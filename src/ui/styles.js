// CSS styles injection module
// Injects custom styles for the analytics panel

export function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        html.dark #advanced-analytics {
            color-scheme: dark;
        }
        
        /* Dialog container */
        #aa-dialog-container {
            position: relative;
            z-index: 9999;
        }
        
        /* Dialog backdrop and content z-index management */
        .aa-dialog-backdrop {
            z-index: 50;
        }
        
        .aa-dialog-dialog {
            z-index: 51;
        }
        
        /* Table styling inside dialog */
        .aa-dialog-dialog-body table {
            scrollbar-width: thin;
        }
        
        .aa-dialog-dialog-body thead tr,
        .aa-dialog-dialog-body th:first-child,
        .aa-dialog-dialog-body td:first-child {
            position: sticky;
            left: 0;
        }

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
