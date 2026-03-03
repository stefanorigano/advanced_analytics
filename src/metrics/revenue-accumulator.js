// ============================================================
// Revenue Accumulator — Production Module
// ============================================================
// Replaces the naive `revenuePerHour * 24` snapshot with an
// MC-anchored accumulation strategy derived from the beta API
// investigation (see src/debug/revenue-debug.js).
//
// Architecture:
//   onMoneyChanged  → hourly MC buckets (ground truth)
//   revenuePerHour poll (500ms) → per-route integral weights per hour
//   At onDayChange  → day-level normalization writes accurate dailyRevenue
//                     per-hour normalization writes hourlyRevenue[24]
//
// Why two normalization scopes?
//   Day-level: absorbs all "all-routes-at-0" tail-lag revenue into the total
//              before distributing — ensures dailyRevenue is always exact.
//   Per-hour:  gives fine-grained breakdown for the rolling 24h window;
//              tail-lag hours where totalWeight===0 contribute 0 to that
//              hour (the amount is already captured in the day total).
//
// Singleton — onMoneyChanged is registered exactly once per page lifetime.
// ============================================================

import { CONFIG } from '../config.js';

const POLL_INTERVAL_MS = 500;
const TAG = '[AA:REVACC]';

// ── Helpers ────────────────────────────────────────────────────────────────

function _makeEmptyBuckets() {
    return Array.from({ length: 24 }, () => ({ mcTotal: 0, routeWeights: {} }));
}

// ── Module-level state ─────────────────────────────────────────────────────

let _hookRegistered   = false;
let _hourBuckets      = _makeEmptyBuckets(); // [24] { mcTotal, routeWeights: { routeId: weight } }
let _lastSampleElapsed = null;               // in-game seconds at last poll
let _lastRates         = {};                 // routeId → last observed revenuePerHour
let _pollTimer         = null;
let _api               = null;

// ── Single onMoneyChanged registration ────────────────────────────────────

function _registerMoneyHook(api) {
    if (_hookRegistered) return;
    _hookRegistered = true;

    api.hooks.onMoneyChanged((balance, change, type /*, category */) => {
        if (type !== 'revenue') return;
        const elapsed = api.gameState.getElapsedSeconds();
        const h = Math.min(Math.max(Math.floor((elapsed % 86400) / 3600), 0), 23);
        _hourBuckets[h].mcTotal += change;
    });

    console.log(`${TAG} ✓ onMoneyChanged hook registered`);
}

// ── Poll tick ──────────────────────────────────────────────────────────────
// Integrates revenuePerHour using held-step: the PREVIOUS tick's rates
// are multiplied by Δt to give the weight for that interval.
// Using elapsed in-game seconds so paused time is excluded automatically.

function _tick() {
    if (!_api || _api.gameState.isPaused()) return;

    const elapsed     = _api.gameState.getElapsedSeconds();
    const lineMetrics = _api.gameState.getLineMetrics();

    if (_lastSampleElapsed !== null && elapsed > _lastSampleElapsed) {
        const dtHours = (elapsed - _lastSampleElapsed) / 3600;
        // Assign weight to the hour the INTERVAL STARTED in
        const h = Math.min(Math.max(Math.floor((_lastSampleElapsed % 86400) / 3600), 0), 23);

        Object.entries(_lastRates).forEach(([routeId, lastRate]) => {
            if (lastRate > 0) {
                _hourBuckets[h].routeWeights[routeId] =
                    (_hourBuckets[h].routeWeights[routeId] || 0) + lastRate * dtHours;
            }
        });
    }

    // Update held rates for next tick
    _lastRates = {};
    lineMetrics.forEach(lm => {
        _lastRates[lm.routeId] = lm.revenuePerHour || 0;
    });

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
 * Reset hourly buckets and poll state for a new in-game day.
 * Call AFTER reading getDaySnapshot() / getHourlySnapshot() at onDayChange.
 * Also call at game load to discard stale data from a previous session.
 */
export function resetForNewDay() {
    _hourBuckets       = _makeEmptyBuckets();
    _lastSampleElapsed = null;
    _lastRates         = {};
    console.log(`${TAG} ↺ Buckets reset for new day`);
}

/**
 * Compute normalized daily revenue per route using DAY-LEVEL normalization.
 *
 * Tail-lag revenue (MC events arriving when all revenuePerHour values are 0)
 * is distributed proportionally using the day's aggregate per-route weights,
 * so no revenue is lost in the normalization.
 *
 * @returns {{ [routeId: string]: number }}
 */
export function getDaySnapshot() {
    const totalRouteWeights = {};
    let totalAllWeights = 0;
    let totalMC = 0;

    _hourBuckets.forEach(bucket => {
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
 * Compute per-hour normalized revenue per route.
 *
 * Each hour's revenue is normalized independently using that hour's weights.
 * Hours where totalWeight === 0 (pure tail-lag) contribute 0 to that hour's
 * breakdown — the amounts are captured in the day total via getDaySnapshot().
 *
 * @returns {{ [routeId: string]: number[] }}  routeId → 24-element array
 */
export function getHourlySnapshot() {
    const routeIds = new Set();
    _hourBuckets.forEach(b => Object.keys(b.routeWeights).forEach(id => routeIds.add(id)));

    const result = {};
    routeIds.forEach(id => { result[id] = new Array(24).fill(0); });

    _hourBuckets.forEach((bucket, h) => {
        const totalWeight = Object.values(bucket.routeWeights).reduce((a, b) => a + b, 0);
        if (totalWeight === 0 || bucket.mcTotal === 0) return;

        Object.entries(bucket.routeWeights).forEach(([routeId, weight]) => {
            result[routeId][h] = (weight / totalWeight) * bucket.mcTotal;
        });
    });

    return result;
}

/**
 * Live query: current accumulated revenue for a single route today.
 * Uses day-level normalization — consistent with getDaySnapshot().
 *
 * Falls back to 0 if no data has been accumulated yet (e.g. immediately
 * after a game load). Callers should fall back to revenuePerHour * elapsed
 * in that case.
 *
 * @param {string} routeId
 * @returns {number}
 */
export function getAccumulatedRevenue(routeId) {
    const snapshot = getDaySnapshot();
    return snapshot[routeId] ?? 0;
}
