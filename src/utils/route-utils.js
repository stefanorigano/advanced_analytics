// Route utilities
// Helper functions for working with route data

import { CONFIG } from '../config.js';

/**
 * Get stations for a route in timetable order, deduplicated.
 *
 * stComboTimings includes the full loop (A→B→C→D→C→B→A), so we keep only
 * the first occurrence of each station ID to show a clean one-way sequence.
 *
 * @param {string} routeId - Route ID
 * @param {Object} api - SubwayBuilderAPI instance
 * @returns {Array} Array of unique station objects in timetable order
 *
 * @example
 * const orderedStations = getRouteStationsInOrder(routeId, api);
 * // Returns: [{ id: '...', name: '...', stNodeId: '...' }, ...]
 */
export function getRouteStationsInOrder(routeId, api) {
    try {
        const routes = api.gameState.getRoutes();
        const route = routes.find(r => r.id === routeId);

        if (!route || !route.stComboTimings || route.stComboTimings.length === 0) {
            return [];
        }

        const allStations = api.gameState.getStations();

        // Build a map of stNodeId -> station for quick lookup
        const stNodeToStation = new Map();
        allStations.forEach(station => {
            if (station.stNodeIds && station.stNodeIds.length > 0) {
                station.stNodeIds.forEach(stNodeId => {
                    stNodeToStation.set(stNodeId, station);
                });
            }
        });

        // Map stComboTimings to stations, then deduplicate by station.id,
        // keeping only the first occurrence (outbound leg of the loop).
        const seen = new Set();
        const orderedStations = [];

        for (const timing of route.stComboTimings) {
            const station = stNodeToStation.get(timing.stNodeId);
            if (!station) continue;
            if (seen.has(station.id)) continue; // skip return-leg duplicates

            seen.add(station.id);
            orderedStations.push({
                id:            station.id,
                name:          station.name || 'Unnamed Station',
                stNodeId:      timing.stNodeId,
                stNodeIndex:   timing.stNodeIndex,
                arrivalTime:   timing.arrivalTime,
                departureTime: timing.departureTime,
            });
        }

        return orderedStations;
    } catch (error) {
        console.error('[RouteUtils] Error getting stations in order:', error);
        return [];
    }
}

/**
 * Get station IDs for a route in timetable order
 *
 * @param {string} routeId - Route ID
 * @param {Object} api - SubwayBuilderAPI instance
 * @returns {Array<string>} Array of station IDs in timetable order
 */
export function getRouteStationIds(routeId, api) {
    return getRouteStationsInOrder(routeId, api).map(station => station.id);
}

/**
 * Determine if a route is circular (one-way loop) vs pendulum (back-and-forth).
 *
 * A circular route (A→B→C→A) has its terminus station at both ends of
 * stComboTimings with NO intermediate station repeated.
 * A pendulum route (A→B→C→B→A) has intermediate stations visited twice.
 *
 * @param {Object} route - Route object with stComboTimings
 * @param {Array} allStations - Array of all station objects
 * @returns {boolean} True if circular (loop), false if pendulum or indeterminate
 */
export function isCircularRoute(route, allStations) {
    const stNodeToStationId = new Map();
    allStations.forEach(s => s.stNodeIds?.forEach(n => stNodeToStationId.set(n, s.id)));

    const timings = route.stComboTimings || [];
    if (timings.length < 4) return false; // need at least A, B, C, A

    const ids = timings.map(t => stNodeToStationId.get(t.stNodeId)).filter(Boolean);
    if (ids.length < 4) return false;
    if (ids[0] !== ids[ids.length - 1]) return false; // terminus must close the loop

    const mid = ids.slice(1, -1);
    const seen = new Set();
    for (const id of mid) {
        if (seen.has(id)) return false; // intermediate repeat → pendulum
        seen.add(id);
    }
    return seen.size >= 2; // need at least 2 intermediate unique stations
}

/**
 * Compute the peak segment passenger load for a route from time-filtered commutes.
 *
 * Returns the raw passenger count on the busiest segment within the time window,
 * broken down by demand phase. Divide by the corresponding capacity to get
 * load factor as a percentage.
 *
 * Commutes are filtered by journeyEnd > cutoff (rolling 24h window).
 * Per-phase breakdown uses journeyStart to classify each commute into
 * high/medium/low demand phases.
 *
 * Why directions are separated (pendulum routes):
 *   For pendulum routes (A→B→C→B→A) the deduplicated station list is
 *   [A, B, C]. WH commuters travelling C→A appear to board at a high
 *   index and alight at a low index. Mixing both directions in a single
 *   cumulative array causes cancellation artifacts. Processing each
 *   direction independently avoids this.
 *
 * @param {string} routeId - Route ID
 * @param {Array<string>} orderedStationIds - Station IDs in timetable order (deduplicated)
 * @param {Array} commutes - Array from getCompletedCommutes()
 * @param {boolean} isCircular - True if circular/loop route
 * @param {number} cutoff - Elapsed seconds cutoff; only commutes with journeyEnd > cutoff are included
 * @param {Array} demandPhases - CONFIG.DEMAND_PHASES array (each: { type, startHour, endHour })
 * @returns {{ overall: number, [tierKey: string]: number }}
 *   Peak segment passenger counts for the overall window and per demand tier
 *   (one key per CONFIG.TIERS entry, e.g. high/medium/low/veryLow)
 */
export function computeSegmentLoads(routeId, orderedStationIds, commutes, isCircular, cutoff, demandPhases) {
    const tierKeys = CONFIG.TIERS.map(t => t.key);
    const zero = { overall: 0 };
    for (const k of tierKeys) zero[k] = 0;
    if (!orderedStationIds.length || !commutes.length) return zero;

    // Build hour → tier lookup (24 entries)
    const hourToPhase = new Array(24);
    for (const phase of demandPhases) {
        for (let h = phase.startHour; h < phase.endHour; h++) {
            hourToPhase[h] = phase.type;
        }
    }

    // Filter to 24h window. Commutes are likely ordered by journeyEnd (appended
    // chronologically by the game), so scan from the end to find the cutoff.
    // Binary search would be faster on very long games, but a simple backward
    // scan is robust even if ordering isn't guaranteed.
    let startIdx = 0;
    if (commutes.length > 0 && commutes[0].journeyEnd !== undefined) {
        // Fast path: if ordered, binary search for cutoff
        if (commutes[commutes.length - 1].journeyEnd >= commutes[0].journeyEnd) {
            let lo = 0, hi = commutes.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (commutes[mid].journeyEnd > cutoff) hi = mid;
                else lo = mid + 1;
            }
            startIdx = lo;
        }
    }

    const n = orderedStationIds.length;
    const stationIdxMap = new Map(orderedStationIds.map((id, i) => [id, i]));

    if (isCircular) {
        return _circularSegmentLoads(routeId, n, stationIdxMap, commutes, startIdx, cutoff, hourToPhase, tierKeys);
    }
    return _pendulumSegmentLoads(routeId, n, stationIdxMap, commutes, startIdx, cutoff, hourToPhase, tierKeys);
}

/**
 * Circular route: direct segment accumulation with wrap-around.
 * There are n segments (0→1, 1→2, …, (n-1)→0).
 */
function _circularSegmentLoads(routeId, n, stationIdxMap, commutes, startIdx, cutoff, hourToPhase, tierKeys) {
    // Overall + per-tier segment load arrays
    const segAll    = new Array(n).fill(0);
    const segByTier = {};
    for (const k of tierKeys) segByTier[k] = new Array(n).fill(0);

    for (let ci = startIdx; ci < commutes.length; ci++) {
        const c = commutes[ci];
        if (c.journeyEnd === undefined || c.journeyEnd <= cutoff) continue;
        if (!c.stationRoutes) continue;
        const size = c.size || 1;
        const seg  = c.stationRoutes.find(s => s.routeId === routeId);
        if (!seg?.stationIds?.length) continue;

        const bi = stationIdxMap.get(seg.stationIds[0]);
        const ai = stationIdxMap.get(seg.stationIds[seg.stationIds.length - 1]);
        if (bi === undefined || ai === undefined || bi === ai) continue;

        // Pick the tier array based on journeyStart hour
        const hour     = Math.floor((c.journeyStart % 86400) / 3600);
        const phaseSeg = segByTier[hourToPhase[hour]];

        if (bi < ai) {
            for (let i = bi; i < ai; i++) { segAll[i] += size; if (phaseSeg) phaseSeg[i] += size; }
        } else {
            for (let i = bi; i < n; i++) { segAll[i] += size; if (phaseSeg) phaseSeg[i] += size; }
            for (let i = 0; i < ai; i++) { segAll[i] += size; if (phaseSeg) phaseSeg[i] += size; }
        }
    }

    const result = { overall: segAll.length > 0 ? Math.max(...segAll) : 0 };
    for (const k of tierKeys) result[k] = segByTier[k].length > 0 ? Math.max(...segByTier[k]) : 0;
    return result;
}

/**
 * Pendulum route: separate forward/reverse cumulative scan.
 */
function _pendulumSegmentLoads(routeId, n, stationIdxMap, commutes, startIdx, cutoff, hourToPhase, tierKeys) {
    // Overall boarding/alighting arrays for forward and reverse directions.
    const fwdB = new Array(n).fill(0), fwdA = new Array(n).fill(0);
    const revB = new Array(n).fill(0), revA = new Array(n).fill(0);
    // Same four arrays per demand tier.
    const tierArrays = {};
    for (const k of tierKeys) {
        tierArrays[k] = {
            fwdB: new Array(n).fill(0), fwdA: new Array(n).fill(0),
            revB: new Array(n).fill(0), revA: new Array(n).fill(0),
        };
    }

    for (let ci = startIdx; ci < commutes.length; ci++) {
        const c = commutes[ci];
        if (c.journeyEnd === undefined || c.journeyEnd <= cutoff) continue;
        if (!c.stationRoutes) continue;
        const size = c.size || 1;
        const seg  = c.stationRoutes.find(s => s.routeId === routeId);
        if (!seg?.stationIds?.length) continue;

        const bi = stationIdxMap.get(seg.stationIds[0]);
        const ai = stationIdxMap.get(seg.stationIds[seg.stationIds.length - 1]);
        if (bi === undefined || ai === undefined) continue;

        const hour = Math.floor((c.journeyStart % 86400) / 3600);
        const ta   = tierArrays[hourToPhase[hour]];

        if (bi <= ai) {
            fwdB[bi] += size; fwdA[ai] += size;
            if (ta) { ta.fwdB[bi] += size; ta.fwdA[ai] += size; }
        } else {
            revB[bi] += size; revA[ai] += size;
            if (ta) { ta.revB[bi] += size; ta.revA[ai] += size; }
        }
    }

    // Compute max segment load via cumulative scan for each set
    const scanMax = (boarding, alighting, fwd) => {
        let load = 0, maxLoad = 0;
        if (fwd) {
            for (let i = 0; i < n - 1; i++) {
                load += boarding[i] - alighting[i];
                if (load > maxLoad) maxLoad = load;
            }
        } else {
            for (let i = n - 1; i > 0; i--) {
                load += boarding[i] - alighting[i];
                if (load > maxLoad) maxLoad = load;
            }
        }
        return maxLoad;
    };

    // For each category, take max of forward and reverse peak
    const result = {
        overall: Math.max(scanMax(fwdB, fwdA, true), scanMax(revB, revA, false)),
    };
    for (const k of tierKeys) {
        const ta = tierArrays[k];
        result[k] = Math.max(scanMax(ta.fwdB, ta.fwdA, true), scanMax(ta.revB, ta.revA, false));
    }
    return result;
}
