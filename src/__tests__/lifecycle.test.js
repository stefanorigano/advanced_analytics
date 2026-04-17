import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage } from '../core/storage.js';
import { createMockApi } from './helpers/mockApi.js';

// Mock heavy side-effect modules so lifecycle tests stay focused on state logic
vi.mock('../metrics/accumulator.js', () => ({
    initAccumulator:       vi.fn(),
    stopAccumulating:      vi.fn(),
    clearAccumulatorState: vi.fn(),
    persistEvents:         vi.fn(() => Promise.resolve()),
    restoreEvents:         vi.fn(() => Promise.resolve()),
    setAccumulatorStorage: vi.fn(),
    setConfigCacheSnapshot:vi.fn(),
    getConfigCacheSnapshot:vi.fn(() => ({})),
    resetTimetableAccum:   vi.fn(),
    getRoute24hStats:      vi.fn(() => ({})),
}));

vi.mock('../metrics/historical-data.js', () => ({
    captureHistoricalData: vi.fn(() => Promise.resolve()),
}));

vi.mock('../metrics/train-config-tracking.js', () => ({
    captureInitialDayConfig: vi.fn(() => Promise.resolve()),
    recordConfigChange:      vi.fn(() => Promise.resolve()),
    pruneConfigCache:        vi.fn(() => Promise.resolve()),
}));

vi.mock('../core/game-timing.js', () => ({
    gameTiming: { init: vi.fn(), onEveryNGameSeconds: vi.fn(), stop: vi.fn(), reset: vi.fn() },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function uniqueSave() {
    return `lc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// onRouteCreated / onRouteDeleted fire async writes without returning a promise.
// Wait for pending microtasks + I/O callbacks to settle.
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

async function freshLifecycle() {
    vi.resetModules();
    return import('../core/lifecycle.js');
}

// ── Route status transitions ───────────────────────────────────────────────

describe('route status lifecycle', () => {
    let lifecycle, api, saveName;

    beforeEach(async () => {
        saveName = uniqueSave();
        lifecycle = await freshLifecycle();
        api = createMockApi({
            gameState: {
                getSaveName:       vi.fn(() => saveName),
                getRoutes:         vi.fn(() => []),
                getStations:       vi.fn(() => []),
                getCurrentDay:     vi.fn(() => 1),
                getElapsedSeconds: vi.fn(() => 0),
                getRouteRidership: vi.fn(() => ({ total: 0 })),
            },
        });
        lifecycle.initLifecycleHooks(api);
        await api._trigger('onGameLoaded', saveName);
    });

    afterEach(async () => { await Storage.deleteSave(saveName); });

    it('onRouteCreated sets route status to "new"', async () => {
        api.gameState.getCurrentDay.mockReturnValue(2);
        api.gameState.getElapsedSeconds.mockReturnValue(7200);
        await api._trigger('onRouteCreated', { id: 'R1', trainSchedule: {} });
        await flushPromises();

        const storage = lifecycle.getStorage();
        const statuses = await storage.get('routeStatuses', {});
        expect(statuses['R1'].status).toBe('new');
        expect(statuses['R1'].createdDay).toBe(2);
    });

    it('onDayChange transitions "new" routes to "ongoing"', async () => {
        api.gameState.getCurrentDay.mockReturnValue(1);
        api.gameState.getElapsedSeconds.mockReturnValue(0);
        await api._trigger('onRouteCreated', { id: 'R1', trainSchedule: {} });
        await flushPromises();

        await api._trigger('onDayChange', 1);

        const storage = lifecycle.getStorage();
        const statuses = await storage.get('routeStatuses', {});
        expect(statuses['R1'].status).toBe('ongoing');
    });

    it('onRouteDeleted marks route as "deleted" with correct day', async () => {
        api.gameState.getCurrentDay.mockReturnValue(1);
        api.gameState.getElapsedSeconds.mockReturnValue(0);
        await api._trigger('onRouteCreated', { id: 'R1', trainSchedule: {} });
        await flushPromises();
        await api._trigger('onDayChange', 1);

        api.gameState.getCurrentDay.mockReturnValue(3);
        await api._trigger('onRouteDeleted', 'R1');
        await flushPromises();

        const storage = lifecycle.getStorage();
        const statuses = await storage.get('routeStatuses', {});
        expect(statuses['R1'].status).toBe('deleted');
        expect(statuses['R1'].deletedDay).toBe(3);
    });
});

// ── Migrations ─────────────────────────────────────────────────────────────

describe('data migrations', () => {
    let lifecycle, api, saveName;

    beforeEach(async () => {
        saveName = uniqueSave();
        lifecycle = await freshLifecycle();
    });

    afterEach(async () => { await Storage.deleteSave(saveName); });

    it('v1.2.8: clears non-zero loadFactor fields from historical snapshots', async () => {
        // Seed IDB with old data that has a corrupted loadFactor
        const s = new Storage(saveName);
        await s.set('historicalData', {
            days: {
                1: { routes: [{ id: 'R1', loadFactor: 1.8, loadFactorHigh: 2.0 }] },
            },
        });
        // Write metadata indicating a pre-1.2.8 version
        await Storage.importSave(saveName, {}, {
            cityCode: 'NYC', routeCount: 1, day: 1, stationCount: 2,
            modVersion: '1.2.7',
        });

        api = createMockApi({
            gameState: {
                getSaveName: vi.fn(() => saveName),
                getRoutes:   vi.fn(() => [{ id: 'R1' }]),
                getStations: vi.fn(() => []),
                getCurrentDay:     vi.fn(() => 1),
                getElapsedSeconds: vi.fn(() => 0),
                getRouteRidership: vi.fn(() => ({ total: 0 })),
            },
        });
        lifecycle.initLifecycleHooks(api);
        await api._trigger('onGameLoaded', saveName);

        const storage = lifecycle.getStorage();
        const historical = await storage.get('historicalData', { days: {} });
        const route = historical.days[1].routes[0];
        expect(route.loadFactor).toBe(0);
        expect(route.loadFactorHigh).toBe(0);
    });

    it('v1.4.5: shifts configCache keys and routeStatus days by +1', async () => {
        // Seed IDB with 0-based day data (pre-1.4.5)
        const s = new Storage(saveName);
        await s.set('configCache', {
            0: [{ routeId: 'R1', high: 3 }],
            1: [{ routeId: 'R1', high: 3 }],
        });
        await s.set('routeStatuses', {
            R1: { status: 'ongoing', createdDay: 0, deletedDay: null },
        });
        await Storage.importSave(saveName, {}, {
            cityCode: 'NYC', routeCount: 1, day: 0, stationCount: 2,
            modVersion: '1.4.4',
        });

        api = createMockApi({
            gameState: {
                getSaveName:       vi.fn(() => saveName),
                getRoutes:         vi.fn(() => [{ id: 'R1' }]),
                getStations:       vi.fn(() => []),
                getCurrentDay:     vi.fn(() => 1),
                getElapsedSeconds: vi.fn(() => 0),
                getRouteRidership: vi.fn(() => ({ total: 0 })),
            },
        });
        lifecycle.initLifecycleHooks(api);
        await api._trigger('onGameLoaded', saveName);

        const storage = lifecycle.getStorage();

        const configCache = await storage.get('configCache', {});
        expect(configCache[1]).toBeDefined();  // was key 0, now 1
        expect(configCache[2]).toBeDefined();  // was key 1, now 2
        expect(configCache[0]).toBeUndefined();

        const statuses = await storage.get('routeStatuses', {});
        expect(statuses['R1'].createdDay).toBe(1);  // was 0, now 1
    });
});

// ── Unsaved-quit rollback (end-to-end) ────────────────────────────────────

describe('unsaved-quit rollback (end-to-end lifecycle)', () => {
    it('reloading after quit without save restores last committed state', async () => {
        const saveName = uniqueSave();

        // ── Session 1: load, play, save ──────────────────────────────────
        let lifecycle = await freshLifecycle();
        let api = createMockApi({
            gameState: {
                getSaveName:       vi.fn(() => saveName),
                getRoutes:         vi.fn(() => []),
                getStations:       vi.fn(() => []),
                getCurrentDay:     vi.fn(() => 1),
                getElapsedSeconds: vi.fn(() => 0),
                getRouteRidership: vi.fn(() => ({ total: 0 })),
            },
        });
        lifecycle.initLifecycleHooks(api);
        await api._trigger('onGameLoaded', saveName);

        // Route created, then game saved
        api.gameState.getCurrentDay.mockReturnValue(1);
        api.gameState.getElapsedSeconds.mockReturnValue(100);
        await api._trigger('onRouteCreated', { id: 'R1', trainSchedule: {} });
        await flushPromises();
        await api._trigger('onGameSaved', saveName);

        // ── Session 1 continues: create another route, then quit without saving ──
        api.gameState.getCurrentDay.mockReturnValue(2);
        await api._trigger('onRouteCreated', { id: 'R2', trainSchedule: {} });
        await flushPromises();

        // Verify R2 is in working state
        let statuses = await lifecycle.getStorage().get('routeStatuses', {});
        expect(statuses['R2']).toBeDefined();

        // User quits (onGameEnd)
        await api._trigger('onGameEnd', {});

        // ── Session 2: reload the same save ─────────────────────────────
        lifecycle = await freshLifecycle();
        api = createMockApi({
            gameState: {
                getSaveName:       vi.fn(() => saveName),
                getRoutes:         vi.fn(() => []),
                getStations:       vi.fn(() => []),
                getCurrentDay:     vi.fn(() => 1),
                getElapsedSeconds: vi.fn(() => 0),
                getRouteRidership: vi.fn(() => ({ total: 0 })),
            },
        });
        lifecycle.initLifecycleHooks(api);
        await api._trigger('onGameLoaded', saveName);

        statuses = await lifecycle.getStorage().get('routeStatuses', {});
        expect(statuses['R1']).toBeDefined();   // survived — it was saved
        expect(statuses['R2']).toBeUndefined(); // discarded — not saved before quit

        await Storage.deleteSave(saveName);
    });
});
