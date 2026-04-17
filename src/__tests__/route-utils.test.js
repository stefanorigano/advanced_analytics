import { describe, it, expect } from 'vitest';
import {
    getRouteStationsInOrder,
    isCircularRoute,
    computeSegmentLoads,
} from '../utils/route-utils.js';

// ── Test data helpers ──────────────────────────────────────────────────────

function makeStations(...ids) {
    return ids.map(id => ({ id, name: id, stNodeIds: [`n${id}`] }));
}

function makeTiming(stNodeId, arrival = 0, departure = 0, stNodeIndex = 0) {
    return { stNodeId, arrivalTime: arrival, departureTime: departure, stNodeIndex };
}

function makeCommute(routeId, boardId, alightId, journeyEnd, journeyStart = 0, size = 1) {
    return {
        journeyEnd,
        journeyStart,
        size,
        stationRoutes: [{ routeId, stationIds: [boardId, alightId] }],
    };
}

const PHASES = [
    { type: 'low',    startHour: 0,  endHour: 5  },
    { type: 'medium', startHour: 5,  endHour: 6  },
    { type: 'high',   startHour: 6,  endHour: 9  },
    { type: 'medium', startHour: 9,  endHour: 16 },
    { type: 'high',   startHour: 16, endHour: 19 },
    { type: 'medium', startHour: 19, endHour: 20 },
    { type: 'low',    startHour: 20, endHour: 24 },
];

// ── isCircularRoute ────────────────────────────────────────────────────────

describe('isCircularRoute', () => {
    it('returns true for A→B→C→A (circular loop)', () => {
        const stations = makeStations('A', 'B', 'C');
        const route = {
            stComboTimings: [
                makeTiming('nA'), makeTiming('nB'), makeTiming('nC'), makeTiming('nA'),
            ],
        };
        expect(isCircularRoute(route, stations)).toBe(true);
    });

    it('returns false for A→B→C→B→A (pendulum, intermediate repeat)', () => {
        const stations = makeStations('A', 'B', 'C');
        const route = {
            stComboTimings: [
                makeTiming('nA'), makeTiming('nB'), makeTiming('nC'),
                makeTiming('nB'), makeTiming('nA'),
            ],
        };
        expect(isCircularRoute(route, stations)).toBe(false);
    });

    it('returns false when loop does not close (first ≠ last)', () => {
        const stations = makeStations('A', 'B', 'C', 'D');
        const route = {
            stComboTimings: [
                makeTiming('nA'), makeTiming('nB'), makeTiming('nC'), makeTiming('nD'),
            ],
        };
        expect(isCircularRoute(route, stations)).toBe(false);
    });

    it('returns false for fewer than 4 timings', () => {
        const stations = makeStations('A', 'B');
        const route = { stComboTimings: [makeTiming('nA'), makeTiming('nB'), makeTiming('nA')] };
        expect(isCircularRoute(route, stations)).toBe(false);
    });

    it('returns false for empty stComboTimings', () => {
        expect(isCircularRoute({ stComboTimings: [] }, [])).toBe(false);
    });
});

// ── getRouteStationsInOrder ────────────────────────────────────────────────

describe('getRouteStationsInOrder', () => {
    it('deduplicates return-leg stations (pendulum A→B→C→B→A returns [A,B,C])', () => {
        const stations = makeStations('A', 'B', 'C');
        const route = {
            id: 'R1',
            stComboTimings: [
                makeTiming('nA', 0, 0, 0),
                makeTiming('nB', 60, 65, 1),
                makeTiming('nC', 120, 125, 2),
                makeTiming('nB', 180, 185, 3),
                makeTiming('nA', 240, 0, 4),
            ],
        };
        const mockApi = {
            gameState: {
                getRoutes:   () => [route],
                getStations: () => stations,
            },
        };
        const result = getRouteStationsInOrder('R1', mockApi);
        expect(result.map(s => s.id)).toEqual(['A', 'B', 'C']);
    });

    it('returns [] for an unknown routeId', () => {
        const mockApi = {
            gameState: { getRoutes: () => [], getStations: () => [] },
        };
        expect(getRouteStationsInOrder('nonexistent', mockApi)).toEqual([]);
    });

    it('returns [] when stComboTimings is empty', () => {
        const route = { id: 'R1', stComboTimings: [] };
        const mockApi = {
            gameState: { getRoutes: () => [route], getStations: () => [] },
        };
        expect(getRouteStationsInOrder('R1', mockApi)).toEqual([]);
    });

    it('includes arrivalTime and departureTime on each result entry', () => {
        const stations = makeStations('A', 'B');
        const route = {
            id: 'R1',
            stComboTimings: [
                makeTiming('nA', 10, 20, 0),
                makeTiming('nB', 80, 90, 1),
            ],
        };
        const mockApi = {
            gameState: { getRoutes: () => [route], getStations: () => stations },
        };
        const result = getRouteStationsInOrder('R1', mockApi);
        expect(result[0]).toMatchObject({ id: 'A', arrivalTime: 10, departureTime: 20 });
        expect(result[1]).toMatchObject({ id: 'B', arrivalTime: 80, departureTime: 90 });
    });
});

// ── computeSegmentLoads ────────────────────────────────────────────────────

describe('computeSegmentLoads', () => {
    it('returns all-zero result for empty commutes', () => {
        expect(computeSegmentLoads('R', ['A', 'B', 'C'], [], false, 0, PHASES))
            .toEqual({ overall: 0, high: 0, medium: 0, low: 0 });
    });

    it('returns all-zero result for empty station list', () => {
        const c = makeCommute('R', 'A', 'C', 200);
        expect(computeSegmentLoads('R', [], [c], false, 0, PHASES))
            .toEqual({ overall: 0, high: 0, medium: 0, low: 0 });
    });

    it('excludes commutes with journeyEnd at or before cutoff', () => {
        const excluded = makeCommute('R', 'A', 'B', 100);
        const included = makeCommute('R', 'A', 'B', 200);
        const result = computeSegmentLoads('R', ['A', 'B', 'C'], [excluded, included], false, 100, PHASES);
        expect(result.overall).toBe(1);
    });

    it('pendulum: forward and reverse commutes produce correct peak without cancellation', () => {
        // A-B-C pendulum: one forward (A→C) and one reverse (C→A)
        const fwd = makeCommute('R', 'A', 'C', 200);
        const rev = makeCommute('R', 'C', 'A', 300);
        const result = computeSegmentLoads('R', ['A', 'B', 'C'], [fwd, rev], false, 0, PHASES);
        // Each direction contributes a peak of 1; no cancellation between them
        expect(result.overall).toBe(1);
    });

    it('circular: wrap-around commute (D→B on A-B-C-D) accumulates correct segments', () => {
        // Stations: A(0) B(1) C(2) D(3). Commute boards at D, alights at B.
        // bi=3 > ai=1 → wrap-around: segment D→A and A→B each get +1
        const c = makeCommute('R', 'D', 'B', 200);
        const result = computeSegmentLoads('R', ['A', 'B', 'C', 'D'], [c], true, 0, PHASES);
        expect(result.overall).toBe(1);
    });

    it('attributes commute to correct demand phase based on journeyStart hour', () => {
        // journeyStart at hour 7 (7*3600=25200) → high-demand phase
        const c = { ...makeCommute('R', 'A', 'B', 500), journeyStart: 25200 };
        const result = computeSegmentLoads('R', ['A', 'B'], [c], false, 0, PHASES);
        expect(result.high).toBe(1);
        expect(result.medium).toBe(0);
        expect(result.low).toBe(0);
    });

    it('respects commute size > 1', () => {
        const c = makeCommute('R', 'A', 'C', 200, 0, 3);
        const result = computeSegmentLoads('R', ['A', 'B', 'C'], [c], false, 0, PHASES);
        expect(result.overall).toBe(3);
    });
});
