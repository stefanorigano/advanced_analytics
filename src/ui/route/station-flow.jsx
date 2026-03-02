// Station Flow Component
// Displays passenger boarding/alighting patterns for a single route using smooth area charts
//
// LAYOUT:
// - Top X axis: time offsets per station, dashed reference line, bg-background labels,
//   directional ▶ arrows every two stations
// - Bottom X axis: station names (rotated -45°) with plain purple transfer circle indicators
// - Transfer info shown in the regular chart tooltip (below % choosing metro)

import { CONFIG } from '../../config.js';
import { RouteBadge } from '../../components/route-badge.jsx';
import { getRouteStationsInOrder } from '../../utils/route-utils.js';
import { getStationTransferRoutes } from '../../utils/transfer-utils.js';

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatOffset(seconds) {
    const totalSeconds = Math.round(seconds);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StationFlow({ routeId, onStationClick }) {
    const [flowData, setFlowData] = React.useState([]);

    const routes = api.gameState.getRoutes();

    React.useEffect(() => {
        if (!routeId) { setFlowData([]); return; }

        const updateData = () => {
            try {
                const ridershipData = api.gameState.getRouteRidership(routeId);
                if (!ridershipData?.byStation) { setFlowData([]); return; }

                const orderedStations = getRouteStationsInOrder(routeId, api);
                if (orderedStations.length === 0) { setFlowData([]); return; }

                const ridershipMap = new Map();
                ridershipData.byStation.forEach(d => {
                    ridershipMap.set(d.stationId, { popCount: d.popCount, percent: d.percent });
                });

                const midTimes = orderedStations.map(station => {
                    const arr = station.arrivalTime;
                    const dep = station.departureTime;
                    if (arr != null && dep != null) return (arr + dep) / 2;
                    return arr ?? dep ?? 0;
                });
                const t0 = midTimes[0];

                const processed = orderedStations.map((station, index) => {
                    const data      = ridershipMap.get(station.id);
                    const ridership = data?.popCount ?? 0;
                    const percent   = data?.percent != null ? parseFloat(data.percent.toFixed(2)) : null;
                    const transferRoutes = getStationTransferRoutes(station.id, routeId, api);

                    return {
                        index,
                        name:          station.name,
                        stationId:     station.id,
                        ridership,
                        percent,
                        transferRoutes,
                        hasTransfers:  transferRoutes.length > 0,
                        timeOffset:    midTimes[index] - t0,
                    };
                });

                setFlowData(processed);
            } catch (error) {
                console.error(`${CONFIG.LOG_PREFIX} Error fetching station flow:`, error);
                setFlowData([]);
            }
        };

        updateData();
        const interval = setInterval(updateData, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [routeId, routes]);

    const routeColor = React.useMemo(() => {
        if (!routeId) return '#22c55e';
        const route = routes.find(r => r.id === routeId);
        return route?.color || '#22c55e';
    }, [routeId, routes]);

    const routeTextColor = React.useMemo(() => {
        if (!routeId) return '#ffffff';
        const route = routes.find(r => r.id === routeId);
        return route?.textColor || '#ffffff';
    }, [routeId, routes]);

    return (
        <div className="aa-chart space-y-4">
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ background: routeColor }} />
                    <span>Ridership</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-6 h-0.5" style={{ background: 'var(--aa-chart-secondary-metric)' }} />
                    <span>% choosing metro</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <TransferDotPreview />
                    <span>Transfer</span>
                </div>
            </div>

            {/* Chart */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {flowData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <icons.TrendingUp size={48} className="text-muted-foreground mb-4" />
                        <div className="text-sm text-muted-foreground">
                            <p>No ridership data available for this route</p>
                        </div>
                    </div>
                ) : (
                    <FlowChart
                        data={flowData}
                        routeColor={routeColor}
                        routeTextColor={routeTextColor}
                        onStationClick={onStationClick}
                    />
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Transfer dot preview (legend)
// ---------------------------------------------------------------------------
function TransferDotPreview() {
    const h = React.createElement;
    const size = 12;
    const r    = size / 2;
    return h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
        h('circle', {
            cx: r, cy: r, r: r - 1,
            fill:        'hsla(var(--background))',
            stroke:      'var(--aa-transfer-color)',
            strokeWidth: 1.5,
        })
    );
}

// ---------------------------------------------------------------------------
// Custom top axis tick — time offset labels with bg-background
// Renders directional ▶ arrow after every station except the last,
// positioned at exactly half the tick spacing (measured via ResizeObserver).
// ---------------------------------------------------------------------------
function makeTopAxisTick(flowData, tickSpacing) {
    return function TopAxisTick(props) {
        const { x, y, payload } = props;
        const h = React.createElement;

        const dataPoint = flowData.find(d => d.name === payload.value);
        if (!dataPoint) return null;

        const offsetLabel = dataPoint.index === 0
            ? '0s'
            : `${formatOffset(dataPoint.timeOffset)}`;

        return h('g', { transform: `translate(${x},${y})` }, [
            // Time offset text — rotated like station names
            h('text', {
                key:        'label',
                x:          0,
                y:          0,
                dy:         -4,
                textAnchor: 'start',
                fill:       'hsl(var(--muted-foreground))',
                fontSize:   12,
                fontFamily: 'Monospace',
                transform:  'rotate(-45)',
            }, offsetLabel),
        ].filter(Boolean));
    };
}

// ---------------------------------------------------------------------------
// Custom bottom axis tick — station name + optional transfer circle (plain)
// ---------------------------------------------------------------------------
function makeBottomAxisTick(flowData) {
    return function BottomAxisTick(props) {
        const { x, y, payload } = props;
        const h = React.createElement;

        const MAX_LEN  = 14;
        const label    = payload.value && payload.value.length > MAX_LEN
            ? payload.value.slice(0, MAX_LEN - 1) + '…'
            : (payload.value || '');

        const dataPoint    = flowData.find(d => d.name === payload.value);
        const hasTransfers = dataPoint?.hasTransfers ?? false;

        const CR  = 6;   // circle radius
        const DY  = 10;  // y-offset from tick baseline
        const GAP = 3;   // gap between text right-edge and circle left-edge

        // Both text and circle share the same rotated coordinate system so the
        // circle appears inline as the "last character" of the label.
        return h('g', { transform: `translate(${x - 6},${y})` }, [
            h('g', { key: 'rotated', transform: 'rotate(-45)' }, [

                // Station name — shifted left to leave room for the circle when needed
                h('text', {
                    key:        'label',
                    x:          hasTransfers ? -(CR + GAP) : 0,
                    y:          DY,
                    textAnchor: 'end',
                    fill:       'hsl(var(--muted-foreground))',
                    fontSize:   12,
                }, label),

                // Transfer circle — sits right at the text anchor point (cx=0),
                // appearing as the last "letter" of the label in reading order
                hasTransfers && h('circle', {
                    key:         'transfer-circle',
                    cx:          0,
                    cy:          DY,
                    r:           CR,
                    fill:        'hsl(var(--background))',
                    stroke:      'var(--aa-transfer-color)',
                    strokeWidth: 1.5,
                }),

            ].filter(Boolean)),
        ].filter(Boolean));
    };
}

// ---------------------------------------------------------------------------
// Custom tooltip for chart hover
// ---------------------------------------------------------------------------
function makeChartTooltip(data, routeColor) {
    return function ChartTooltip({ active, payload, label }) {
        if (!active || !payload?.length) return null;
        const h = React.createElement;

        const ridershipEntry  = payload.find(p => p.dataKey === 'ridership');
        const percentEntry    = payload.find(p => p.dataKey === 'percent');
        const dataPoint       = data.find(d => d.name === label);
        const transferRoutes  = dataPoint?.transferRoutes ?? [];

        return h('div', {
            className: 'bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[160px]'
        }, [
            // Header: station name + time offset
            h('div', {
                key: 'header',
                className:'flex items-center justify-between gap-6 mb-3'
            }, [
                h('div', { key: 'title', className: 'font-medium'}, dataPoint?.name || label),
                dataPoint?.timeOffset != null && h('div', {
                    key:       'offset',
                    className: 'text-xs font-mono',
                }, dataPoint.index === 0 ? '0s' : `+${formatOffset(dataPoint.timeOffset)}`),
            ]),

            // Ridership row
            ridershipEntry && h('div', {
                key:       'ridership',
                className: 'flex items-center justify-between gap-6 text-xs mb-2'
            }, [
                h('div', { key: 'left', className: 'flex items-center gap-1.5' }, [
                    h('div', { key: 'dot', className: 'w-3 h-3 mr-1 rounded-sm', style: { background: routeColor } }),
                    h('span', { key: 'lbl', className: 'text-muted-foreground' }, 'Ridership'),
                ]),
                h('span', { key: 'val', className: 'font-mono font-medium' },
                    (ridershipEntry.value ?? 0).toLocaleString()),
            ]),

            // % choosing metro row
            percentEntry?.value != null && h('div', {
                key:       'percent',
                className: 'flex items-center justify-between gap-6 text-xs',
            }, [
                h('div', { key: 'left', className: 'flex items-center gap-1.5' }, [
                    h('div', { key: 'dot', className: 'w-3 h-0.5', style: { background: 'var(--aa-chart-secondary-metric)' } }),
                    h('span', { key: 'lbl', className: 'text-muted-foreground' }, '% choosing metro'),
                ]),
                h('span', { key: 'val', className: 'font-mono font-medium' },
                    `${percentEntry.value.toFixed(2)}%`),
            ]),

            // Transfers section
            transferRoutes.length > 0 && h('div', {
                key:       'transfers',
                className: 'mt-3 pt-2 border-t border-border',
            }, [
                h('div', {
                    key:       'transfers-title',
                    className: 'text-xs text-muted-foreground mb-1.5',
                }, 'Transfers'),
                h('div', {
                    key:       'transfers-badges',
                    className: 'flex flex-wrap gap-1',
                },
                    transferRoutes.map(tr =>
                        h(RouteBadge, { key: tr.routeId, routeId: tr.routeId, size: '1.2rem' })
                    )
                ),
            ]),
        ].filter(Boolean));
    };
}

// ---------------------------------------------------------------------------
// Y-axis formatters
// ---------------------------------------------------------------------------
function formatYAxisLeft(value) {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toLocaleString();
}
function formatYAxisRight(value) { return `${value}%`; }

// ---------------------------------------------------------------------------
// FlowChart
// ---------------------------------------------------------------------------
function FlowChart({ data, routeColor, routeTextColor, onStationClick }) {
    const h = React.createElement;

    // Measure container width to compute exact tick spacing for arrow placement
    const containerRef  = React.useRef(null);
    const [tickSpacing, setTickSpacing] = React.useState(null);

    React.useLayoutEffect(() => {
        if (!containerRef.current || data.length < 2) return;

        const measure = () => {
            // Recharts renders tick <text> elements inside .recharts-cartesian-axis-tick
            // We pick the top-axis ticks (first XAxis in the SVG) and read their x transforms
            const svg = containerRef.current.querySelector('svg.recharts-surface');
            if (!svg) return;

            // All tick groups for XAxis orientation=top live inside the first
            // .recharts-xAxis group that has "xaxis-top" referenced somewhere.
            // Simpler: grab all top-axis tick groups by reading their g[transform] x values.
            const topAxisGroups = svg.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick');
            if (topAxisGroups.length < 2) return;

            const xs = Array.from(topAxisGroups).map(g => {
                const t = g.getAttribute('transform') || '';
                const m = t.match(/translate\(([^,)]+)/);
                return m ? parseFloat(m[1]) : null;
            }).filter(v => v !== null).sort((a, b) => a - b);

            if (xs.length < 2) return;

            const spacing = xs[1] - xs[0];
            setTickSpacing(spacing);
        };

        // Measure after first paint and on resize
        const id = setTimeout(measure, 50);
        const ro = new ResizeObserver(measure);
        ro.observe(containerRef.current);
        return () => { clearTimeout(id); ro.disconnect(); };
    }, [data]);

    const TopTick    = React.useMemo(
        () => makeTopAxisTick(data, tickSpacing),
        [data, tickSpacing]
    );
    const BottomTick = React.useMemo(
        () => makeBottomAxisTick(data),
        [data]
    );
    const ChartTooltip = React.useMemo(
        () => makeChartTooltip(data, routeColor),
        [data, routeColor]
    );

    // Circle is now inline with the label, so height is uniform regardless of transfers
    const bottomAxisHeight = 90;

    return h('div', {
        ref:       containerRef,
        className: 'w-full',
        style:     { height: '420px', position: 'relative' },
    },
        // Dashed time-axis reference line — y=43 confirmed in browser.
        // x1/x2 clamped to first/last tick centres so it doesn't overflow.
        // No zIndex so it stays behind the chart content.
        h('svg', {
            key:   'time-axis-line',
            style: {
                position:      'absolute',
                top:           0,
                left:          0,
                width:         '100%',
                height:        '100%',
                pointerEvents: 'none',
                overflow:      'visible',
            }
        },
        ),
        h(charts.ResponsiveContainer, { width: '100%', height: '100%' },
            h(charts.ComposedChart, {
                data,
                margin: { top: 42, right: 0, left: 0, bottom: 10 },
            }, [
                h(charts.CartesianGrid, {
                    key: 'grid', strokeDasharray: '3 3', stroke: '#374151', opacity: 0.3,
                }),

                // ── Top X axis — time offsets ────────────────────────────────
                h(charts.XAxis, {
                    key:          'xaxis-top',
                    xAxisId:      'top',
                    dataKey:      'name',
                    orientation:  'top',
                    interval:     0,
                    height:       42,
                    tick:         TopTick,
                    tickLine:     false,
                    axisLine:     false,
                }),

                // ── Bottom X axis — station names + transfer circles ─────────
                h(charts.XAxis, {
                    key:         'xaxis-bottom',
                    xAxisId:     'bottom',
                    dataKey:     'name',
                    orientation: 'bottom',
                    stroke:      '#9ca3af',
                    interval:    0,
                    height:      bottomAxisHeight,
                    tick:        BottomTick,
                    tickLine:    false,
                    axisLine:    false,
                }),

                h(charts.YAxis, {
                    key: 'yaxis-left', yAxisId: 'left', stroke: "#9ca3af",
                    fontSize: 12, tickFormatter: formatYAxisLeft,
                    tickLine: false, axisLine: false,
                }),
                h(charts.YAxis, {
                    key: 'yaxis-right', yAxisId: 'right', orientation: 'right',
                    stroke: '#9ca3af', fontSize: 12,
                    tickFormatter: formatYAxisRight, domain: [0, 100],
                    tickLine: false, axisLine: false,
                }),

                h(charts.Tooltip, { key: 'tooltip', content: ChartTooltip }),

                h(charts.Bar, {
                    key:         'ridership',
                    xAxisId:     'bottom',
                    yAxisId:     'left',
                    dataKey:     'ridership',
                    stroke:      routeColor,
                    strokeWidth: 2,
                    fill:        routeColor,
                    fillOpacity: 0.3,
                    radius:      [2, 2, 0, 0],
                    activeBar:   { fillOpacity: 1 },
                    cursor:      onStationClick ? 'pointer' : undefined,
                    onClick:     onStationClick
                        ? (barData) => onStationClick(barData?.stationId)
                        : undefined,
                }),

                h(charts.Line, {
                    key:               'percent',
                    xAxisId:           'bottom',
                    yAxisId:           'right',
                    type:              'monotoneX',
                    dataKey:           'percent',
                    stroke:            'var(--aa-chart-secondary-metric)',
                    strokeWidth:       2,
                    dot:               false,
                    activeDot:         { r: 3, fill: routeTextColor },
                    connectNulls:      false,
                    strokeOpacity:     0.5,
                    animationDuration: 500,
                }),
            ])
        )
    );
}