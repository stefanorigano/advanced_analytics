// Main analytics panel component
// Manages state locally with no persistence - resets when unmounted

import { CONFIG, INITIAL_STATE } from '../config.js';
import { Toolbar } from './toolbar.jsx';
import { SortableTable } from './table.jsx';
import { getStorage } from '../core/lifecycle.js';
import { calculateTransfers } from '../metrics/transfers.js';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from '../metrics/route-metrics.js';
import { buildComparisonRow, getComparisonData } from '../metrics/comparison.js';
import { sortTableData } from '../utils/sorting.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function AnalyticsPanel({ groups = ['trains', 'finance', 'performance'] }) {
    // All state is local - resets when component unmounts
    const [tableData, setTableData] = React.useState([]);
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
    
    // Data fetching and processing (main update loop)
    React.useEffect(() => {
        if (CONFIG.debug) {
            console.log(`${CONFIG.LOG_PREFIX} Debug mode enabled - updates paused`);
            return;
        }
        
        const updateData = async () => {
            let processedData = [];
            
            // COMPARISON MODE
            if (compareMode && comparePrimaryDay && compareSecondaryDay) {
                const comparisonRows = getComparisonData(comparePrimaryDay, compareSecondaryDay, historicalData);
                const routeStatuses = await storage.get('routeStatuses', {});
                
                if (comparisonRows) {
                    const mappedRows = comparisonRows.map(row => 
                        buildComparisonRow(row, routeStatuses, comparePrimaryDay, compareSecondaryDay)
                    );
                    
                    // Filter routes that were 'new' in either comparison day
                    const filteredRows = mappedRows.filter(row => {
                        const status = routeStatuses[row.id];
                        if (!status) return true;
                        
                        const wasNewOnPrimaryDay = status.createdDay === comparePrimaryDay;
                        const wasNewOnSecondaryDay = status.createdDay === compareSecondaryDay;
                        return !(wasNewOnPrimaryDay || wasNewOnSecondaryDay);
                    });
                    
                    processedData = filteredRows;
                }
            }
            // HISTORICAL DATA MODE
            else if (timeframeState !== 'last24h') {
                const dayData = historicalData.days[timeframeState];
                if (dayData && dayData.routes) {
                    const currentRoutes = api.gameState.getRoutes();
                    processedData = dayData.routes.map(route => ({
                        ...route,
                        deleted: !currentRoutes.some(r => r.id === route.id)
                    }));
                }
            }
            // LIVE DATA MODE
            else {
                const routes = api.gameState.getRoutes();
                const trainTypes = api.trains.getTrainTypes();
                const lineMetrics = api.gameState.getLineMetrics();
                const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;
                
                const transfersMap = calculateTransfers(routes, api);
                
                routes.forEach(route => {
                    const metrics = lineMetrics.find(m => m.routeId === route.id);
                    const ridership = metrics ? metrics.ridersPerHour * timeWindowHours : 0;
                    const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
                    const dailyRevenue = revenuePerHour * 24;
                    
                    if (!validateRouteData(route)) {
                        processedData.push({
                            id: route.id,
                            name: route.name || route.bullet,
                            ridership,
                            dailyRevenue,
                            deleted: false,
                            transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                            ...getEmptyMetrics()
                        });
                        return;
                    }
                    
                    const trainType = trainTypes[route.trainType];
                    if (!trainType) {
                        processedData.push({
                            id: route.id,
                            name: route.name || route.bullet,
                            ridership,
                            dailyRevenue,
                            deleted: false,
                            transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                            ...getEmptyMetrics()
                        });
                        return;
                    }
                    
                    const calculatedMetrics = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
                    
                    processedData.push({
                        id: route.id,
                        name: route.name || route.bullet,
                        ridership,
                        dailyRevenue,
                        deleted: false,
                        transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                        ...calculatedMetrics
                    });
                });
            }
            
            const sortedData = sortTableData(processedData, sortState);
            setTableData(sortedData);
        };
        
        updateData();
        
        // Only set interval for live data
        if (timeframeState === 'last24h') {
            const interval = setInterval(updateData, CONFIG.REFRESH_INTERVAL);
            return () => clearInterval(interval);
        }
    }, [sortState, timeframeState, historicalData, compareMode, comparePrimaryDay, compareSecondaryDay, compareShowPercentages, storage]);
    
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
        <div id="advanced-analytics" className="flex flex-col h-full bg-background">
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
        </div>
    );
}
