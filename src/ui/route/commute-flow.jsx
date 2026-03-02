// Commute Flow Component
// Sankey chart showing the full passenger flow through a selected station.
//
// LAYOUT (5 columns):
//
//   [Home→Work bd.]  ─┐                              ┌─ [Home→Work al.]
//                     ├──► [Boarding] ─► [STATION] ─► [Alighting] ┤
//   [Work→Home bd.]  ─┘                              └─ [Work→Home al.]
//
//   [Prev. station]  ──────────────────► [STATION] ──────────────────► [Next station]
//
// HW/WH boarding flows funnel through a "Boarding" aggregator node before the
// station; alighting flows fan out from an "Alighting" aggregator node after it.
// Metro (passthrough) flows bypass both aggregators and link directly to the station.
//
// Station balance:
//   in  = Boarding (totalBoard) + metroIn (pt + totalAlight)
//   out = Alighting (totalAlight) + metroOut (pt + totalBoard)  → always equal.
//
// The station is selected via an interactive horizontal strip showing all stops.

import { CONFIG }                  from '../../config.js';
import { getRouteStationsInOrder } from '../../utils/route-utils.js';
import {RouteDialog} from "./route-dialog";

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;

// Journey-type palette
const COLOR_HOME_WORK  = '#3b82f6'; // blue-500   — home → work
const COLOR_WORK_HOME  = '#ef4444'; // red-500    — work → home

// ── Data hook ─────────────────────────────────────────────────────────────────
// Aggregates completed commutes for a specific station on a specific route.
// Returns boarding/alighting/passthrough counts split by journey type.
//
// Passthrough: a commute that uses this route AND passes through this station
// without boarding or alighting here — i.e. the station lies strictly between
// the commute's entry and exit stations in the route's ordered station list.

function useCommuteData(routeId, stationId) {
    const [data, setData] = React.useState(null);

    React.useEffect(() => {
        if (!routeId || !stationId) { setData(null); return; }

        const compute = () => {
            try {
                const commutes = api.gameState.getCompletedCommutes?.() ?? [];

                // Build ordered station index for passthrough detection once per call
                const orderedIds  = getRouteStationsInOrder(routeId, api).map(s => s.id);
                const selectedIdx = orderedIds.indexOf(stationId);

                let boardingHW   = 0;
                let boardingWH   = 0;
                let alightingHW  = 0;
                let alightingWH  = 0;
                let passthroughTotal = 0; // not split by journey — shown as one number

                for (const c of commutes) {
                    const seg = c.stationRoutes?.find(s => s.routeId === routeId);
                    if (!seg || !seg.stationIds?.length) continue;

                    const size  = c.size || 1;
                    const isHW  = c.origin === 'home'; // home→work commuter
                    const entry = seg.stationIds[0];
                    const exit  = seg.stationIds[seg.stationIds.length - 1];

                    if (entry === stationId) {
                        if (isHW) boardingHW += size;
                        else      boardingWH += size;
                    } else if (exit === stationId) {
                        if (isHW) alightingHW += size;
                        else      alightingWH += size;
                    } else if (selectedIdx !== -1) {
                        // Check whether the selected station is strictly between
                        // entry and exit in the route order (handles both directions)
                        const entryIdx = orderedIds.indexOf(entry);
                        const exitIdx  = orderedIds.indexOf(exit);
                        if (entryIdx !== -1 && exitIdx !== -1) {
                            const lo = Math.min(entryIdx, exitIdx);
                            const hi = Math.max(entryIdx, exitIdx);
                            if (selectedIdx > lo && selectedIdx < hi) {
                                passthroughTotal += size;
                            }
                        }
                    }
                }

                setData({ boardingHW, boardingWH, alightingHW, alightingWH, passthroughTotal });
            } catch (err) {
                console.error(`${CONFIG.LOG_PREFIX} CommuteFlow error:`, err);
                setData({ boardingHW: 0, boardingWH: 0, alightingHW: 0, alightingWH: 0, passthroughTotal: 0 });
            }
        };

        compute();
        const id = setInterval(compute, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(id);
    }, [routeId, stationId]);

    return data;
}

// ── Station Strip ─────────────────────────────────────────────────────────────
// Horizontal scrollable row of station dots connected by a route-colored line.
// Clicking a dot selects that station for the Sankey.

function StationStrip({ stations, selectedId, routeColor, onSelect }) {
    const scrollRef = React.useRef(null);

    // Horizontally centre the selected station in the strip.
    // Uses container.scrollTo (horizontal-only) instead of scrollIntoView to avoid
    // the browser also scrolling the page/dialog vertically on open.
    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        const btn = container.querySelector(`[data-sid="${selectedId}"]`);
        if (!btn) return;
        const target = btn.offsetLeft - container.offsetWidth / 2 + btn.offsetWidth / 2;
        container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }, [selectedId]);

    return (
        <div
            ref={scrollRef}
            className="overflow-x-auto"
            style={{ scrollbarWidth: 'thin', paddingBottom: 4 }}
        >
            <div className="flex justify-between pb-4" style={{ minWidth: '100%'}}>
                {stations.map((st, idx) => {
                    const selected = st.id === selectedId;
                    return (
                        <React.Fragment key={st.id}>
                            {/* Connector line between stations */}
                            {idx > 0 && (
                                <div style={{
                                    minWidth:    36,
                                    height:      1,
                                    marginTop:   5, // vertically centred with the 14px dot
                                    background:  routeColor,
                                    opacity:     0.55,
                                    flexShrink:  0,
                                    flexGrow:    1,
                                }} />
                            )}

                            {/* Station dot + label */}
                            <button
                                data-sid={st.id}
                                onClick={() => onSelect(st.id)}
                                className="flex relative flex-col items-center gap-1.5 focus:outline-none text-muted-foreground hover:text-foreground"
                                style={{ flexShrink: 0 }}
                                title={st.name}
                            >
                                <div style={{
                                    position: 'absolute',
                                    left:        0,
                                    right:       0,
                                    height:      1,
                                    top:         5, // vertically centred with the 14px dot
                                    background:  routeColor,
                                    opacity:     0.55,
                                }} />
                                <div style={{
                                    width:        10,
                                    height:       10,
                                    borderRadius: '50%',
                                    border:       `2px solid ${selected ? routeColor : 'currentColor'}`,
                                    background:   selected ? routeColor : 'hsl(var(--background))',
                                    boxShadow:    selected ? `0 0 0 3px ${routeColor}33` : 'none',
                                    transition:   'all 0.15s ease',
                                    cursor:       'pointer',
                                    zIndex:       1,
                                }} />
                                <span style={{
                                    fontSize:     10,
                                    maxWidth:     160,
                                    overflow:     'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace:   'nowrap',
                                    display:      'block',
                                    color:        selected
                                        ? 'var(--aa-chart-secondary-metric)'
                                        : 'hsl(var(--muted-foreground))',
                                }}>
                                    {st.name}
                                </span>
                            </button>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}

// ── Sankey helpers ────────────────────────────────────────────────────────────

// Build the Recharts Sankey `data` object from aggregated commute counts.
// Only non-zero flows produce nodes/links so the chart is always valid.
//
// Topology:
//   HW/WH boarding  → [Boarding]  → Station → [Alighting] → HW/WH alighting
//   prevStation (metro)           → Station →               nextStation (metro)
//
// Each link carries a `journey` field ('hw'|'wh'|'metro'|'boarding'|'alighting')
// used by the link renderer for colour.
//
// Station balance:
//   in  = totalBoard (via Boarding node) + (pt + totalAlight) (metro direct)
//   out = totalAlight (via Alighting node) + (pt + totalBoard) (metro direct) ✓
//
// Node 0 is always the station (center).
// Returns { nodes, links, meta, viaMetroIn, viaMetroOut }.

function buildSankeyData(
    { boardingHW, boardingWH, alightingHW, alightingWH, passthroughTotal },
    stationName,
    prevStationName,
    nextStationName,
) {
    // Node 0 = station (always present)
    const nodes = [{ name: stationName }];
    const meta  = [{ side: 'center', journey: null, label: null }];
    const links = []; // { source, target, value, journey }

    const pt          = passthroughTotal ?? 0;
    const totalBoard  = boardingHW  + boardingWH;
    const totalAlight = alightingHW + alightingWH;

    // Train load on the metro as it arrives / departs
    const viaMetroIn  = pt + totalAlight;
    const viaMetroOut = pt + totalBoard;

    const labelIn  = prevStationName ? `${prevStationName} →` : 'Prev. Stop →';
    const labelOut = nextStationName ? `→ ${nextStationName}` : '→ Next Stop';

    // ── "Boarding" aggregator (center-left) ──────────────────────────────────
    // All HW+WH boarders converge here first, then a single ribbon enters the station.
    let boardingIdx = null;
    if (totalBoard > 0) {
        boardingIdx = nodes.length;
        nodes.push({ name: 'Boarding' });
        meta.push({ side: 'center-left', journey: 'boarding', label: 'Boarding' });
        links.push({ source: boardingIdx, target: 0, value: totalBoard, journey: 'boarding' });
    }

    // ── "Alighting" aggregator (center-right) ────────────────────────────────
    // Station sends one ribbon here, which then fans out to HW/WH alighting nodes.
    let alightingIdx = null;
    if (totalAlight > 0) {
        alightingIdx = nodes.length;
        nodes.push({ name: 'Alighting' });
        meta.push({ side: 'center-right', journey: 'alighting', label: 'Alighting' });
        links.push({ source: 0, target: alightingIdx, value: totalAlight, journey: 'alighting' });
    }

    // ── Left: HW/WH boarding → Boarding aggregator ───────────────────────────
    if (boardingIdx !== null) {
        if (boardingHW > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Home → Work' });
            meta.push({ side: 'left', journey: 'hw', label: 'Work →' });
            links.push({ source: i, target: boardingIdx, value: boardingHW, journey: 'hw' });
        }
        if (boardingWH > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Work → Home' });
            meta.push({ side: 'left', journey: 'wh', label: 'Home →' });
            links.push({ source: i, target: boardingIdx, value: boardingWH, journey: 'wh' });
        }
    }

    // ── Left: Metro passthrough → Station (direct, skips Boarding) ───────────
    if (viaMetroIn > 0) {
        const i = nodes.length;
        nodes.push({ name: labelIn });
        meta.push({ side: 'left', journey: 'metro', label: '' });
        links.push({ source: i, target: 0, value: viaMetroIn, journey: 'metro' });
    }

    // ── Right: Alighting aggregator → HW/WH alighting ────────────────────────
    if (alightingIdx !== null) {
        if (alightingHW > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Home → Work' });
            meta.push({ side: 'right', journey: 'hw', label: '→ Work' });
            links.push({ source: alightingIdx, target: i, value: alightingHW, journey: 'hw' });
        }
        if (alightingWH > 0) {
            const i = nodes.length;
            nodes.push({ name: 'Work → Home' });
            meta.push({ side: 'right', journey: 'wh', label: '→ Home ' });
            links.push({ source: alightingIdx, target: i, value: alightingWH, journey: 'wh' });
        }
    }

    // ── Right: Station → Metro passthrough (direct, skips Alighting) ─────────
    if (viaMetroOut > 0) {
        const i = nodes.length;
        nodes.push({ name: labelOut });
        meta.push({ side: 'right', journey: 'metro', label: '' });
        links.push({ source: 0, target: i, value: viaMetroOut, journey: 'metro' });
    }

    return { nodes, links, meta, viaMetroIn, viaMetroOut };
}

// ── Custom Sankey node renderer ───────────────────────────────────────────────

// Neutral color for the Boarding/Alighting aggregator nodes
const COLOR_AGGREGATOR = '#64748b'; // slate-500

function makeNodeRenderer(meta, routeColor) {
    return function SankeyNode({ x, y, width, height, index }) {
        const m   = meta[index] ?? { side: 'center', journey: null };
        const w   = Math.max(width,  2);
        const h   = Math.max(height, 2);
        const mid = y + h / 2;

        const isCenter     = m.side === 'center';
        const isAggregator = m.side === 'center-left' || m.side === 'center-right';

        const color = isCenter          ? 'currentColor'
            : m.journey === 'hw'        ? COLOR_HOME_WORK
            : m.journey === 'wh'        ? COLOR_WORK_HOME
            : m.journey === 'metro'     ? routeColor
            : isAggregator              ? COLOR_AGGREGATOR
            :                             'currentColor';

        const opacity = isCenter ? 0.95 : 0.8;

        // Station and aggregator labels sit above the bar (centred).
        // Outer left/right node labels sit beside the bar.
        let textX, textAnchor, textY, baseline;
        if (isCenter || isAggregator) {
            textX      = x + w / 2;
            textAnchor = 'middle';
            textY      = y - 8;
            baseline   = 'auto';
        } else if (m.side === 'left') {
            textX      = x - 8;
            textAnchor = 'end';
            textY      = mid;
            baseline   = 'middle';
        } else { // right
            textX      = x + w + 8;
            textAnchor = 'start';
            textY      = mid;
            baseline   = 'middle';
        }

        const name = isCenter ? null : (m.label ?? '');

        return React.createElement('g', {}, [
            React.createElement('rect', {
                key: 'r',
                x, y, width: w, height: h,
                fill: color, fillOpacity: opacity, rx: 0,
            }),
            name && React.createElement('text', {
                key:              'label',
                x:                textX,
                y:                textY,
                textAnchor,
                dominantBaseline: baseline,
                fontSize:         11,
                fill:             'var(--aa-chart-secondary-metric)',
            }, name),
        ].filter(Boolean));
    };
}

// ── Custom Sankey link renderer ───────────────────────────────────────────────
//
// Colour is read from `link.journey` (set in buildSankeyData):
//   'hw'        → blue   (Home→Work)
//   'wh'        → red    (Work→Home)
//   'metro'     → route colour (passthrough train load)
//   'boarding'  → slate  (Boarding aggregator → Station)
//   'alighting' → slate  (Station → Alighting aggregator)

function makeLinkRenderer(links, routeColor) {
    return function SankeyLink({
        sourceX, targetX,
        sourceY, targetY,
        sourceControlX, targetControlX,
        linkWidth, index,
    }) {
        const link = links[index];
        if (!link) return null;

        const color = link.journey === 'hw'        ? COLOR_HOME_WORK
                    : link.journey === 'wh'        ? COLOR_WORK_HOME
                    : link.journey === 'metro'     ? routeColor
                    :                                COLOR_AGGREGATOR; // boarding/alighting

        const opacity = link.journey === 'metro'                                    ? 1
                      : link.journey === 'boarding' || link.journey === 'alighting' ? 0.5
                      :                                                               0.35; // hw/wh

        const d = [
            `M ${sourceX},${sourceY}`,
            `C ${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`,
        ].join(' ');

        return React.createElement('path', {
            d,
            strokeWidth:   Math.max(linkWidth, 1),
            stroke:        color,
            fill:          'none',
            strokeOpacity: opacity,
        });
    };
}

// ── Sankey chart ──────────────────────────────────────────────────────────────

function CommuteSankey({ data, stationName, routeColor, prevStationName, nextStationName }) {
    const total = data.boardingHW + data.boardingWH + data.alightingHW + data.alightingWH + data.passthroughTotal;

    if (total === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                {React.createElement(icons.Users, { size: 40, className: 'text-muted-foreground mb-3' })}
                <p className="text-sm text-muted-foreground">
                    No completed commute data for this station yet
                </p>
            </div>
        );
    }

    const { nodes, links, meta, viaMetroIn, viaMetroOut } = buildSankeyData(
        data, stationName, prevStationName, nextStationName,
    );

    // Memoize renderers so Recharts doesn't re-mount on every tick
    const NodeRenderer = React.useMemo(
        () => makeNodeRenderer(meta, routeColor),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(meta), routeColor],
    );
    const LinkRenderer = React.useMemo(
        () => makeLinkRenderer(links, routeColor),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [JSON.stringify(links), routeColor],
    );

    const totalBoarding  = data.boardingHW  + data.boardingWH;
    const totalAlighting = data.alightingHW + data.alightingWH;

    // Sankey might not be available in older Recharts bundles
    if (!charts.Sankey) {
        return (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Sankey chart not available in this version
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: 260, position: 'relative' }}>
            {/* Single summary row: train load arriving · station · train load departing */}
            <div
                className="absolute left-0 right-0 top-2 text-center font-bold text-foreground text-sm pointer-events-none whitespace-nowrap"
                style={{ zIndex: 1 }}
            >
                {stationName}
            </div>
            <charts.ResponsiveContainer width="100%" height="100%">
                <charts.Sankey
                    data={{ nodes, links }}
                    nodeWidth={14}
                    nodePadding={24}
                    iterations={0}
                    margin={{ top: 80, right: 160, bottom: 40, left: 160 }}
                    node={NodeRenderer}
                    link={LinkRenderer}
                >
                    <charts.Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0];
                            const val = p.value ?? p.payload?.value ?? 0;
                            return (
                                <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg text-xs">
                                    <div className="font-medium mb-1">{p.payload?.name || p.name || ''}</div>
                                    <div className="text-muted-foreground">{val.toLocaleString()} pops</div>
                                </div>
                            );
                        }}
                    />
                </charts.Sankey>
            </charts.ResponsiveContainer>
            {/* Single summary row: train load arriving · station · train load departing */}
            <div
                className="absolute left-0 right-0 bottom-0 grid text-center text-sm text-foreground pointer-events-none whitespace-nowrap"
                style={{ zIndex: 1, gridTemplateColumns: '1fr 0.15fr 1fr 0.15fr 1fr' }}
            >
                <span>
                    {prevStationName ? prevStationName : 'Previous Stop' }
                    {/*: <strong>{viaMetroIn.toLocaleString()}</strong>*/}
                </span>
                <span/>
                <span/>
                <span/>
                <span>
                    {nextStationName ? nextStationName : 'Next Stop' }
                    {/*<strong>{viaMetroOut.toLocaleString()}</strong> ↑*/}
                </span>
            </div>
        </div>
    );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function CommuteLegend({ routeColor }) {
    return (
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: COLOR_HOME_WORK }} />
                <span>Home → Work</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: COLOR_WORK_HOME }} />
                <span>Work → Home</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: COLOR_AGGREGATOR }} />
                <span>Boarding / Alighting</span>
            </div>
            <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: routeColor }} />
                <span>Passthrough</span>
            </div>
        </div>
    );
}

// ── Exported component ────────────────────────────────────────────────────────

export function CommuteFlow({ routeId, externalStationId }) {
    const routes = api.gameState.getRoutes();

    const { routeColor } = React.useMemo(() => {
        const r = routes.find(r => r.id === routeId);
        return {
            routeColor:     r?.color     ?? '#6b7280',
            routeTextColor: r?.textColor ?? '#ffffff',
        };
    }, [routeId, routes]);

    const stations = React.useMemo(
        () => (routeId ? getRouteStationsInOrder(routeId, api) : []),
        [routeId],
    );

    const [selectedId, setSelectedId] = React.useState(null);

    // Auto-select the first station; reset when the route changes
    React.useEffect(() => {
        setSelectedId(stations[0]?.id ?? null);
    }, [routeId]);

    // When a bar is clicked in StationFlow, honour that selection if the station
    // belongs to this route (guard against stale ids from a previous route).
    React.useEffect(() => {
        if (!externalStationId) return;
        if (stations.some(s => s.id === externalStationId)) {
            setSelectedId(externalStationId);
        }
    }, [externalStationId]);

    const commuteData     = useCommuteData(routeId, selectedId);
    const selectedStation = stations.find(s => s.id === selectedId);

    // Adjacent station names for "From …" / "To …" labels on the Via metro nodes
    const selectedIdx     = stations.findIndex(s => s.id === selectedId);
    const prevStationName = selectedIdx > 0                    ? stations[selectedIdx - 1].name : null;
    const nextStationName = selectedIdx < stations.length - 1  ? stations[selectedIdx + 1].name : null;

    if (stations.length === 0) {
        return (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                No stations found for this route
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* ── Legend ── */}
            <CommuteLegend routeColor={routeColor} />

            {/* ── Sankey chart ── */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {!commuteData ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        Loading…
                    </div>
                ) : (
                    <CommuteSankey
                        data={commuteData}
                        stationName={selectedStation?.name ?? ''}
                        routeColor={routeColor}
                        prevStationName={prevStationName}
                        nextStationName={nextStationName}
                    />
                )}
            </div>

            {/* ── Station strip toggler ── */}
            <StationStrip
                stations={stations}
                selectedId={selectedId}
                routeColor={routeColor}
                onSelect={setSelectedId}
            />
        </div>
    );
}
