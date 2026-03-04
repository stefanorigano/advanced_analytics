// Advanced Analytics v0.9.1
// Modular refactored version with JSX UI components

import { CONFIG } from './config.js';
import { initLifecycleHooks, getStorage, handleMapReadyFallback } from './core/lifecycle.js';
import { injectStyles } from './assets/styles.js';
import { Dashboard }    from './ui/dashboard.jsx';
import { RouteDialog }  from './ui/route/route-dialog.jsx';
import { Panel }        from './ui/panel.jsx';
import { PortalHost }   from './hooks/portal-host.jsx';

// Debug: revenue fluctuation debug
import { startRevenueDebug } from './debug/revenue-debug.js';
const DEBUG_REVENUE = true;

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
                component: Dashboard
            });

            // RouteDialog — opened by clicking any interactive RouteBadge.
            // Mounted separately so it is always in the tree (independent of the
            // main Dashboard dialog being open).
            api.ui.registerComponent('top-bar', {
                id: 'aa-route-dialog-mount',
                component: RouteDialog
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
                label: 'AA Dashboard',
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
                render: Panel
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

            // Debug Revenues
            if (DEBUG_REVENUE) {
                if (window.AdvancedAnalytics.revenueDebug) {
                    window.AdvancedAnalytics.revenueDebug.stop();
                }
                window.AdvancedAnalytics.revenueDebug = startRevenueDebug(api);
            }
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