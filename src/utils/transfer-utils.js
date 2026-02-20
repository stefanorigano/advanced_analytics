// Transfer utilities
// Helper functions for resolving transfer connections at a specific station

import { CONFIG } from '../config.js';

/**
 * Get transfer route info for a specific station
 *
 * Returns all routes (excluding currentRouteId) that connect to this station
 * via nearby stations with walkingTime < threshold.
 *
 * Reusable wherever transfer badge display is needed (e.g. StationFlow tooltip,
 * future map overlays, etc.).
 *
 * @param {string} stationId       - The station to check
 * @param {string} currentRouteId  - The route we're currently viewing (excluded from results)
 * @param {Object} api             - SubwayBuilderAPI instance
 * @returns {Array<{ routeId: string, routeName: string, bullet: string }>}
 */
export function getStationTransferRoutes(stationId, currentRouteId, api) {
    try {
        const allStations = api.gameState.getStations();
        const allRoutes   = api.gameState.getRoutes();
        const THRESHOLD   = CONFIG.TRANSFER_WALKING_TIME_THRESHOLD;

        // Find the station itself
        const station = allStations.find(s => s.id === stationId);
        if (!station || !station.nearbyStations || station.nearbyStations.length === 0) {
            return [];
        }

        const transferRouteIds = new Set();

        station.nearbyStations.forEach(nearby => {
            if (nearby.walkingTime >= THRESHOLD) return;

            const nearbyStation = allStations.find(s => s.id === nearby.stationId);
            if (!nearbyStation || !nearbyStation.routeIds) return;

            nearbyStation.routeIds.forEach(routeId => {
                if (routeId !== currentRouteId) {
                    transferRouteIds.add(routeId);
                }
            });
        });

        // Also check if the station itself is served by other routes
        if (station.routeIds) {
            station.routeIds.forEach(routeId => {
                if (routeId !== currentRouteId) {
                    transferRouteIds.add(routeId);
                }
            });
        }

        // Resolve route IDs to route objects
        return Array.from(transferRouteIds)
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

    } catch (error) {
        console.error('[TransferUtils] Error getting station transfers:', error);
        return [];
    }
}
