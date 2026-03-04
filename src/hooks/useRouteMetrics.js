// Custom hook for route metrics data fetching and processing
// The React hook that orchestrates metrics. It fetches live data from the API,
// calls getRoute24hStats() per route, then sorts the results.
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
import { buildComparisonRow, getComparisonData } from '../metrics/comparison.js';
import { sortTableData } from '../utils/sorting.js';
import { getStorage } from '../core/lifecycle.js';
import { getRoute24hStats } from '../metrics/accumulator.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

/**
 * Hook for fetching and processing route metrics data
 *
 * Handles four data modes:
 * 1. LIVE DATA (timeframe === 'last24h'): Current game state via getRoute24hStats
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

                            const wasNewOnPrimaryDay   = status.createdDay === comparePrimaryDay;
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
        storage
    ]);

    return { tableData, isLoading };
}

/**
 * Fetch live route data using the rolling 24h accumulator.
 *
 * Each route's stats come directly from getRoute24hStats(), which provides
 * a true rolling 24-hour window for revenue, cost, capacity and all derived
 * metrics — no day-boundary resets, no pulse-driven fluctuation.
 *
 * @param {Object} storage - Storage instance
 * @returns {Promise<Array>} Processed route data
 */
async function fetchLiveRouteData(storage) {
    const routes     = api.gameState.getRoutes();
    const currentDay = api.gameState.getCurrentDay();

    // Read route statuses once for the isNewToday UI flag
    const routeStatuses = storage
        ? await storage.get('routeStatuses', {})
        : {};

    return routes.map(route => {
        const stats = getRoute24hStats(route.id);

        const status     = routeStatuses[route.id];
        const isNewToday = !!(status && status.status === 'new' && status.createdDay === currentDay);

        return {
            id:          route.id,
            name:        route.name || route.bullet,
            deleted:     false,
            isNewToday,
            ...stats,
        };
    });
}
