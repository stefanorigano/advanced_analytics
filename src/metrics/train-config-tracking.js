// Train configuration tracking module
// Captures train schedule changes throughout the day with minute-level precision

import { CONFIG } from '../config.js';
import { readTierCounts } from '../utils/demand-tiers.js';

/**
 * Record a train configuration change
 * Writes directly to storage 
 */
export async function recordConfigChange(routeId, hour, minute, config, api, storage) {
    const currentDay = api.gameState.getCurrentDay();
    const timestamp = hour * 60 + minute;
    
    const configCache = await storage.get('configCache', {});
    
    if (!configCache[currentDay]) {
        configCache[currentDay] = {};
    }
    if (!configCache[currentDay][routeId]) {
        configCache[currentDay][routeId] = [];
    }
    
    const entry = { timestamp, hour, minute };
    for (const tier of CONFIG.TIERS) entry[tier.key] = config[tier.key] || 0;
    configCache[currentDay][routeId].push(entry);

    await storage.set('configCache', configCache);
}

/**
 * Capture initial configuration at day start (midnight)
 * Ensures we have a baseline snapshot for cost calculations
 * 
 * @param {number} day - Day number
 * @param {Object} api - SubwayBuilderAPI instance
 * @param {Object} storage - Storage instance
 */
export async function captureInitialDayConfig(day, api, storage) {
    const routes = api.gameState.getRoutes();
    
    const configCache = await storage.get('configCache', {});
    configCache[day] = {};
    
    routes.forEach(route => {
        const counts = readTierCounts(route.trainSchedule);
        const entry = { timestamp: 0, hour: 0, minute: 0 }; // Midnight baseline
        for (const tier of CONFIG.TIERS) entry[tier.key] = counts[tier.key];
        configCache[day][route.id] = [entry];
    });
    
    await storage.set('configCache', configCache);
}

/**
 * Prune old days from the config cache to prevent storage bloat.
 * Keeps only the most recent N days (mirrors pruneHistoricalData).
 *
 * @param {number} daysToKeep - Number of days to retain
 * @param {Object} storage    - Storage instance
 * @returns {Promise<void>}
 */
export async function pruneConfigCache(daysToKeep, storage) {
    const configCache = await storage.get('configCache', {});
    const days = Object.keys(configCache).map(Number).sort((a, b) => b - a);
    if (days.length <= daysToKeep) return;

    days.slice(daysToKeep).forEach(day => { delete configCache[day]; });
    await storage.set('configCache', configCache);
}

/**
 * Calculate daily cost from configuration timeline
 * 
 * Uses phase-based cost calculation:
 * - For each demand phase (high/medium/low), determines which train configuration was active
 * - Calculates cost based on actual duration each configuration was active
 * - Handles mid-phase configuration changes accurately
 * 
 * @param {string} routeId - Route ID
 * @param {Array} configTimeline - Array of config snapshots with timestamps
 * @param {Object} trainType - Train type definition
 * @param {number} carsPerTrain - Cars per train
 * @returns {number} Total daily cost
 */
export function calculateDailyCostFromTimeline(routeId, configTimeline, trainType, carsPerTrain) {
    if (!configTimeline || configTimeline.length === 0) {
        return null; // No data, use fallback
    }
    
    // Sort chronologically
    const sorted = [...configTimeline].sort((a, b) => a.timestamp - b.timestamp);
    
    const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
    const carCostPerHour = trainType.stats.carOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
    const costPerTrainPerMinute = (trainCostPerHour + (carsPerTrain * carCostPerHour)) / 60;
    
    let totalCost = 0;
    
    // Process each demand phase
    CONFIG.DEMAND_PHASES.forEach(phase => {
        const phaseStartMin = phase.startHour * 60;
        const phaseEndMin = phase.endHour * 60;
        const demandType = phase.type; // 'high', 'medium', 'low'
        
        // Find all config changes that occurred during or before this phase
        let currentConfig = null;
        let lastChangeTime = phaseStartMin;
        
        for (let i = 0; i < sorted.length; i++) {
            const change = sorted[i];
            
            // Find config active at phase start
            if (change.timestamp <= phaseStartMin) {
                currentConfig = change;
                lastChangeTime = phaseStartMin;
                continue;
            }
            
            // Config change during this phase
            if (change.timestamp < phaseEndMin) {
                if (currentConfig) {
                    // Calculate cost for previous config up to this change
                    const duration = change.timestamp - lastChangeTime;
                    // `|| 0`: pre-4-tier config entries have no veryLow count.
                    const trainCount = currentConfig[demandType] || 0;
                    totalCost += trainCount * duration * costPerTrainPerMinute;
                }
                
                currentConfig = change;
                lastChangeTime = change.timestamp;
            } else {
                // Change is after this phase ends
                break;
            }
        }
        
        // Calculate cost for final config segment of this phase
        if (currentConfig) {
            const duration = phaseEndMin - lastChangeTime;
            const trainCount = currentConfig[demandType] || 0;
            totalCost += trainCount * duration * costPerTrainPerMinute;
        }
    });
    
    return totalCost;
}
