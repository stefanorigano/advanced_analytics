// Analytics Chart Component
// Displays time-series charts for route metrics
//
// LIVE DATA INTEGRATION:
// When liveRouteData is provided the chart injects a synthetic "Today" data
// point at the right edge of the series.  It is rendered with:
//   • dashed stroke for the segment leading into it
//   • lower opacity on the dot
//   • tooltip showing both raw (partial day) and projected (extrapolated to 24h)
//     values for time-dependent metrics (cost, revenue, profit, capacity)
//
// Metrics that are NOT time-dependent (ridership, utilization, stations,
// transfers) show only the raw live value — extrapolation would be misleading.

import { CONFIG } from '../../config.js';
import { getAvailableDays } from '../../utils/formatting.js';
import { ButtonsGroup, ButtonsGroupItem } from '../../components/buttons-group.jsx';
import { Dropdown } from '../../components/dropdown.jsx';
import { DropdownItem } from '../../components/dropdown-item.jsx';
import { RouteBadge } from '../../components/route-badge.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;

// ── Constants ───────────────────────────────────────────────────────────────

const CHART_METRICS = [
    { key: 'ridership',   label: 'Ridership',      color: '#3b82f6' },
    { key: 'capacity',    label: 'Throughput',     color: '#8b5cf6' },
    { key: 'utilization', label: 'Usage %',        color: '#22c55e' },
    { key: 'dailyCost',   label: 'Daily Cost',     color: '#ef4444' },
    { key: 'dailyRevenue',label: 'Daily Revenue',  color: '#10b981' },
    { key: 'dailyProfit', label: 'Daily Profit',   color: '#06b6d4' },
];

// Timeframes: "7 Days" now means 6 historical days + Today
const TIMEFRAMES = [
    { key: '7',   label: '7 Days'   },
    { key: '14',  label: '14 Days'  },
    { key: 'all', label: 'All Time' },
];

// Label used for the synthetic today entry
const TODAY_LABEL = 'Today';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the projected (full-day extrapolated) value for a time-based metric.
 * Build the synthetic "Today" data point from liveRouteData.
 * Returns an object shaped like a historical day's route entry but tagged
 * with isLive = true.
 *
 * @param {Array}  liveRouteData  - Output of useRouteMetrics in live mode
 * @param {string} metricKey      - Currently selected metric
 * @returns {Object}              - Data point for Recharts
 */
function buildTodayPoint(liveRouteData, metricKey) {
    const point = { day: TODAY_LABEL, isLive: true };
    liveRouteData.forEach(route => {
        point[route.id] = route[metricKey] ?? 0;
    });
    return point;
}

// ── Main component ───────────────────────────────────────────────────────────

export function DashboardTrends({ historicalData, liveRouteData = [] }) {
    const [chartType,       setChartType]       = React.useState('line');
    const [selectedRoutes,  setSelectedRoutes]  = React.useState([]);
    const [selectedMetric,  setSelectedMetric]  = React.useState('utilization');
    const [timeframe,       setTimeframe]        = React.useState('7');
    const [hoveredRoute,    setHoveredRoute]     = React.useState(null);

    const routes = api.gameState.getRoutes();

    const metricConfig = CHART_METRICS.find(m => m.key === selectedMetric);

    // All completed historical days, newest-first
    const allDays = React.useMemo(() => getAvailableDays(historicalData), [historicalData]);

    // Days to show based on timeframe (excluding Today — added separately)
    const daysToShow = React.useMemo(() => {
        if (timeframe === 'all') return allDays;
        // "7 Days" = 6 historical + Today, so slice to limit - 1
        const limit = parseInt(timeframe) - 1;
        return allDays.slice(0, limit);
    }, [allDays, timeframe]);

    // Build chart data: historical (oldest→newest) + Today
    const chartData = React.useMemo(() => {
        if (selectedRoutes.length === 0) return [];

        // Historical points (reverse to chronological order)
        const historical = [...daysToShow].reverse().map(day => {
            const dayData = historicalData.days[day];
            if (!dayData) return null;

            const point = { day, isLive: false };
            selectedRoutes.forEach(routeId => {
                const routeData = dayData.routes.find(r => r.id === routeId);
                point[routeId] = routeData?.[selectedMetric] ?? null;
                // No projected key for historical — they are complete days
            });
            return point;
        }).filter(Boolean);

        // Today point (only if we have live data)
        const todayPoint = liveRouteData.length > 0
            ? buildTodayPoint(liveRouteData, selectedMetric)
            : null;

        return todayPoint ? [...historical, todayPoint] : historical;
    }, [selectedRoutes, selectedMetric, daysToShow, historicalData, liveRouteData]);

    // Auto-select top 3 routes by ridership on first render
    React.useEffect(() => {
        if (selectedRoutes.length > 0) return;
        if (routes.length === 0) return;

        // Prefer live data for ranking; fall back to most-recent historical day
        if (liveRouteData.length > 0) {
            const top = [...liveRouteData]
                .sort((a, b) => b.ridership - a.ridership)
                .slice(0, 3)
                .map(r => r.id);
            setSelectedRoutes(top);
            return;
        }

        if (allDays.length > 0) {
            const recentDay  = allDays[0];
            const recentData = historicalData.days[recentDay];
            if (recentData?.routes) {
                const top = [...recentData.routes]
                    .sort((a, b) => b.ridership - a.ridership)
                    .slice(0, 3)
                    .map(r => r.id);
                setSelectedRoutes(top);
            }
        }
    }, [routes, allDays, historicalData, liveRouteData, selectedRoutes.length]);

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between gap-4">
                {/* Chart type */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Chart:</span>
                    <ButtonsGroup value={chartType} onChange={setChartType}>
                        <ButtonsGroupItem value="line" text="Line" />
                        <ButtonsGroupItem value="bar"  text="Bar"  />
                    </ButtonsGroup>
                </div>

                {/* Route & Metric selection */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Routes:</span>
                    <Dropdown
                        togglerContent={
                            selectedRoutes.length === 1
                                ? <RouteBadge routeId={selectedRoutes[0]} size="1.2rem" interactive={false} />
                                : null
                        }
                        togglerIcon={selectedRoutes.length === 0 ? icons.Route : null}
                        togglerText={
                            selectedRoutes.length === 0 ? 'Select routes'
                            : selectedRoutes.length > 1  ? `${selectedRoutes.length} selected`
                            : null
                        }
                        togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                        menuClasses="min-w-[200px] max-h-[300px] overflow-y-auto"
                        multiselect={true}
                        value={selectedRoutes}
                        onChange={setSelectedRoutes}
                    >
                        {routes.map(route => (
                            <DropdownItem
                                key={route.id}
                                route={route}
                                active={selectedRoutes.includes(route.id)}
                                onClick={() => {
                                    const next = selectedRoutes.includes(route.id)
                                        ? selectedRoutes.filter(id => id !== route.id)
                                        : [...selectedRoutes, route.id];
                                    setSelectedRoutes(next);
                                }}
                                hoveredRoute={hoveredRoute}
                                onHover={setHoveredRoute}
                                onLeave={() => setHoveredRoute(null)}
                            />
                        ))}
                    </Dropdown>

                    <span className="text-xs font-medium">Metric:</span>
                    <Dropdown
                        togglerIcon={icons.LineChart}
                        togglerText={metricConfig?.label || 'Select metric'}
                        togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                        menuClasses="min-w-[180px]"
                        multiselect={false}
                        value={selectedMetric}
                        onChange={setSelectedMetric}
                    >
                        {CHART_METRICS.map(metric => (
                            <DropdownItem
                                key={metric.key}
                                value={metric.key}
                                text={metric.label}
                            />
                        ))}
                    </Dropdown>
                </div>

                {/* Timeframe */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Period:</span>
                    <ButtonsGroup value={timeframe} onChange={setTimeframe}>
                        {TIMEFRAMES.map(tf => (
                            <ButtonsGroupItem key={tf.key} value={tf.key} text={tf.label} />
                        ))}
                    </ButtonsGroup>
                </div>
            </div>

            {/* Chart */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {chartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <icons.LineChart size={48} className="text-muted-foreground mb-4" />
                        <div className="text-sm text-muted-foreground">
                            {selectedRoutes.length === 0 ? (
                                <p>Select routes to display chart</p>
                            ) : daysToShow.length === 0 && liveRouteData.length === 0 ? (
                                <p>No data available yet</p>
                            ) : (
                                <p>No data available for selected timeframe</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <ChartDisplay
                        data={chartData}
                        routes={routes}
                        selectedRoutes={selectedRoutes}
                        metricKey={selectedMetric}
                        metricLabel={metricConfig?.label}
                        chartType={chartType}
                        hoveredRoute={hoveredRoute}
                        onHover={setHoveredRoute}
                        onLeave={() => setHoveredRoute(null)}
                    />
                )}
            </div>
        </div>
    );
}

// ── Chart display ────────────────────────────────────────────────────────────

function ChartDisplay({ data, routes, selectedRoutes, metricKey, metricLabel, chartType,
                        hoveredRoute, onHover, onLeave }) {
    const h = React.createElement;

    const getRouteColor = (routeId) => {
        const route = routes.find(r => r.id === routeId);
        return route?.color || '#888888';
    };

    // ── Formatters ───────────────────────────────────────────────────────────

    const formatYAxis = (value) => {
        if (['dailyCost', 'dailyRevenue', 'dailyProfit'].includes(metricKey)) {
            if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
            if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}k`;
            return `$${value}`;
        }
        if (metricKey === 'utilization') return `${value}%`;
        if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
        return value.toLocaleString();
    };

    const formatValue = (value) => {
        if (value == null) return '—';
        if (['dailyCost', 'dailyRevenue', 'dailyProfit'].includes(metricKey)) {
            return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        }
        if (metricKey === 'utilization') return `${value}%`;
        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    };

    // ── Custom tooltip ────────────────────────────────────────────────────────

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        const isLivePoint = label === TODAY_LABEL;

        return h('div', {
            className: 'bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg'
        }, [
            h('div', {
                key: 'label',
                className: 'text-xs font-medium mb-2 text-muted-foreground flex items-center gap-1.5'
            }, [
                isLivePoint && h('span', {
                    key: 'live-badge',
                    className: 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30'
                }, [
                    h('span', { key: 'dot', className: 'w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse' }),
                    'LIVE'
                ]),
                h('span', { key: 'day-label' }, isLivePoint ? 'Today (partial day)' : `Day ${label}`)
            ]),

            // Per-route rows
            ...selectedRoutes.map((routeId, i) => {
                const route      = routes.find(r => r.id === routeId);
                const routeName  = route?.name || route?.bullet || routeId;
                const rawEntry   = payload.find(p => p.dataKey === routeId);
                const rawVal     = rawEntry?.value;

                return h('div', { key: routeId, className: 'mt-1' }, [
                    // Route name + color pip
                    h('div', { key: 'name', className: 'flex items-center gap-1.5 mb-0.5' }, [
                        h('div', {
                            key: 'pip',
                            className: 'w-3 h-3 rounded-full flex-shrink-0',
                            style: { backgroundColor: getRouteColor(routeId) }
                        }),
                        h('span', { key: 'label', className: 'text-xs font-medium' }, routeName)
                    ]),

                    h('div', {
                        key: 'val',
                        className: 'flex items-center justify-between gap-6 text-xs pl-4'
                    }, [
                        h('span', { key: 'k', className: 'text-muted-foreground' }, metricLabel),
                        h('span', { key: 'v', className: 'font-mono font-medium' },
                            formatValue(rawVal))
                    ]),
                ]);
            })
        ]);
    };

    // ── Custom dot — dim the "Today" dot; hide dots for null values ──────────
    // Recharts calls the dot renderer even for null/undefined values (producing
    // ghost dots at y=0 or the axis edge for routes that didn't exist yet).
    // Returning null suppresses the element entirely for those points.

    const makeLiveDot = (color) => (props) => {
        const { cx, cy, value, payload } = props;
        // Suppress dot when there is no data for this route on this day
        if (value == null) return null;
        if (!payload?.isLive) {
            return h('circle', { cx, cy, r: 3, fill: color, stroke: 'none' });
        }
        return h('circle', {
            cx, cy, r: 4,
            fill: 'none',
            stroke: color,
            strokeWidth: 1.5,
            opacity: 0.65,
            strokeDasharray: '2 1',
        });
    };

    // ── Segment colour — dashed approaching Today ─────────────────────────────
    // Recharts doesn't natively support per-segment dash patterns on Line, so
    // we overlay a second hidden Line for the projected series and rely on the
    // dot customisation + a vertical ReferenceLine to communicate "live edge".

    const commonProps = {
        data,
        margin: { top: 20, right: 0, left: 0, bottom: 20 },
    };

    const xAxisProps = {
        key:          'xaxis',
        dataKey:      'day',
        stroke:       '#9ca3af',
        fontSize:     12,
        tickFormatter: (day) => day === TODAY_LABEL ? '▸ Today' : `Day ${day}`,
        // Add breathing room after the Today tick so it doesn't hug the border
        padding:      { right: 32, left: 32 },
        axisLine:     false,
        tickLine:     false,
    };

    const yAxisProps = {
        key:           'yaxis',
        stroke:        '#9ca3af',
        fontSize:      12,
        tickFormatter: formatYAxis,
        axisLine:      false,
        tickLine:      false,
    };

    const gridProps = {
        key:             'grid',
        strokeDasharray: '3 3',
        stroke:          '#374151',
        opacity:         0.3,
    };

    // Vertical marker at the Today boundary
    const todayRefLine = h(charts.ReferenceLine, {
        key:    'today-ref',
        x:      TODAY_LABEL,
        stroke: '#6b7280',
        strokeDasharray: '4 3',
        strokeOpacity:   0.5,
        label:  { value: '', position: 'insideTopRight' },
    });

    // Custom badge legend — renders a RouteBadge per visible series.
    // Hovering a badge dims all other routes to 50% opacity.
    const BadgeLegend = ({ payload }) => {
        if (!payload?.length) return null;
        const visible = payload;
        return h('div', {
            className: 'flex items-center justify-center gap-3 flex-wrap pt-1'
        },
            visible.map(entry =>
                h('div', {
                    key:          entry.dataKey,
                    className:    'flex items-center gap-1.5 cursor-pointer transition-opacity',
                    style:        { opacity: hoveredRoute && hoveredRoute !== entry.dataKey ? 0.5 : 1 },
                    onMouseEnter: () => onHover?.(entry.dataKey),
                    onMouseLeave: () => onLeave?.(),
                }, [
                    h(RouteBadge, { key: 'badge', routeId: entry.dataKey, size: '1.3rem' }),
                ])
            )
        );
    };

    if (chartType === 'line') {
        return h('div', {
            className: 'aa-chart w-full',
            style: { height: '400px' }
        },
            h(charts.ResponsiveContainer, { width: '100%', height: '100%' },
                h(charts.LineChart, commonProps, [
                    h(charts.CartesianGrid, gridProps),
                    h(charts.XAxis, xAxisProps),
                    h(charts.YAxis, yAxisProps),
                    h(charts.Tooltip, { key: 'tooltip', content: CustomTooltip }),
                    h(charts.Legend, {
                        key:     'legend',
                        content: BadgeLegend,
                    }),
                    todayRefLine,

                    // Main series per route — dim non-hovered routes
                    ...selectedRoutes.map(routeId =>
                        h(charts.Line, {
                            key:          routeId,
                            type:         'monotone',
                            dataKey:      routeId,
                            stroke:       getRouteColor(routeId),
                            strokeWidth:  hoveredRoute === routeId ? 3 : 2,
                            strokeOpacity: hoveredRoute && hoveredRoute !== routeId ? 0.2 : 1,
                            dot:          makeLiveDot(getRouteColor(routeId)),
                            activeDot:    { r: 5 },
                            connectNulls: false,
                            style:        { transition: 'stroke-opacity 0.15s, stroke-width 0.15s' },
                            animationDuration: 500,
                        })
                    ),

                ])
            )
        );
    }

    // ── Bar chart ─────────────────────────────────────────────────────────────
    // Today's bar is rendered at reduced opacity to signal "partial day".
    // Recharts Cell lets us style individual bars.

    const makeLiveBar = (color, routeId) => {
        // Dims "Today" bars (partial day) and non-hovered routes
        return function LiveBarShape(props) {
            const { x, y, width, height, payload } = props;
            const liveFillOpacity   = payload?.isLive ? 0.2 : 0.3;
            const fillOpacity  = hoveredRoute && hoveredRoute !== routeId ? 0.1 : liveFillOpacity;
            const strokeDasharray  = payload?.isLive ? '3 3' : false;
            const opacity  = hoveredRoute && hoveredRoute !== routeId ? 0.2 : 1;

            return h('rect', {
                x, y, width, height,
                rx: 2,
                ry: 2,
                fill: color,
                stroke: color,
                strokeWidth: 1,
                opacity: opacity,
                fillOpacity: fillOpacity,
                strokeDasharray: strokeDasharray,
            });
        };
    };

    return h('div', {
        className: 'aa-chart w-full',
        style: { height: '400px' }
    },
        h(charts.ResponsiveContainer, { width: '100%', height: '100%' },
            h(charts.BarChart, commonProps, [
                h(charts.CartesianGrid, gridProps),
                h(charts.XAxis, xAxisProps),
                h(charts.YAxis, yAxisProps),
                h(charts.Tooltip, { key: 'tooltip', content: CustomTooltip }),
                h(charts.Legend, {
                    key:     'legend',
                    content: BadgeLegend,
                }),
                todayRefLine,

                ...selectedRoutes.map(routeId =>
                    h(charts.Bar, {
                        key:     routeId,
                        dataKey: routeId,
                        shape:   makeLiveBar(getRouteColor(routeId), routeId),
                    })
                ),
            ])
        )
    );
}
