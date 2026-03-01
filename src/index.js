// Advanced Analytics v5.0.0
// Modular refactored version with JSX UI components

import { CONFIG } from './config.js';
import { initLifecycleHooks, getStorage, handleMapReadyFallback } from './core/lifecycle.js';
import { injectStyles } from './ui/styles.js';
import { AnalyticsDialog } from './ui/analytics-dialog.jsx';
import { AnalyticsPanel } from './ui/analytics-panel.jsx';
import { PortalHost } from './ui/portal-host.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

console.log(`${CONFIG.LOG_PREFIX} Advanced Analytics v${CONFIG.VERSION} initializing...`);

const AdvancedAnalytics = {
    version: CONFIG.VERSION,
    api,
    config: CONFIG,
    initialized: false,
    
    init() {
        console.log(`${CONFIG.LOG_PREFIX} [LC] init() called | initialized: ${this.initialized}`);

        if (!api) {
            console.error(`${CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }
        
        if (this.initialized) {
            console.log(`${CONFIG.LOG_PREFIX} [LC] init() skipped — already initialized`);
            // console.log(`${CONFIG.LOG_PREFIX} Already initialized, skipping`);
            return;
        }
        
        console.log(`${CONFIG.LOG_PREFIX} Architecture: Modular (17 files)`);
        console.log(`${CONFIG.LOG_PREFIX} UI: Dialog-based with JSX + Lite toolbar panel`);
        
        // Initialize lifecycle hooks first
        initLifecycleHooks(api);
        
        // Setup game initialization hook
        function registerUI() {
            console.log(`${CONFIG.LOG_PREFIX} [LC] registerUI() called`);

            injectStyles();

            api.ui.registerComponent('top-bar', {
                id: 'aa-dialog-mount',
                component: AnalyticsDialog
            });

            // PortalHost acts as a rendering target for the Portal component:
            // any Dropdown menu, Dialog backdrop, or Tooltip that needs to
            // escape a clipping/transform ancestor pushes its JSX here via
            // window.AdvancedAnalytics._portalRegistry.
            // Since PortalHost lives outside all panels, position:fixed on its
            // children is relative to the real viewport, not a transformed
            // ancestor.
            api.ui.registerComponent('top-bar', {
                id: 'aa-portal-host',
                component: PortalHost
            });

            api.ui.addButton('bottom-bar', {
                id: 'advanced-analytics-btn',
                label: 'Advanced Analytics',
                icon: 'ChartPie',
                onClick: () => {
                    if (window.AdvancedAnalytics.toggleDialog) {
                        window.AdvancedAnalytics.toggleDialog();
                    }
                }
            });

            api.ui.addFloatingPanel({
                id: 'advanced-analytics-lite',
                title: 'Advanced Analytics',
                icon: 'ChartPie',
                width: 640,
                render: AnalyticsPanel
            });

            console.log(`${CONFIG.LOG_PREFIX} [LC] ✓ Dialog component registered`);
            console.log(`${CONFIG.LOG_PREFIX} [LC] ✓ Bottom bar button registered`);
            console.log(`${CONFIG.LOG_PREFIX} [LC] ✓ Lite toolbar panel registered`);
        }

        api.hooks.onMapReady(() => {
            console.log(`${CONFIG.LOG_PREFIX} [LC] onMapReady fired | storage: ${getStorage() ? getStorage().saveName : 'null'}`);

            if (!getStorage()) {
                // Subsequent load — onGameLoaded did not fire (API bug).
                // Attempt to recover save name from Zustand and reinitialize storage.
                console.warn(`${CONFIG.LOG_PREFIX} [LC] onMapReady — storage null, subsequent load detected (API bug)`);
                handleMapReadyFallback(api);
            }

            registerUI();
        });

        api.hooks.onGameLoaded(async (saveName) => {
            console.log(`${CONFIG.LOG_PREFIX} [LC] onGameLoaded (from index) fired | saveName: ${saveName}`);
        });
        
        this.initialized = true;
        console.log(`${CONFIG.LOG_PREFIX} [LC] init() complete`);
    }
};

// Export for global access
window.AdvancedAnalytics = AdvancedAnalytics;

// Auto-initialize if API is available
if (api) {
    AdvancedAnalytics.init();
}

export default AdvancedAnalytics;