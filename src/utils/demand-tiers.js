// Demand-tier helpers
// Centralizes the 4-tier demand model (CONFIG.TIERS) so cost, capacity,
// load-factor, and UI code can iterate tiers instead of hard-coding
// { high, medium, low } everywhere.

import { CONFIG } from '../config.js';

/**
 * Capitalize a tier key for building flat field names.
 * 'veryLow' → 'VeryLow', 'high' → 'High'.
 */
function _cap(key) {
    return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Build a flat per-tier field name.
 * e.g. perTierField('trains', 'veryLow') → 'trainsVeryLow'.
 * Kept flat so persisted historical snapshots stay backward-compatible.
 */
export function perTierField(prefix, tierKey) {
    return prefix + _cap(tierKey);
}

/**
 * Read the train counts for every tier off a game route.trainSchedule object.
 * Missing/undefined counts default to 0.
 * @returns {Object} keyed by tier key, e.g. { high, medium, low, veryLow }
 */
export function readTierCounts(trainSchedule) {
    const counts = {};
    for (const tier of CONFIG.TIERS) {
        counts[tier.key] = trainSchedule?.[tier.scheduleField] || 0;
    }
    return counts;
}

/**
 * A fresh per-tier map with every tier set to `value` (default 0).
 */
export function emptyTierMap(value = 0) {
    const map = {};
    for (const tier of CONFIG.TIERS) map[tier.key] = value;
    return map;
}

/**
 * Sum a flat per-tier field across all tiers on an object.
 * e.g. sumTierField(row, 'trains') = trainsHigh + trainsMedium + trainsLow + trainsVeryLow.
 */
export function sumTierField(obj, prefix) {
    if (!obj) return 0;
    let total = 0;
    for (const tier of CONFIG.TIERS) total += obj[perTierField(prefix, tier.key)] || 0;
    return total;
}

/**
 * Build a 24-entry lookup array mapping hour-of-day → tier key,
 * derived from CONFIG.DEMAND_PHASES.
 */
export function buildHourToTier() {
    const hourToTier = new Array(24);
    for (const phase of CONFIG.DEMAND_PHASES) {
        for (let h = phase.startHour; h < phase.endHour; h++) {
            hourToTier[h] = phase.type;
        }
    }
    return hourToTier;
}

/**
 * Return the demand phase (from CONFIG.DEMAND_PHASES) covering a given hour.
 * Falls back to the first phase if none matches.
 */
export function getPhaseForHour(hour) {
    return CONFIG.DEMAND_PHASES.find(p => hour >= p.startHour && hour < p.endHour)
        || CONFIG.DEMAND_PHASES[0];
}
