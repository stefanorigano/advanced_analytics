// Main analytics panel component
// Manages state locally with no persistence - resets when unmounted
//
// When liveRouteData is provided by the parent (AnalyticsDialog) the component
// uses it directly instead of running its own useRouteMetrics fetch for live
// mode.  This avoids a duplicate API call and keeps both siblings in sync.

import { CONFIG, INITIAL_STATE } from '../config.js';
import { Toolbar } from './toolbar.jsx';
import { SortableTable } from './table.jsx';
import { getStorage } from '../core/lifecycle.js';
import { useRouteMetrics } from '../hooks/useRouteMetrics.js';
import { sortTableData } from '../utils/sorting.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function AnalyticsTable({
    groups = ['trains', 'finance', 'performance'],
    liveRouteData = null,   // optional — provided by AnalyticsDialog
}) {
    // All state is local - resets when component unmounts
    const [sortState, setSortState]                     = React.useState(INITIAL_STATE.sort);
    const [groupState, setGroupState]                   = React.useState(INITIAL_STATE.groups);
    const [timeframeState, setTimeframeState]           = React.useState(INITIAL_STATE.timeframe);
    const [historicalData, setHistoricalData]           = React.useState({ days: {} });
    const [compareMode, setCompareMode]                 = React.useState(false);
    const [comparePrimaryDay, setComparePrimaryDay]     = React.useState(null);
    const [compareSecondaryDay, setCompareSecondaryDay] = React.useState(null);
    const [compareShowPercentages, setCompareShowPercentages] = React.useState(true);
    
    const storage = getStorage();
    
    // Load historical data on mount (only data that's persisted for game saves)
    React.useEffect(() => {
        const loadHistorical = async () => {
            if (!storage) return;
            const data = await storage.get('historicalData', { days: {} });
            setHistoricalData(data);
        };
        loadHistorical();
    }, [storage]);
    
    // Poll for historical data updates
    React.useEffect(() => {
        if (!storage) return;
        
        const checkUpdates = setInterval(async () => {
            const latest = await storage.get('historicalData', { days: {} });
            if (JSON.stringify(latest) !== JSON.stringify(historicalData)) {
                setHistoricalData(latest);
            }
        }, 2000);
        
        return () => clearInterval(checkUpdates);
    }, [storage, historicalData]);

    // ── Data fetching ────────────────────────────────────────────────────────
    // When a parent supplies liveRouteData we only need the hook for non-live
    // modes (historical / comparison).  In those modes liveRouteData is ignored
    // anyway, so we always call useRouteMetrics but skip its output for live.
    const { tableData: ownLiveData } = useRouteMetrics({
        sortState,
        timeframeState,
        compareMode,
        comparePrimaryDay,
        compareSecondaryDay,
        historicalData,
    });

    // Decide which data to display:
    // • live mode + parent supplied data  → sort the shared liveRouteData
    // • everything else                  → use the hook's output directly
    const tableData = React.useMemo(() => {
        const isLive = timeframeState === 'last24h' && !compareMode;
        if (isLive && liveRouteData !== null) {
            return sortTableData(liveRouteData, sortState);
        }
        return ownLiveData;
    }, [timeframeState, compareMode, liveRouteData, ownLiveData, sortState]);

    // ── State updaters (no persistence) ─────────────────────────────────────
    const updateSortState = React.useCallback((newState) => {
        setSortState(newState);
    }, []);
    
    const updateGroupState = React.useCallback((groupKey) => {
        setGroupState(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
    }, []);
    
    const updateTimeframeState = React.useCallback((newTimeframe) => {
        setTimeframeState(newTimeframe);
    }, []);
    
    const updateCompareMode = React.useCallback((enabled) => {
        setCompareMode(enabled);
        
        if (enabled && historicalData.days) {
            const allDays = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
            const mostRecentDay = allDays[0];
            const dayBefore = allDays[1];
            
            if (mostRecentDay && dayBefore) {
                setComparePrimaryDay(mostRecentDay);
                setCompareSecondaryDay(dayBefore);
            }
        }
    }, [historicalData]);
    
    const updateComparePrimaryDay = React.useCallback((value) => {
        const newPrimary = Number(value);
        setComparePrimaryDay(newPrimary);
        
        // Auto-adjust secondary if now invalid
        if (compareSecondaryDay >= newPrimary) {
            setCompareSecondaryDay(newPrimary - 1);
        }
    }, [compareSecondaryDay]);
    
    const updateCompareSecondaryDay = React.useCallback((value) => {
        setCompareSecondaryDay(Number(value));
    }, []);
    
    const updateCompareShowPercentages = React.useCallback(() => {
        setCompareShowPercentages(prev => !prev);
    }, []);
    
    return (
        <>
            <section>
                <div className="py-5 flex items-center justify-between gap-8">
                    <h3 className="whitespace-nowrap text-2xl font-semibold leading-none tracking-tight">Routes Stats</h3>
                </div>
                <div className="pb-3 flex items-center justify-between gap-8">
                    <Toolbar
                        groupState={groupState}
                        onGroupChange={updateGroupState}
                        timeframeState={timeframeState}
                        onTimeframeChange={updateTimeframeState}
                        compareMode={compareMode}
                        onCompareModeChange={updateCompareMode}
                        comparePrimaryDay={comparePrimaryDay}
                        onComparePrimaryDayChange={updateComparePrimaryDay}
                        compareSecondaryDay={compareSecondaryDay}
                        onCompareSecondaryDayChange={updateCompareSecondaryDay}
                        compareShowPercentages={compareShowPercentages}
                        onCompareShowPercentagesChange={updateCompareShowPercentages}
                        historicalData={historicalData}
                    />
                </div>
                <div className="max-w-full rounded-lg border border-foreground/20 backdrop-blur-sm text-card-foreground mb-6 flex-1 overflow-auto max-h-[40vh]">
                    <SortableTable
                        data={tableData}
                        sortState={sortState}
                        onSortChange={updateSortState}
                        groups={groups}
                        groupState={groupState}
                        compareShowPercentages={compareShowPercentages}
                    />
                </div>
            </section>
        </>
    );
}
