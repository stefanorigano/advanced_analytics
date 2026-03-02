// System Map Component
// Schematic SVG map of the transport network with Bezier curves.
//
// Transfer detection: uses getStationTransferRoutes() from transfer-utils.js
// which handles both the Zustand path (stationGroups) and the nearbyStations fallback.
//
// Transfers in the game use stations with different IDs but physically close to each other.
// For each station of each route, getStationTransferRoutes() returns the
// other routes reachable from there — if non-empty, it's a transfer point.
// The SVG dot is positioned on the station of the route that encounters it first.

import { getRouteStationsInOrder } from '../../utils/route-utils.js';
import { getStationTransferRoutes } from '../../utils/transfer-utils.js';
import { getStationGroups, isZustandAvailable } from '../../core/api-support.js';
import { Dropdown } from '../../components/dropdown.jsx';
import { DropdownItem } from '../../components/dropdown-item.jsx';
import { RouteBadge } from '../../components/route-badge.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

const W   = 900;
const H   = 360;
const PAD = 56;

// ─────────────────────────────────────────────────────────────
// TRANSFER MAP
// ─────────────────────────────────────────────────────────────

function buildTransferMap(routes, stationsByRoute, api) {
    const allStations = api.gameState.getStations();

    const stationToGroup = {};
    if (isZustandAvailable()) {
        getStationGroups().forEach(group => {
            group.stationIds.forEach(sid => {
                stationToGroup[sid] = group.id;
            });
        });
    }
    allStations.forEach(s => {
        if (!stationToGroup[s.id]) stationToGroup[s.id] = s.id;
    });

    const groupToRoutes  = {};
    const groupCanonical = {};

    routes.forEach(route => {
        (stationsByRoute[route.id] || []).forEach(stId => {
            const connectedRoutes = getStationTransferRoutes(stId, route.id, api);
            if (!connectedRoutes.length) return;

            const groupId = stationToGroup[stId] || stId;

            if (!groupToRoutes[groupId]) {
                groupToRoutes[groupId]  = new Set();
                groupCanonical[groupId] = stId;
            }

            groupToRoutes[groupId].add(route.id);
            connectedRoutes.forEach(tr => groupToRoutes[groupId].add(tr.routeId));
        });
    });

    const transferMap = {};
    Object.entries(groupToRoutes).forEach(([groupId, routeIdSet]) => {
        if (routeIdSet.size < 2) return;
        const canonicalId = groupCanonical[groupId];
        const station = allStations.find(s => s.id === canonicalId);
        transferMap[groupId] = {
            canonicalStationId: canonicalId,
            routeIds: Array.from(routeIdSet),
            name: station?.name || 'Transfer',
        };
    });

    return transferMap;
}

// ─────────────────────────────────────────────────────────────
// LAYOUT ENGINE
// ─────────────────────────────────────────────────────────────

function assignBaseY(routes) {
    const n = routes.length;
    const baseYMap = {};
    routes.forEach((route, i) => {
        baseYMap[route.id] = n === 1 ? 50 : 5 + (i / (n - 1)) * 90;
    });
    return baseYMap;
}

function buildStationToCanonical(transferMap) {
    const stationToCanonical = {};

    if (isZustandAvailable()) {
        const groups = getStationGroups();
        Object.entries(transferMap).forEach(([groupId, data]) => {
            const group = groups.find(g => g.id === groupId);
            if (group) {
                group.stationIds.forEach(sid => {
                    stationToCanonical[sid] = data.canonicalStationId;
                });
            } else {
                stationToCanonical[groupId] = data.canonicalStationId;
            }
        });
    } else {
        Object.values(transferMap).forEach(data => {
            stationToCanonical[data.canonicalStationId] = data.canonicalStationId;
        });
    }

    return stationToCanonical;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeLayout
//
// Design goals (in priority order):
//   1. Transfer stations are vertically aligned (same X across all routes)
//   2. Every route reads left-to-right (monotone non-decreasing X)
//   3. Backward lines are avoided
//   4. Total line crossings are minimised
//
// Algorithm overview
// ──────────────────
// Phase 1 – Assign natural fractional X (i / n-1) to every point.
//
// Phase 2 – Order transfer groups via topological sort on traversal constraints.
//   Each route contributes directed edges between consecutive transfer groups
//   it visits (in the order it actually visits them). We collect all edges,
//   then do a Kahn's-algorithm topological sort to get a left-to-right order
//   that every route agrees with. Cycles (contradictory routes) are broken by
//   keeping the majority-direction edge. Finally, groups are spaced evenly in
//   [0.15 … 0.85].
//
// Phase 3 – Enforce monotonicity for non-transfer interior points.
//   Forward + backward sweep clamps free points between their neighbours.
//
// Phase 4 – Redistribute free interior points evenly between anchors.
// ─────────────────────────────────────────────────────────────────────────────
function computeLayout(routes, transferMap, stationsByRoute, baseYMap) {
    const stationToCanonical = buildStationToCanonical(transferMap);

    // ── Y: average across participating routes ────────────────────────────────
    const canonicalY = {};
    Object.values(transferMap).forEach(({ canonicalStationId, routeIds }) => {
        const ys = routeIds.map(rid => baseYMap[rid] ?? 50);
        canonicalY[canonicalStationId] = ys.reduce((a, b) => a + b, 0) / ys.length;
    });

    // ── Phase 1: natural X for every point ───────────────────────────────────
    const routePoints = {};
    routes.forEach(route => {
        const stations = stationsByRoute[route.id] || [];
        const n = stations.length;
        routePoints[route.id] = stations.map((stId, i) => {
            const canonical = stationToCanonical[stId];
            return {
                stationId:   stId,
                canonicalId: canonical || stId,
                isTransfer:  !!canonical,
                naturalX:    n <= 1 ? 0.5 : i / (n - 1),
                x:           n <= 1 ? 0.5 : i / (n - 1),
                y:           canonical
                    ? (canonicalY[canonical] ?? baseYMap[route.id])
                    : baseYMap[route.id],
            };
        });
    });

    // ── Phase 2: topological ordering of transfer groups ─────────────────────
    //
    // For each route, extract the subsequence of transfer-point canonicalIds
    // in the order that route visits them. Each consecutive pair (A→B) is a
    // "before" constraint: A must have a smaller X than B.
    //
    // We tally edge votes: edgeVotes[A][B] = #routes that say A comes before B.
    // Then keep only edges where forward votes > backward votes (majority wins).
    // Finally, Kahn's topological sort gives a consistent left-to-right order.
    // Groups not connected to any edge are inserted by their natural-X median.

    const transferGroups = Object.values(transferMap);
    const canonicalX     = {};

    if (transferGroups.length > 0) {
        const allGroupIds = transferGroups.map(g => g.canonicalStationId);

        // Collect traversal order constraints from every route
        // edgeVotes[from][to] = vote count
        const edgeVotes = {};
        allGroupIds.forEach(id => { edgeVotes[id] = {}; });

        routes.forEach(route => {
            const pts = routePoints[route.id] || [];
            // Extract transfer canonicalIds in visit order (deduplicated)
            const visited = [];
            pts.forEach(pt => {
                if (pt.isTransfer) {
                    const last = visited[visited.length - 1];
                    if (last !== pt.canonicalId) visited.push(pt.canonicalId);
                }
            });
            // Add directed edges for each consecutive pair
            for (let i = 0; i < visited.length - 1; i++) {
                const from = visited[i];
                const to   = visited[i + 1];
                if (!edgeVotes[from])       edgeVotes[from]       = {};
                if (!edgeVotes[to])         edgeVotes[to]         = {};
                edgeVotes[from][to]         = (edgeVotes[from][to]         || 0) + 1;
            }
        });

        // Build final edge set: keep A→B only if votes(A→B) >= votes(B→A)
        // (strict ties keep both dropped to avoid cycle; doesn't matter in practice)
        const adjList  = {};   // adjacency list for Kahn's
        const inDegree = {};
        allGroupIds.forEach(id => { adjList[id] = []; inDegree[id] = 0; });

        allGroupIds.forEach(from => {
            Object.entries(edgeVotes[from] || {}).forEach(([to, fwdVotes]) => {
                const bwdVotes = (edgeVotes[to] && edgeVotes[to][from]) || 0;
                if (fwdVotes > bwdVotes) {
                    adjList[from].push(to);
                    inDegree[to] = (inDegree[to] || 0) + 1;
                }
            });
        });

        // Kahn's algorithm — nodes with in-degree 0 processed in median-X order
        // (so ties are broken consistently)
        const naturalMedian = {};
        allGroupIds.forEach(id => {
            const xs = [];
            const group = transferGroups.find(g => g.canonicalStationId === id);
            (group?.routeIds || []).forEach(rid => {
                const pt = (routePoints[rid] || []).find(p => p.canonicalId === id);
                if (pt) xs.push(pt.naturalX);
            });
            xs.sort((a, b) => a - b);
            const mid = Math.floor(xs.length / 2);
            naturalMedian[id] = xs.length === 0 ? 0.5
                : xs.length % 2 === 1 ? xs[mid]
                : (xs[mid - 1] + xs[mid]) / 2;
        });

        const topoOrder = [];
        // Priority queue (simple sort): prefer smaller naturalMedian first
        let queue = allGroupIds.filter(id => (inDegree[id] || 0) === 0);
        queue.sort((a, b) => naturalMedian[a] - naturalMedian[b]);

        while (queue.length > 0) {
            const node = queue.shift();
            topoOrder.push(node);
            (adjList[node] || []).forEach(neighbour => {
                inDegree[neighbour]--;
                if (inDegree[neighbour] === 0) {
                    queue.push(neighbour);
                    queue.sort((a, b) => naturalMedian[a] - naturalMedian[b]);
                }
            });
        }

        // Any nodes not reached (cycle remnants) appended by naturalMedian
        allGroupIds
            .filter(id => !topoOrder.includes(id))
            .sort((a, b) => naturalMedian[a] - naturalMedian[b])
            .forEach(id => topoOrder.push(id));

        // Assign evenly-spaced X values in [0.15 … 0.85]
        const g = topoOrder.length;
        topoOrder.forEach((id, idx) => {
            canonicalX[id] = g === 1 ? 0.5 : 0.15 + (idx / (g - 1)) * 0.70;
        });
    }

    // Apply canonical X to transfer points
    routes.forEach(route => {
        (routePoints[route.id] || []).forEach(pt => {
            if (pt.isTransfer) {
                pt.x = canonicalX[pt.canonicalId] ?? pt.naturalX;
            }
        });
    });

    // ── Phase 3: enforce left-to-right monotonicity ───────────────────────────
    // Two passes for stability. Only non-transfer points are clamped;
    // transfer points keep their canonical X.
    for (let pass = 0; pass < 2; pass++) {
        routes.forEach(route => {
            const pts = routePoints[route.id] || [];

            // Forward: ensure x[i] >= x[i-1]
            for (let i = 1; i < pts.length; i++) {
                if (!pts[i].isTransfer) {
                    pts[i].x = Math.max(pts[i].x, pts[i - 1].x);
                }
            }
            // Backward: ensure x[i] <= x[i+1]
            for (let i = pts.length - 2; i >= 0; i--) {
                if (!pts[i].isTransfer) {
                    pts[i].x = Math.min(pts[i].x, pts[i + 1].x);
                }
            }
        });
    }

    // ── Phase 4: redistribute free interior points evenly ────────────────────
    // Between each pair of consecutive anchors (transfer points + endpoints),
    // space any free points uniformly to avoid clustering.
    routes.forEach(route => {
        const pts = routePoints[route.id] || [];
        if (pts.length < 3) return;

        const anchors = pts
            .map((p, i) => (p.isTransfer || i === 0 || i === pts.length - 1 ? i : -1))
            .filter(i => i >= 0);

        for (let a = 0; a < anchors.length - 1; a++) {
            const lo  = anchors[a];
            const hi  = anchors[a + 1];
            const gap = hi - lo;
            if (gap < 2) continue;

            const xLo = pts[lo].x;
            const xHi = pts[hi].x;

            for (let k = 1; k < gap; k++) {
                pts[lo + k].x = xLo + (xHi - xLo) * (k / gap);
            }
        }
    });

    return routePoints;
}

function toSVG(x, y) {
    return {
        px: PAD + x * (W - 2 * PAD),
        py: PAD + (y / 100) * (H - 2 * PAD),
    };
}

function buildPath(svgPts) {
    if (svgPts.length < 2) return '';
    let d = `M ${svgPts[0].px},${svgPts[0].py}`;
    for (let i = 0; i < svgPts.length - 1; i++) {
        const a  = svgPts[i];
        const b  = svgPts[i + 1];
        const cx = (a.px + b.px) / 2;
        d += ` C ${cx},${a.py} ${cx},${b.py} ${b.px},${b.py}`;
    }
    return d;
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────

function useSystemMapData(selectedRouteIds) {
    const [mapData, setMapData] = React.useState(null);

    // Stable string key so the effect re-runs when selection changes
    const filterKey = selectedRouteIds ? selectedRouteIds.slice().sort().join(',') : null;

    React.useEffect(() => {
        function update() {
            try {
                const allRoutes = api.gameState.getRoutes();
                const stations  = api.gameState.getStations();

                if (!allRoutes.length) { setMapData(null); return; }

                // Apply route filter (null = no filter yet = show all)
                const routes = selectedRouteIds && selectedRouteIds.length > 0
                    ? allRoutes.filter(r => selectedRouteIds.includes(r.id))
                    : allRoutes;

                if (!routes.length) { setMapData(prev => prev ? { ...prev, renderedRoutes: [], transferDots: [] } : null); return; }

                const stationsByRoute = {};
                routes.forEach(route => {
                    const ordered = getRouteStationsInOrder(route.id, api);
                    stationsByRoute[route.id] = ordered.map(s => s.id);
                });

                const stationNames = {};
                stations.forEach(s => { stationNames[s.id] = s.name || 'Station'; });

                const transferMap = buildTransferMap(routes, stationsByRoute, api);
                const baseYMap    = assignBaseY(routes);
                const routePoints = computeLayout(routes, transferMap, stationsByRoute, baseYMap);

                // allTransferMap: built from all routes so transfer chips always list
                // every route connected to each hub, even if currently deselected.
                const allStationsByRoute = {};
                allRoutes.forEach(route => {
                    if (stationsByRoute[route.id]) {
                        allStationsByRoute[route.id] = stationsByRoute[route.id];
                    } else {
                        const ordered = getRouteStationsInOrder(route.id, api);
                        allStationsByRoute[route.id] = ordered.map(s => s.id);
                    }
                });
                const allTransferMap = buildTransferMap(allRoutes, allStationsByRoute, api);

                const renderedRoutes = routes.map(route => {
                    const pts    = routePoints[route.id] || [];
                    const svgPts = pts.map(({ x, y }) => toSVG(x, y));
                    return {
                        id:     route.id,
                        bullet: route.bullet || route.name || route.id,
                        name:   route.name   || route.bullet || route.id,
                        color:  route.color  || '#888888',
                        svgPts, pts,
                        path:   buildPath(svgPts),
                    };
                });

                const transferDots = Object.entries(transferMap).map(([groupId, data]) => {
                    const { canonicalStationId, name } = data;
                    // Use allTransferMap to get the full routeIds (including deselected routes)
                    const fullRouteIds = allTransferMap[groupId]?.routeIds ?? data.routeIds;

                    let px = null, py = null;
                    for (const route of routes) {
                        const pt = (routePoints[route.id] || []).find(
                            p => p.canonicalId === canonicalStationId
                        );
                        if (pt) {
                            const svg = toSVG(pt.x, pt.y);
                            px = svg.px;
                            py = svg.py;
                            break;
                        }
                    }

                    if (px === null) return null;
                    return { groupId, canonicalStationId, name, px, py, routeIds: fullRouteIds };
                }).filter(Boolean);

                setMapData({ renderedRoutes, transferDots, transferMap, stationNames, routes, allRoutes });

            } catch (err) {
                console.error('[DashboardMap] Error computing layout:', err);
                setMapData(null);
            }
        }

        update();
        const interval = setInterval(update, 5000);
        return () => clearInterval(interval);
    }, [filterKey]);   // ← re-runs when selection changes

    return mapData;
}

// ─────────────────────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────────────────────

function MapTooltip({ data, mapData }) {
    if (!data || !mapData) return null;

    const { groupId, x, y } = data;
    const { transferMap, allRoutes } = mapData;
    const entry = transferMap[groupId];
    if (!entry) return null;

    return (
        <div
            className='bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg'
            style={{
                position: 'fixed', left: x, top: y,
                transform: 'translateY(-125%)',
            }}
        >
            <div className="font-semibold text-xs mb-1">{entry.name}</div>
            <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-border">
                {entry.routeIds.map(rid => {
                    const route = (allRoutes ?? []).find(r => r.id === rid);
                    return (
                        <div key={rid} className="flex items-center gap-1.5">
                            <RouteBadge routeId={rid} size="1.2rem" />
                            <span className="text-[10px] text-muted-foreground">
                                {route?.name || route?.bullet || rid}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export function DashboardMap() {
    // ── Route filter state ────────────────────────────────────
    // Declared BEFORE the hook so we can pass the filter in for layout re-compute.
    const [selectedRoutes, setSelectedRoutes] = React.useState([]);

    // Pass the current selection into the hook.
    // While selectedRoutes is still [] (first render), pass null → hook uses all routes.
    const filterArg = selectedRoutes.length > 0 ? selectedRoutes : null;
    const mapData = useSystemMapData(filterArg);

    // allRoutes: the complete unfiltered list, used to populate the dropdown.
    const allRoutes   = mapData?.allRoutes ?? [];
    const allRouteIds = React.useMemo(
        () => allRoutes.map(r => r.id),
        [allRoutes.map(r => r.id).join(',')]
    );

    // Seed selectedRoutes to "all" on first data arrival, and clean up stale ids thereafter.
    React.useEffect(() => {
        if (allRouteIds.length === 0) return;
        setSelectedRoutes(prev =>
            prev.length === 0
                ? allRouteIds
                : prev.filter(id => allRouteIds.includes(id))
        );
    }, [allRouteIds.join(',')]);

    // ── Hover state ───────────────────────────────────────────
    const [hoveredRoute,    setHoveredRoute]    = React.useState(null);
    const [hoveredTransfer, setHoveredTransfer] = React.useState(null);
    const [tooltip,         setTooltip]         = React.useState(null);

    // Empty / loading state
    if (!mapData) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-muted-foreground mb-2 text-sm">Generating system map…</div>
                <div className="text-xs text-muted-foreground">Build routes and stations to see the network map</div>
            </div>
        );
    }

    // No routes selected
    if (selectedRoutes.length === 0) {
        return (
            <div className="space-y-3">
                <div className="flex gap-3">
                    <Dropdown
                        togglerText={`0/${allRouteIds.length}`}
                        togglerIcon={icons.Route}
                        togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                        menuClasses="min-w-[180px]"
                        multiselect={true}
                        value={selectedRoutes}
                        onChange={setSelectedRoutes}
                    >
                        {allRoutes.map(route => (
                            <DropdownItem key={route.id} route={route} value={route.id} />
                        ))}
                    </Dropdown>
                </div>
                <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-background/50">
                    <div className="text-muted-foreground mb-1 text-sm">No routes selected</div>
                    <div className="text-xs text-muted-foreground">Select at least one route to see the map</div>
                </div>
            </div>
        );
    }

    // Routes selected but layout produced nothing (edge case)
    if (!mapData.renderedRoutes.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-muted-foreground text-sm">No route data available</div>
            </div>
        );
    }

    const { renderedRoutes, transferDots, routes } = mapData;

    // ── Highlight logic ───────────────────────────────────────
    // activeRouteIds: routes that should stay bright. null = no hover active.
    const activeRouteIds = hoveredTransfer
        ? new Set(transferDots.find(d => d.groupId === hoveredTransfer)?.routeIds ?? [])
        : hoveredRoute
            ? new Set([hoveredRoute])
            : null;

    const routeOpacity = rid => !activeRouteIds ? 1 : activeRouteIds.has(rid) ? 1 : 0.08;
    const routeStroke  = rid => !activeRouteIds ? 2.5 : activeRouteIds.has(rid) ? 4 : 1.5;
    const routeFilter  = rid => {
        if (!activeRouteIds || !activeRouteIds.has(rid)) return 'none';
        const c = routes.find(r => r.id === rid)?.color ?? '#888';
        return `drop-shadow(0 0 5px ${c}80)`;
    };

    // Transfer dot opacity:
    // • hoveredTransfer → only the hovered dot is bright; ALL others dim (including
    //   dots that share routes with the hovered one — focus is on the single hub)
    // • hoveredRoute    → dim dots whose routes don't intersect the active route
    // • no hover        → everything full opacity
    const transferDotOpacity = ({ groupId, routeIds }) => {
        if (hoveredTransfer) return groupId === hoveredTransfer ? 1 : 0.08;
        if (!activeRouteIds) return 1;
        return routeIds.some(rid => activeRouteIds.has(rid)) ? 1 : 0.08;
    };

    // ── Handlers ──────────────────────────────────────────────
    const removeRoute = (e, rid) => {
        e.stopPropagation();
        setSelectedRoutes(prev => prev.filter(id => id !== rid));
    };

    return (
        <div className="space-y-3">

            {/* ── Top bar: route-filter dropdown + badges ─────── */}
            <div className="flex gap-3">

                <Dropdown
                    togglerText={`${selectedRoutes.length}/${allRouteIds.length}`}
                    togglerIcon={icons.Route}
                    togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                    menuClasses="min-w-[180px]"
                    multiselect={true}
                    value={selectedRoutes}
                    onChange={setSelectedRoutes}
                >
                    {allRoutes.map(route => (
                        <DropdownItem
                            key={route.id}
                            route={route}
                            value={route.id}
                        />
                    ))}
                </Dropdown>

                {/* Route badges — hovering highlights the route; × removes it */}
                <div className="flex gap-1 flex-wrap">
                    {selectedRoutes.map(rid => {
                        const isHovered = hoveredRoute === rid;
                        return (
                            <div
                                key={rid}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/30 cursor-pointer"
                                style={{
                                    opacity:    activeRouteIds && !activeRouteIds.has(rid) ? 0.35 : 1,
                                    transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={() => { setHoveredRoute(rid); setHoveredTransfer(null); }}
                                onMouseLeave={() => setHoveredRoute(null)}
                            >
                                <RouteBadge routeId={rid} size={selectedRoutes.length > 10 ? "1rem" : "1.2rem"} />
                                <button
                                    onClick={e => removeRoute(e, rid)}
                                    style={{
                                        opacity:     isHovered ? 1 : 0.7,
                                    }}
                                    title="Remove"
                                >
                                    <icons.X size={12}/>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── SVG map ─────────────────────────────────────── */}
            <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    style={{ width: '100%', overflow: 'visible', display: 'block' }}
                >
                    {/* Vertical grid lines */}
                    {Array.from({ length: 11 }).map((_, i) => {
                        const x = PAD + (i / 10) * (W - 2 * PAD);
                        return (
                            <line key={i}
                                  x1={x} y1={PAD / 2} x2={x} y2={H - PAD / 2}
                                  stroke="currentColor" strokeOpacity={0.04} strokeWidth={1}
                            />
                        );
                    })}

                    {/* Route paths */}
                    {renderedRoutes.map(route => (
                        <path
                            key={route.id}
                            d={route.path}
                            fill="none"
                            stroke={route.color}
                            strokeWidth={routeStroke(route.id)}
                            strokeOpacity={routeOpacity(route.id)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                filter:     routeFilter(route.id),
                                transition: 'stroke-width 0.15s, stroke-opacity 0.15s',
                                cursor:     'pointer',
                            }}
                            onMouseEnter={() => { setHoveredRoute(route.id); setHoveredTransfer(null); }}
                            onMouseLeave={() => setHoveredRoute(null)}
                        />
                    ))}

                    {/* Transfer dots */}
                    {transferDots.map(({ groupId, name, px, py, routeIds }) => (
                        <g
                            key={groupId}
                            style={{
                                cursor:     'pointer',
                                opacity:     transferDotOpacity({ groupId, routeIds }),
                                transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={e => {
                                setHoveredTransfer(groupId);
                                setHoveredRoute(null);
                                setTooltip({ groupId, x: e.clientX, y: e.clientY });
                            }}
                            onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                            onMouseLeave={() => { setHoveredTransfer(null); setTooltip(null); }}
                        >
                            <circle cx={px} cy={py} r={16} fill="transparent" />
                            <circle cx={px} cy={py} r={8}
                                    fill="hsla(var(--background))"
                                    stroke="var(--aa-transfer-color)"
                                    strokeWidth={hoveredTransfer === groupId ? 2.5 : 1.5}
                            />
                            {routeIds.map((rid, i) => {
                                const route  = routes.find(r => r.id === rid);
                                const total  = routeIds.length;
                                const angle  = (i / total) * Math.PI * 2 - Math.PI / 2;
                                const radius = total > 2 ? 4 : 2.5;
                                const pipR   = total > 2 ? 1.8 : 2.2;
                                return (
                                    <circle key={rid}
                                            cx={px + Math.cos(angle) * radius}
                                            cy={py + Math.sin(angle) * radius}
                                            r={pipR}
                                            fill={route?.color || '#888'}
                                    />
                                );
                            })}
                            <text
                                x={px} y={py - 13}
                                textAnchor="middle"
                                fontSize={8}
                                fill="hsl(var(--muted-foreground))"
                                style={{ letterSpacing: '0.06em' }}
                            >
                                {name.length > 12 ? name.slice(0, 11) + '…' : name.toUpperCase()}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>
            {/* ── Transfer chips (below chart) ─────────────────── */}
                <div className="flex flex-wrap gap-1.5">
                {transferDots.map(({ groupId, name, routeIds }) => {
                    const isHovered = hoveredTransfer === groupId;
                    return (
                        <div
                            key={groupId}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-muted/30 text-[10px] cursor-pointer"
                            style={{
                                borderColor: isHovered
                                    ? 'var(--aa-transfer-color)'
                                    : 'hsl(var(--border))',
                                opacity: hoveredTransfer
                                    ? (isHovered ? 1 : 0.2)
                                    : activeRouteIds && !routeIds.some(rid => activeRouteIds.has(rid))
                                        ? 0.2 : 1,
                                transition: 'opacity 0.15s, border-color 0.15s',
                            }}
                            onMouseEnter={() => { setHoveredTransfer(groupId); setHoveredRoute(null); }}
                            onMouseLeave={() => setHoveredTransfer(null)}
                        >
                            <span className={'whitespace-nowrap'}>{name}</span>
                            <span style={{ color: 'hsl(var(--border))' }}>·</span>
                            {/* Show ALL connected routes via RouteBadge regardless of selection */}
                            {(() => {
                                const allRoutes = api.gameState.getRoutes();
                                return (
                                    <Dropdown
                                        togglerContent={
                                            <span className="text-xs font-semibold tabular-nums">
                                                {routeIds.length}
                                            </span>
                                        }
                                        togglerClasses="flex items-center gap-1 rounded hover:bg-accent px-1 -ml-1 transition-colors"
                                        onChange={(rid) => window.AdvancedAnalytics?.openRouteDialog?.(rid)}
                                    >
                                        {routeIds.map(rid => {
                                            const route = allRoutes.find(r => r.id === rid);
                                            return route
                                                ? <DropdownItem key={rid} value={rid} route={route} />
                                                : null;
                                        })}
                                    </Dropdown>
                                );
                            })()}
                        </div>
                    );
                })}
            </div>

            <MapTooltip data={tooltip} mapData={mapData} />
        </div>
    );
}
