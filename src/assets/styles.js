// CSS styles injection module
// Injects custom styles for the analytics panel

export function injectStyles() {
    const existing = document.getElementById('aa-stylesheet');
    const style = existing ?? document.createElement('style');
    style.id = 'aa-stylesheet';
    style.textContent = `
        /* ===== General ==================================================== */
        html.dark .aa-dialog-dialog, html.dark #aa-panel,
        html.dark .aa-dropdown-menu, html.dark .aa-static-panel {
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
        
        /* ===== Utility Classes ============================================ */
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
        
        /* ===== Components ================================================= */        
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
        
        .aa-dialog-dialog-header {
            border-radius: calc(var(--radius) - 2px) calc(var(--radius) - 2px) 0 0;
        }
        
        #root:has(#metro-nav-panel-build) .aa-static-panel,
        #root:has(#metro-nav-panel-analyze) .aa-static-panel {
            max-width: MIN(CALC(100vw - 535px), 1280px);
            width: 1280px;
        }
        
        .aa-static-panel {
            max-width: MIN(CALC(100vw - 104px), 1280px);
            width: 100%;
            margin-right: 52px;
            min-width: 900px;
        }
           
        /* ===== Top Bar ==================================================== */
        .aa-topbar-bar {
        }

        html.dark .aa-topbar-bar {
            color-scheme: dark;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }

        .aa-topbar-chip {
            border-radius: calc(var(--radius) - 2px);
            transition: background-color 150ms ease;
        }

        .aa-topbar-chip:hover {
            background-color: hsl(var(--accent));
        }

        /* ===== Charts ===================================================== */
        html .aa-chart [fill="#ccc"] {
            fill: #000!important;
            opacity: 0.05;
        }

        html.dark .aa-chart [fill="#ccc"] {
            fill: #FFF!important;
            opacity: 0.05;
        }
    `;
    if (!existing) document.head.appendChild(style);
}
