// Transfer calculation module
// Calculates transfer connections between routes for the analytics table.
//
// PRIMARY:  Zustand stationGroups — stations sharing a group = physical transfer hub
// FALLBACK: nearbyStations walkingTime heuristic (original behaviour)
//
// Result shape per route:
// {
//   count:      number,   // total transfer-station count across all connected routes
//   routes:     string[], // display names of connected routes
//   routeIds:   string[], // IDs of connected routes
//   stationIds: string[]  // IDs of this route's stations that are transfer points
// }

import { CONFIG } from '../config.js';
import {
    isZustandAvailable,
    getSiblingStationIds,
} from '../core/zustand-store.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate transfer connections for every route.
 *
 * @param {Array}  routes - Array of route objects from api.gameState.getRoutes()
 * @param {Object} api    - SubwayBuilderAPI instance
 * @returns {Object} Map of routeId -> { count, routes, routeIds, stationIds }
 */
export function calculateTransfers(routes, api) {
    return isZustandAvailable()
        ? _calculateTransfersZustand(routes, api)
        : _calculateTransfersFallback(routes, api);
}

// ---------------------------------------------------------------------------
// Zustand-based implementation
// ---------------------------------------------------------------------------

/**
 * Uses stationGroups to identify transfer hubs.
 *
 * For each route, iterates its stations. A station is a transfer point when
 * getSiblingStationIds() returns at least one ID — meaning the station shares
 * a group with another station served by a different route.
 *
 * @private
 */
function _calculateTransfersZustand(routes, api) {
    const allStations = api.gameState.getStations();
    const transferMap = {};

    routes.forEach(route => {
        // Map of otherRouteId -> Set of transfer station IDs on this route
        const transfersByRoute = new Map();

        // Find all stations belonging to this route
        allStations.forEach(station => {
            if (!station.routeIds?.includes(route.id)) return;

            const siblingIds = getSiblingStationIds(station.id);
            if (siblingIds.length === 0) return;

            // Each sibling station may serve different routes
            siblingIds.forEach(sibId => {
                const sibling = allStations.find(s => s.id === sibId);
                if (!sibling?.routeIds) return;

                sibling.routeIds.forEach(otherRouteId => {
                    if (otherRouteId === route.id) return; // skip self

                    if (!transfersByRoute.has(otherRouteId)) {
                        transfersByRoute.set(otherRouteId, new Set());
                    }
                    transfersByRoute.get(otherRouteId).add(station.id);
                });
            });
        });

        transferMap[route.id] = _buildResult(transfersByRoute, routes);
    });

    return transferMap;
}

// ---------------------------------------------------------------------------
// Fallback: original nearbyStations walking-time heuristic
// ---------------------------------------------------------------------------

/**
 * Original implementation — kept as-is for fallback parity.
 *
 * @private
 */
function _calculateTransfersFallback(routes, api) {
    const allStations = api.gameState.getStations();
    const THRESHOLD   = CONFIG.TRANSFER_WALKING_TIME_THRESHOLD;
    const transferMap = {};

    routes.forEach(route => {
        const transfersByRoute = new Map();

        allStations.forEach(station => {
            if (!station.routeIds?.includes(route.id)) return;
            if (!station.nearbyStations?.length) return;

            station.nearbyStations.forEach(nearby => {
                if (nearby.walkingTime >= THRESHOLD) return;

                const nearbyStation = allStations.find(s => s.id === nearby.stationId);
                if (!nearbyStation?.routeIds) return;

                nearbyStation.routeIds.forEach(otherRouteId => {
                    if (otherRouteId === route.id) return;

                    if (!transfersByRoute.has(otherRouteId)) {
                        transfersByRoute.set(otherRouteId, new Set());
                    }
                    transfersByRoute.get(otherRouteId).add(station.id);
                });
            });
        });

        transferMap[route.id] = _buildResult(transfersByRoute, routes);
    });

    return transferMap;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build the result object from a transfersByRoute map.
 *
 * @param {Map<string, Set<string>>} transfersByRoute
 * @param {Array} routes
 * @returns {{ count: number, routes: string[], routeIds: string[], stationIds: string[] }}
 * @private
 */
function _buildResult(transfersByRoute, routes) {
    let totalCount = 0;
    const connectedRouteData = [];
    const allStationIds = [];

    transfersByRoute.forEach((stationIdsSet, otherRouteId) => {
        const otherRoute  = routes.find(r => r.id === otherRouteId);
        const stationIds  = Array.from(stationIdsSet);
        totalCount += stationIds.length;
        connectedRouteData.push({
            routeId:     otherRouteId,
            routeName:   otherRoute ? (otherRoute.name || otherRoute.bullet) : otherRouteId,
            sharedCount: stationIds.length,
        });
        allStationIds.push(...stationIds);
    });

    // Sort by shared count desc, then alphabetically
    connectedRouteData.sort((a, b) =>
        b.sharedCount !== a.sharedCount
            ? b.sharedCount - a.sharedCount
            : a.routeName.localeCompare(b.routeName)
    );

    return {
        count:      totalCount,
        routes:     connectedRouteData.map(r => r.routeName),
        routeIds:   connectedRouteData.map(r => r.routeId),
        stationIds: allStationIds,
    };
}
