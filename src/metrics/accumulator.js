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
//   getRoute24hStats(routeId)              — rolling last-24h stats
//   getRouteTodayStats(routeId)            — current day stats (trend chart "Today")
//   initAccumulator(api)                   — start poll + register money hook (idempotent)
//   stopAccumulating()                     — stop poll/prune intervals
//   clearAccumulatorState()                — wipe all events (call before restoreEvents)
//   persistEvents(storage)                 — save event log to IDB
//   restoreEvents(storage, currentElapsed) — load + prune stale events from IDB
//
// Architecture:
//   onMoneyChanged       → append { t, amount, weights } to _revEvents / _costEvents
//   poll (500ms wall)    → update _lastRevWeights, _lastCostWeights, refresh caches
//   prune (60s wall)     → drop events older than 24 h + grace period
//   gameTiming (5 game min) → refresh _transfersCache + _segmentLoadsCache
//                             scales correctly with game speed (fast/ultrafast)
//
// Capacity:
//   Static full-day throughput ceiling — same formula as calculateRouteMetrics.
//   Stable throughout the day; only changes when the train schedule or loop
//   time changes.  No rolling window, no prorating for new routes.
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
import { getRouteStationsInOrder, isCircularRoute, computeSegmentLoads } from '../utils/route-utils.js';
import { gameTiming } from '../core/game-timing.js';
import { recordConfigChange } from './train-config-tracking.js';
import { perTierField, readTierCounts, emptyTierMap, getPhaseForHour } from '../utils/demand-tiers.js';

const TAG                        = '[AA:ACC]';
const POLL_INTERVAL_MS           = 500;
const PRUNE_INTERVAL_MS          = 60_000;
const CACHES_REFRESH_GAME_SEC    = 300;  // refresh transfers/loads every 5 game minutes
const GRACE_SECONDS              = 300;  // keep 5 min extra past the 24 h cutoff
const PERSIST_KEY         = 'accumulatorEvents';

// onMoneyChanged category for balance changes the mod itself causes (not
// player revenue) — e.g. debug/dev tools that set the balance directly.
const MOD_SET_MONEY_CATEGORY = 'mod-setMoney';

// The game API has no dedicated category for bond issuances — they arrive
// as type: 'revenue', category: 'general', indistinguishable from ordinary
// fare revenue. Bonds are only sold in these three fixed denominations, so
// until the API exposes a real category we filter by exact amount instead.
const BOND_AMOUNTS = new Set([100_000_000, 500_000_000, 1_000_000_000]);

// ── Module-level state ─────────────────────────────────────────────────────

let _hookRegistered  = false;
let _api             = null;

// Event logs
let _revEvents    = []; // { t: elapsedSec, amount: number, weights: { routeId: proportion } }
let _costEvents   = []; // same shape

// Weight carry-forward (non-zero proportions, kept across tail-lag periods)
let _lastRevWeights  = {}; // routeId → proportion  (values sum to 1)
let _lastCostWeights = {}; // routeId → proportion  (values sum to 1)

// Poll-refreshed caches
let _routesCache        = null; // current routes array
let _trainTypesCache    = null; // { trainTypeId: trainType }
let _transfersCache     = null; // { routeId: { count, routes, routeIds, stationIds } }
let _segmentLoadsCache  = {};   // { routeId: maxLoadPerDirection }
let _trainsByRoute      = new Map(); // routeId → Train[] (from getTrains())

// Per-day timetable accumulation (reset at midnight via resetTimetableAccum())
// Bucket shape: { fwd: { sumDelaySec, sumDwellActual, sumDwellExpected, count },
//                 rev: <same> | null }
// rev is null for circular/one-way routes; both legs exist for pendulum routes.
// Terminal stations on pendulum routes accumulate into fwd only (rev stays count=0).
let _timetableAccum  = {}; // { [routeId]: { [stNodeId]: { fwd, rev } } }
let _lastSeenArrival = {}; // { [trainId]: { [stNodeIndex]: number } } — last arrivalTime accumulated per stop
let _routeLegMap     = {}; // { [routeId]: { isPendulum: bool, turnaroundIdx: number|null } }

// Timers
let _pollTimer  = null;
let _pruneTimer = null;

// Schedule change tracking
let _lastKnownSchedules  = {};  // { routeId: { high, medium, low } } — for change detection
let _configCacheSnapshot = {};  // { [day]: { [routeId]: [...entries] } } — in-memory mirror of IDB configCache
let _storage             = null;

// ── Helper: empty stats shape ──────────────────────────────────────────────

function _emptyStats() {
    const stats = {
        dailyRevenue:       0,
        dailyCost:          0,
        dailyProfit:        0,
        ridership:          0,
        capacity:           0,
        utilization:        0,
        efficiency:         0,
        loadFactor:         0,
        stations:           0,
        transfers:          { count: 0, routes: [], routeIds: [], stationIds: [] },
        trainSchedule:          0,
        totalTrains:            0,
        profitPerTrain:         0,
        scheduleChangedRecently: false,
    };
    // Per-tier flat fields (loadFactorHigh…VeryLow, trainsHigh…VeryLow)
    for (const tier of CONFIG.TIERS) {
        stats[perTierField('loadFactor', tier.key)] = 0;
        stats[perTierField('trains', tier.key)]     = 0;
    }
    return stats;
}

// ── Helper: formula-based cost rates per route ─────────────────────────────

function _computeCostRates(elapsedSeconds, routes) {
    if (!_api) return {};

    const currentHour = Math.floor((elapsedSeconds % 86400) / 3600);
    const demandType  = getPhaseForHour(currentHour).type;

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

        const trainCounts = readTierCounts(route.trainSchedule);

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


// ── Helper: per-phase capacities ──────────────────────────────────────────

function _computePhaseCapacities(route, trainType) {
    if (!route.stComboTimings?.length) return emptyTierMap(0);
    const timings     = route.stComboTimings;
    const loopTimeSec = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
    if (loopTimeSec <= 0) return emptyTierMap(0);
    const loopsPerHour     = 3600 / loopTimeSec;
    const carsPerTrain     = route.carsPerTrain ?? trainType.stats.carsPerCarSet;
    const capacityPerTrain = carsPerTrain * trainType.stats.capacityPerCar;
    const counts = readTierCounts(route.trainSchedule);
    const caps = {};
    for (const tier of CONFIG.TIERS) {
        caps[tier.key] = Math.round(
            counts[tier.key] * CONFIG.DEMAND_HOURS[tier.key] * loopsPerHour * capacityPerTrain
        );
    }
    return caps;
}

// ── Helper: static full-day capacity ──────────────────────────────────────

/**
 * Maximum passengers the route can carry across a full 24-hour day.
 *
 * Uses the fixed demand-hour totals from CONFIG (per-tier hours in DEMAND_HOURS)
 * and the current train schedule — identical to calculateRouteMetrics.
 *
 * This value is stable throughout the day and only changes when the player
 * edits the train schedule or the route's loop time changes.
 *
 * @param {Object} route     - Route object (current game state)
 * @param {Object} trainType - Train type definition
 * @returns {number} Rounded passenger capacity
 */
function _computeStaticCapacity(route, trainType) {
    if (!route.stComboTimings?.length) return 0;

    const timings     = route.stComboTimings;
    const loopTimeSec = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
    if (loopTimeSec <= 0) return 0;

    const loopsPerHour = 3600 / loopTimeSec;
    const carsPerTrain = route.carsPerTrain !== undefined
        ? route.carsPerTrain
        : trainType.stats.carsPerCarSet;
    const capacityPerTrain = carsPerTrain * trainType.stats.capacityPerCar;

    const trainCounts = readTierCounts(route.trainSchedule);

    let weightedTrainHours = 0;
    for (const tier of CONFIG.TIERS) {
        weightedTrainHours += trainCounts[tier.key] * CONFIG.DEMAND_HOURS[tier.key];
    }

    return Math.round(weightedTrainHours * loopsPerHour * capacityPerTrain);
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
    const trainCounts = readTierCounts(route.trainSchedule);
    let totalTrains = 0;
    for (const tier of CONFIG.TIERS) totalTrains += trainCounts[tier.key];
    const stations    = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;

    let capacity                 = 0;
    let utilization              = 0;
    let efficiency               = 0;
    let loadFactor               = 0;
    const loadFactors            = emptyTierMap(0);
    let scheduleChangedRecently  = false;

    if (trainType) {
        const elapsedDay       = Math.floor(now / 86400);   // seconds-based, for time-window math only
        const currentDay       = _api.gameState.getCurrentDay(); // UI day key, matches configCache

        // scheduleChangedRecently: kept for backward compat in historical snapshots.
        const dayHistory       = _configCacheSnapshot[currentDay]?.[routeId]     || null;
        const yesterdayHistory = _configCacheSnapshot[currentDay - 1]?.[routeId] || null;
        const todayStart       = elapsedDay * 86400;
        const yesterdayStart   = todayStart - 86400;
        const hasRecentChange  = (timeline, baselineSec) =>
            Array.isArray(timeline) &&
            timeline.some(e => e.timestamp > 0 && (baselineSec + e.timestamp * 60) > cutoff);
        scheduleChangedRecently =
            hasRecentChange(dayHistory, todayStart) ||
            hasRecentChange(yesterdayHistory, yesterdayStart);

        capacity = _computeStaticCapacity(route, trainType);

        utilization = capacity > 0 ? Math.round((ridership / capacity) * 100) : 0;
        efficiency  = capacity > 0 ? ridership / (2 * capacity) : 0;

        // Load factor: peak segment load from time-filtered commutes ÷ capacity.
        // _segmentLoadsCache holds { overall, high, medium, low } raw passenger counts
        // from the rolling 24h window, computed directly from commute timestamps.
        //
        // Per-phase denominators use _computePhaseCapacities (current train counts)
        // so that the bars respond immediately when trains are added or removed,
        // rather than lagging behind a time-weighted historical average.
        //
        // Overall load factor = max of the active per-phase load factors, so that
        // removing all trains from a phase immediately removes its contribution
        // from the total (rather than waiting for the rolling 24h window to drain).
        const segLoads = _segmentLoadsCache[routeId];
        if (segLoads && segLoads.overall > 0) {
            const pc = _computePhaseCapacities(route, trainType);
            for (const tier of CONFIG.TIERS) {
                if (trainCounts[tier.key] > 0 && pc[tier.key] > 0) {
                    loadFactors[tier.key] = Math.round((segLoads[tier.key] / pc[tier.key]) * 100);
                }
            }

            // Overall = worst active phase (immediately tracks train-count changes).
            const activeLFs = CONFIG.TIERS.map(t => loadFactors[t.key]).filter(v => v > 0);
            if (activeLFs.length > 0) loadFactor = Math.max(...activeLFs);
        }
    }

    const profit            = revenue - cost;
    const profitPerTrain     = totalTrains > 0 ? profit / totalTrains : 0;

    const stats = {
        dailyRevenue:   revenue,
        dailyCost:      cost,
        dailyProfit:    profit,
        ridership,
        capacity,
        utilization,
        efficiency,
        loadFactor,
        stations,
        transfers,
        trainSchedule:           trainCounts.high,
        totalTrains,
        profitPerTrain,
        scheduleChangedRecently,
    };
    for (const tier of CONFIG.TIERS) {
        stats[perTierField('loadFactor', tier.key)] = loadFactors[tier.key];
        stats[perTierField('trains', tier.key)]     = trainCounts[tier.key];
    }
    return stats;
}

// ── Money hook ─────────────────────────────────────────────────────────────

/**
 * True when an onMoneyChanged 'revenue' event should NOT be attributed to
 * any route — it's either a mod-driven balance adjustment or a bond
 * issuance mislabeled as ordinary revenue by the game API.
 * @param {string} category - onMoneyChanged category argument
 * @param {number} amount - onMoneyChanged change argument
 * @returns {boolean}
 */
export function isIgnorableRevenueEvent(category, amount) {
    if (category === MOD_SET_MONEY_CATEGORY) return true;
    if (BOND_AMOUNTS.has(amount)) return true;
    return false;
}

function _registerMoneyHook(api) {
    if (_hookRegistered) return;
    _hookRegistered = true;

    api.hooks.onMoneyChanged((balance, change, type, category) => {
        const t = api.gameState.getElapsedSeconds();

        if (type === 'revenue') {
            if (isIgnorableRevenueEvent(category, change)) return;
            if (Object.keys(_lastRevWeights).length > 0) {
                _revEvents.push({ t, amount: change, weights: { ..._lastRevWeights } });
            }
        } else if (type === 'expense' && category === 'trainOperational') {
            if (Object.keys(_lastCostWeights).length > 0) {
                _costEvents.push({ t, amount: Math.abs(change), weights: { ..._lastCostWeights } });
            }
        }
    });
}

// ── Helper: route leg info for timetable direction split ─────────────────────
// Returns { isPendulum, turnaroundIdx, returnToFwd } for a given route.
//
// turnaroundIdx: array position in stComboTimings of the last outbound stop.
//   Stops with stNodeIndex <= turnaroundIdx are outbound; the rest are return.
//   Falls back to array position when stComboTimings entries lack stNodeIndex.
//
// returnToFwd: { returnStNodeId → outboundStNodeId }
//   For pendulum routes where the return leg uses a DIFFERENT stNodeId than the
//   outbound leg, this map lets us accumulate both legs under the outbound key.
//   When both legs share the same stNodeId, the entry maps id → id (identity).
function _getRouteLegInfo(routeId) {
    if (_routeLegMap[routeId] !== undefined) return _routeLegMap[routeId];

    const route = _routesCache?.find(r => r.id === routeId);
    if (!route?.stComboTimings?.length) {
        return (_routeLegMap[routeId] = { isPendulum: false, turnaroundIdx: null, returnToFwd: {} });
    }

    const allStations  = _api?.gameState?.getStations?.() ?? [];
    const stNodeToStId = new Map(); // stNodeId → station.id
    allStations.forEach(s => s.stNodeIds?.forEach(n => stNodeToStId.set(n, s.id)));

    const seenByStId   = {}; // station.id → first (outbound) stNodeId
    const seenNodeIds  = new Set(); // direct stNodeId tracking (fallback when station map is unavailable)
    const returnToFwd  = {}; // returnStNodeId → outboundStNodeId
    let turnaroundIdx  = null;
    let isPendulum     = false;

    for (let i = 0; i < route.stComboTimings.length; i++) {
        const timing  = route.stComboTimings[i];
        const { stNodeId } = timing;
        const stId    = stNodeToStId.get(stNodeId); // may be undefined if station map unavailable

        if (stId) {
            if (stId in seenByStId) {
                // Return-leg stop with a different stNodeId (or same — mapped either way)
                if (!isPendulum) {
                    isPendulum    = true;
                    // Use the stNodeIndex from the timing if present; fall back to array position
                    turnaroundIdx = route.stComboTimings[i - 1]?.stNodeIndex ?? (i - 1);
                }
                returnToFwd[stNodeId] = seenByStId[stId];
            } else {
                seenByStId[stId] = stNodeId;
            }
        } else {
            // Station map unavailable — fall back to direct stNodeId repeat detection
            if (seenNodeIds.has(stNodeId)) {
                if (!isPendulum) {
                    isPendulum    = true;
                    turnaroundIdx = route.stComboTimings[i - 1]?.stNodeIndex ?? (i - 1);
                }
                returnToFwd[stNodeId] = stNodeId; // same stNodeId: identity mapping
            } else {
                seenNodeIds.add(stNodeId);
            }
        }
    }

    return (_routeLegMap[routeId] = { isPendulum, turnaroundIdx, returnToFwd });
}

// ── Poll tick (wall-clock, 500 ms) ─────────────────────────────────────────
// Updates weight caches on every real-time tick so that onMoneyChanged
// events are always attributed with up-to-date per-route proportions.

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

    // ── Refresh route/train-type caches ─────────────────────────────────
    _routesCache     = routes;
    _trainTypesCache = _api.trains.getTrainTypes();

    // ── Refresh trains-by-route cache + timetable lap accumulation ──────
    if (typeof _api.gameState.getTrains === 'function') {
        const trains = _api.gameState.getTrains();
        const grouped = new Map();
        for (const t of trains) {
            if (!grouped.has(t.routeId)) grouped.set(t.routeId, []);
            grouped.get(t.routeId).push(t);
        }
        _trainsByRoute = grouped;

        // Detect newly-completed stops and accumulate delay + dwell per stNodeId.
        // A stop is considered newly completed when arrivalTime and departureTime are
        // both non-null AND the arrivalTime differs from what we last accumulated
        // (catches both first-time visits and new-lap revisits).
        for (const train of trains) {
            if (!train.timings) continue;

            // Skip deposit-bound trains — their stops produce phantom delay data once
            // the game recalls them to the depot at a phase change. The game signals
            // this several ticks before the train leaves getTrains() by setting
            // futureCycleArrivalTimes = [] at stop 0 (confirmed via in-game diagnostic).
            // We guard only on the explicit empty array; undefined (field not exposed)
            // is not a deposit signal and must fall through to accumulate normally.
            const stop0 = train.timings[0];
            if (stop0
                    && Array.isArray(stop0.futureCycleArrivalTimes)
                    && stop0.futureCycleArrivalTimes.length === 0) {
                continue;
            }

            const trainSeen = _lastSeenArrival[train.id] ?? {};

            for (const stop of train.timings) {
                const { stNodeId, stNodeIndex, arrivalTime, departureTime,
                        adjustedExpectedArrivalTime, expectedArrivalTime,
                        expectedDepartureTime } = stop;

                if (arrivalTime === null || departureTime === null) continue;
                if (arrivalTime === trainSeen[stNodeIndex]) continue;

                // New completed stop — accumulate into fwd or rev leg.
                // returnToFwd handles the case where outbound/return passes use
                // different stNodeIds: we always store under the outbound stNodeId.
                const { isPendulum, turnaroundIdx, returnToFwd } = _getRouteLegInfo(train.routeId);

                let leg, accumNodeId;
                if (!isPendulum) {
                    leg = 'fwd'; accumNodeId = stNodeId;
                } else {
                    const mapped = returnToFwd[stNodeId];
                    if (mapped !== undefined && mapped !== stNodeId) {
                        // Different stNodeId per direction: definitively a return-leg stop
                        leg = 'rev'; accumNodeId = mapped;
                    } else {
                        // Same stNodeId both directions (or no mapping): use stNodeIndex
                        leg = turnaroundIdx !== null && stNodeIndex > turnaroundIdx ? 'rev' : 'fwd';
                        accumNodeId = stNodeId;
                    }
                }

                if (!_timetableAccum[train.routeId])                  _timetableAccum[train.routeId] = {};
                if (!_timetableAccum[train.routeId][accumNodeId]) {
                    const emptyBucket = () => ({ sumDelaySec: 0, sumDwellActual: 0, sumDwellExpected: 0, count: 0 });
                    _timetableAccum[train.routeId][accumNodeId] = {
                        fwd: emptyBucket(),
                        rev: isPendulum ? emptyBucket() : null,
                    };
                }
                const bucket = _timetableAccum[train.routeId][accumNodeId][leg];
                if (!bucket) { trainSeen[stNodeIndex] = arrivalTime; continue; }
                bucket.sumDelaySec    += arrivalTime - adjustedExpectedArrivalTime;
                bucket.sumDwellActual += departureTime - arrivalTime;
                bucket.sumDwellExpected += expectedDepartureTime - expectedArrivalTime;
                bucket.count          += 1;

                trainSeen[stNodeIndex] = arrivalTime;
            }

            _lastSeenArrival[train.id] = trainSeen;
        }

        // Prune stale entries for trains that went to deposit and left getTrains().
        // Prevents stale state if the game reuses a train ID in a later phase.
        const liveIds = new Set(trains.map(t => t.id));
        for (const id of Object.keys(_lastSeenArrival)) {
            if (!liveIds.has(id)) delete _lastSeenArrival[id];
        }
    }

    // ── Schedule change detection ────────────────────────────────────────
    const currentHour   = Math.floor((elapsed % 86400) / 3600);
    const currentMinute = Math.floor((elapsed % 3600) / 60);
    const day           = _api.gameState.getCurrentDay();

    for (const route of routes) {
        const s = route.trainSchedule;
        if (!s) continue;
        const cur = readTierCounts(s);
        const last = _lastKnownSchedules[route.id];

        if (!last) {
            // First tick for this route — baseline already captured by captureInitialDayConfig
            _lastKnownSchedules[route.id] = cur;
            continue;
        }
        if (CONFIG.TIERS.some(t => last[t.key] !== cur[t.key])) {
            _lastKnownSchedules[route.id] = cur;

            // Update in-memory snapshot immediately (used synchronously by _computeStatsForWindow)
            if (!_configCacheSnapshot[day]) _configCacheSnapshot[day] = {};
            if (!_configCacheSnapshot[day][route.id]) _configCacheSnapshot[day][route.id] = [];
            _configCacheSnapshot[day][route.id].push({
                timestamp: currentHour * 60 + currentMinute,
                hour: currentHour, minute: currentMinute, ...cur,
            });

            // Async persist to IDB
            if (_storage) {
                recordConfigChange(route.id, currentHour, currentMinute, cur, _api, _storage)
                    .catch(e => console.warn(`${TAG} recordConfigChange failed`, e));
            }
        }
    }
}

// ── Cache refresh (game-time, every CACHES_REFRESH_GAME_SEC) ───────────────
// Refreshes expensive derived caches (transfers, segment loads) based on
// game-elapsed-seconds rather than wall-clock time, so the refresh cadence
// scales correctly with game speed (normal / fast / ultrafast).

function _refreshCaches() {
    if (!_api) return;

    const elapsed = _api.gameState.getElapsedSeconds();
    const routes  = _routesCache ?? _api.gameState.getRoutes();

    try {
        _transfersCache = calculateTransfers(routes, _api);
    } catch (_) {
        // Non-critical — retain previous cache
    }

    try {
        const commutes    = _api.gameState.getCompletedCommutes?.() ?? [];
        const cutoff      = elapsed - 86400; // rolling 24h window

        const allStations = _api.gameState.getStations();
        const newLoads    = {};
        for (const route of routes) {
            const ordered    = getRouteStationsInOrder(route.id, _api);
            const orderedIds = ordered.map(s => s.id);
            const circular   = isCircularRoute(route, allStations);
            newLoads[route.id] = computeSegmentLoads(
                route.id, orderedIds, commutes, circular, cutoff, CONFIG.DEMAND_PHASES
            );
        }
        _segmentLoadsCache = newLoads;
    } catch (_) {
        // Non-critical — retain previous cache
    }
}

// ── Prune timer ────────────────────────────────────────────────────────────

function _pruneEvents() {
    if (!_api) return;
    const now    = _api.gameState.getElapsedSeconds();
    const cutoff = now - 86400 - GRACE_SECONDS;

    _revEvents  = _revEvents.filter(e => e.t >= cutoff);
    _costEvents = _costEvents.filter(e => e.t >= cutoff);
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

    // Game-time-aware cache refresh — scales with game speed.
    gameTiming.init(api);
    gameTiming.onEveryNGameSeconds(CACHES_REFRESH_GAME_SEC, _refreshCaches);
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
    gameTiming.stop();
}

/**
 * Clear all event logs and weight/cache state.
 * Call BEFORE restoreEvents when loading a save, to discard stale in-memory data.
 */
export function clearAccumulatorState() {
    _revEvents           = [];
    _costEvents          = [];
    _lastRevWeights      = {};
    _lastCostWeights     = {};
    _routesCache         = null;
    _trainTypesCache     = null;
    _transfersCache      = null;
    _segmentLoadsCache        = {};
    _trainsByRoute            = new Map();
    _timetableAccum           = {};
    _lastSeenArrival          = {};
    _lastKnownSchedules       = {};
    _configCacheSnapshot      = {};
    _storage                  = null;
    gameTiming.reset();
}

export function setAccumulatorStorage(s)      { _storage = s; }
export function setConfigCacheSnapshot(snap)  { _configCacheSnapshot = snap || {}; }
export function getConfigCacheSnapshot()      { return _configCacheSnapshot; }

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
 *                     totalTrains, profitPerTrain }
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

/**
 * Get live train objects for a route (from getTrains(), grouped by routeId).
 * Returns an empty array if getTrains() is unavailable or no trains are active.
 *
 * @param {string} routeId
 * @returns {Train[]}
 */
export function getTrainsForRoute(routeId) {
    return _trainsByRoute.get(routeId) ?? [];
}

/**
 * Get the accumulated timetable data for a route (delay + dwell per stNodeId).
 * Returns null if no data has been collected yet for this route today.
 *
 * @param {string} routeId
 * @returns {{ [stNodeId]: { sumDelaySec, sumDwellActual, sumDwellExpected, count } } | null}
 */
export function getTimetableAccum(routeId) {
    return _timetableAccum[routeId] ?? null;
}

/**
 * Reset timetable accumulation for all routes.
 * Called at midnight (onDayChange) so charts reflect the current day only.
 */
export function resetTimetableAccum() {
    _timetableAccum    = {};
    _lastSeenArrival   = {};
    _routeLegMap       = {};
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
            revEvents:  _revEvents,
            costEvents: _costEvents,
        });
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
            return;
        }

        const cutoff = currentElapsed - 86400 - GRACE_SECONDS;

        // Keep only events in [cutoff, currentElapsed]
        _revEvents  = (saved.revEvents  || []).filter(e => e.t >= cutoff && e.t <= currentElapsed);
        _costEvents = (saved.costEvents || []).filter(e => e.t >= cutoff && e.t <= currentElapsed);
    } catch (e) {
        console.error(`${TAG} Failed to restore events:`, e);
    }
}
