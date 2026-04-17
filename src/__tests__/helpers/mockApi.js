export function createMockApi(overrides = {}) {
    const _hooks = {};

    const api = {
        hooks: {
            onGameInit:     vi.fn(cb => { _hooks.onGameInit     = cb; }),
            onGameLoaded:   vi.fn(cb => { _hooks.onGameLoaded   = cb; }),
            onGameSaved:    vi.fn(cb => { _hooks.onGameSaved    = cb; }),
            onGameEnd:      vi.fn(cb => { _hooks.onGameEnd      = cb; }),
            onDayChange:    vi.fn(cb => { _hooks.onDayChange    = cb; }),
            onRouteCreated: vi.fn(cb => { _hooks.onRouteCreated = cb; }),
            onRouteDeleted: vi.fn(cb => { _hooks.onRouteDeleted = cb; }),
            onMoneyChanged: vi.fn(cb => { _hooks.onMoneyChanged = cb; }),
        },
        gameState: {
            getSaveName:       vi.fn(() => 'TestCity'),
            getRoutes:         vi.fn(() => []),
            getStations:       vi.fn(() => []),
            getCurrentDay:     vi.fn(() => 1),
            getElapsedSeconds: vi.fn(() => 0),
            getRouteRidership: vi.fn(() => ({ total: 0 })),
        },
        trains: {
            getTrainTypes: vi.fn(() => ({})),
            getTrains:     vi.fn(() => []),
        },
        utils:     { getCityCode:          vi.fn(() => 'NYC') },
        popTiming: { getCommuteTimeRanges: vi.fn(() => [])    },
        _trigger: (event, ...args) => _hooks[event]?.(...args),
    };

    // Merge nested overrides
    for (const [k, v] of Object.entries(overrides)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v) && typeof api[k] === 'object') {
            Object.assign(api[k], v);
        } else {
            api[k] = v;
        }
    }

    return api;
}
