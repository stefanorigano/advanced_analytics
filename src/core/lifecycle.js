// Lifecycle hooks management module
// Sets up all game lifecycle hooks

import { CONFIG } from '../config.js';
import { Storage } from './storage.js';
import { captureHistoricalData } from '../metrics/historical-data.js';
import { recordConfigChange, captureInitialDayConfig } from '../metrics/train-config-tracking.js';
import { getZustandSaveName } from './api-support.js';
import {
    initAccumulator,
    stopAccumulating,
    resetForNewDay,
    getDaySnapshot,
    getHourlySnapshot,
} from '../metrics/revenue-accumulator.js';

let storage = null;

// Global variable to track current save name
let currentSaveName = null;

// Track last hour to detect hour changes
let lastHour = null;

// Module-level reference to startConfigTracking, set during initLifecycleHooks.
let _startConfigTracking = null;

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

    lastHour = null;

    if (_startConfigTracking) {
        _startConfigTracking();
    } else {
        console.warn(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback — _startConfigTracking not available yet`);
    }

    // Revenue accumulator: restart poll + reset buckets for the freshly loaded save
    resetForNewDay();
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

        if (saveData.cityCode    === cityCode       &&
            saveData.routeCount  === routes.length  &&
            saveData.day         === day             &&
            saveData.stationCount === stations.length) {
            return key;
        }
    }

    return null;
}

/**
 * Initialize all lifecycle hooks.
 * @param {Object} api - SubwayBuilderAPI instance
 */
export function initLifecycleHooks(api) {
    console.log(`${CONFIG.LOG_PREFIX} Setting up lifecycle hooks...`);

    let configCheckInterval = null;
    let lastTrainConfig     = {};
    let lastHour            = null;

    // ── Config tracking interval ────────────────────────────────────────────
    function startConfigTracking() {
        if (configCheckInterval) {
            clearInterval(configCheckInterval);
            configCheckInterval = null;
            console.log(`${CONFIG.LOG_PREFIX} [LC] configCheck — cleared previous interval`);
        }

        configCheckInterval = setInterval(() => {
            if (!storage) {
                console.warn(`${CONFIG.LOG_PREFIX} [LC] configCheck tick | storage null, skipping`);
                return;
            }
            if (api.gameState.isPaused()) return;

            const routes         = api.gameState.getRoutes();
            const elapsedSeconds = api.gameState.getElapsedSeconds();
            const currentHour    = Math.floor((elapsedSeconds % 86400) / 3600);
            const currentMinute  = Math.floor((elapsedSeconds % 3600) / 60);

            routes.forEach(route => {
                const currentConfig = {
                    high:   route.trainSchedule?.highDemand   || 0,
                    medium: route.trainSchedule?.mediumDemand || 0,
                    low:    route.trainSchedule?.lowDemand    || 0,
                };

                const lastConfig = lastTrainConfig[route.id];

                if (!lastConfig || _hasConfigChanged(currentConfig, lastConfig)) {
                    recordConfigChange(route.id, currentHour, currentMinute, currentConfig, api, storage);
                    lastTrainConfig[route.id] = currentConfig;
                }
            });

            lastHour = currentHour;
        }, 500);

        console.log(`${CONFIG.LOG_PREFIX} [LC] configCheck — interval started`);
    }

    _startConfigTracking = startConfigTracking;

    // ── onGameInit ──────────────────────────────────────────────────────────
    api.hooks.onGameInit(() => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameInit fired | storage: ${storage ? storage.saveName : 'null'}`);
        startConfigTracking();
        resetForNewDay();
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

        lastTrainConfig = {};
        lastHour        = null;

        startConfigTracking();

        // Revenue accumulator: reset stale data from previous session, then restart
        resetForNewDay();
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

        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameSaved complete | active save: ${currentSaveName}`);
    });

    // ── onGameEnd ───────────────────────────────────────────────────────────
    api.hooks.onGameEnd((result) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameEnd fired | result: ${JSON.stringify(result)} | clearing interval and storage`);

        if (configCheckInterval) {
            clearInterval(configCheckInterval);
            configCheckInterval = null;
            console.log(`${CONFIG.LOG_PREFIX} [LC] configCheck — interval cleared on game end`);
        }

        storage           = null;
        lastTrainConfig   = {};
        lastHour          = null;
        currentSaveName   = null;
        _startConfigTracking = null;

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

        const currentDay = api.gameState.getCurrentDay();
        await captureInitialDayConfig(currentDay, api, storage);

        lastTrainConfig = {};

        // Snapshot accumulated revenue BEFORE resetting for the new day
        const accumulatedRevenue = getDaySnapshot();     // { routeId → dailyRevenue }
        const hourlyRevenue      = getHourlySnapshot();  // { routeId → number[24] }
        console.log(`${CONFIG.LOG_PREFIX} [LC] Revenue snapshot: ${Object.keys(accumulatedRevenue).length} routes accumulated`);

        // Reset buckets so the new day starts clean
        resetForNewDay();

        await captureHistoricalData(dayThatEnded, api, storage, accumulatedRevenue, hourlyRevenue);
        await _transitionNewRoutesToOngoing(storage);
    });

    // ── onRouteCreated ──────────────────────────────────────────────────────
    api.hooks.onRouteCreated((route) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onRouteCreated | route: ${route.id} | storage: ${storage ? storage.saveName : 'null'}`);

        if (!storage) return;

        const currentDay   = api.gameState.getCurrentDay();
        const creationTime = api.gameState.getElapsedSeconds();
        _setRouteStatus(route.id, 'new', currentDay, storage, creationTime);

        lastTrainConfig[route.id] = {
            high:   route.trainSchedule?.highDemand   || 0,
            medium: route.trainSchedule?.mediumDemand || 0,
            low:    route.trainSchedule?.lowDemand    || 0,
        };
    });

    // ── onRouteDeleted ──────────────────────────────────────────────────────
    api.hooks.onRouteDeleted((routeId) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onRouteDeleted | route: ${routeId} | storage: ${storage ? storage.saveName : 'null'}`);

        if (!storage) return;

        const currentDay = api.gameState.getCurrentDay();
        _setRouteStatus(routeId, 'deleted', currentDay, storage);

        delete lastTrainConfig[routeId];
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

/**
 * Detect train configuration changes.
 */
function _hasConfigChanged(config1, config2) {
    return config1.high   !== config2.high   ||
           config1.medium !== config2.medium ||
           config1.low    !== config2.low;
}
