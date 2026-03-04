// Custom hook for route metrics data fetching and processing
// The React hook that orchestrates metrics. It fetches live data from the API
// (routes, ridership, line metrics, elapsed time), reads storage for route
// statuses, calls the revenue accumulator, then decides which of the two
// calculators to use per route. It owns all the state, polling, and data
// assembly.
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
import { calculateRealTimeMetrics } from '../metrics/realtime-metrics.js';
import { buildComparisonRow, getComparisonData } from '../metrics/comparison.js';
import { sortTableData } from '../utils/sorting.js';
import { getStorage } from '../core/lifecycle.js';
import { getAccumulatedRevenue, getAccumulatedCost } from '../metrics/accumulator.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

/**
 * Hook for fetching and processing route metrics data
 * 
 * Handles four data modes:
 * 1. LIVE DATA (timeframe === 'last24h'): Current game state
 * 2. LIVE DATA + REAL-TIME (new routes today): Accurate costs for newly created routes
 * 3. HISTORICAL DATA (timeframe === specific day): Past snapshot
 * 4. COMPARISON MODE: Compare two days with percentage changes
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
    
    // Get storage directly - no need for ref
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
                // COMPARISON MODE
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
                // HISTORICAL DATA
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
                // LIVE DATA
                else {
                    processedData = await fetchLiveRouteData(storage);
                }
                
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
        let interval = null;
        if (timeframeState === 'last24h' && !compareMode) {
            interval = setInterval(updateData, CONFIG.REFRESH_INTERVAL);
        }
        
        // Cleanup
        return () => {
            if (interval) clearInterval(interval);
        };
        
    }, [
        sortState, 
        timeframeState, 
        historicalData, 
        compareMode, 
        comparePrimaryDay, 
        compareSecondaryDay,
        storage // Add storage to dependencies
    ]);
    
    return { tableData, isLoading };
}

/**
 * Fetch live route data from current game state
 * 
 * This is the core data fetching logic that was duplicated in both
 * dashboard-table.jsx and panel.jsx
 * 
 * Now includes real-time cost calculation for newly created routes
 * 
 * @param {Object} storage - Storage instance
 * @returns {Array} Processed route data
 */
async function fetchLiveRouteData(storage) {
    const routes = api.gameState.getRoutes();
    const trainTypes = api.trains.getTrainTypes();
    const lineMetrics = api.gameState.getLineMetrics();
    const currentTime = api.gameState.getElapsedSeconds();
    const currentDay = api.gameState.getCurrentDay();
    
    // Get route statuses to detect new routes
    const routeStatuses = storage
        ? await storage.get('routeStatuses', {})
        : {};
    
    // Calculate transfers for all routes
    const transfersMap = calculateTransfers(routes, api);
    
    const processedData = [];
    
    routes.forEach(route => {
        // Get ridership metrics
        const metrics = lineMetrics.find(m => m.routeId === route.id);
        const ridership = api.gameState.getRouteRidership(route.id).total;
        const revenuePerHour = metrics ? metrics.revenuePerHour : 0;

        const accumulated = getAccumulatedRevenue(route.id);

        // Check if route is new today
        const status = routeStatuses[route.id];
        const isNewToday = status &&
                          status.status === 'new' &&
                          status.createdDay === currentDay;

        // dailyRevenue — what gets displayed in the table and used for all metric
        // calculations.  Always prefer the MC-anchored accumulated value when it
        // exists; fall back to the instantaneous rate-based projection only when
        // the accumulator has nothing yet (game just loaded / day just started).
        const dailyRevenue = accumulated > 0 ? accumulated : revenuePerHour * 24;

        // Rate-based 24h projection — used as the fallback inside
        // calculateRealTimeMetrics when no accumulated data is available yet.
        const projectedRevenue = revenuePerHour * 24;
        
        // Validate route data
        if (!validateRouteData(route)) {
            processedData.push({
                ...getEmptyMetrics(),
                id: route.id,
                name: route.name || route.bullet,
                ridership,
                dailyRevenue,  // override getEmptyMetrics()'s dailyRevenue: 0
                deleted: false,
                isNewToday: false,
                transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
            });
            return;
        }

        // Get train type
        const trainType = trainTypes[route.trainType];
        if (!trainType) {
            processedData.push({
                ...getEmptyMetrics(),
                id: route.id,
                name: route.name || route.bullet,
                ridership,
                dailyRevenue,  // override getEmptyMetrics()'s dailyRevenue: 0
                deleted: false,
                isNewToday: false,
                transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
            });
            return;
        }
        
        // Calculate metrics
        let calculatedMetrics;

        if (isNewToday && status.creationTime !== null && status.creationTime !== undefined) {
            // Real-time calculation for new routes.
            // Pass projectedRevenue as the scaling fallback and accumulated as
            // the actual override — calculateRealTimeMetrics uses accumulated
            // directly when it is > 0, eliminating pulse-driven fluctuation.
            calculatedMetrics = calculateRealTimeMetrics(
                route,
                trainType,
                ridership,
                projectedRevenue,
                status.creationTime,
                currentTime,
                accumulated > 0 ? accumulated : null
            );
        } else {
            // Standard 24h projection for established routes
            calculatedMetrics = calculateRouteMetrics(
                route,
                trainType,
                ridership,
                dailyRevenue
            );
        }

        // Override dailyCost with MC-anchored accumulated value when available.
        // Falls back to the formula-based value from the calculator (full 24h
        // projection for established routes, prorated for new-today routes).
        const accumulatedCostValue = getAccumulatedCost(route.id);
        const dailyCost = accumulatedCostValue > 0 ? accumulatedCostValue : calculatedMetrics.dailyCost;

        // Recompute profit fields with the accurate cost
        const dailyProfit        = dailyRevenue - dailyCost;
        const profitPerPassenger = ridership > 0 ? dailyProfit / ridership : 0;
        const totalTrains        = (route.trainSchedule?.highDemand   || 0) +
                                   (route.trainSchedule?.mediumDemand || 0) +
                                   (route.trainSchedule?.lowDemand    || 0);
        const profitPerTrain     = totalTrains > 0 ? dailyProfit / totalTrains : 0;

        processedData.push({
            id: route.id,
            name: route.name || route.bullet,
            ridership,
            dailyRevenue,
            deleted: false,
            isNewToday: isNewToday,  // Flag for UI indicators (optional)
            transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
            ...calculatedMetrics,
            dailyCost,
            dailyProfit,
            profitPerPassenger,
            profitPerTrain,
        });
    });
    
    return processedData;
}
