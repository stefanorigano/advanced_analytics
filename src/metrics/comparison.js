// Comparison logic module
// Handles route comparisons and percentage calculations

import { calculateTotalTrains } from '../utils/formatting.js';

// Derive efficiency from a stored route, falling back for old snapshots that
// pre-date the efficiency field being added to the accumulator output.
function getEfficiency(route) {
    if (!route) return 0;
    if (route.efficiency != null) return route.efficiency;
    return route.capacity > 0 ? route.ridership / (2 * route.capacity) : 0;
}

/**
 * Determine if a metric is good when high (vs good when low like costs)
 * @param {string} metricKey - Metric identifier
 * @returns {boolean} True if higher is better
 */
export function isMetricGoodWhenHigh(metricKey) {
    const goodWhenLow = ['dailyCost'];
    return !goodWhenLow.includes(metricKey);
}

/**
 * Calculate percentage change between two values with proper handling of edge cases
 * Determines if change is an improvement based on metric type
 * 
 * @param {number} primaryValue - Current/newer value
 * @param {number} secondaryValue - Previous/older value  
 * @param {string} metricKey - Metric identifier (e.g., 'ridership', 'dailyCost')
 * @returns {Object} {type: string, value: number, isImprovement: boolean}
 */
export function calculatePercentageChange(primaryValue, secondaryValue, metricKey) {
    // Handle special cases
    if (primaryValue === null || primaryValue === undefined || 
        secondaryValue === null || secondaryValue === undefined) {
        return { type: 'missing', value: 0 };
    }

    // Route exists in primary but not secondary = NEW
    if (secondaryValue === 0 && primaryValue > 0) {
        return { type: 'new', value: 0 };
    }

    // Route exists in secondary but not primary = DELETED
    if (primaryValue === 0 && secondaryValue > 0) {
        return { type: 'deleted', value: 0 };
    }

    // Both zero
    if (primaryValue === 0 && secondaryValue === 0) {
        return { type: 'zero', value: 0 };
    }

    // Calculate percentage
    const percentage = ((primaryValue - secondaryValue) / secondaryValue) * 100;
    
    // Determine if positive change is good or bad
    const isGoodWhenHigh = isMetricGoodWhenHigh(metricKey);
    
    return {
        type: 'normal',
        value: percentage,
        isImprovement: isGoodWhenHigh ? percentage > 0 : percentage < 0
    };
}

/**
 * Build a comparison row for a route
 * Handles three cases: NEW routes, DELETED routes, and normal comparison with percentage changes
 *
 * NEW/DELETED status is derived purely from whether the route's snapshot is
 * present on each day being compared — NOT from routeStatuses.createdDay.
 * A route's createdDay can coincide with either comparison day (e.g. every
 * starting route in a fresh city has createdDay === 1) while still having a
 * perfectly valid, non-empty snapshot for that day. Treating "created on this
 * day" as "no data for this day" was wrong and made the earliest possible
 * comparison (Day 2 vs Day 1) come up empty for every new city.
 *
 * @param {Object} row - Row object containing primaryRoute and secondaryRoute
 * @returns {Object} Formatted comparison row with metrics
 */
export function buildComparisonRow(row) {
    const { primaryRoute, secondaryRoute } = row;

    // NEW route: exists in primary (newer) day but has no snapshot on secondary (older) day
    if (primaryRoute && !secondaryRoute) {
        return {
            id: row.id,
            name: row.name,
            ridership: 'NEW',
            capacity: 'NEW',
            loadFactor: 'NEW',
            efficiency: 'NEW',
            stations: 'NEW',
            trainSchedule: 'NEW',
            transfers: 'NEW',
            dailyCost: 'NEW',
            dailyRevenue: 'NEW',
            dailyProfit: 'NEW',
            profitPerTrain: 'NEW',
            primaryValues: {
                ridership: primaryRoute.ridership,
                capacity: primaryRoute.capacity,
                loadFactor: primaryRoute.loadFactor || 0,
                efficiency: getEfficiency(primaryRoute),
                stations: primaryRoute.stations,
                trainSchedule: calculateTotalTrains(primaryRoute),
                transfers: primaryRoute.transfers,
                dailyCost: primaryRoute.dailyCost,
                dailyRevenue: primaryRoute.dailyRevenue,
                dailyProfit: primaryRoute.dailyProfit,
                profitPerTrain: primaryRoute.profitPerTrain
            },
            secondaryValues: {
                ridership: secondaryRoute?.ridership || 0,
                capacity: secondaryRoute?.capacity || 0,
                loadFactor: secondaryRoute?.loadFactor || 0,
                efficiency: getEfficiency(secondaryRoute),
                stations: secondaryRoute?.stations || 0,
                trainSchedule: calculateTotalTrains(secondaryRoute),
                transfers: secondaryRoute?.transfers || { count: 0, routes: [], stationIds: [] },
                dailyCost: secondaryRoute?.dailyCost || 0,
                dailyRevenue: secondaryRoute?.dailyRevenue || 0,
                dailyProfit: secondaryRoute?.dailyProfit || 0,
                profitPerTrain: secondaryRoute?.profitPerTrain || 0
            },
            deleted: false,
            isNew: true,
            isComparison: true
        };
    }

    // DELETED route: had a snapshot on secondary (older) day but none on primary (newer) day
    if (!primaryRoute && secondaryRoute) {
        return {
            id: row.id,
            name: row.name,
            ridership: 'DELETED',
            capacity: 'DELETED',
            loadFactor: 'DELETED',
            efficiency: 'DELETED',
            stations: 'DELETED',
            trainSchedule: 'DELETED',
            transfers: 'DELETED',
            dailyCost: 'DELETED',
            dailyRevenue: 'DELETED',
            dailyProfit: 'DELETED',
            profitPerTrain: 'DELETED',
            primaryValues: {
                ridership: 0,
                capacity: 0,
                loadFactor: 0,
                efficiency: 0,
                stations: 0,
                trainSchedule: 0,
                transfers: { count: 0, routes: [], stationIds: [] },
                dailyCost: 0,
                dailyRevenue: 0,
                dailyProfit: 0,
                profitPerTrain: 0
            },
            secondaryValues: {
                ridership: secondaryRoute.ridership,
                capacity: secondaryRoute.capacity,
                loadFactor: secondaryRoute.loadFactor || 0,
                efficiency: getEfficiency(secondaryRoute),
                stations: secondaryRoute.stations,
                trainSchedule: calculateTotalTrains(secondaryRoute),
                transfers: secondaryRoute.transfers,
                dailyCost: secondaryRoute.dailyCost,
                dailyRevenue: secondaryRoute.dailyRevenue,
                dailyProfit: secondaryRoute.dailyProfit,
                profitPerTrain: secondaryRoute.profitPerTrain
            },
            deleted: true,
            isDeleted: true,
            isComparison: true
        };
    }

    // Normal comparison - calculate percentages for all metrics
    const metrics = {
        ridership: calculatePercentageChange(primaryRoute.ridership, secondaryRoute.ridership, 'ridership'),
        capacity: calculatePercentageChange(primaryRoute.capacity, secondaryRoute.capacity, 'capacity'),
        loadFactor: calculatePercentageChange(primaryRoute.loadFactor || 0, secondaryRoute.loadFactor || 0, 'loadFactor'),
        efficiency: calculatePercentageChange(getEfficiency(primaryRoute), getEfficiency(secondaryRoute), 'efficiency'),
        stations: calculatePercentageChange(primaryRoute.stations, secondaryRoute.stations, 'stations'),
        trainSchedule: calculatePercentageChange(
            calculateTotalTrains(primaryRoute),
            calculateTotalTrains(secondaryRoute),
            'trainSchedule'
        ),
        transfers: calculatePercentageChange(
            primaryRoute.transfers?.count || 0,
            secondaryRoute.transfers?.count || 0,
            'transfers'
        ),
        dailyCost: calculatePercentageChange(primaryRoute.dailyCost, secondaryRoute.dailyCost, 'dailyCost'),
        dailyRevenue: calculatePercentageChange(primaryRoute.dailyRevenue, secondaryRoute.dailyRevenue, 'dailyRevenue'),
        dailyProfit: calculatePercentageChange(primaryRoute.dailyProfit, secondaryRoute.dailyProfit, 'dailyProfit'),
        profitPerTrain: calculatePercentageChange(
            primaryRoute.profitPerTrain,
            secondaryRoute.profitPerTrain,
            'profitPerTrain'
        )
    };

    return {
        id: row.id,
        name: row.name,
        ...metrics,
        primaryValues: {
            ridership: primaryRoute.ridership,
            capacity: primaryRoute.capacity,
            loadFactor: primaryRoute.loadFactor || 0,
            efficiency: getEfficiency(primaryRoute),
            stations: primaryRoute.stations,
            trainSchedule: calculateTotalTrains(primaryRoute),
            transfers: primaryRoute.transfers,
            dailyCost: primaryRoute.dailyCost,
            dailyRevenue: primaryRoute.dailyRevenue,
            dailyProfit: primaryRoute.dailyProfit,
            profitPerTrain: primaryRoute.profitPerTrain,
            scheduleChangedRecently: primaryRoute.scheduleChangedRecently || false,
        },
        secondaryValues: {
            ridership: secondaryRoute.ridership,
            capacity: secondaryRoute.capacity,
            loadFactor: secondaryRoute.loadFactor || 0,
            efficiency: getEfficiency(secondaryRoute),
            stations: secondaryRoute.stations,
            trainSchedule: calculateTotalTrains(secondaryRoute),
            transfers: secondaryRoute.transfers,
            dailyCost: secondaryRoute.dailyCost,
            dailyRevenue: secondaryRoute.dailyRevenue,
            dailyProfit: secondaryRoute.dailyProfit,
            profitPerTrain: secondaryRoute.profitPerTrain,
            scheduleChangedRecently: secondaryRoute.scheduleChangedRecently || false,
        },
        deleted: false,
        isComparison: true
    };
}

/**
 * Get comparison data for two days
 * @param {number} primaryDay - Primary day (newer)
 * @param {number} secondaryDay - Secondary day (older)
 * @param {Object} historicalData - Historical data object
 * @returns {Array|null} Array of comparison rows or null if data missing
 */
export function getComparisonData(primaryDay, secondaryDay, historicalData) {
    const primaryData = historicalData.days[primaryDay];
    const secondaryData = historicalData.days[secondaryDay];
    
    if (!primaryData || !secondaryData) {
        return null;
    }

    // Build map of secondary routes by ID for quick lookup
    const secondaryRoutes = new Map();
    secondaryData.routes.forEach(route => {
        secondaryRoutes.set(route.id, route);
    });

    // Build map of primary routes by ID
    const primaryRoutes = new Map();
    primaryData.routes.forEach(route => {
        primaryRoutes.set(route.id, route);
    });

    // Combine all routes
    const allRouteIds = new Set([...primaryRoutes.keys(), ...secondaryRoutes.keys()]);
    
    const comparisonRows = [];
    
    allRouteIds.forEach(routeId => {
        const primaryRoute = primaryRoutes.get(routeId);
        const secondaryRoute = secondaryRoutes.get(routeId);
        
        // Filter out routes that don't exist in either day
        if (!primaryRoute && !secondaryRoute) {
            return;
        }
        
        comparisonRows.push({
            id: routeId,
            name: (primaryRoute || secondaryRoute).name,
            primaryRoute,
            secondaryRoute
        });
    });
    
    return comparisonRows;
}
