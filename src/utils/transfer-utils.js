// Transfer utilities
// Helper functions for resolving transfer connections at a specific station.
//
// PRIMARY:  Zustand stationGroups — stations sharing a group = physical transfer hub
// FALLBACK: nearbyStations walkingTime heuristic (original behaviour)

import { CONFIG } from '../config.js';
import {
    isZustandAvailable,
    getGroupForStation,
    getSiblingStationIds,
} from '../core/zustand-store.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get transfer route info for a specific station.
 *
 * Returns all routes (excluding currentRouteId) that connect to this station
 * via the same station group (Zustand) or via nearbyStations walkingTime (fallback).
 *
 * @param {string} stationId       - The station to check
 * @param {string} currentRouteId  - The route currently being viewed (excluded)
 * @param {Object} api             - SubwayBuilderAPI instance
 * @returns {Array<{ routeId: string, routeName: string, bullet: string }>}
 */
export function getStationTransferRoutes(stationId, currentRouteId, api) {
    return isZustandAvailable()
        ? _getTransferRoutesZustand(stationId, currentRouteId, api)
        : _getTransferRoutesFallback(stationId, currentRouteId, api);
}

// ---------------------------------------------------------------------------
// Zustand-based implementation
// ---------------------------------------------------------------------------

/**
 * Uses stationGroups to find co-located stations and resolves their routes.
 *
 * A station is a transfer if it shares a group with at least one other station.
 * We collect all routes served by sibling stations (excluding currentRouteId).
 *
 * @private
 */
function _getTransferRoutesZustand(stationId, currentRouteId, api) {
    try {
        const allStations = api.gameState.getStations();
        const allRoutes   = api.gameState.getRoutes();

        const siblingIds = getSiblingStationIds(stationId);
        if (siblingIds.length === 0) return [];

        const transferRouteIds = new Set();

        for (const sibId of siblingIds) {
            const sib = allStations.find(s => s.id === sibId);
            if (!sib?.routeIds) continue;

            for (const routeId of sib.routeIds) {
                if (routeId !== currentRouteId) {
                    transferRouteIds.add(routeId);
                }
            }
        }

        // Also include other routes served directly at this station
        const thisStation = allStations.find(s => s.id === stationId);
        if (thisStation?.routeIds) {
            for (const routeId of thisStation.routeIds) {
                if (routeId !== currentRouteId) {
                    transferRouteIds.add(routeId);
                }
            }
        }

        return _resolveRouteIds(transferRouteIds, allRoutes);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} [TransferUtils/Zustand] Error:`, error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Fallback: original nearbyStations walking-time heuristic
// ---------------------------------------------------------------------------

/**
 * Original implementation — kept as-is for fallback parity.
 *
 * @private
 */
function _getTransferRoutesFallback(stationId, currentRouteId, api) {
    try {
        const allStations = api.gameState.getStations();
        const allRoutes   = api.gameState.getRoutes();
        const THRESHOLD   = CONFIG.TRANSFER_WALKING_TIME_THRESHOLD;

        const station = allStations.find(s => s.id === stationId);
        if (!station?.nearbyStations?.length) return [];

        const transferRouteIds = new Set();

        station.nearbyStations.forEach(nearby => {
            if (nearby.walkingTime >= THRESHOLD) return;

            const nearbyStation = allStations.find(s => s.id === nearby.stationId);
            if (!nearbyStation?.routeIds) return;

            nearbyStation.routeIds.forEach(routeId => {
                if (routeId !== currentRouteId) transferRouteIds.add(routeId);
            });
        });

        // Also check routes served directly at this station
        if (station.routeIds) {
            station.routeIds.forEach(routeId => {
                if (routeId !== currentRouteId) transferRouteIds.add(routeId);
            });
        }

        return _resolveRouteIds(transferRouteIds, allRoutes);
    } catch (error) {
        console.error(`${CONFIG.LOG_PREFIX} [TransferUtils/Fallback] Error:`, error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a Set of route IDs to route descriptor objects.
 *
 * @param {Set<string>} routeIdSet
 * @param {Array}       allRoutes
 * @returns {Array<{ routeId: string, routeName: string, bullet: string }>}
 * @private
 */
function _resolveRouteIds(routeIdSet, allRoutes) {
    return Array.from(routeIdSet)
        .map(routeId => {
            const route = allRoutes.find(r => r.id === routeId);
            if (!route) return null;
            return {
                routeId,
                routeName: route.name || route.bullet || routeId,
                bullet:    route.bullet || '?',
            };
        })
        .filter(Boolean);
}
