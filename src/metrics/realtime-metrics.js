// Real-time metrics calculation module
// Calculates accurate costs/profits for routes created during the current day
// Only counts time elapsed since route creation

import { CONFIG } from '../config.js';

/**
 * Calculate real-time metrics for newly created routes
 * Only accounts for time elapsed since creation
 *
 * Used in "Last 24h" mode to show accurate costs/profits for routes
 * created during the current day, avoiding inflated projections
 *
 * @param {Object} route - Route object
 * @param {Object} trainType - Train type definition
 * @param {number} ridership - Ridership (already rolling 24h window)
 * @param {number} projectedDailyRevenue - Rate-based 24h projection (revenuePerHour * 24).
 *        Used as fallback to estimate partial-day revenue when actualRevenue is null.
 * @param {number} creationTime - Creation timestamp (elapsed seconds)
 * @param {number} currentTime - Current timestamp (elapsed seconds)
 * @param {number|null} actualRevenue - MC-anchored accumulated revenue since day start.
 *        When provided this is used directly for profit calculations instead of
 *        the scaled projection, eliminating pulse-driven fluctuation.
 * @returns {Object} Calculated metrics
 */
export function calculateRealTimeMetrics(route, trainType, ridership, projectedDailyRevenue, creationTime, currentTime, actualRevenue = null) {
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

    const elapsedSeconds = currentTime - creationTime;
    const elapsedHours = elapsedSeconds / 3600;

    let capacity = 0;
    let utilization = 0;
    let dailyCost = 0;

    if (route.stComboTimings && route.stComboTimings.length > 0) {
        const timings = route.stComboTimings;
        const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;

        if (loopTimeSeconds > 0) {
            const loopsPerHour = 3600 / loopTimeSeconds;

            // Calculate capacity for elapsed time only
            // Determine which demand phases have occurred since creation
            const creationMinute = Math.floor((creationTime % 86400) / 60);
            const currentMinute = Math.floor((currentTime % 86400) / 60);
            
            let elapsedHighHours = 0;
            let elapsedMediumHours = 0;
            let elapsedLowHours = 0;
            
            // Calculate overlap between route lifetime and each demand phase
            CONFIG.DEMAND_PHASES.forEach(phase => {
                const phaseStartMin = phase.startHour * 60;
                const phaseEndMin = phase.endHour * 60;
                
                // Find overlap between [creationMinute, currentMinute] and [phaseStart, phaseEnd]
                const overlapStart = Math.max(creationMinute, phaseStartMin);
                const overlapEnd = Math.min(currentMinute, phaseEndMin);
                
                if (overlapStart < overlapEnd) {
                    const durationHours = (overlapEnd - overlapStart) / 60;
                    
                    if (phase.type === 'high') elapsedHighHours += durationHours;
                    else if (phase.type === 'medium') elapsedMediumHours += durationHours;
                    else if (phase.type === 'low') elapsedLowHours += durationHours;
                }
            });

            // Calculate capacity based on actual elapsed time in each phase
            const highCapacity = trainCounts.high * elapsedHighHours * loopsPerHour * capacityPerTrain;
            const mediumCapacity = trainCounts.medium * elapsedMediumHours * loopsPerHour * capacityPerTrain;
            const lowCapacity = trainCounts.low * elapsedLowHours * loopsPerHour * capacityPerTrain;

            capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);

            if (capacity > 0) {
                utilization = Math.round((ridership / capacity) * 100);
            }

            // Calculate cost for elapsed time
            const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
            const carCostPerHour = trainType.stats.carOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
            const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);

            dailyCost = (trainCounts.low * elapsedLowHours * costPerTrainPerHour) +
                       (trainCounts.medium * elapsedMediumHours * costPerTrainPerHour) +
                       (trainCounts.high * elapsedHighHours * costPerTrainPerHour);
        }
    }

    const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;

    // Revenue for profit calculation:
    //   • actualRevenue supplied → use it directly (MC-anchored, already the real partial-day total)
    //   • no actualRevenue       → scale the rate-based projection by elapsed fraction
    const scaledRevenue = actualRevenue !== null
        ? actualRevenue
        : projectedDailyRevenue * (elapsedHours / 24);
    const dailyProfit = scaledRevenue - dailyCost;
    
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
