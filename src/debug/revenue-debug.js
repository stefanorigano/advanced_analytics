// ============================================================
// TEMPORARY DEBUG MODULE — Revenue fluctuation investigation
// ============================================================
// Purpose: Understand how revenuePerHour behaves in the beta
// API, and validate whether onMoneyChanged + per-route
// revenuePerHour proportions can drive accurate per-route
// revenue attribution.
//
// Usage:
//   Automatically started from index.js when DEBUG_REVENUE=true.
//   Stop at any time from the console:
//     window.AdvancedAnalytics.revenueDebug.stop()
//   Print an on-demand summary:
//     window.AdvancedAnalytics.revenueDebug.summary()
//   Reset all accumulated state (e.g. after loading a new city):
//     window.AdvancedAnalytics.revenueDebug.reset()
//
// REMOVE before shipping to production.
// ============================================================

const POLL_INTERVAL_MS    = 100;   // fast enough to catch short pulses
const SUMMARY_INTERVAL_MS = 10000; // periodic console summary
const TAG                 = '[AA:REVDBG]';
const TAG_MC              = '[AA:MC]';   // onMoneyChanged events

// ── Helpers ────────────────────────────────────────────────────────────────

function gameTime(api) {
    const elapsed = api.gameState.getElapsedSeconds();
    const h = Math.floor((elapsed % 86400) / 3600);
    const m = Math.floor((elapsed % 3600)  / 60);
    const s = Math.floor(elapsed % 60);
    return {
        elapsed,
        label: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
        day: api.gameState.getCurrentDay(),
    };
}

function routeLabel(route) {
    return route.name || route.bullet || route.id;
}

// ── Per-route state ────────────────────────────────────────────────────────

function makeRouteState() {
    return {
        lastValue:    null,   // last known revenuePerHour
        // Pulse tracking
        pulseActive:  false,
        pulseStartMs: null,
        pulseStartGT: null,
        pulseValues:  [],
        // Integration accumulator (revenuePerHour × Δt_ingame_hours)
        integratedRevenue:    0,
        lastSampleElapsed:    null, // last in-game elapsed seconds
        // Attribution accumulator (proportional share of each onMoneyChanged event)
        attributedRevenue:    0,
        // Pulse history
        pulseHistory: [],
    };
}

// ── Module-level singletons ────────────────────────────────────────────────
// These live outside startRevenueDebug() so they survive across stop()/restart
// calls.  This solves three bugs:
//
//  1. onMoneyChanged stacking: the API cannot unregister hooks, so each call to
//     startRevenueDebug() would add a new listener.  By guarding with
//     _hookRegistered, the hook is registered exactly once per page lifetime.
//
//  2. Integration drift: route state (integratedRevenue, lastSampleElapsed) is
//     preserved across restarts, so reloading a save doesn't zero-out the
//     accumulated in-game integral.
//
//  3. Attributed drift: totalMoneyChangedRevenue lives in module scope, so all
//     events — including those that arrived before the latest restart — are
//     counted in the cross-check.

let _hookRegistered         = false;
let _routeStates            = {};    // routeId → makeRouteState()
let _totalMoneyChangedRev   = 0;
let _moneyChangedEventCount = 0;
let _lastLineMetrics        = [];
let _pollTimer              = null;
let _summaryTimer           = null;

// ── One-time hook registration ─────────────────────────────────────────────

function _registerMoneyHook(api) {
    if (_hookRegistered) return;
    _hookRegistered = true;

    api.hooks.onMoneyChanged((balance, change, type, category) => {
        const gt  = gameTime(api);
        const cat = category || 'Uncategorized';

        if (type !== 'revenue') {
            // Log expenses separately but briefly
            console.log(
                `${TAG_MC} [Day ${gt.day} ${gt.label}] ` +
                `${type} | ${cat} | ${change >= 0 ? '+' : ''}${change}`
            );
            return;
        }

        // ── Accumulate ground truth ────────────────────────────────────────
        _totalMoneyChangedRev += change;
        _moneyChangedEventCount++;

        // ── Read current per-route rates ───────────────────────────────────
        const routes    = api.gameState.getRoutes();
        const metrics   = _lastLineMetrics.length ? _lastLineMetrics : api.gameState.getLineMetrics();
        const totalRate = metrics.reduce((sum, m) => sum + (m.revenuePerHour || 0), 0);

        // ── Compute proportional attribution ──────────────────────────────
        const attribution = routes.map(route => {
            const lm   = metrics.find(m => m.routeId === route.id);
            const rate = lm ? lm.revenuePerHour : 0;
            const prop = totalRate > 0 ? rate / totalRate : 0;
            const share = change * prop;

            // Accumulate into module-level route state
            if (!_routeStates[route.id]) _routeStates[route.id] = makeRouteState();
            _routeStates[route.id].attributedRevenue += share;

            return { label: routeLabel(route), rate, prop: (prop * 100).toFixed(1), share: share.toFixed(0) };
        });

        // ── Log ────────────────────────────────────────────────────────────
        const rateStr = attribution
            .filter(a => a.rate > 0)
            .map(a => `${a.label}:${a.rate}(${a.prop}%→${a.share})`)
            .join('  ') || '(all routes at 0)';

        console.log(
            `${TAG_MC} [Day ${gt.day} ${gt.label}] +${change} | ` +
            `totalRate: ${totalRate} | ${rateStr} | ` +
            `cumulativeRevenue: ${_totalMoneyChangedRev.toFixed(0)}`
        );
    });

    console.log(`${TAG} ✓ onMoneyChanged hook registered (once)`);
}

// ── Main factory ───────────────────────────────────────────────────────────

export function startRevenueDebug(api) {
    console.log(`${TAG} ▶ Revenue debug started | poll: ${POLL_INTERVAL_MS}ms`);

    // Register onMoneyChanged once — state is kept in module scope
    _registerMoneyHook(api);

    // Clear any previous intervals (safe if already null)
    if (_pollTimer)    clearInterval(_pollTimer);
    if (_summaryTimer) clearInterval(_summaryTimer);

    // ── Poll tick — tracks revenuePerHour pulses ───────────────────────────
    function tick() {
        if (api.gameState.isPaused()) return;

        const gt          = gameTime(api);
        const routes      = api.gameState.getRoutes();
        const lineMetrics = api.gameState.getLineMetrics();
        _lastLineMetrics  = lineMetrics;

        routes.forEach(route => {
            const lm      = lineMetrics.find(m => m.routeId === route.id);
            const revenue = lm ? lm.revenuePerHour : 0;

            if (!_routeStates[route.id]) _routeStates[route.id] = makeRouteState();
            const state = _routeStates[route.id];

            // ── Integrate using in-game elapsed time ───────────────────────
            if (state.lastSampleElapsed !== null) {
                const dtHours = (gt.elapsed - state.lastSampleElapsed) / 3600;
                state.integratedRevenue += (state.lastValue ?? 0) * dtHours;
            }
            state.lastSampleElapsed = gt.elapsed;

            // ── Detect value changes ───────────────────────────────────────
            if (revenue !== state.lastValue) {
                const prev = state.lastValue;
                state.lastValue = revenue;

                console.log(
                    `${TAG} [Day ${gt.day} ${gt.label}] ${routeLabel(route)} ` +
                    `revenuePerHour: ${prev ?? '(init)'} → ${revenue}`
                );
            }

            // ── Pulse tracking ─────────────────────────────────────────────
            if (revenue > 0) {
                if (!state.pulseActive) {
                    state.pulseActive  = true;
                    state.pulseStartMs = Date.now();
                    state.pulseStartGT = gt.elapsed;
                    state.pulseValues  = [];
                    console.log(`${TAG} [Day ${gt.day} ${gt.label}] ${routeLabel(route)} ▲ PULSE START`);
                }
                state.pulseValues.push(revenue);

            } else if (revenue === 0 && state.pulseActive) {
                state.pulseActive = false;

                const nowMs      = Date.now();
                const durationMs = nowMs - state.pulseStartMs;
                const durationS  = (durationMs / 1000).toFixed(1);
                const peak       = Math.max(...state.pulseValues);
                const avg        = (state.pulseValues.reduce((a, b) => a + b, 0) / state.pulseValues.length).toFixed(2);
                const gtDelta    = gt.elapsed - state.pulseStartGT;

                const summary = {
                    durationMs,
                    durationRealS: durationS,
                    durationGameS: gtDelta,
                    peak,
                    avg:           parseFloat(avg),
                    sampleCount:   state.pulseValues.length,
                };
                state.pulseHistory.push(summary);
                if (state.pulseHistory.length > 20) state.pulseHistory.shift();

                console.log(
                    `${TAG} [Day ${gt.day} ${gt.label}] ${routeLabel(route)} ▼ PULSE END | ` +
                    `real: ${durationS}s | in-game: ${gtDelta}s | ` +
                    `peak: ${peak} | avg: ${avg} | samples: ${summary.sampleCount}`
                );
            }
        });
    }

    // ── Periodic summary ───────────────────────────────────────────────────
    function printSummary() {
        // Don't log while the game is paused — avoids flooding the console
        if (api.gameState.isPaused()) return;

        const gt     = gameTime(api);
        const routes = api.gameState.getRoutes();

        console.groupCollapsed(`${TAG} ══ SUMMARY [Day ${gt.day} ${gt.label}] ══`);
        console.log(`  onMoneyChanged events : ${_moneyChangedEventCount}`);
        console.log(`  total MC revenue      : ${_totalMoneyChangedRev.toFixed(0)}`);

        let totalIntegrated  = 0;
        let totalAttributed  = 0;

        routes.forEach(route => {
            const state = _routeStates[route.id];
            if (!state) return;

            totalIntegrated += state.integratedRevenue;
            totalAttributed += state.attributedRevenue;

            const history = state.pulseHistory;
            const lm = (_lastLineMetrics.length ? _lastLineMetrics : api.gameState.getLineMetrics())
                           .find(m => m.routeId === route.id);
            const currentRate = lm ? lm.revenuePerHour : 0;

            console.groupCollapsed(`  ${routeLabel(route)}`);
            console.log(`  currentRevenuePerHour : ${currentRate}`);
            console.log(`  integrated (poll)     : ${state.integratedRevenue.toFixed(4)}`);
            console.log(`  attributed (MC share) : ${state.attributedRevenue.toFixed(4)}`);
            console.log(`  pulses so far         : ${history.length}`);
            if (history.length > 0) {
                const avgDurS = (history.reduce((a, p) => a + p.durationMs, 0) / history.length / 1000).toFixed(1);
                const avgPeak = (history.reduce((a, p) => a + p.peak, 0) / history.length).toFixed(0);
                console.log(`  avg pulse duration    : ${avgDurS}s real`);
                console.log(`  avg pulse peak        : ${avgPeak}`);
            }
            console.groupEnd();
        });

        // Cross-check: do the two methods agree on totals?
        const integrationDrift = _totalMoneyChangedRev > 0
            ? ((totalIntegrated - _totalMoneyChangedRev) / _totalMoneyChangedRev * 100).toFixed(1)
            : 'n/a';
        const attributionDrift = _totalMoneyChangedRev > 0
            ? ((totalAttributed - _totalMoneyChangedRev) / _totalMoneyChangedRev * 100).toFixed(1)
            : 'n/a';

        console.log(`  ── Totals cross-check ──`);
        console.log(`  MC total (ground truth)  : ${_totalMoneyChangedRev.toFixed(0)}`);
        console.log(`  integrated total (poll)  : ${totalIntegrated.toFixed(0)}  drift: ${integrationDrift}%`);
        console.log(`  attributed total (MC)    : ${totalAttributed.toFixed(0)}  drift: ${attributionDrift}%`);

        console.groupEnd();
    }

    // ── Start intervals ────────────────────────────────────────────────────
    _pollTimer    = setInterval(tick,         POLL_INTERVAL_MS);
    _summaryTimer = setInterval(printSummary, SUMMARY_INTERVAL_MS);

    // ── Public handle ──────────────────────────────────────────────────────
    return {
        stop() {
            clearInterval(_pollTimer);
            clearInterval(_summaryTimer);
            _pollTimer    = null;
            _summaryTimer = null;
            console.log(`${TAG} ■ Revenue debug stopped.`);
        },
        summary() {
            printSummary();
        },
        /** Wipe all accumulated state — useful when loading a new city/save. */
        reset() {
            _routeStates            = {};
            _totalMoneyChangedRev   = 0;
            _moneyChangedEventCount = 0;
            _lastLineMetrics        = [];
            console.log(`${TAG} ↺ State reset.`);
        },
        get states() {
            return _routeStates;
        },
        get mcTotal() {
            return _totalMoneyChangedRev;
        },
    };
}
