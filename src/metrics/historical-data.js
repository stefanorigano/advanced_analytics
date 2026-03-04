// Historical data management module
// Captures and retrieves historical route data

import { CONFIG } from '../config.js';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from './route-metrics.js';
import { calculateTransfers } from './transfers.js';
import { calculateDailyCostFromTimeline } from './train-config-tracking.js';

/**
 * Capture current route data as historical snapshot
 * Called at end of each day
 *
 * Uses MC-anchored accumulated revenue and cost when available (from accumulator.js).
 * Falls back to the naive `revenuePerHour * 24` snapshot if no accumulated data
 * exists (e.g. the game was just loaded and onDayChange fired immediately).
 *
 * @param {number} day - Day number that just ended
 * @param {Object} api - SubwayBuilderAPI instance
 * @param {Object} storage - Storage instance
 * @param {{ [routeId: string]: number }} [accumulatedRevenue] - Day-level normalized revenue map
 * @param {{ [routeId: string]: number[] }} [hourlyRevenue] - Per-hour normalized revenue map (24 values)
 * @param {{ [routeId: string]: number }} [accumulatedCost] - MC-anchored operational cost map
 * @returns {Promise<void>}
 */
export async function captureHistoricalData(day, api, storage, accumulatedRevenue = null, hourlyRevenue = null, accumulatedCost = null) {
    try {
        const routes = api.gameState.getRoutes();
        const trainTypes = api.trains.getTrainTypes();
        const lineMetrics = api.gameState.getLineMetrics();
        // Get config timeline for accurate cost calculation
        const configCache = await storage.get('configCache', {});
        const configTimeline = configCache[day] || {};

        // Calculate transfers for all routes
        const transfersMap = calculateTransfers(routes, api);

        const processedData = [];

        routes.forEach(route => {
            const metrics = lineMetrics.find(m => m.routeId === route.id);
            const ridership = api.gameState.getRouteRidership(route.id).total;
            const revenuePerHour = metrics ? metrics.revenuePerHour : 0;

            // Prefer MC-anchored accumulated revenue; fall back to rate snapshot
            const accumulated = accumulatedRevenue ? (accumulatedRevenue[route.id] ?? 0) : 0;
            const dailyRevenue = accumulated > 0
                ? accumulated
                : revenuePerHour * 24;

            // Per-hour breakdown for the rolling 24h window (null if not available)
            const routeHourlyRevenue = hourlyRevenue ? (hourlyRevenue[route.id] ?? null) : null;

            if (!validateRouteData(route)) {
                processedData.push({
                    id: route.id,
                    name: route.name || route.bullet,
                    ridership,
                    dailyRevenue,
                    hourlyRevenue: routeHourlyRevenue,
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
                    hourlyRevenue: routeHourlyRevenue,
                    transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                    ...getEmptyMetrics()
                });
                return;
            }

            // Get cars per train
            const carsPerTrain = route.carsPerTrain !== undefined 
                ? route.carsPerTrain 
                : trainType.stats.carsPerCarSet;

            // Calculate metrics using standard calculation (capacity, stations, etc.)
            const calculatedMetrics = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
            
            // Resolve dailyCost with three-tier fallback:
            //   1. MC-anchored accumulated cost (most accurate — actual money events)
            //   2. Timeline-based calculation (accurate when train config changed mid-day)
            //   3. Standard formula from calculateRouteMetrics (full-day projection)
            const routeTimeline   = configTimeline[route.id];
            const accCost         = accumulatedCost ? (accumulatedCost[route.id] ?? 0) : 0;
            let dailyCost;

            if (accCost > 0) {
                dailyCost = accCost;
            } else if (routeTimeline && routeTimeline.length > 0) {
                const timelineCost = calculateDailyCostFromTimeline(route.id, routeTimeline, trainType, carsPerTrain);
                dailyCost = timelineCost !== null ? timelineCost : calculatedMetrics.dailyCost;
            } else {
                dailyCost = calculatedMetrics.dailyCost;
            }
            
            // Recalculate profit with accurate cost
            const dailyProfit = dailyRevenue - dailyCost;
            const profitPerPassenger = ridership > 0 ? dailyProfit / ridership : 0;
            const totalTrains = (route.trainSchedule?.highDemand || 0) + 
                              (route.trainSchedule?.mediumDemand || 0) + 
                              (route.trainSchedule?.lowDemand || 0);
            const profitPerTrain = totalTrains > 0 ? dailyProfit / totalTrains : 0;
            
            processedData.push({
                id: route.id,
                name: route.name || route.bullet,
                ridership,
                dailyRevenue,
                hourlyRevenue: routeHourlyRevenue,
                transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                ...calculatedMetrics,
                dailyCost,
                dailyProfit,
                profitPerPassenger,
                profitPerTrain
            });
        });

        // Load existing historical data
        const historicalData = await storage.get('historicalData', { days: {} });
        
        // Store snapshot for this day
        historicalData.days[day] = {
            timestamp: Date.now(),
            routes: processedData
        };

        // Save to storage
        await storage.set('historicalData', historicalData);
        
        // Clean up config cache for this day
        delete configCache[day];
        await storage.set('configCache', configCache);
        
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
 * Clear old historical data to prevent storage bloat
 * Keeps only the most recent N days
 * @param {number} daysToKeep - Number of days to retain
 * @param {Object} storage - Storage instance
 * @returns {Promise<void>}
 */
export async function pruneHistoricalData(daysToKeep, storage) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const days = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
        
        if (days.length <= daysToKeep) {
            return; // Nothing to prune
        }
        
        // Keep only recent days
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
