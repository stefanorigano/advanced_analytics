// Lifecycle hooks management module
// Sets up all game lifecycle hooks

import { CONFIG } from '../config.js';
import { Storage } from './storage.js';
import { captureHistoricalData } from '../metrics/historical-data.js';
import { getZustandSaveName } from './api-support.js';
import {
    initAccumulator,
    stopAccumulating,
    clearAccumulatorState,
    persistEvents,
    restoreEvents,
    getRoute24hStats,
} from '../metrics/accumulator.js';

let storage = null;

// Global variable to track current save name
let currentSaveName = null;

/**
 * Fallback handler for subsequent loads where onGameLoaded does not fire.
 *
 * API bug: after the first session load, onGameLoaded and onGameInit are never
 * triggered again. onMapReady is the only reliable hook on subsequent loads.
 *
 * @param {Object} api - SubwayBuilderAPI instance
 */
export async function handleMapReadyFallback(api) {
    const zustandName  = getZustandSaveName();
    const resolvedName = zustandName || `session_${Date.now()}`;
    const source       = zustandName ? 'Zustand' : 'temp ID';

    console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback | saveName: ${resolvedName} (source: ${source})`);

    storage = _initStorage(resolvedName);

    const matchingKey = await _findMatchingSave(resolvedName, api);

    if (matchingKey) {
        console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback — found matching save: ${matchingKey}`);
        storage.setSaveName(matchingKey);
        currentSaveName = matchingKey;
    } else {
        console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback — no matching save found, using: ${resolvedName}`);
        currentSaveName = resolvedName;
    }

    await storage.restore();

    // Prune historical entries that belong to days in the future
    // (can appear when a save file is rewound to an earlier day)
    await _pruneFutureHistoricalData(storage, api);

    // Accumulator: clear stale in-memory state, restore persisted events, restart
    clearAccumulatorState();
    await restoreEvents(storage, api.gameState.getElapsedSeconds());
    initAccumulator(api);

    console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback complete | active save: ${currentSaveName}`);
}

/**
 * Initialize (or reuse) the storage instance for a given save name.
 * @param {string} saveName
 * @returns {Storage}
 */
function _initStorage(saveName) {
    if (!storage) {
        storage = new Storage(saveName);
    } else {
        storage.setSaveName(saveName);
    }
    currentSaveName = saveName;
    return storage;
}

/**
 * Get current save name (for use by UI components).
 * @returns {string|null}
 */
export function getCurrentSaveName() {
    return currentSaveName;
}

/**
 * Find a matching save in IDB by comparing game state metadata.
 * Uses strict matching: name + cityCode + routeCount + day + stationCount must ALL match.
 *
 * @param {string} saveName - Save name from the game
 * @param {Object} api      - SubwayBuilderAPI instance
 * @returns {Promise<string|null>} Matching save key or null
 */
async function _findMatchingSave(saveName, api) {
    const saves = await Storage.getAllSaves();

    const cityCode    = api.utils.getCityCode?.() || null;
    const routes      = api.gameState.getRoutes();
    const stations    = api.gameState.getStations();
    const day         = api.gameState.getCurrentDay();

    for (const [key, saveData] of Object.entries(saves)) {
        if (key !== saveName) continue;

        if (saveData.cityCode     === cityCode        &&
            saveData.routeCount   === routes.length   &&
            saveData.day          === day              &&
            saveData.stationCount === stations.length) {
            return key;
        }
    }

    return null;
}

/**
 * Prune historical data entries that belong to days >= currentDay.
 * Prevents stale future-day data after a save file is rewound.
 *
 * @param {Object} storage - Storage instance
 * @param {Object} api     - SubwayBuilderAPI instance
 */
async function _pruneFutureHistoricalData(storage, api) {
    try {
        const historicalData = await storage.get('historicalData', { days: {} });
        const currentDay     = api.gameState.getCurrentDay();
        let   pruned         = false;

        for (const day of Object.keys(historicalData.days)) {
            if (parseInt(day) >= currentDay) {
                delete historicalData.days[day];
                pruned = true;
            }
        }

        if (pruned) {
            await storage.set('historicalData', historicalData);
            console.log(`${CONFIG.LOG_PREFIX} [LC] Pruned historical data for days >= ${currentDay}`);
        }
    } catch (e) {
        console.error(`${CONFIG.LOG_PREFIX} [LC] Failed to prune future historical data:`, e);
    }
}

/**
 * Initialize all lifecycle hooks.
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function initLifecycleHooks(api) {
    console.log(`${CONFIG.LOG_PREFIX} Setting up lifecycle hooks...`);

    // ── onGameInit ──────────────────────────────────────────────────────────
    api.hooks.onGameInit(() => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameInit fired | storage: ${storage ? storage.saveName : 'null'}`);
        // New game: no persisted events to restore
        clearAccumulatorState();
        initAccumulator(api);
    });

    // ── onGameLoaded ────────────────────────────────────────────────────────
    api.hooks.onGameLoaded(async (saveName) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameLoaded fired | saveName: ${saveName} | prev storage: ${storage ? storage.saveName : 'null'}`);

        storage = _initStorage(saveName);

        const matchingKey = await _findMatchingSave(saveName, api);

        if (matchingKey) {
            console.log(`${CONFIG.LOG_PREFIX} [LC] Found matching save: ${matchingKey}`);
            storage.setSaveName(matchingKey);
            currentSaveName = matchingKey;
        } else {
            console.log(`${CONFIG.LOG_PREFIX} [LC] No matching save found, using: ${saveName}`);
            currentSaveName = saveName;
        }

        await storage.restore();

        // Prune stale future-day historical data
        await _pruneFutureHistoricalData(storage, api);

        // Accumulator: discard stale data, restore from IDB, restart
        clearAccumulatorState();
        await restoreEvents(storage, api.gameState.getElapsedSeconds());
        initAccumulator(api);

        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameLoaded complete | active save: ${currentSaveName}`);
    });

    // ── onGameSaved ─────────────────────────────────────────────────────────
    api.hooks.onGameSaved(async (saveName) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameSaved fired | saveName: ${saveName} | prev storage: ${storage ? storage.saveName : 'null'}`);

        if (!storage) {
            storage = _initStorage(saveName);
        }

        const oldSaveName = storage.saveName;

        // Migrate keys if the save was previously stored under a temp/different name
        if (oldSaveName && oldSaveName !== saveName) {
            const isTempId = /\d{13}/.test(oldSaveName);

            await Storage.migrateKeys(oldSaveName, saveName, isTempId);
            await Storage.renameSave(oldSaveName, saveName);

            if (isTempId) {
                console.log(`${CONFIG.LOG_PREFIX} [LC] Migrated data from temp save "${oldSaveName}" to: "${saveName}"`);
            } else {
                console.log(`${CONFIG.LOG_PREFIX} [LC] Copied data from "${oldSaveName}" to: "${saveName}"`);
            }
        }

        storage.setSaveName(saveName);
        currentSaveName = saveName;

        await storage.backup(api);
        await persistEvents(storage);

        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameSaved complete | active save: ${currentSaveName}`);
    });

    // ── onGameEnd ───────────────────────────────────────────────────────────
    api.hooks.onGameEnd((result) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameEnd fired | result: ${JSON.stringify(result)}`);

        storage         = null;
        currentSaveName = null;

        stopAccumulating();

        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameEnd — state reset complete`);
    });

    // ── onDayChange ─────────────────────────────────────────────────────────
    api.hooks.onDayChange(async (dayThatEnded) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onDayChange fired | day ended: ${dayThatEnded} | storage: ${storage ? storage.saveName : 'null'}`);

        if (!storage) {
            console.warn(`${CONFIG.LOG_PREFIX} Storage not initialized, skipping data capture`);
            return;
        }

        // Build stats snapshot for each active route using the rolling 24h window.
        // At the day boundary, the rolling window covers exactly the day that just ended.
        const routes = api.gameState.getRoutes();
        const routeStatsMap = {};
        routes.forEach(route => {
            routeStatsMap[route.id] = getRoute24hStats(route.id);
        });

        // Persist event log before the new day continues accumulating
        await persistEvents(storage);

        // Save historical snapshot for the day that ended
        await captureHistoricalData(dayThatEnded, api, storage, routeStatsMap);

        // Transition 'new' routes to 'ongoing' status
        await _transitionNewRoutesToOngoing(storage);
    });

    // ── onRouteCreated ──────────────────────────────────────────────────────
    api.hooks.onRouteCreated((route) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onRouteCreated | route: ${route.id} | storage: ${storage ? storage.saveName : 'null'}`);

        if (!storage) return;

        const currentDay   = api.gameState.getCurrentDay();
        const creationTime = api.gameState.getElapsedSeconds();
        _setRouteStatus(route.id, 'new', currentDay, storage, creationTime);
    });

    // ── onRouteDeleted ──────────────────────────────────────────────────────
    api.hooks.onRouteDeleted((routeId) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onRouteDeleted | route: ${routeId} | storage: ${storage ? storage.saveName : 'null'}`);

        if (!storage) return;

        const currentDay = api.gameState.getCurrentDay();
        _setRouteStatus(routeId, 'deleted', currentDay, storage);
    });

    console.log(`${CONFIG.LOG_PREFIX} ✓ Lifecycle hooks registered`);
}

/**
 * Get the active storage instance (for use by UI components and hooks).
 * @returns {Storage|null}
 */
export function getStorage() {
    return storage;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Set route lifecycle status in storage.
 */
async function _setRouteStatus(routeId, status, day, storage, creationTime = null) {
    const statuses = await storage.get('routeStatuses', {});

    if (status === 'new') {
        statuses[routeId] = {
            status:       'new',
            createdDay:   day,
            creationTime: creationTime,
            deletedDay:   null,
        };
    } else if (status === 'ongoing') {
        if (statuses[routeId]) {
            statuses[routeId].status = 'ongoing';
        }
    } else if (status === 'deleted') {
        if (statuses[routeId]) {
            statuses[routeId].status     = 'deleted';
            statuses[routeId].deletedDay = day;
        }
    }

    await storage.set('routeStatuses', statuses);
}

/**
 * Transition all 'new' routes to 'ongoing' at day change.
 */
async function _transitionNewRoutesToOngoing(storage) {
    const statuses = await storage.get('routeStatuses', {});
    let updated    = false;

    for (const routeId in statuses) {
        if (statuses[routeId].status === 'new') {
            statuses[routeId].status = 'ongoing';
            updated = true;
        }
    }

    if (updated) {
        await storage.set('routeStatuses', statuses);
    }
}
