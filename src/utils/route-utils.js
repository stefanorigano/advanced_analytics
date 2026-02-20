// Route utilities
// Helper functions for working with route data

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
