// Custom hook for route metrics data fetching and processing
// Eliminates duplication between analytics-table.jsx and analytics-panel.jsx
//
// USAGE:
// const { tableData, isLoading } = useRouteMetrics({
//     sortState,
//     timeframeState,
//     compareMode,
//     comparePrimaryDay,
//     compareSecondaryDay,
//     historicalData
// });

import { CONFIG } from '../config.js';
import { calculateTransfers } from '../metrics/transfers.js';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from '../metrics/route-metrics.js';
import { buildComparisonRow, getComparisonData } from '../metrics/comparison.js';
import { sortTableData } from '../utils/sorting.js';
import { getStorage } from '../core/lifecycle.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

/**
 * Hook for fetching and processing route metrics data
 * 
 * Handles three data modes:
 * 1. LIVE DATA (timeframe === 'last24h'): Current game state
 * 2. HISTORICAL DATA (timeframe === specific day): Past snapshot
 * 3. COMPARISON MODE: Compare two days with percentage changes
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.sortState - Sort configuration {column, order}
 * @param {string} options.timeframeState - Current timeframe selection
 * @param {boolean} options.compareMode - Whether comparison mode is active
 * @param {number} options.comparePrimaryDay - Primary comparison day (newer)
 * @param {number} options.compareSecondaryDay - Secondary comparison day (older)
 * @param {Object} options.historicalData - Historical data object
 * @returns {Object} {tableData: Array, isLoading: boolean}
 */
export function useRouteMetrics({
    sortState,
    timeframeState = 'last24h',
    compareMode = false,
    comparePrimaryDay = null,
    compareSecondaryDay = null,
    historicalData = { days: {} }
}) {
    const [tableData, setTableData] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const storage = getStorage();
    
    React.useEffect(() => {
        // Skip updates in debug mode
        if (CONFIG.debug) {
            console.log(`${CONFIG.LOG_PREFIX} Debug mode - updates paused`);
            return;
        }
        
        const updateData = async () => {
            setIsLoading(true);
            let processedData = [];
            
            try {
                // =========================================================================
                // MODE 1: COMPARISON MODE
                // =========================================================================
                if (compareMode && comparePrimaryDay && compareSecondaryDay) {
                    const comparisonRows = getComparisonData(
                        comparePrimaryDay, 
                        compareSecondaryDay, 
                        historicalData
                    );
                    
                    if (comparisonRows && storage) {
                        const routeStatuses = await storage.get('routeStatuses', {});
                        
                        const mappedRows = comparisonRows.map(row => 
                            buildComparisonRow(
                                row, 
                                routeStatuses, 
                                comparePrimaryDay, 
                                compareSecondaryDay
                            )
                        );
                        
                        // Filter out routes that were 'new' on either comparison day
                        // This prevents confusing NEW labels for routes that existed before
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
                // =========================================================================
                // MODE 2: HISTORICAL DATA
                // =========================================================================
                else if (timeframeState !== 'last24h') {
                    const dayData = historicalData.days[timeframeState];
                    
                    if (dayData && dayData.routes) {
                        const currentRoutes = api.gameState.getRoutes();
                        
                        // Mark routes as deleted if they no longer exist
                        processedData = dayData.routes.map(route => ({
                            ...route,
                            deleted: !currentRoutes.some(r => r.id === route.id)
                        }));
                    }
                }
                // =========================================================================
                // MODE 3: LIVE DATA (default)
                // =========================================================================
                else {
                    processedData = fetchLiveRouteData();
                }
                
                // Sort the data
                const sortedData = sortTableData(processedData, sortState);
                setTableData(sortedData);
                
            } catch (error) {
                console.error(`${CONFIG.LOG_PREFIX} Error updating route metrics:`, error);
                setTableData([]);
            } finally {
                setIsLoading(false);
            }
        };
        
        updateData();
        
        // Only poll for live data mode
        if (timeframeState === 'last24h' && !compareMode) {
            const interval = setInterval(updateData, CONFIG.REFRESH_INTERVAL);
            return () => clearInterval(interval);
        }
        
    }, [
        sortState, 
        timeframeState, 
        historicalData, 
        compareMode, 
        comparePrimaryDay, 
        compareSecondaryDay,
        storage
    ]);
    
    return { tableData, isLoading };
}

/**
 * Fetch live route data from current game state
 * 
 * This is the core data fetching logic that was duplicated in both
 * analytics-table.jsx and analytics-panel.jsx
 * 
 * @returns {Array} Processed route data
 */
function fetchLiveRouteData() {
    const routes = api.gameState.getRoutes();
    const trainTypes = api.trains.getTrainTypes();
    const lineMetrics = api.gameState.getLineMetrics();
    const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;
    
    // Calculate transfers for all routes
    const transfersMap = calculateTransfers(routes, api);
    
    const processedData = [];
    
    routes.forEach(route => {
        // Get ridership metrics
        const metrics = lineMetrics.find(m => m.routeId === route.id);
        const ridership = metrics ? metrics.ridersPerHour * timeWindowHours : 0;
        const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
        const dailyRevenue = revenuePerHour * 24;
        
        // Validate route data
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
        
        // Get train type
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
        
        // Calculate all metrics
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
    
    return processedData;
}
