// Main analytics panel component
// Manages state locally with no persistence - resets when unmounted

import { CONFIG, INITIAL_STATE } from '../config.js';
import { Toolbar } from './toolbar.jsx';
import { SortableTable } from './table.jsx';
import { getStorage } from '../core/lifecycle.js';
import { useRouteMetrics } from '../hooks/useRouteMetrics.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function AnalyticsTable({ groups = ['trains', 'finance', 'performance'] }) {
    // All state is local - resets when component unmounts
    const [sortState, setSortState] = React.useState(INITIAL_STATE.sort);
    const [groupState, setGroupState] = React.useState(INITIAL_STATE.groups);
    const [timeframeState, setTimeframeState] = React.useState(INITIAL_STATE.timeframe);
    const [historicalData, setHistoricalData] = React.useState({ days: {} });
    const [compareMode, setCompareMode] = React.useState(false);
    const [comparePrimaryDay, setComparePrimaryDay] = React.useState(null);
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
    

    // USE CUSTOM HOOK - All data fetching logic is now centralized
    const { tableData } = useRouteMetrics({
        sortState,
        timeframeState,
        compareMode,
        comparePrimaryDay,
        compareSecondaryDay,
        historicalData
    });
    
    // State updaters (no persistence)
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
            <div className="py-5 flex items-center justify-between gap-8">
                <h3 className="whitespace-nowrap text-2xl font-semibold leading-none tracking-tight">Routes Stats</h3>
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
            <section className="max-w-full overflow-hidden rounded-lg border border-foreground/20 backdrop-blur-sm text-card-foreground mb-6">
                <div className="flex-1 overflow-auto">
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
