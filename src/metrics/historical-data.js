// Historical data management module
// Captures and retrieves historical route data

import { CONFIG } from '../config.js';

/**
 * Capture a day's route data as a historical snapshot.
 * Called at end of each day from lifecycle.js onDayChange.
 *
 * The caller (lifecycle.js) already computed per-route stats via
 * getRoute24hStats(), so this function just formats and persists them.
 *
 * @param {number} day          - In-game day number that just ended
 * @param {Object} api          - SubwayBuilderAPI instance
 * @param {Object} storage      - Storage instance
 * @param {Object} routeStatsMap - { [routeId]: statsFromGetRoute24hStats }
 * @returns {Promise<void>}
 */
export async function captureHistoricalData(day, api, storage, routeStatsMap = {}) {
    try {
        const routes = api.gameState.getRoutes();

        const processedData = routes.map(route => {
            const stats = routeStatsMap[route.id] || {};
            return {
                id:      route.id,
                name:    route.name || route.bullet,
                deleted: false,
                // Spread all precomputed stats (dailyRevenue, dailyCost, dailyProfit,
                // capacity, utilization, ridership, transfers, trains*, stations, etc.)
                ...stats,
            };
        });

        // Load existing historical data
        const historicalData = await storage.get('historicalData', { days: {} });

        // Store snapshot for this day
        historicalData.days[day] = {
            timestamp: Date.now(),
            routes:    processedData,
        };

        await storage.set('historicalData', historicalData);

        console.log(`${CONFIG.LOG_PREFIX} Captured data for Day ${day}: ${processedData.length} routes`);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to capture historical data:`, error);
    }
}

/**
 * Load all historical data from storage
 * @param {Object} storage - Storage instance
 * @returns {Promise<Object>} Historical data object
 */
export async function loadHistoricalData(storage) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const dayCount = Object.keys(historicalData.days).length;
        console.log(`${CONFIG.LOG_PREFIX} Loaded historical data: ${dayCount} days`);
        return historicalData;
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to load historical data:`, error);
        return { days: {} };
    }
}

/**
 * Get route data for a specific day
 * @param {number} day - Day number
 * @param {Object} historicalData - Historical data object
 * @returns {Array|null} Array of route data or null if day not found
 */
export function getDataForDay(day, historicalData) {
    const dayData = historicalData.days[day];
    if (!dayData || !dayData.routes) {
        return null;
    }
    return dayData.routes;
}

/**
 * Clear old historical data to prevent storage bloat.
 * Keeps only the most recent N days.
 *
 * @param {number} daysToKeep - Number of days to retain
 * @param {Object} storage    - Storage instance
 * @returns {Promise<void>}
 */
export async function pruneHistoricalData(daysToKeep, storage) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const days = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);

        if (days.length <= daysToKeep) {
            return; // Nothing to prune
        }

        const daysToDelete = days.slice(daysToKeep);
        daysToDelete.forEach(day => {
            delete historicalData.days[day];
        });

        await storage.set('historicalData', historicalData);
        console.log(`${CONFIG.LOG_PREFIX} Pruned ${daysToDelete.length} old days, keeping ${daysToKeep} most recent`);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to prune historical data:`, error);
    }
}
