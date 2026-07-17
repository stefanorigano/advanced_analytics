// Lifecycle hooks management module
// Sets up all game lifecycle hooks

import { CONFIG } from '../config.js';
import { Storage } from './storage.js';
import { captureHistoricalData, computeAdherenceSnapshot } from '../metrics/historical-data.js';
import {
    initAccumulator,
    stopAccumulating,
    clearAccumulatorState,
    persistEvents,
    restoreEvents,
    getRoute24hStats,
    setAccumulatorStorage,
    setConfigCacheSnapshot,
    getConfigCacheSnapshot,
    resetTimetableAccum,
} from '../metrics/accumulator.js';
import { captureInitialDayConfig, recordConfigChange, pruneConfigCache } from '../metrics/train-config-tracking.js';
import { initAlertsEngine, stopAlertsEngine } from '../ui/alerts/alerts-engine.js';
import { getPhaseForHour, readTierCounts } from '../utils/demand-tiers.js';

let storage = null;

// Global variable to track current save name
let currentSaveName = null;

// ── Demand phase helpers ───────────────────────────────────────────────────
// Demand phases are a fixed, hard-coded mapping of hour-of-day → tier
// (CONFIG.DEMAND_PHASES). They are no longer derived from the game's commute
// timing API, so the mod's 4 train-schedule tiers (High/Medium/Low/Very Low)
// always line up with the same authoritative hour boundaries.

export function getCurrentPhaseName() {
    const elapsed     = window.SubwayBuilderAPI.gameState.getElapsedSeconds();
    const currentHour = Math.floor((elapsed % 86400) / 3600);
    return getPhaseForHour(currentHour)?.name ?? null;
}

/**
 * Fallback handler for subsequent loads where onGameLoaded does not fire.
 *
 * API bug: after the first session load, onGameLoaded and onGameInit are never
 * triggered again. onMapReady is the only reliable hook on subsequent loads.
 *
 * @param {Object} api - SubwayBuilderAPI instance
 */
export async function handleMapReadyFallback(api) {
    const apiName      = api.gameState.getSaveName?.();
    const resolvedName = apiName || `session_${Date.now()}`;
    const source       = apiName ? 'getSaveName()' : 'temp ID';

    storage = _initStorage(resolvedName);

    const matchingKey = await _findMatchingSave(resolvedName, api);

    if (matchingKey) {
        storage.setSaveName(matchingKey);
        currentSaveName = matchingKey;
    } else {
        currentSaveName = resolvedName;
    }

    await storage.restore();
    await _runMigrations(currentSaveName, storage);

    // Prune historical entries that belong to days in the future
    // (can appear when a save file is rewound to an earlier day)
    await _pruneFutureHistoricalData(storage, api);

    // Accumulator: clear stale in-memory state, restore persisted events, restart
    clearAccumulatorState();
    await restoreEvents(storage, api.gameState.getElapsedSeconds());
    initAccumulator(api);
    setAccumulatorStorage(storage);
    const configCache = await storage.get('configCache', {});
    setConfigCacheSnapshot(configCache);

    initAlertsEngine(api, storage);
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
            // Use strict greater-than: getCurrentDay() returns the current UI day
            // (fixed in game v1.3.0 — it now advances before the onDayChange callback
            // runs). The last completed snapshot key equals getCurrentDay()-1, so
            // the condition > currentDay correctly keeps all completed snapshots and
            // prunes only genuine future-day data that can appear after a save-rewind.
            if (parseInt(day) > currentDay) {
                delete historicalData.days[day];
                pruned = true;
            }
        }

        if (pruned) {
            await storage.set('historicalData', historicalData);
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

    // ── onGameInit ──────────────────────────────────────────────────────────
    api.hooks.onGameInit(() => {
        // New game: no persisted events to restore
        clearAccumulatorState();
        initAccumulator(api);
    });

    // ── onGameLoaded ────────────────────────────────────────────────────────
    api.hooks.onGameLoaded(async (saveName) => {

        storage = _initStorage(saveName);

        const matchingKey = await _findMatchingSave(saveName, api);

        if (matchingKey) {
            storage.setSaveName(matchingKey);
            currentSaveName = matchingKey;
        } else {
            currentSaveName = saveName;
        }

        await storage.restore();
        await _runMigrations(currentSaveName, storage);

        // Prune stale future-day historical data
        await _pruneFutureHistoricalData(storage, api);

        // Accumulator: discard stale data, restore from IDB, restart
        clearAccumulatorState();
        await restoreEvents(storage, api.gameState.getElapsedSeconds());
        initAccumulator(api);
        setAccumulatorStorage(storage);
        const configCache = await storage.get('configCache', {});
        setConfigCacheSnapshot(configCache);

        initAlertsEngine(api, storage);

    });

    // ── onGameSaved ─────────────────────────────────────────────────────────
    api.hooks.onGameSaved(async (saveName) => {

        if (!storage) {
            storage = _initStorage(saveName);
        }

        const oldSaveName = storage.saveName;

        // Migrate keys if the save was previously stored under a temp/different name
        if (oldSaveName && oldSaveName !== saveName) {
            const isTempId = /\d{13}/.test(oldSaveName);

            await Storage.migrateKeys(oldSaveName, saveName, isTempId);
            await Storage.renameSave(oldSaveName, saveName);
        }

        storage.setSaveName(saveName);
        currentSaveName = saveName;

        await storage.backup(api);
        await persistEvents(storage);
    });

    // ── onGameEnd ───────────────────────────────────────────────────────────
    api.hooks.onGameEnd((result) => {
        storage         = null;
        currentSaveName = null;

        stopAccumulating();
        stopAlertsEngine();
    });

    // ── onDayChange ─────────────────────────────────────────────────────────
    api.hooks.onDayChange(async (dayThatEnded) => {

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

        // Snapshot timetable adherence before the per-day accumulators are cleared
        const adherenceSnapshot = computeAdherenceSnapshot(api);

        // Reset per-day timetable accumulation (delay/dwell charts)
        resetTimetableAccum();

        // Save historical snapshot for the day that ended (include config cache for scheduleChangedAt)
        await captureHistoricalData(dayThatEnded, api, storage, routeStatsMap, getConfigCacheSnapshot(), adherenceSnapshot);

        // Capture baseline config at midnight for the new day
        const newDay = dayThatEnded + 1;
        await captureInitialDayConfig(newDay, api, storage);
        await pruneConfigCache(30, storage);
        const updatedConfigCache = await storage.get('configCache', {});
        setConfigCacheSnapshot(updatedConfigCache);

        // Transition 'new' routes to 'ongoing' status
        await _transitionNewRoutesToOngoing(storage);
    });

    // ── onRouteCreated ──────────────────────────────────────────────────────
    api.hooks.onRouteCreated((route) => {
        if (!storage) return;

        const currentDay   = api.gameState.getCurrentDay();
        const creationTime = api.gameState.getElapsedSeconds();
        _setRouteStatus(route.id, 'new', currentDay, storage, creationTime);

        // Record the initial schedule config for this new route so weighted capacity works
        const elapsed = creationTime;
        const hour    = Math.floor((elapsed % 86400) / 3600);
        const minute  = Math.floor((elapsed % 3600) / 60);
        recordConfigChange(route.id, hour, minute,
            readTierCounts(route.trainSchedule),
            api, storage
        ).then(() => storage.get('configCache', {}).then(setConfigCacheSnapshot))
         .catch(e => console.warn(`${CONFIG.LOG_PREFIX} [LC] initial config record failed`, e));
    });

    // ── onRouteDeleted ──────────────────────────────────────────────────────
    api.hooks.onRouteDeleted((routeId) => {
        if (!storage) return;

        const currentDay = api.gameState.getCurrentDay();
        _setRouteStatus(routeId, 'deleted', currentDay, storage);
    });
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
 * Compare two semver strings (major.minor.patch).
 * Returns -1 if a < b, 0 if equal, +1 if a > b.
 */
function _compareVersions(a, b) {
    const pa = (a || '0.0.0').split('.').map(Number);
    const pb = (b || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const na = pa[i] || 0, nb = pb[i] || 0;
        if (na < nb) return -1;
        if (na > nb) return  1;
    }
    return 0;
}

/**
 * Run data migrations for a save that was last written by an older mod version.
 *
 * Called once after restore() on every game load, before any other processing.
 * Read the stored modVersion from metadata, compare to __MOD_VERSION__, and
 * apply any necessary transformations to persisted data.
 *
 * Pattern for future migrations:
 *   if (!storedVersion || _compareVersions(storedVersion, '2.0.0') < 0) {
 *       await _migrateToV2(storageInstance);
 *   }
 *
 * @param {string} saveName
 * @param {Object} storageInstance
 */
async function _runMigrations(saveName, storageInstance) {
    try {
        const saves         = await Storage.getAllSaves();
        const storedVersion = saves[saveName]?.modVersion ?? null;

        if (storedVersion === __MOD_VERSION__) return;  // nothing to do

        // ── v1.2.8: clear stale loadFactor from historical snapshots ─────────
        // Versions before 1.2.8 may have captured historical loadFactor values
        // using a ×2 multiplier that was briefly and incorrectly applied to
        // pendulum routes. The correct values cannot be recalculated from stored
        // data, so we zero them out — showing a gap is less misleading than
        // showing 2× inflated figures in the Historical Trends chart.
        if (!storedVersion || _compareVersions(storedVersion, '1.2.8') < 0) {
            await _migrateLoadFactorV1_2_8(storageInstance);
        }
        // ────────────────────────────────────────────────────────────────────

        // ── v1.4.5: shift day-indexed data from elapsed-day (0-based) to ────
        // UI-day (1-based) now that getCurrentDay() is fixed in game v1.3.0.
        // Affects: configCache keys, routeStatuses.createdDay/deletedDay,
        // and the meta::saves.day field used by _findMatchingSave.
        // historicalData.days keys are unchanged (always onDayChange arg).
        if (!storedVersion || _compareVersions(storedVersion, '1.4.5') < 0) {
            await _migrateV130(storageInstance);
        }
        // ────────────────────────────────────────────────────────────────────

        // ── v1.5.2: remove orphaned dashboardMap namespace from uiPreferences ─
        if (!storedVersion || _compareVersions(storedVersion, '1.5.2') < 0) {
            await _migrateV152(storageInstance);
        }
        // ────────────────────────────────────────────────────────────────────

        console.log(`${CONFIG.LOG_PREFIX} [Migration] ${storedVersion ?? 'pre-versioning'} → ${__MOD_VERSION__}`);
    } catch (e) {
        console.error(`${CONFIG.LOG_PREFIX} [Migration] Failed:`, e);
    }
}

/**
 * v1.2.8 migration: zero out loadFactor fields in all historical snapshots.
 * Cannot recalculate — just clear so the trends chart shows a gap instead of
 * potentially 2× inflated values from the brief ×2 era in v1.2.7.
 */
async function _migrateLoadFactorV1_2_8(storageInstance) {
    const historicalData = await storageInstance.get('historicalData', { days: {} });
    let changed = false;

    for (const daySnapshot of Object.values(historicalData.days)) {
        if (!Array.isArray(daySnapshot.routes)) continue;
        for (const route of daySnapshot.routes) {
            if (route.loadFactor || route.loadFactorHigh || route.loadFactorMedium || route.loadFactorLow) {
                route.loadFactor       = 0;
                route.loadFactorHigh   = 0;
                route.loadFactorMedium = 0;
                route.loadFactorLow    = 0;
                changed = true;
            }
        }
    }

    if (changed) {
        await storageInstance.set('historicalData', historicalData);
        console.log(`${CONFIG.LOG_PREFIX} [Migration v1.2.8] Cleared stale loadFactor values from historical snapshots.`);
    }
}

/**
 * v1.4.5 migration: shift day-indexed IDB data from elapsed-day (0-based) to
 * UI-day (1-based) after game v1.3.0 fixed getCurrentDay().
 *
 * Three stores are affected:
 *   configCache        — shift all top-level integer keys by +1
 *   routeStatuses      — increment createdDay and deletedDay by +1
 *   meta::saves.day    — increment by +1 (via Storage.patchAllSavesMeta)
 *
 * historicalData.days keys are NOT migrated — they were always the raw
 * onDayChange arg, whose numeric value has not changed.
 */
async function _migrateV130(storageInstance) {
    try {
        // a) configCache keys
        const configCache = await storageInstance.get('configCache', {});
        const shiftedCache = {};
        for (const [key, val] of Object.entries(configCache)) {
            shiftedCache[parseInt(key, 10) + 1] = val;
        }
        await storageInstance.set('configCache', shiftedCache);

        // b) routeStatuses createdDay / deletedDay
        const statuses = await storageInstance.get('routeStatuses', {});
        for (const s of Object.values(statuses)) {
            if (s.createdDay != null) s.createdDay += 1;
            if (s.deletedDay  != null) s.deletedDay  += 1;
        }
        await storageInstance.set('routeStatuses', statuses);

        // c) meta::saves.day (global, not per-save)
        await Storage.patchAllSavesMeta(meta => {
            for (const entry of Object.values(meta)) {
                if (entry.day != null) entry.day += 1;
            }
        });

        console.log(`${CONFIG.LOG_PREFIX} [Migration v1.4.5] Shifted day-indexed data to UI-day (getCurrentDay fix).`);
    } catch (e) {
        console.error(`${CONFIG.LOG_PREFIX} [Migration v1.4.5] Failed:`, e);
    }
}

/**
 * v1.5.2 migration: remove orphaned dashboardMap namespace from uiPreferences.
 * DashboardMap was removed in v1.5.2; its stored prefs are no longer needed.
 */
async function _migrateV152(storageInstance) {
    const all = await storageInstance.get('uiPreferences', {});
    if (!all.dashboardMap) return;
    delete all.dashboardMap;
    await storageInstance.set('uiPreferences', all);
    console.log(`${CONFIG.LOG_PREFIX} [Migration v1.5.2] Removed dashboardMap preferences.`);
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
