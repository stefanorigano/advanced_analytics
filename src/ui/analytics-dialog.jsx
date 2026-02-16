// Analytics Dialog Wrapper
// Manages dialog state (no persistence)

import { Dialog } from './dialog.jsx';
import { AnalyticsSetting } from './analytics-setting.jsx';
import { AnalyticsTable } from './analytics-table.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

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
            size={1280}
            onClose={() => setIsOpen(false)}
        >
            <section class="flex gap-2 justify-end">
                <div className="flex items-center gap-2 whitespace-nowrap">
                    {!api.gameState.isPaused() && (
                        <>
                            <span className="text-xs">Tracking Data</span>
                            <span className="inline-flex ml-1 relative">
                                <div className="absolute w-2 h-2 rounded-full bg-green-500 dark:bg-green-600 opacity-75 animate-ping"/>
                                <span className="relative inline-flex w-2 h-2 rounded-full dark:bg-green-500 bg-green-600"/>
                            </span>
                        </>
                    )}
                    {api.gameState.isPaused() && (
                        <>
                            <span className="text-xs text-muted-foreground">Game Paused</span>
                            <icons.Pause className="dark:text-amber-400 text-amber-600" size={14} />
                        </>
                    )}
                    <span className="border-foreground/20 border-r ml-2 mr-2 py-3"/>
                    <AnalyticsSetting/>
                </div>
            </section>
            <AnalyticsTable groups={['trains', 'finance', 'performance']} />
        </Dialog>
    );
}