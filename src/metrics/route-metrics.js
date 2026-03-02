// Route metrics calculation module
// Calculates all metrics for a route

import { CONFIG } from '../config.js';

/**
 * Validate that a route has the required data for calculations
 * @param {Object} route - Route object
 * @returns {boolean} True if route is valid
 */
export function validateRouteData(route) {
    return route && route.trainSchedule;
}

/**
 * Get empty metrics object for routes with missing data
 * @returns {Object} Metrics with zero/empty values
 */
export function getEmptyMetrics() {
    return {
        capacity: 0,
        utilization: 0,
        stations: 0,
        trainsLow: 0,
        trainsMedium: 0,
        trainsHigh: 0,
        trainSchedule: 0,
        dailyCost: 0,
        dailyRevenue: 0,
        dailyProfit: 0,
        profitPerPassenger: 0,
        profitPerTrain: 0,
        transfers: { count: 0, routes: [], routeIds: [], stationIds: [] }
    };
}

/**
 * Calculate all metrics for a route
 * @param {Object} route - Route object
 * @param {Object} trainType - Train type definition
 * @param {number} ridership - Ridership per period
 * @param {number} dailyRevenue - Daily revenue
 * @returns {Object} Calculated metrics
 */
export function calculateRouteMetrics(route, trainType, ridership, dailyRevenue) {
    const carsPerTrain = route.carsPerTrain !== undefined 
        ? route.carsPerTrain 
        : trainType.stats.carsPerCarSet;
    
    const capacityPerCar = trainType.stats.capacityPerCar;
    const capacityPerTrain = carsPerTrain * capacityPerCar;

    const schedule = route.trainSchedule || {};
    const trainCounts = {
        high: schedule.highDemand || 0,
        medium: schedule.mediumDemand || 0,
        low: schedule.lowDemand || 0
    };

    let capacity = 0;
    let utilization = 0;
    let dailyCost = 0;

    if (route.stComboTimings && route.stComboTimings.length > 0) {
        const timings = route.stComboTimings;
        const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;

        if (loopTimeSeconds > 0) {
            const loopsPerHour = 3600 / loopTimeSeconds;

            const highCapacity = trainCounts.high * CONFIG.DEMAND_HOURS.high * loopsPerHour * capacityPerTrain;
            const mediumCapacity = trainCounts.medium * CONFIG.DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain;
            const lowCapacity = trainCounts.low * CONFIG.DEMAND_HOURS.low * loopsPerHour * capacityPerTrain;

            capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);

            if (capacity > 0) {
                utilization = Math.round((ridership / capacity) * 100);
            }

            const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
            const carCostPerHour = trainType.stats.carOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
            const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);

            dailyCost = (trainCounts.low * CONFIG.DEMAND_HOURS.low * costPerTrainPerHour) +
                        (trainCounts.medium * CONFIG.DEMAND_HOURS.medium * costPerTrainPerHour) +
                        (trainCounts.high * CONFIG.DEMAND_HOURS.high * costPerTrainPerHour);
        }
    }

    const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;
    const dailyProfit = dailyRevenue - dailyCost;
    const profitPerPassenger = ridership > 0 ? dailyProfit / ridership : 0;
    const totalTrains = trainCounts.high + trainCounts.medium + trainCounts.low;
    const profitPerTrain = totalTrains > 0 ? dailyProfit / totalTrains : 0;

    return {
        capacity,
        utilization,
        stations,
        trainsLow: trainCounts.low,
        trainsMedium: trainCounts.medium,
        trainsHigh: trainCounts.high,
        trainSchedule: trainCounts.high,
        dailyCost,
        dailyProfit,
        profitPerPassenger,
        profitPerTrain
    };
}
