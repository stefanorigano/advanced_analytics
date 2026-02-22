// Zustand store access module
// Provides direct access to the game's internal Zustand store,
// bypassing the public API for more precise data.
//
// ARCHITECTURE:
// - Locates the Zustand store at module init time (one-time scan)
// - Exposes typed accessors with automatic fallback to API-based methods
// - Logs availability once at startup so it's visible in the dev console
//
// USAGE:
//   import { getTransferStationIds, isZustandAvailable } from './zustand-store.js';

import { CONFIG } from '../config.js';

// ---------------------------------------------------------------------------
// Store location
// ---------------------------------------------------------------------------

/**
 * Locate the Zustand store by scanning window properties.
 *
 * The store is identified by having a `getState` function whose result
 * contains a `stationGroups` array (the most stable discriminator we have).
 *
 * @returns {Object|null} Zustand store reference or null
 */
function findZustandStore() {
    try {
        for (const val of Object.values(window)) {
            if (typeof val?.getState !== 'function') continue;

            const state = val.getState();
            if (Array.isArray(state?.stationGroups)) {
                return val;
            }
        }
    } catch (err) {
        // Defensive: window enumeration can throw in some sandboxed contexts
        console.warn(`${CONFIG.LOG_PREFIX} [Zustand] Error while scanning window:`, err);
    }
    return null;
}

// Perform the scan once at module load time.
const _store = findZustandStore();

if (_store) {
    console.log(`${CONFIG.LOG_PREFIX} [Zustand] ✓ Store found — enhanced data accessors active`);
} else {
    console.warn(`${CONFIG.LOG_PREFIX} [Zustand] ✗ Store not found — falling back to API-based methods`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Whether the Zustand store was successfully located.
 * Use this to branch between enhanced and fallback code paths.
 *
 * @returns {boolean}
 */
export function isZustandAvailable() {
    return _store !== null;
}

/**
 * Get the raw Zustand state snapshot.
 * Returns null if the store is not available.
 *
 * Prefer the typed accessors below over calling this directly.
 *
 * @returns {Object|null}
 */
export function getZustandState() {
    if (!_store) return null;
    try {
        return _store.getState();
    } catch (err) {
        console.warn(`${CONFIG.LOG_PREFIX} [Zustand] getState() failed:`, err);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Station / Transfer accessors
// ---------------------------------------------------------------------------

/**
 * Get all station groups from Zustand.
 *
 * A station group represents a physical hub (named location).
 * Groups with multiple stationIds are transfer hubs where two or more
 * in-game station entities share the same catchment area.
 *
 * @returns {Array<{
 *   id: string,
 *   name: string,
 *   stationIds: string[],
 *   center: [number, number],
 *   bounds: Object,
 *   manualAdditions: any,
 *   manualRemovals: any
 * }>} Array of station groups, or empty array if unavailable
 */
export function getStationGroups() {
    const state = getZustandState();
    if (!state?.stationGroups) return [];
    return state.stationGroups;
}

/**
 * Get only the station groups that contain more than one station,
 * i.e. actual transfer hubs.
 *
 * @returns {Array} Filtered station groups
 */
export function getTransferGroups() {
    return getStationGroups().filter(g => g.stationIds.length > 1);
}

/**
 * Build a Set of station IDs that participate in at least one transfer group.
 *
 * This is the primary utility for the transfer detection use-case.
 * A station is considered a "transfer station" if its ID appears in a group
 * that also contains at least one other station ID.
 *
 * @returns {Set<string>} Set of station IDs involved in transfers
 */
export function getTransferStationIds() {
    const ids = new Set();
    for (const group of getTransferGroups()) {
        for (const stationId of group.stationIds) {
            ids.add(stationId);
        }
    }
    return ids;
}

/**
 * Given a station ID, return the group it belongs to (if any).
 *
 * @param {string} stationId
 * @returns {Object|null} The station group, or null if not found
 */
export function getGroupForStation(stationId) {
    return getStationGroups().find(g => g.stationIds.includes(stationId)) ?? null;
}

/**
 * Given a station ID, return the IDs of all other stations in the same group.
 * Returns an empty array if the station is alone in its group or not found.
 *
 * This is a direct, Zustand-native replacement for the nearbyStations walking-
 * time heuristic used in transfer-utils.js.
 *
 * @param {string} stationId
 * @returns {string[]} Sibling station IDs in the same group
 */
export function getSiblingStationIds(stationId) {
    const group = getGroupForStation(stationId);
    if (!group) return [];
    return group.stationIds.filter(id => id !== stationId);
}
