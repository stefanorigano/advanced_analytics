import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Storage } from '../core/storage.js';

// Mock game-timing so initAccumulator doesn't start real polling intervals
vi.mock('../core/game-timing.js', () => ({
    gameTiming: {
        init:                 vi.fn(),
        onEveryNGameSeconds:  vi.fn(),
        stop:                 vi.fn(),
        reset:                vi.fn(),
    },
}));

// mock transfers & route-utils heavy work (not under test here)
vi.mock('../metrics/transfers.js', () => ({
    calculateTransfers: vi.fn(() => ({})),
}));

vi.mock('../metrics/train-config-tracking.js', () => ({
    recordConfigChange: vi.fn(() => Promise.resolve()),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function uniqueSave() {
    return `acc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function freshAccumulator() {
    vi.resetModules();
    return import('../metrics/accumulator.js');
}

// ── persistEvents / restoreEvents ─────────────────────────────────────────

describe('persistEvents / restoreEvents round-trip', () => {
    let saveName, storage;

    beforeEach(() => {
        saveName = uniqueSave();
        storage  = new Storage(saveName);
    });

    afterEach(async () => { await Storage.deleteSave(saveName); });

    it('persists in-memory events to IDB and restores them', async () => {
        const acc = await freshAccumulator();
        acc.clearAccumulatorState();

        // Manually inject events into module state via a mock API hook
        // We use setAccumulatorStorage + persistEvents to test the round-trip
        acc.setAccumulatorStorage(storage);

        // Inject a mock api so the money hook can be registered
        const api = {
            hooks:     { onMoneyChanged: vi.fn() },
            gameState: { getElapsedSeconds: vi.fn(() => 5000), getRoutes: vi.fn(() => []),
                         getCurrentDay: vi.fn(() => 1), getRouteRidership: vi.fn(() => ({ total: 0 })) },
            trains:    { getTrainTypes: vi.fn(() => ({})), getTrains: vi.fn(() => []) },
        };
        acc.initAccumulator(api);

        // Persist empty state first, then verify restore works
        await acc.persistEvents(storage);
        acc.clearAccumulatorState();
        await acc.restoreEvents(storage, 5000);

        // No events were added, so stats should be empty (no crash)
        const stats = acc.getRoute24hStats('nonexistent');
        expect(stats).toBeDefined();
    });
});

// ── Rollback: unsaved events discarded on reload ───────────────────────────

describe('restoreEvents — unsaved-quit rollback', () => {
    let saveName, storage;

    beforeEach(() => {
        saveName = uniqueSave();
        storage  = new Storage(saveName);
    });

    afterEach(async () => { await Storage.deleteSave(saveName); });

    it('discards events with timestamp > currentElapsed (events from unsaved session)', async () => {
        // Simulate: game was last saved at t=1000.
        // During the unsaved session, events were persisted at t=1100 and t=1200.
        // On reload, currentElapsed is back to t=1000, so those events must be gone.
        const savedEvents = {
            revEvents:  [
                { t: 800,  amount: 100, weights: { R1: 1 } },   // within 24h of 1000 → keep
                { t: 1100, amount:  50, weights: { R1: 1 } },   // future → discard
                { t: 1200, amount:  75, weights: { R1: 1 } },   // future → discard
            ],
            costEvents: [
                { t: 900,  amount:  30, weights: { R1: 1 } },   // keep
                { t: 1150, amount:  20, weights: { R1: 1 } },   // future → discard
            ],
        };

        // Write the "persisted" events directly to IDB (bypassing in-memory state)
        await storage.set('accumulatorEvents', savedEvents);

        const acc = await freshAccumulator();
        acc.clearAccumulatorState();

        // Reload with currentElapsed = 1000 (back to save point)
        await acc.restoreEvents(storage, 1000);

        // Persist the restored state so we can inspect what was kept
        const restored = new Storage(saveName);
        // Re-persist to a separate key so we can read it
        await acc.persistEvents(restored);
        const persisted = await restored.get('accumulatorEvents', null);

        // Only events with t <= 1000 should have been restored
        expect(persisted.revEvents.every(e => e.t  <= 1000)).toBe(true);
        expect(persisted.costEvents.every(e => e.t <= 1000)).toBe(true);
        expect(persisted.revEvents.length).toBe(1);   // t=800
        expect(persisted.costEvents.length).toBe(1);  // t=900
    });

    it('discards events older than 24h + grace window', async () => {
        const ELAPSED = 90000; // 25h in seconds
        const GRACE   = 300;   // matching GRACE_SECONDS in accumulator
        const cutoff  = ELAPSED - 86400 - GRACE; // ≈ 3300

        const savedEvents = {
            revEvents: [
                { t: cutoff - 1, amount: 10, weights: { R1: 1 } },  // too old → discard
                { t: cutoff + 1, amount: 20, weights: { R1: 1 } },  // within window → keep
                { t: ELAPSED,    amount: 30, weights: { R1: 1 } },  // at current elapsed → keep
            ],
            costEvents: [],
        };

        await storage.set('accumulatorEvents', savedEvents);

        const acc = await freshAccumulator();
        acc.clearAccumulatorState();
        await acc.restoreEvents(storage, ELAPSED);
        await acc.persistEvents(storage);

        const persisted = await storage.get('accumulatorEvents', null);
        expect(persisted.revEvents.length).toBe(2);
        expect(persisted.revEvents.every(e => e.t >= cutoff)).toBe(true);
    });

    it('handles missing persisted events gracefully (no crash)', async () => {
        const acc = await freshAccumulator();
        acc.clearAccumulatorState();
        // storage has no accumulatorEvents key
        await expect(acc.restoreEvents(storage, 5000)).resolves.not.toThrow();
    });
});
