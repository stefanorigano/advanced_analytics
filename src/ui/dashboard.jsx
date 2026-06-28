// Analytics Dialog Wrapper
// Manages dialog state (no persistence)
//
// ARCHITECTURE NOTE:
// This component owns both historicalData and liveRouteData so that
// DashboardTable and DashboardTrends can share the same live snapshot
// without fetching it twice.  DashboardTable accepts liveRouteData as
// an optional prop and skips its own fetch when it is provided.

import { StaticPanel } from '../components/static-panel';
import { AboutTrigger } from './about/about-trigger.jsx';
import { GuideTrigger } from './guide/guide-trigger.jsx';
import { StorageTrigger } from './storage/storage-trigger.jsx';
import { SettingsDialogTrigger } from './settings/settings-dialog-trigger.jsx';
import { SystemStats } from './dashboard/system-stats.jsx';
import { DashboardTable } from './dashboard/dashboard-table.jsx';
import { DashboardTrends } from './dashboard/dashboard-trends.jsx';
import { DashboardMap } from './dashboard/dashboard-map.jsx';
import { TransferFlow } from './transfer-flow.jsx';
import { getStorage } from '../core/lifecycle.js';
import { useRouteMetrics } from '../hooks/useRouteMetrics.js';
import { INITIAL_STATE } from '../config.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Dashboard body (no StaticPanel wrapper) ──────────────────────────────────
// Used by AnalyticsPanel as the "dashboard" view.
// Also consumed by the legacy Dashboard wrapper below for standalone use.
export function DashboardContent({ liveRouteData, historicalData }) {
    return (
        <>
            <section className="sticky z-10 top-0 backdrop-blur bg-background/50 flex items-center gap-2 border-b px-6">
                <GuideTrigger/>
                <span className="border-foreground/20 border-r py-5"/>
                <AboutTrigger/>
                <div className="flex items-center gap-2 whitespace-nowrap ml-auto">
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
                    <span className="border-foreground/20 border-r ml-2 mr-2 py-5"/>
                    <StorageTrigger/>
                    <SettingsDialogTrigger/>
                </div>
            </section>

            {/* System Stats — load factor + health score + quick chips */}
            <SystemStats liveRouteData={liveRouteData} />

            {/* Table Section — receives pre-fetched live data */}
            <DashboardTable
                groups={['trains', 'finance', 'performance']}
                liveRouteData={liveRouteData}
            />

            {/* Chart Section — receives both historical and live data */}
            <section className="py-6 px-6">
                <div className="py-5">
                    <h3 className="text-xl font-semibold leading-none tracking-tight">Historical Trends</h3>
                </div>
                <DashboardTrends
                    historicalData={historicalData}
                    liveRouteData={liveRouteData}
                />
            </section>

            {/* Transfer Hub Flow */}
            <section className="py-6 px-6">
                <div className="py-5 flex items-baseline gap-3">
                    <h3 className="text-xl font-semibold leading-none tracking-tight">Transfer Hub Flow</h3>
                    <p className="text-xs text-muted-foreground mt-1">Passenger flows through interchange stations</p>
                </div>
                <TransferFlow />
            </section>

            {/* System Map */}
            <section className="py-6 px-6">
                <div className="py-5 flex items-baseline gap-3">
                    <h3 className="text-xl font-semibold leading-none tracking-tight">System Map</h3>
                    <p className="text-xs text-muted-foreground mt-1">Network schematic map</p>
                </div>
                <DashboardMap />
            </section>
        </>
    );
}

// ── Legacy standalone wrapper (kept for backward compatibility) ───────────────
// AnalyticsPanel is now the preferred entry point; this wrapper owns its own
// data state so it can still be used in isolation if needed.
export function Dashboard() {
    const [isOpen, setIsOpen] = React.useState(false);
    const [historicalData, setHistoricalData] = React.useState({ days: {} });

    const storage = getStorage();

    const emptyHistoricalData = React.useMemo(() => ({ days: {} }), []);
    const { tableData: liveRouteData } = useRouteMetrics({
        sortState:      INITIAL_STATE.sort,
        timeframeState: 'last24h',
        compareMode:    false,
        historicalData: emptyHistoricalData,
    });

    React.useEffect(() => {
        if (!isOpen || !storage) return;
        const loadData = async () => {
            const data = await storage.get('historicalData', { days: {} });
            setHistoricalData(data);
        };
        loadData();
        const interval = setInterval(loadData, 2000);
        return () => clearInterval(interval);
    }, [isOpen, storage]);

    React.useEffect(() => {
        window.AdvancedAnalytics = window.AdvancedAnalytics || {};
        window.AdvancedAnalytics.openDialog   = () => setIsOpen(true);
        window.AdvancedAnalytics.closeDialog  = () => setIsOpen(false);
        window.AdvancedAnalytics.toggleDialog = () => setIsOpen(prev => !prev);
        return () => {
            delete window.AdvancedAnalytics.openDialog;
            delete window.AdvancedAnalytics.closeDialog;
            delete window.AdvancedAnalytics.toggleDialog;
        };
    }, []);

    return (
        <StaticPanel
            id="aa-dashboard"
            title="Advanced Analytics — Dashboard"
            staticPanelPaddingClasses="pb-4"
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
        >
            <DashboardContent liveRouteData={liveRouteData} historicalData={historicalData} />
        </StaticPanel>
    );
}