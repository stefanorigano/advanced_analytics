// Analytics Dialog Wrapper
// Manages dialog state (no persistence)
//
// ARCHITECTURE NOTE:
// This component owns both historicalData and liveRouteData so that
// AnalyticsTable and AnalyticsChart can share the same live snapshot
// without fetching it twice.  AnalyticsTable accepts liveRouteData as
// an optional prop and skips its own fetch when it is provided.

import { Dialog } from './dialog.jsx';
import { AnalyticsGuide } from './analytics-guide.jsx';
import { AnalyticsSetting } from './analytics-setting.jsx';
import { AnalyticsTable } from './analytics-table.jsx';
import { AnalyticsChart } from './analytics-chart.jsx';
import { StationFlow } from './station-flow.jsx';
import { SystemMap } from './system-map.jsx';
import { getStorage } from '../core/lifecycle.js';
import { useRouteMetrics } from '../hooks/useRouteMetrics.js';
import { INITIAL_STATE } from '../config.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function AnalyticsDialog() {
    const [isOpen, setIsOpen] = React.useState(false);
    const [historicalData, setHistoricalData] = React.useState({ days: {} });

    const storage = getStorage();

    // ── Live data (shared between AnalyticsTable and AnalyticsChart) ──────────
    // We use the default sort from INITIAL_STATE; the table manages its own sort
    // internally, but for the purpose of sharing we only need the raw route data.
    // The empty historicalData is memoised so the hook's dependency array is stable.
    const emptyHistoricalData = React.useMemo(() => ({ days: {} }), []);
    const { tableData: liveRouteData } = useRouteMetrics({
        sortState:      INITIAL_STATE.sort,
        timeframeState: 'last24h',
        compareMode:    false,
        historicalData: emptyHistoricalData,
    });

    // Load historical data when dialog opens
    React.useEffect(() => {
        if (!isOpen || !storage) return;
        
        const loadData = async () => {
            const data = await storage.get('historicalData', { days: {} });
            setHistoricalData(data);
        };
        
        loadData();
        
        // Poll for updates while dialog is open
        const interval = setInterval(loadData, 2000);
        return () => clearInterval(interval);
    }, [isOpen, storage]);
    
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
            title="Advanced Analytics - Dashboard"
            isOpen={isOpen}
            size={1280}
            onClose={() => setIsOpen(false)}
        >
            <section class="flex gap-2 justify-end border-b pb-4">
                <AnalyticsGuide/>
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

            {/* Table Section — receives pre-fetched live data */}
            <AnalyticsTable
                groups={['trains', 'finance', 'performance']}
                liveRouteData={liveRouteData}
            />

            {/* Chart Section — receives both historical and live data */}
            <section className="mt-8 mb-6">
                <div className="py-5">
                    <h3 className="text-2xl font-semibold leading-none tracking-tight">Historical Trends</h3>
                </div>
                <AnalyticsChart
                    historicalData={historicalData}
                    liveRouteData={liveRouteData}
                />
            </section>
            
            {/* Station Flow Section */}
            <section className="mt-8 mb-6">
                <div className="py-5">
                    <h3 className="text-2xl font-semibold leading-none tracking-tight">Station Flow</h3>
                    <p className="text-sm text-muted-foreground mt-1">Passenger ridership patterns</p>
                </div>
                <StationFlow />
            </section>

            {/* System Map */}
            <section className="mt-8 mb-6">
                <div className="py-5">
                    <h3 className="text-2xl font-semibold leading-none tracking-tight">System Map</h3>
                    <p className="text-sm text-muted-foreground mt-1">Network schematic map</p>
                </div>
                <SystemMap />
            </section>
        </Dialog>
    );
}