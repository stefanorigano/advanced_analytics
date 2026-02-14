// Advanced Analytics v5.0.0
// Modular refactored version with JSX UI components

import { CONFIG } from './config.js';
import { initLifecycleHooks } from './core/lifecycle.js';
import { injectStyles } from './ui/styles.js';
import { AnalyticsDialog } from './ui/analytics-dialog.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

console.log(`${CONFIG.LOG_PREFIX} Advanced Analytics v${CONFIG.VERSION} initializing...`);

const AdvancedAnalytics = {
    version: CONFIG.VERSION,
    api,
    config: CONFIG,
    initialized: false,
    
    init() {
        if (!api) {
            console.error(`${CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }
        
        if (this.initialized) {
            console.log(`${CONFIG.LOG_PREFIX} Already initialized, skipping`);
            return;
        }
        
        console.log(`${CONFIG.LOG_PREFIX} Architecture: Modular (17 files)`);
        console.log(`${CONFIG.LOG_PREFIX} UI: Dialog-based with JSX`);
        
        // Initialize lifecycle hooks first
        initLifecycleHooks(api);
        
        // Setup game initialization hook
        api.hooks.onGameInit(() => {
            injectStyles();
            
            // Register dialog component in top-bar (hidden, just for mounting)
            // We'll control visibility via the Dialog component's isOpen state
            api.ui.registerComponent('top-bar', {
                id: 'aa-dialog-mount',
                component: AnalyticsDialog
            });
            
            // Add bottom bar button
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
            
            console.log(`${CONFIG.LOG_PREFIX} ✓ Dialog component registered`);
            console.log(`${CONFIG.LOG_PREFIX} ✓ Bottom bar button registered`);
        });
        
        this.initialized = true;
        console.log(`${CONFIG.LOG_PREFIX} Successfully initialized!`);
    }
};

// Export for global access
window.AdvancedAnalytics = AdvancedAnalytics;

// Auto-initialize if API is available
if (api) {
    AdvancedAnalytics.init();
}

export default AdvancedAnalytics;