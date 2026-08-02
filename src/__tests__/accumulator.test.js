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

// ── _tick() — deposit-bound train filtering ────────────────────────────────

describe('_tick() — deposit-bound train filtering', () => {
    let acc;

    beforeEach(async () => {
        vi.useFakeTimers();
        acc = await freshAccumulator();
        acc.clearAccumulatorState();
    });

    afterEach(() => {
        acc?.stopAccumulating();
        vi.useRealTimers();
    });

    // Build a minimal train. futureCycleArrivalTimes is attached to stop0 only
    // when explicitly provided so we can distinguish "absent" from "= []".
    function makeTrain(id, routeId, { futureCycleArrivalTimes, arrivalTime = 1000, departureTime = 1020 } = {}) {
        const stop = {
            stNodeId:                    'N1',
            stNodeIndex:                 0,
            arrivalTime,
            departureTime,
            adjustedExpectedArrivalTime: 1000,
            expectedArrivalTime:         1000,
            expectedDepartureTime:       1020,
        };
        if (futureCycleArrivalTimes !== undefined) {
            stop.futureCycleArrivalTimes = futureCycleArrivalTimes;
        }
        return { id, routeId, timings: [stop] };
    }

    function makeApi(getTrainsFn) {
        return {
            hooks:     { onMoneyChanged: vi.fn() },
            gameState: {
                isPaused:          vi.fn(() => false),
                getElapsedSeconds: vi.fn(() => 5000),
                getRoutes:         vi.fn(() => []),
                getLineMetrics:    vi.fn(() => []),
                getCurrentDay:     vi.fn(() => 1),
                getTrains:         getTrainsFn,
            },
            trains: { getTrainTypes: vi.fn(() => ({})) },
        };
    }

    it('does NOT accumulate stops for a deposit-bound train (futureCycleArrivalTimes = [])', async () => {
        const train = makeTrain('T1', 'R1', { futureCycleArrivalTimes: [] });
        const api   = makeApi(vi.fn(() => [train]));
        acc.initAccumulator(api);
        vi.advanceTimersByTime(500);
        expect(acc.getTimetableAccum('R1')).toBeNull();
    });

    it('DOES accumulate for a train with futureCycleArrivalTimes absent (field not exposed)', async () => {
        const train = makeTrain('T1', 'R1'); // no futureCycleArrivalTimes key
        const api   = makeApi(vi.fn(() => [train]));
        acc.initAccumulator(api);
        vi.advanceTimersByTime(500);
        expect(acc.getTimetableAccum('R1')?.['N1']?.fwd.count).toBe(1);
    });

    it('DOES accumulate for a train with futureCycleArrivalTimes = [2000, 3000] (cycling train)', async () => {
        const train = makeTrain('T1', 'R1', { futureCycleArrivalTimes: [2000, 3000] });
        const api   = makeApi(vi.fn(() => [train]));
        acc.initAccumulator(api);
        vi.advanceTimersByTime(500);
        expect(acc.getTimetableAccum('R1')?.['N1']?.fwd.count).toBe(1);
    });

    it('prunes _lastSeenArrival when a train leaves getTrains(); reused ID accumulates again', async () => {
        const getTrains = vi.fn();
        const api       = makeApi(getTrains);

        // Tick 1: T1 live with arrivalTime=1000 → accumulated, count=1.
        const trainV1 = makeTrain('T1', 'R1');
        getTrains.mockReturnValueOnce([trainV1]);
        acc.initAccumulator(api);
        vi.advanceTimersByTime(500);
        expect(acc.getTimetableAccum('R1')?.['N1']?.fwd.count).toBe(1);

        // Tick 2: T1 gone (went to deposit) → _lastSeenArrival['T1'] pruned.
        getTrains.mockReturnValueOnce([]);
        vi.advanceTimersByTime(500);

        // Tick 3: T1 reappears (ID reuse) with NEW arrivalTime=9999.
        // Without cleanup the stale entry would suppress this, leaving count at 1.
        const trainV2 = makeTrain('T1', 'R1', { arrivalTime: 9999, departureTime: 10010 });
        getTrains.mockReturnValueOnce([trainV2]);
        vi.advanceTimersByTime(500);
        expect(acc.getTimetableAccum('R1')?.['N1']?.fwd.count).toBe(2);
    });
});

// ── isIgnorableRevenueEvent() — pure predicate ─────────────────────────────

describe('isIgnorableRevenueEvent()', () => {
    it('ignores mod-driven balance adjustments regardless of amount', async () => {
        const acc = await freshAccumulator();
        expect(acc.isIgnorableRevenueEvent('mod-setMoney', 5000)).toBe(true);
        expect(acc.isIgnorableRevenueEvent('mod-setMoney', 100_000_000)).toBe(true);
    });

    it('ignores bond issuances mislabeled as "general" revenue', async () => {
        const acc = await freshAccumulator();
        expect(acc.isIgnorableRevenueEvent('general', 100_000_000)).toBe(true);
        expect(acc.isIgnorableRevenueEvent('general', 500_000_000)).toBe(true);
        expect(acc.isIgnorableRevenueEvent('general', 1_000_000_000)).toBe(true);
    });

    it('does NOT ignore ordinary fare revenue under "general"', async () => {
        const acc = await freshAccumulator();
        expect(acc.isIgnorableRevenueEvent('general', 5000)).toBe(false);
        expect(acc.isIgnorableRevenueEvent('general', 99_999_999)).toBe(false);
    });
});

// ── _registerMoneyHook() — end-to-end wiring ───────────────────────────────
// Guards the actual onMoneyChanged callback, not just the predicate above —
// confirms ignored events never reach _revEvents / getRoute24hStats().

describe('_registerMoneyHook() — revenue event filtering', () => {
    let acc;

    beforeEach(async () => {
        vi.useFakeTimers();
        acc = await freshAccumulator();
        acc.clearAccumulatorState();
    });

    afterEach(() => {
        acc?.stopAccumulating();
        vi.useRealTimers();
    });

    function makeApi(onMoneyChanged) {
        return {
            hooks: { onMoneyChanged },
            gameState: {
                isPaused:          vi.fn(() => false),
                getElapsedSeconds: vi.fn(() => 5000),
                getRoutes:         vi.fn(() => []),
                getLineMetrics:    vi.fn(() => [{ routeId: 'R1', revenuePerHour: 1000 }]),
                getCurrentDay:     vi.fn(() => 1),
                getRouteRidership: vi.fn(() => ({ total: 0 })),
                getTrains:         vi.fn(() => []),
            },
            trains: { getTrainTypes: vi.fn(() => ({})) },
        };
    }

    it('does not attribute mod-setMoney adjustments to any route', () => {
        const onMoneyChanged = vi.fn();
        acc.initAccumulator(makeApi(onMoneyChanged));
        vi.advanceTimersByTime(500); // populate _lastRevWeights for R1

        const hook = onMoneyChanged.mock.calls[0][0];
        hook(1_250_000, 250_000, 'revenue', 'mod-setMoney');

        expect(acc.getRoute24hStats('R1').dailyRevenue).toBe(0);
    });

    it.each([100_000_000, 500_000_000, 1_000_000_000])(
        'does not attribute a bond issuance of exactly $%i to any route',
        (amount) => {
            const onMoneyChanged = vi.fn();
            acc.initAccumulator(makeApi(onMoneyChanged));
            vi.advanceTimersByTime(500);

            const hook = onMoneyChanged.mock.calls[0][0];
            hook(amount + 5000, amount, 'revenue', 'general');

            expect(acc.getRoute24hStats('R1').dailyRevenue).toBe(0);
        }
    );

    it('still attributes ordinary fare revenue under category "general"', () => {
        const onMoneyChanged = vi.fn();
        acc.initAccumulator(makeApi(onMoneyChanged));
        vi.advanceTimersByTime(500);

        const hook = onMoneyChanged.mock.calls[0][0];
        hook(1_005_000, 5000, 'revenue', 'general');

        expect(acc.getRoute24hStats('R1').dailyRevenue).toBe(5000);
    });
});
