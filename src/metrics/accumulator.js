// ============================================================
// Accumulator — Revenue + Cost (Production Module)
// ============================================================
// Unified accumulation of per-route revenue and operational costs.
//
// Both channels use the same MC-anchored strategy:
//   onMoneyChanged  → hourly MC buckets (ground truth totals)
//   poll (500ms)    → per-route integral weights per hour
//   At onDayChange  → day-level normalization writes accurate per-route values
//
// Revenue:  type === 'revenue'
// Cost:     type === 'expense' && category === 'trainOperational'
//
// Why MC-anchoring for costs?
//   Like revenuePerHour, operational costs are charged in discrete pulses by
//   the game engine. Using the actual money-change events as the total and
//   formula-derived costPerHour as weights gives exact per-route values without
//   depending on stable pulse timing.
//
// See src/docs/REVENUE_ARCHITECTURE.md for the full design rationale (revenue
// channel). The cost channel mirrors it exactly.
//
// Singleton — onMoneyChanged is registered exactly once per page lifetime.
// ============================================================

import { CONFIG } from '../config.js';

const POLL_INTERVAL_MS = 500;
const TAG = '[AA:ACC]';

// ── Helpers ────────────────────────────────────────────────────────────────

function _makeEmptyBuckets() {
    return Array.from({ length: 24 }, () => ({ mcTotal: 0, routeWeights: {} }));
}

/**
 * Day-level normalization: distribute the total MC amount across routes
 * proportionally to their aggregate weight across all hours.
 * Absorbs "tail-lag" periods where all per-route rates were 0.
 *
 * @param {Array} buckets - 24-element bucket array
 * @returns {{ [routeId: string]: number }}
 */
function _normalizeDaySnapshot(buckets) {
    const totalRouteWeights = {};
    let totalAllWeights = 0;
    let totalMC = 0;

    buckets.forEach(bucket => {
        totalMC += bucket.mcTotal;
        Object.entries(bucket.routeWeights).forEach(([routeId, weight]) => {
            totalRouteWeights[routeId] = (totalRouteWeights[routeId] || 0) + weight;
            totalAllWeights += weight;
        });
    });

    if (totalAllWeights === 0 || totalMC === 0) return {};

    const result = {};
    Object.entries(totalRouteWeights).forEach(([routeId, weight]) => {
        result[routeId] = (weight / totalAllWeights) * totalMC;
    });
    return result;
}

/**
 * Per-hour normalization: each hour normalized independently.
 * Hours where totalWeight === 0 contribute 0 (tail-lag captured in day total).
 *
 * @param {Array} buckets - 24-element bucket array
 * @returns {{ [routeId: string]: number[] }}  routeId → 24-element array
 */
function _normalizeHourlySnapshot(buckets) {
    const routeIds = new Set();
    buckets.forEach(b => Object.keys(b.routeWeights).forEach(id => routeIds.add(id)));

    const result = {};
    routeIds.forEach(id => { result[id] = new Array(24).fill(0); });

    buckets.forEach((bucket, h) => {
        const totalWeight = Object.values(bucket.routeWeights).reduce((a, b) => a + b, 0);
        if (totalWeight === 0 || bucket.mcTotal === 0) return;

        Object.entries(bucket.routeWeights).forEach(([routeId, weight]) => {
            result[routeId][h] = (weight / totalWeight) * bucket.mcTotal;
        });
    });

    return result;
}

// ── Module-level state ─────────────────────────────────────────────────────

let _hookRegistered    = false;

// Revenue channel
let _revBuckets        = _makeEmptyBuckets(); // [24] { mcTotal, routeWeights: { routeId: weight } }
let _lastRevRates      = {};                  // routeId → last observed revenuePerHour

// Cost channel
let _expBuckets        = _makeEmptyBuckets(); // [24] { mcTotal, routeWeights: { routeId: weight } }
let _lastCostRates     = {};                  // routeId → last computed costPerHour (formula-derived)

// Shared poll state
let _lastSampleElapsed = null;                // in-game seconds at last poll
let _pollTimer         = null;
let _api               = null;

// ── Single onMoneyChanged registration ────────────────────────────────────

function _registerMoneyHook(api) {
    if (_hookRegistered) return;
    _hookRegistered = true;

    api.hooks.onMoneyChanged((balance, change, type, category) => {
        const elapsed = api.gameState.getElapsedSeconds();
        const h = Math.min(Math.max(Math.floor((elapsed % 86400) / 3600), 0), 23);

        if (type === 'revenue') {
            _revBuckets[h].mcTotal += change;
        } else if (type === 'expense' && category === 'trainOperational') {
            _expBuckets[h].mcTotal += Math.abs(change);
        }
    });

    console.log(`${TAG} ✓ onMoneyChanged hook registered`);
}

// ── Cost rate helper ───────────────────────────────────────────────────────
// Computes per-route costPerHour using the current demand phase and the
// same formula as route-metrics.js. Called once per poll tick to update
// the held-step cost rates for the next integration interval.

function _computeCostRates(elapsedSeconds) {
    if (!_api) return {};

    const currentHour = Math.floor((elapsedSeconds % 86400) / 3600);
    const phase = CONFIG.DEMAND_PHASES.find(
        p => currentHour >= p.startHour && currentHour < p.endHour
    ) || CONFIG.DEMAND_PHASES[0];
    const demandType = phase.type;

    const routes     = _api.gameState.getRoutes();
    const trainTypes = _api.trains.getTrainTypes();

    const rates = {};
    routes.forEach(route => {
        const trainType = trainTypes[route.trainType];
        if (!trainType || !route.trainSchedule || !route.stComboTimings?.length) {
            rates[route.id] = 0;
            return;
        }

        const carsPerTrain = route.carsPerTrain !== undefined
            ? route.carsPerTrain
            : trainType.stats.carsPerCarSet;

        const trainCostPerHour    = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
        const carCostPerHour      = trainType.stats.carOperationalCostPerHour   * CONFIG.COST_MULTIPLIER;
        const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);

        const trainCounts = {
            high:   route.trainSchedule.highDemand   || 0,
            medium: route.trainSchedule.mediumDemand || 0,
            low:    route.trainSchedule.lowDemand    || 0,
        };

        rates[route.id] = (trainCounts[demandType] || 0) * costPerTrainPerHour;
    });

    return rates;
}

// ── Poll tick ──────────────────────────────────────────────────────────────
// Integrates both revenue and cost rates using held-step:
// the PREVIOUS tick's rates × Δt give the weight for that interval.
// Using in-game elapsed seconds so paused time is excluded automatically.

function _tick() {
    if (!_api || _api.gameState.isPaused()) return;

    const elapsed     = _api.gameState.getElapsedSeconds();
    const lineMetrics = _api.gameState.getLineMetrics();

    if (_lastSampleElapsed !== null && elapsed > _lastSampleElapsed) {
        const dtHours = (elapsed - _lastSampleElapsed) / 3600;
        // Assign weight to the hour the interval STARTED in
        const h = Math.min(Math.max(Math.floor((_lastSampleElapsed % 86400) / 3600), 0), 23);

        // Revenue weights
        Object.entries(_lastRevRates).forEach(([routeId, lastRate]) => {
            if (lastRate > 0) {
                _revBuckets[h].routeWeights[routeId] =
                    (_revBuckets[h].routeWeights[routeId] || 0) + lastRate * dtHours;
            }
        });

        // Cost weights
        Object.entries(_lastCostRates).forEach(([routeId, lastRate]) => {
            if (lastRate > 0) {
                _expBuckets[h].routeWeights[routeId] =
                    (_expBuckets[h].routeWeights[routeId] || 0) + lastRate * dtHours;
            }
        });
    }

    // Update held rates for next tick
    _lastRevRates = {};
    lineMetrics.forEach(lm => {
        _lastRevRates[lm.routeId] = lm.revenuePerHour || 0;
    });

    _lastCostRates = _computeCostRates(elapsed);

    _lastSampleElapsed = elapsed;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start the accumulator. Safe to call multiple times — restarts the poll
 * interval but does NOT reset accumulated state and does NOT re-register
 * the money hook.
 *
 * Call from: onGameInit, onGameLoaded, handleMapReadyFallback
 *
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function initAccumulator(api) {
    _api = api;
    _registerMoneyHook(api);

    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(_tick, POLL_INTERVAL_MS);

    console.log(`${TAG} ▶ Accumulator started | poll: ${POLL_INTERVAL_MS}ms`);
}

/**
 * Stop the poll interval. Does NOT clear accumulated data.
 * The onMoneyChanged hook continues to fire (cannot be unregistered).
 * Call from: onGameEnd.
 */
export function stopAccumulating() {
    if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
    }
    console.log(`${TAG} ■ Accumulator stopped`);
}

/**
 * Reset both revenue and cost hourly buckets and poll state for a new in-game day.
 * Call AFTER reading all snapshots at onDayChange.
 * Also call at game load to discard stale data from a previous session.
 */
export function resetForNewDay() {
    _revBuckets        = _makeEmptyBuckets();
    _expBuckets        = _makeEmptyBuckets();
    _lastSampleElapsed = null;
    _lastRevRates      = {};
    _lastCostRates     = {};
    console.log(`${TAG} ↺ Buckets reset for new day`);
}

// ── Revenue snapshots ──────────────────────────────────────────────────────

/**
 * Compute normalized daily revenue per route using day-level normalization.
 * @returns {{ [routeId: string]: number }}
 */
export function getDayRevenueSnapshot() {
    return _normalizeDaySnapshot(_revBuckets);
}

/**
 * Compute per-hour normalized revenue per route.
 * @returns {{ [routeId: string]: number[] }}  routeId → 24-element array
 */
export function getHourlyRevenueSnapshot() {
    return _normalizeHourlySnapshot(_revBuckets);
}

/**
 * Live query: current accumulated revenue for a single route today.
 * Falls back to 0 if no data yet — caller should fall back to revenuePerHour * elapsed.
 *
 * @param {string} routeId
 * @returns {number}
 */
export function getAccumulatedRevenue(routeId) {
    return getDayRevenueSnapshot()[routeId] ?? 0;
}

// ── Cost snapshots ─────────────────────────────────────────────────────────

/**
 * Compute normalized daily operational cost per route using day-level normalization.
 * @returns {{ [routeId: string]: number }}
 */
export function getDayCostSnapshot() {
    return _normalizeDaySnapshot(_expBuckets);
}

/**
 * Compute per-hour normalized operational cost per route.
 * @returns {{ [routeId: string]: number[] }}  routeId → 24-element array
 */
export function getHourlyCostSnapshot() {
    return _normalizeHourlySnapshot(_expBuckets);
}

/**
 * Live query: current accumulated operational cost for a single route today.
 * Falls back to 0 if no expense events have fired yet — caller should fall back
 * to the formula-based cost (calculateRouteMetrics / calculateRealTimeMetrics).
 *
 * @param {string} routeId
 * @returns {number}
 */
export function getAccumulatedCost(routeId) {
    return getDayCostSnapshot()[routeId] ?? 0;
}
