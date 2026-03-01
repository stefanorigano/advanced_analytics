// CSS styles injection module
// Injects custom styles for the analytics panel

export function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* ===== General ===== */
        html.dark .aa-dialog-dialog, html.dark #aa-panel,
        html.dark .aa-dropdown-menu {
            color-scheme: dark;
        }
        html {
            --aa-transfer-color: #8f4eff;
            --aa-chart-secondary-metric: #000;
        }
        html.dark {
            --aa-transfer-color: #a78bfa;
            --aa-chart-secondary-metric: #FFF;
        }
        
        /* ===== Utility Classes ===== */
        html.dark .dark\\:bg-background\\/50 {
            background-color: hsl(var(--background) / 0.5);
        }
        
        .list-disc {
            list-style-type: disc;
            padding-inline-start: 3em;
        }
        
        .sticky {
            position: sticky;
        }
        
        .scrollbar-thin {
             scrollbar-width: thin;
        }
        
        /* ===== Components ===== */        
        .aa-table th:first-child,
            position: sticky;
            left: 0;
        }

        .aa-dropdown-menu {
            min-width: 100%;
        }

        #sb-aa-panel-wrapper .aa-table {
            height: 100%;
        }
           
        /* ===== Charts ===== */
        html .aa-chart [fill="#ccc"] {
            fill: #000!important;
            opacity: 0.05;
        }

        html.dark .aa-chart [fill="#ccc"] {
            fill: #FFF!important;
            opacity: 0.05;
        }
    `;
    document.head.appendChild(style);
}
