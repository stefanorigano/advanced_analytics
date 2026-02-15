// Analytics Dialog Wrapper
// Manages dialog state (no persistence)

import { Dialog } from './dialog.jsx';
import { AnalyticsTable } from './analytics-table.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function AnalyticsDialog() {
    const [isOpen, setIsOpen] = React.useState(false);
    
    // Expose global functions to control dialog
    React.useEffect(() => {
        window.AdvancedAnalytics = window.AdvancedAnalytics || {};
        window.AdvancedAnalytics.openDialog = () => setIsOpen(true);
        window.AdvancedAnalytics.closeDialog = () => setIsOpen(false);
        window.AdvancedAnalytics.toggleDialog = () => setIsOpen(prev => !prev);
        
        return () => {
            delete window.AdvancedAnalytics.openDialog;
            delete window.AdvancedAnalytics.closeDialog;
            delete window.AdvancedAnalytics.toggleDialog;
        };
    }, []);
    
    return (
        <Dialog
            id="aa-dialog-analytics"
            title="Advanced Route Analytics"
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
        >
            {/*<div class="px-3 py-5">
                <h3 class="text-2xl font-semibold leading-none tracking-tight">Routes Stats</h3>
            </div>
            <section class="max-w-full overflow-hidden rounded-lg border border-foreground/20 backdrop-blur-sm text-card-foreground mb-6">
                <AnalyticsTable groups={['trains', 'finance', 'performance']} />
            </section>*/}
            <AnalyticsTable groups={['trains', 'finance', 'performance']} />
        </Dialog>
    );
}