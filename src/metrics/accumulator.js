// ============================================================
// Accumulator — Event-Log Based Revenue + Cost (Production Module)
// ============================================================
// Replaces the hourly-bucket system with a rolling event log.
//
// Revenue and cost money-change events are stored with per-route
// proportional weights captured at event time.  This allows querying
// a TRUE rolling 24-hour window without any day-boundary resets.
//
// Key public functions:
//   getRoute24hStats(routeId)            — rolling last-24h stats
//   getRouteTodayStats(routeId)          — current day stats (trend chart "Today")
//   initAccumulator(api)                 — start poll + register money hook (idempotent)
//   stopAccumulating()                   — stop poll/prune intervals
//   clearAccumulatorState()              — wipe all events (call before restoreEvents)
//   persistEvents(storage)              — save event log to IDB
//   restoreEvents(storage, currentElapsed) — load + prune stale events from IDB
//
// Architecture:
//   onMoneyChanged  → append { t, amount, weights } to _revEvents / _costEvents
//   poll (500ms)    → update _lastRevWeights, _lastCostWeights, detect config changes
//   prune (60s)     → drop events older than 24 h + grace period
//   transfers (~5s) → refresh _transfersCache via calculateTransfers
//
// Weight carry-forward (tail-lag defence):
//   revenuePerHour oscillates near 0 between game engine pulses.  We track
//   per-route proportions normalised from the last non-zero rate snapshot.
//   When all rates are 0, _buildWeights returns the previous proportions so
//   money events during the quiet period are still attributed correctly.
//
// Singleton — onMoneyChanged is registered exactly once per page lifetime.
// ============================================================

import { CONFIG } from '../config.js';
import { calculateTransfers } from './transfers.js';

const TAG                 = '[AA:ACC]';
const POLL_INTERVAL_MS    = 500;
const PRUNE_INTERVAL_MS   = 60_000;
const TRANSFERS_REFRESH_N = 10;   // every N poll ticks ≈ 5 s
const GRACE_SECONDS       = 300;  // keep 5 min extra past the 24 h cutoff
const PERSIST_KEY         = 'accumulatorEvents';

// ── Module-level state ─────────────────────────────────────────────────────

let _hookRegistered  = false;
let _api             = null;

// Event logs
let _revEvents    = []; // { t: elapsedSec, amount: number, weights: { routeId: proportion } }
let _costEvents   = []; // same shape

// Config change timeline — used for exact rolling capacity calculation
let _configEvents  = []; // { t: elapsedSec, routeId: string, config: {high,medium,low} }
let _lastConfigs   = {}; // routeId → last observed { high, medium, low }

// Weight carry-forward (non-zero proportions, kept across tail-lag periods)
let _lastRevWeights  = {}; // routeId → proportion  (values sum to 1)
let _lastCostWeights = {}; // routeId → proportion  (values sum to 1)

// Poll-refreshed caches
let _routesCache     = null; // current routes array
let _trainTypesCache = null; // { trainTypeId: trainType }
let _transfersCache  = null; // { routeId: { count, routes, routeIds, stationIds } }

// Timers
let _pollTimer       = null;
let _pruneTimer      = null;
let _transfersTick   = 0;

// ── Helper: empty stats shape ──────────────────────────────────────────────

function _emptyStats() {
    return {
        dailyRevenue:       0,
        dailyCost:          0,
        dailyProfit:        0,
        ridership:          0,
        capacity:           0,
        utilization:        0,
        stations:           0,
        transfers:          { count: 0, routes: [], routeIds: [], stationIds: [] },
        trainsHigh:         0,
        trainsMedium:       0,
        trainsLow:          0,
        trainSchedule:      0,
        totalTrains:        0,
        profitPerPassenger: 0,
        profitPerTrain:     0,
    };
}

// ── Helper: demand-phase hours in an elapsed-seconds range ─────────────────

/**
 * Compute hours of each demand type (high/medium/low) within [t1, t2].
 * Handles windows that span day boundaries.
 *
 * @param {number} t1 - Start in elapsed seconds
 * @param {number} t2 - End in elapsed seconds
 * @returns {{ high: number, medium: number, low: number }}
 */
function _demandPhaseHoursInRange(t1, t2) {
    const hours = { high: 0, medium: 0, low: 0 };
    if (t2 <= t1) return hours;

    let t = t1;
    while (t < t2) {
        const secInDay  = t % 86400;
        const hourInDay = Math.floor(secInDay / 3600);

        const phase = CONFIG.DEMAND_PHASES.find(
            p => hourInDay >= p.startHour && hourInDay < p.endHour
        );

        if (!phase) {
            // Should not happen with well-formed DEMAND_PHASES; advance 1 s
            t += 1;
            continue;
        }

        // Compute how far until the next phase/day boundary
        const dayStart          = t - secInDay;
        const nextPhaseInDay    = phase.endHour * 3600;
        const nextPhaseBoundary = dayStart + nextPhaseInDay;
        const dayBoundary       = dayStart + 86400;

        const segEnd   = Math.min(nextPhaseBoundary, dayBoundary, t2);
        const segHours = (segEnd - t) / 3600;

        hours[phase.type] += segHours;
        t = segEnd;
    }

    return hours;
}

// ── Helper: formula-based cost rates per route ─────────────────────────────

function _computeCostRates(elapsedSeconds, routes) {
    if (!_api) return {};

    const currentHour = Math.floor((elapsedSeconds % 86400) / 3600);
    const phase = CONFIG.DEMAND_PHASES.find(
        p => currentHour >= p.startHour && currentHour < p.endHour
    ) || CONFIG.DEMAND_PHASES[0];
    const demandType = phase.type;

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

// ── Helper: build normalised weight map ────────────────────────────────────

/**
 * Convert a { routeId: rate } map to { routeId: proportion } (sum = 1).
 * Returns prevWeights unchanged when total rate is zero (carry-forward).
 */
function _buildWeights(rates, prevWeights) {
    let total = 0;
    for (const r of Object.values(rates)) total += r;
    if (total === 0) return prevWeights; // tail-lag carry-forward

    const weights = {};
    for (const [id, r] of Object.entries(rates)) {
        if (r > 0) weights[id] = r / total;
    }
    return weights;
}

// ── Helper: rolling capacity over a time window ────────────────────────────

/**
 * Compute the total capacity a route could carry between [cutoff, now].
 * Uses _configEvents to handle mid-window train schedule changes.
 * Capacity starts from the route's first config event (creation proxy)
 * so new routes don't claim capacity before they existed.
 */
function _computeRollingCapacity(routeId, route, trainType, cutoff, now) {
    if (!route.stComboTimings?.length) return 0;

    const timings     = route.stComboTimings;
    const loopTimeSec = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
    if (loopTimeSec <= 0) return 0;

    const loopsPerHour = 3600 / loopTimeSec;
    const carsPerTrain = route.carsPerTrain !== undefined
        ? route.carsPerTrain
        : trainType.stats.carsPerCarSet;
    const capacityPerTrain = carsPerTrain * trainType.stats.capacityPerCar;

    // Config events for this route, oldest first
    const eventsForRoute = _configEvents
        .filter(e => e.routeId === routeId)
        .sort((a, b) => a.t - b.t);

    // Effective start: max(cutoff, first config event).
    // For routes created within the 24 h window this excludes time before creation.
    const firstEvent     = eventsForRoute[0];
    const effectiveCutoff = firstEvent ? Math.max(cutoff, firstEvent.t) : cutoff;

    // Config that was active at effectiveCutoff
    let configAtCutoff = null;
    for (const e of eventsForRoute) {
        if (e.t <= effectiveCutoff) configAtCutoff = e.config;
    }

    if (!configAtCutoff) {
        // No earlier event: use the current route schedule as the best guess
        configAtCutoff = {
            high:   route.trainSchedule?.highDemand   || 0,
            medium: route.trainSchedule?.mediumDemand || 0,
            low:    route.trainSchedule?.lowDemand    || 0,
        };
    }

    // Build segments between config changes within [effectiveCutoff, now]
    const segments   = [];
    let activeConfig = configAtCutoff;
    let segStart     = effectiveCutoff;

    for (const e of eventsForRoute) {
        if (e.t <= effectiveCutoff) continue;
        if (e.t >= now)             break;
        segments.push({ start: segStart, end: e.t, config: activeConfig });
        activeConfig = e.config;
        segStart     = e.t;
    }
    segments.push({ start: segStart, end: now, config: activeConfig });

    // Integrate capacity across segments
    let total = 0;
    for (const seg of segments) {
        const ph = _demandPhaseHoursInRange(seg.start, seg.end);
        const c  = seg.config;
        total += (c.high * ph.high + c.medium * ph.medium + c.low * ph.low)
               * loopsPerHour * capacityPerTrain;
    }

    return Math.round(total);
}

// ── Core stats computation ─────────────────────────────────────────────────

/**
 * Aggregate revenue, cost, capacity, and live data for a route
 * over the given elapsed-seconds window [cutoff, now].
 */
function _computeStatsForWindow(routeId, cutoff, now) {
    if (!_api) return _emptyStats();

    // ── Revenue from event log ──────────────────────────────────────────
    let revenue = 0;
    for (const ev of _revEvents) {
        if (ev.t < cutoff || ev.t > now) continue;
        const w = ev.weights[routeId];
        if (w > 0) revenue += ev.amount * w;
    }

    // ── Cost from event log ─────────────────────────────────────────────
    let cost = 0;
    for (const ev of _costEvents) {
        if (ev.t < cutoff || ev.t > now) continue;
        const w = ev.weights[routeId];
        if (w > 0) cost += ev.amount * w;
    }

    // ── Live data from caches / API ─────────────────────────────────────
    const route     = _routesCache?.find(r => r.id === routeId);
    const ridership = _api.gameState.getRouteRidership(routeId).total;
    const transfers = _transfersCache?.[routeId]
        ?? { count: 0, routes: [], routeIds: [], stationIds: [] };

    if (!route) {
        return { ..._emptyStats(), dailyRevenue: revenue, dailyCost: cost,
                 dailyProfit: revenue - cost, ridership, transfers };
    }

    const trainType = _trainTypesCache?.[route.trainType];
    const trainCounts = {
        high:   route.trainSchedule?.highDemand   || 0,
        medium: route.trainSchedule?.mediumDemand || 0,
        low:    route.trainSchedule?.lowDemand    || 0,
    };
    const totalTrains = trainCounts.high + trainCounts.medium + trainCounts.low;
    const stations    = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;

    let capacity    = 0;
    let utilization = 0;

    if (trainType) {
        capacity    = _computeRollingCapacity(routeId, route, trainType, cutoff, now);
        utilization = capacity > 0 ? Math.round((ridership / capacity) * 100) : 0;
    }

    const profit            = revenue - cost;
    const profitPerPassenger = ridership   > 0 ? profit / ridership   : 0;
    const profitPerTrain     = totalTrains > 0 ? profit / totalTrains : 0;

    return {
        dailyRevenue:   revenue,
        dailyCost:      cost,
        dailyProfit:    profit,
        ridership,
        capacity,
        utilization,
        stations,
        transfers,
        trainsHigh:     trainCounts.high,
        trainsMedium:   trainCounts.medium,
        trainsLow:      trainCounts.low,
        trainSchedule:  trainCounts.high,
        totalTrains,
        profitPerPassenger,
        profitPerTrain,
    };
}

// ── Money hook ─────────────────────────────────────────────────────────────

function _registerMoneyHook(api) {
    if (_hookRegistered) return;
    _hookRegistered = true;

    api.hooks.onMoneyChanged((balance, change, type, category) => {
        const t = api.gameState.getElapsedSeconds();

        if (type === 'revenue') {
            if (Object.keys(_lastRevWeights).length > 0) {
                _revEvents.push({ t, amount: change, weights: { ..._lastRevWeights } });
            }
        } else if (type === 'expense' && category === 'trainOperational') {
            if (Object.keys(_lastCostWeights).length > 0) {
                _costEvents.push({ t, amount: Math.abs(change), weights: { ..._lastCostWeights } });
            }
        }
    });

    console.log(`${TAG} ✓ onMoneyChanged hook registered`);
}

// ── Poll tick ──────────────────────────────────────────────────────────────

function _tick() {
    if (!_api || _api.gameState.isPaused()) return;

    const elapsed     = _api.gameState.getElapsedSeconds();
    const routes      = _api.gameState.getRoutes();
    const lineMetrics = _api.gameState.getLineMetrics();

    // ── Revenue weights (carry-forward on tail-lag) ─────────────────────
    const revRates = {};
    lineMetrics.forEach(lm => { revRates[lm.routeId] = lm.revenuePerHour || 0; });
    _lastRevWeights = _buildWeights(revRates, _lastRevWeights);

    // ── Cost weights (formula-based, carry-forward on zero) ─────────────
    const costRates  = _computeCostRates(elapsed, routes);
    _lastCostWeights = _buildWeights(costRates, _lastCostWeights);

    // ── Refresh caches ──────────────────────────────────────────────────
    _routesCache     = routes;
    _trainTypesCache = _api.trains.getTrainTypes();

    // ── Config change detection → record to _configEvents ───────────────
    routes.forEach(route => {
        const config = {
            high:   route.trainSchedule?.highDemand   || 0,
            medium: route.trainSchedule?.mediumDemand || 0,
            low:    route.trainSchedule?.lowDemand    || 0,
        };
        const last = _lastConfigs[route.id];
        if (!last ||
            config.high   !== last.high   ||
            config.medium !== last.medium ||
            config.low    !== last.low) {
            _configEvents.push({ t: elapsed, routeId: route.id, config });
            _lastConfigs[route.id] = config;
        }
    });

    // ── Refresh transfers cache every N ticks ───────────────────────────
    _transfersTick++;
    if (_transfersTick % TRANSFERS_REFRESH_N === 0) {
        try {
            _transfersCache = calculateTransfers(routes, _api);
        } catch (_) {
            // Non-critical — retain previous cache
        }
    }
}

// ── Prune timer ────────────────────────────────────────────────────────────

function _pruneEvents() {
    if (!_api) return;
    const now    = _api.gameState.getElapsedSeconds();
    const cutoff = now - 86400 - GRACE_SECONDS;

    _revEvents    = _revEvents.filter(e => e.t >= cutoff);
    _costEvents   = _costEvents.filter(e => e.t >= cutoff);
    _configEvents = _configEvents.filter(e => e.t >= cutoff);

    console.log(`${TAG} ✂ Pruned events | cutoff: ${Math.round(cutoff)}s | rev: ${_revEvents.length} | cost: ${_costEvents.length} | cfg: ${_configEvents.length}`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start the accumulator. Safe to call multiple times — restarts timers
 * but does NOT reset state and does NOT re-register the money hook.
 *
 * Call from: onGameInit, onGameLoaded, handleMapReadyFallback
 *
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function initAccumulator(api) {
    _api = api;
    _registerMoneyHook(api);

    if (_pollTimer)  clearInterval(_pollTimer);
    if (_pruneTimer) clearInterval(_pruneTimer);

    _pollTimer  = setInterval(_tick,        POLL_INTERVAL_MS);
    _pruneTimer = setInterval(_pruneEvents, PRUNE_INTERVAL_MS);

    console.log(`${TAG} ▶ Accumulator started | poll: ${POLL_INTERVAL_MS}ms | prune: ${PRUNE_INTERVAL_MS}ms`);
}

/**
 * Stop poll and prune intervals.
 * The onMoneyChanged hook continues to fire (cannot be unregistered).
 *
 * Call from: onGameEnd
 */
export function stopAccumulating() {
    if (_pollTimer)  { clearInterval(_pollTimer);  _pollTimer  = null; }
    if (_pruneTimer) { clearInterval(_pruneTimer); _pruneTimer = null; }
    console.log(`${TAG} ■ Accumulator stopped`);
}

/**
 * Clear all event logs and weight/cache state.
 * Call BEFORE restoreEvents when loading a save, to discard stale in-memory data.
 */
export function clearAccumulatorState() {
    _revEvents       = [];
    _costEvents      = [];
    _configEvents    = [];
    _lastConfigs     = {};
    _lastRevWeights  = {};
    _lastCostWeights = {};
    _routesCache     = null;
    _trainTypesCache = null;
    _transfersCache  = null;
    _transfersTick   = 0;
    console.log(`${TAG} ↺ Accumulator state cleared`);
}

// ── Live rolling queries ───────────────────────────────────────────────────

/**
 * True rolling last-24 h stats for a route.
 *
 * Use for: dashboard table, route dialog stat cards.
 *
 * @param {string} routeId
 * @returns {Object} { dailyRevenue, dailyCost, dailyProfit, ridership,
 *                     capacity, utilization, stations, transfers,
 *                     trainsHigh, trainsMedium, trainsLow, trainSchedule,
 *                     totalTrains, profitPerPassenger, profitPerTrain }
 */
export function getRoute24hStats(routeId) {
    if (!_api) return _emptyStats();
    const now    = _api.gameState.getElapsedSeconds();
    const cutoff = now - 86400;
    return _computeStatsForWindow(routeId, cutoff, now);
}

/**
 * Current calendar-day stats for a route (day start → now).
 *
 * Use for: route-metrics trend chart "Today" data point.
 *
 * @param {string} routeId
 * @returns {Object} Same shape as getRoute24hStats
 */
export function getRouteTodayStats(routeId) {
    if (!_api) return _emptyStats();
    const now      = _api.gameState.getElapsedSeconds();
    const dayStart = Math.floor(now / 86400) * 86400;
    return _computeStatsForWindow(routeId, dayStart, now);
}

// ── Persistence ────────────────────────────────────────────────────────────

/**
 * Persist the current event log to IDB.
 * Call from: onDayChange (before historical capture), onGameSaved.
 *
 * @param {Object} storage - Storage instance
 */
export async function persistEvents(storage) {
    if (!storage) return;
    try {
        await storage.set(PERSIST_KEY, {
            revEvents:    _revEvents,
            costEvents:   _costEvents,
            configEvents: _configEvents,
        });
        console.log(`${TAG} 💾 Events persisted | rev: ${_revEvents.length} | cost: ${_costEvents.length} | cfg: ${_configEvents.length}`);
    } catch (e) {
        console.error(`${TAG} Failed to persist events:`, e);
    }
}

/**
 * Load event log from IDB and prune:
 *   • events in the future relative to currentElapsed (handles save rewinding)
 *   • events older than 24 h + grace period
 *
 * Call AFTER clearAccumulatorState() on game load/reload.
 *
 * @param {Object} storage        - Storage instance
 * @param {number} currentElapsed - Current in-game elapsed seconds
 */
export async function restoreEvents(storage, currentElapsed) {
    if (!storage) return;
    try {
        const saved = await storage.get(PERSIST_KEY, null);
        if (!saved) {
            console.log(`${TAG} No persisted events found`);
            return;
        }

        const cutoff = currentElapsed - 86400 - GRACE_SECONDS;

        // Keep only events in [cutoff, currentElapsed]
        _revEvents    = (saved.revEvents    || []).filter(e => e.t >= cutoff && e.t <= currentElapsed);
        _costEvents   = (saved.costEvents   || []).filter(e => e.t >= cutoff && e.t <= currentElapsed);
        _configEvents = (saved.configEvents || []).filter(e => e.t >= cutoff && e.t <= currentElapsed);

        // Rebuild _lastConfigs from the most-recent config event per route
        _lastConfigs = {};
        const sortedCfg = [..._configEvents].sort((a, b) => a.t - b.t);
        for (const e of sortedCfg) {
            _lastConfigs[e.routeId] = e.config;
        }

        console.log(`${TAG} ♻ Events restored | rev: ${_revEvents.length} | cost: ${_costEvents.length} | cfg: ${_configEvents.length}`);
    } catch (e) {
        console.error(`${TAG} Failed to restore events:`, e);
    }
}
