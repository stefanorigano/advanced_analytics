// Analytics Dialog Wrapper
// Manages dialog state (no persistence)

import { Dialog } from './dialog.jsx';
import { AnalyticsPanel } from './panel.jsx';

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
            <section class="overflow-hidden pb-4 rounded-lg border backdrop-blur-sm text-card-foreground mb-6">
                <AnalyticsPanel groups={['trains', 'finance', 'performance']} />
            </section>
        </Dialog>
    );
}