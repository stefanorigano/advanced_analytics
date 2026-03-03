// Route Metrics Chart
// Time-series chart for a single route with multiple selectable metrics.
//
// Differences from DashboardTrends:
//   • Fixed to the route passed via props (no route selector)
//   • Multiple metrics selectable simultaneously via toggle chips
//   • Dual Y axes assigned dynamically by unit-type priority:
//       people > currency > percent > transfers > trains
//     The top 2 unit types among selected metrics become left/right axes.
//     Metrics of a 3rd+ type fold into the closer axis.
//   • Default selection: Ridership, Usage %, Daily Profit

import { CONFIG } from '../../config.js';
import { getAvailableDays } from '../../utils/formatting.js';
import { ButtonsGroup, ButtonsGroupItem } from '../../components/buttons-group.jsx';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from '../../metrics/route-metrics.js';
import { calculateTransfers } from '../../metrics/transfers.js';
import { getStorage } from '../../core/lifecycle.js';

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;

// ── Metric definitions ───────────────────────────────────────────────────────
// No static yAxis — axis assignment is computed dynamically from unit priority.

const METRICS = [
    { key: 'ridership',    label: 'Ridership',     color: '#3b82f6', unit: 'people'    },
    { key: 'capacity',     label: 'Throughput',    color: '#8b5cf6', unit: 'people'    },
    { key: 'dailyProfit',  label: 'Daily Profit',  color: '#06b6d4', unit: 'currency'  },
    { key: 'dailyRevenue', label: 'Daily Revenue', color: '#10b981', unit: 'currency'  },
    { key: 'dailyCost',    label: 'Daily Cost',    color: '#ef4444', unit: 'currency'  },
    { key: 'utilization',  label: 'Usage %',       color: '#22c55e', unit: 'percent'   },
    { key: 'transfers',    label: 'Transfers',     color: '#f59e0b', unit: 'transfers' },
    { key: 'totalTrains',  label: 'Trains',        color: '#a78bfa', unit: 'trains'    },
];

const DEFAULT_METRICS = ['ridership', 'utilization', 'dailyProfit'];

// Priority order for axis slot assignment (index 0 = highest priority = left axis)
const UNIT_PRIORITY = ['people', 'currency', 'percent', 'transfers', 'trains'];

const TIMEFRAMES = [
    { key: '7',   label: '7 Days'  },
    { key: '14',  label: '14 Days' },
    { key: 'all', label: 'All Time'},
];

const TODAY_LABEL = 'Today';

// ── Axis unit types ───────────────────────────────────────────────────────────

/**
 * Returns the distinct unit types present in the selected metrics,
 * sorted by UNIT_PRIORITY (index 0 = left axis, index 1 = right axis,
 * index 2+ = hidden axes that still provide correct per-unit scaling).
 */
function getAxisUnitTypes(selectedMetrics) {
    return [
        ...new Set(
            selectedMetrics
                .map(k => METRICS.find(m => m.key === k)?.unit)
                .filter(Boolean)
        )
    ].sort((a, b) => UNIT_PRIORITY.indexOf(a) - UNIT_PRIORITY.indexOf(b));
}

// ── Per-unit formatters ───────────────────────────────────────────────────────

// Axis tick labels (compact)
const AXIS_FORMATTERS = {
    people:    (v) => {
        if (v == null) return '';
        if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
        if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
        return v.toLocaleString();
    },
    currency:  (v) => {
        if (v == null) return '';
        if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
        if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
        return `$${v.toLocaleString()}`;
    },
    percent:   (v) => v == null ? '' : `${v}%`,
    transfers: (v) => v == null ? '' : String(Math.round(v)),
    trains:    (v) => v == null ? '' : String(Math.round(v)),
};

// Tooltip / legend values (full precision)
const VALUE_FORMATTERS = {
    people:    (v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    currency:  (v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    percent:   (v) => `${v.toFixed(1)}%`,
    transfers: (v) => String(Math.round(v)),
    trains:    (v) => String(Math.round(v)),
};

function formatMetricValue(metricKey, value) {
    if (value == null) return '—';
    const m = METRICS.find(m => m.key === metricKey);
    const fmt = VALUE_FORMATTERS[m?.unit];
    return fmt ? fmt(value) : value.toLocaleString();
}

// ── Data hook ────────────────────────────────────────────────────────────────

/**
 * Polls both historical storage data and live game state for a single route.
 * Returns { historicalData, liveData } where liveData contains all metric keys
 * including transfers and totalTrains.
 */
function useRouteMetricsData(routeId) {
    const [historicalData, setHistoricalData] = React.useState({ days: {} });
    const [liveData, setLiveData] = React.useState(null);

    // Poll historical from storage (infrequent — only updates end-of-day)
    React.useEffect(() => {
        const storage = getStorage();
        if (!storage) return;

        const fetchHistorical = async () => {
            const data = await storage.get('historicalData', { days: {} });
            setHistoricalData(data || { days: {} });
        };

        fetchHistorical();
        const interval = setInterval(fetchHistorical, 5000);
        return () => clearInterval(interval);
    }, []);

    // Poll live game state at normal refresh rate
    React.useEffect(() => {
        if (!routeId) { setLiveData(null); return; }

        const update = () => {
            const routes = api.gameState.getRoutes();
            const route  = routes.find(r => r.id === routeId);
            if (!route) { setLiveData(null); return; }

            const trainTypes  = api.trains.getTrainTypes();
            const lineMetrics = api.gameState.getLineMetrics();

            const lm           = lineMetrics.find(lm => lm.routeId === routeId);
            const ridership    = api.gameState.getRouteRidership(routeId).total;
            const dailyRevenue = lm ? lm.revenuePerHour * 24 : 0;
            const trainType    = trainTypes[route.trainType];

            // Transfer count (same as stat cards above the chart)
            const transfersMap  = calculateTransfers(routes, api);
            const transferCount = transfersMap[routeId]?.count ?? 0;

            if (!trainType || !validateRouteData(route)) {
                setLiveData({
                    ridership, dailyRevenue,
                    transfers: transferCount, totalTrains: 0,
                    ...getEmptyMetrics(),
                });
                return;
            }

            const calculated  = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
            const totalTrains = (calculated.trainsHigh   || 0)
                              + (calculated.trainsMedium || 0)
                              + (calculated.trainsLow    || 0);

            setLiveData({
                ridership, dailyRevenue,
                ...calculated,
                transfers: transferCount,
                totalTrains,
            });
        };

        update();
        const interval = setInterval(update, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [routeId]);

    return { historicalData, liveData };
}

// ── Main component ────────────────────────────────────────────────────────────

export function RouteMetrics({ routeId }) {
    const [chartType,       setChartType]       = React.useState('line');
    const [selectedMetrics, setSelectedMetrics] = React.useState(DEFAULT_METRICS);
    const [timeframe,       setTimeframe]       = React.useState('7');

    const { historicalData, liveData } = useRouteMetricsData(routeId);

    // All completed historical days, newest-first
    const allDays = React.useMemo(() => getAvailableDays(historicalData), [historicalData]);

    // Days to show based on timeframe (Today appended separately)
    const daysToShow = React.useMemo(() => {
        if (timeframe === 'all') return allDays;
        const limit = parseInt(timeframe) - 1; // "7 Days" = 6 historical + Today
        return allDays.slice(0, limit);
    }, [allDays, timeframe]);

    // Build chart data: historical oldest→newest, then Today
    const chartData = React.useMemo(() => {
        const historical = [...daysToShow].reverse().map(day => {
            const dayData    = historicalData.days[day];
            if (!dayData) return null;
            const routeEntry = dayData.routes?.find(r => r.id === routeId);
            if (!routeEntry) return null;

            const point = { day, isLive: false };
            METRICS.forEach(m => { point[m.key] = routeEntry[m.key] ?? null; });
            // transfers is stored as { count, routes, stationIds } — extract the number
            point.transfers  = routeEntry.transfers?.count ?? null;
            // totalTrains is not stored directly — derive from the three period counts
            point.totalTrains = routeEntry.trainsLow != null
                ? (routeEntry.trainsLow || 0) + (routeEntry.trainsMedium || 0) + (routeEntry.trainsHigh || 0)
                : null;
            return point;
        }).filter(Boolean);

        if (liveData) {
            const todayPoint = { day: TODAY_LABEL, isLive: true };
            METRICS.forEach(m => { todayPoint[m.key] = liveData[m.key] ?? null; });
            historical.push(todayPoint);
        }

        return historical;
    }, [routeId, daysToShow, historicalData, liveData]);

    // Ordered unit types for the selected metrics (index 0=left, 1=right, 2+=hidden)
    const axisUnitTypes = React.useMemo(
        () => getAxisUnitTypes(selectedMetrics),
        [selectedMetrics]
    );

    const toggleMetric = (key) => {
        setSelectedMetrics(prev =>
            prev.includes(key)
                ? prev.length > 1 ? prev.filter(k => k !== key) : prev   // keep ≥1 active
                : [...prev, key]
        );
    };

    return (
        <div className="space-y-4">
            {/* ── Controls ── */}
            <div className="flex items-center justify-between gap-4 flex-wrap">

                {/* Chart type toggle */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Chart:</span>
                    <ButtonsGroup value={chartType} onChange={setChartType}>
                        <ButtonsGroupItem value="line" text="Line" />
                        <ButtonsGroupItem value="bar"  text="Bar"  />
                    </ButtonsGroup>
                </div>

                {/* Metric toggle chips */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">Metrics:</span>
                    <div className="flex gap-1.5 flex-wrap">
                        {METRICS.map(metric => {
                            const active = selectedMetrics.includes(metric.key);
                            return (
                                <button
                                    key={metric.key}
                                    onClick={() => toggleMetric(metric.key)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                                        active
                                            ? 'border-transparent text-white'
                                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                    }`}
                                    style={active ? { backgroundColor: metric.color, borderColor: metric.color } : {}}
                                >
                                    {active && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                                    )}
                                    {metric.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Timeframe selector */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Period:</span>
                    <ButtonsGroup value={timeframe} onChange={setTimeframe}>
                        {TIMEFRAMES.map(tf => (
                            <ButtonsGroupItem key={tf.key} value={tf.key} text={tf.label} />
                        ))}
                    </ButtonsGroup>
                </div>
            </div>

            {/* ── Chart area ── */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {chartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <icons.LineChart size={48} className="text-muted-foreground mb-4" />
                        <p className="text-sm text-muted-foreground">No data available yet</p>
                    </div>
                ) : (
                    <RouteMetricsChart
                        data={chartData}
                        selectedMetrics={selectedMetrics}
                        chartType={chartType}
                        axisUnitTypes={axisUnitTypes}
                    />
                )}
            </div>
        </div>
    );
}

// ── Chart sub-component ───────────────────────────────────────────────────────
//
// Key design: each metric's yAxisId = its unit type string (e.g. 'people').
// We mount one YAxis per distinct unit type:
//   index 0 → left,  visible tick labels
//   index 1 → right, visible tick labels
//   index 2+ → left orientation, hidden ticks, width=0 (no layout space)
// This ensures every metric is scaled correctly against its own domain,
// even when 3+ unit types are selected simultaneously.

function RouteMetricsChart({ data, selectedMetrics, chartType, axisUnitTypes }) {
    const h = React.createElement;

    const leftUnit  = axisUnitTypes[0] ?? null;
    const rightUnit = axisUnitTypes[1] ?? null;   // null if only one unit type

    // ── Custom tooltip ───────────────────────────────────────────────────────

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        const isLivePoint = label === TODAY_LABEL;

        return h('div', {
            className: 'bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[170px]'
        }, [
            h('div', {
                key: 'header',
                className: 'text-xs font-medium mb-2 text-muted-foreground flex items-center gap-1.5'
            }, [
                isLivePoint && h('span', {
                    key: 'live',
                    className: 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30'
                }, [
                    h('span', { key: 'pulse', className: 'w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse' }),
                    'LIVE'
                ]),
                h('span', { key: 'day' }, isLivePoint ? 'Today (partial day)' : `Day ${label}`)
            ]),

            ...selectedMetrics.map(metricKey => {
                const metricDef = METRICS.find(m => m.key === metricKey);
                if (!metricDef) return null;
                const entry = payload.find(p => p.dataKey === metricKey);
                const value = entry?.value;

                return h('div', {
                    key: metricKey,
                    className: 'flex items-center justify-between gap-6 text-xs mt-1.5'
                }, [
                    h('div', { key: 'label', className: 'flex items-center gap-1.5' }, [
                        h('div', {
                            key: 'dot',
                            className: 'w-2 h-2 rounded-full flex-shrink-0',
                            style: { backgroundColor: metricDef.color }
                        }),
                        h('span', { key: 'name', className: 'text-muted-foreground' }, metricDef.label)
                    ]),
                    h('span', { key: 'val', className: 'font-mono font-medium' },
                        formatMetricValue(metricKey, value))
                ]);
            }).filter(Boolean)
        ]);
    };

    // ── Custom dot (dims the live Today point) ───────────────────────────────

    const makeDot = (color) => (props) => {
        const { cx, cy, value, payload } = props;
        if (value == null) return null;
        if (!payload?.isLive) {
            return h('circle', { cx, cy, r: 3, fill: color, stroke: 'none' });
        }
        return h('circle', {
            cx, cy, r: 4,
            fill: 'none', stroke: color, strokeWidth: 1.5,
            opacity: 0.65, strokeDasharray: '2 1',
        });
    };

    // ── Custom bar shape (dims the live Today bar) ───────────────────────────

    const makeLiveBar = (color) => function LiveBar(props) {
        const { x, y, width, height, payload } = props;
        if (!width || !height) return null;
        const rectY      = height < 0 ? y + height : y;
        const rectHeight = Math.abs(height);
        return h('rect', {
            x, y: rectY, width, height: rectHeight, rx: 2, ry: 2,
            fill: color, stroke: color, strokeWidth: 1,
            fillOpacity:     payload?.isLive ? 0.2 : 0.3,
            strokeDasharray: payload?.isLive ? '3 3' : undefined,
        });
    };

    // ── Metric colour legend ─────────────────────────────────────────────────

    const MetricLegend = () =>
        h('div', { className: 'flex items-center justify-center gap-4 flex-wrap pt-1' },
            selectedMetrics.map(key => {
                const m = METRICS.find(m => m.key === key);
                if (!m) return null;
                // Arrow shows which visible axis this metric's scale is read from.
                // Hidden axes (index ≥ 2) show a small dot indicator instead.
                const unitIndex = axisUnitTypes.indexOf(m.unit);
                const axisHint  = unitIndex === 0 ? '←'
                                : unitIndex === 1 ? '→'
                                : '·';
                return h('div', {
                    key,
                    className: 'flex items-center gap-1.5 text-xs text-muted-foreground'
                }, [
                    h('div', { key: 'dot', className: 'w-2.5 h-2.5 rounded-full', style: { backgroundColor: m.color } }),
                    h('span', { key: 'lbl' }, m.label),
                    axisUnitTypes.length > 1 && h('span', {
                        key: 'axis',
                        className: 'text-[10px] text-muted-foreground/50'
                    }, axisHint),
                ]);
            }).filter(Boolean)
        );

    // ── Y axes ───────────────────────────────────────────────────────────────
    // One YAxis per distinct unit type.
    // Axes at index 0 and 1 are visible (left / right).
    // Axes at index ≥ 2 are invisible (width=0, no ticks) but still registered
    // so Recharts computes the correct domain/scale for their series.

    const yAxes = axisUnitTypes.map((unit, i) => {
        const isRight  = i === 1;
        const isHidden = i >= 2;
        return h(charts.YAxis, {
            key:           `yaxis-${unit}`,
            yAxisId:       unit,
            orientation:   isRight ? 'right' : 'left',
            stroke:        '#9ca3af',
            fontSize:      12,
            tickFormatter: isHidden ? () => '' : AXIS_FORMATTERS[unit],
            axisLine:      !isHidden,
            tickLine:      !isHidden,
            tick:          !isHidden,
            width:         isHidden ? 0 : undefined,
        });
    });

    // ── Shared chart props ───────────────────────────────────────────────────

    const commonProps = {
        data,
        margin: { top: 20, right: rightUnit ? 55 : 10, left: 0, bottom: 20 },
    };

    const xAxisProps = {
        key:           'xaxis',
        dataKey:       'day',
        stroke:        '#9ca3af',
        fontSize:      12,
        tickFormatter: (day) => day === TODAY_LABEL ? '▸ Today' : `Day ${day}`,
        padding:       { right: 32, left: 32 },
        axisLine:      false,
        tickLine:      false,
    };

    const gridProps = {
        key:             'grid',
        strokeDasharray: '3 3',
        stroke:          '#374151',
        opacity:         0.3,
    };

    // ReferenceLine always uses the left unit axis (index 0, always present)
    const todayRefLine = h(charts.ReferenceLine, {
        key:             'today-ref',
        yAxisId:         leftUnit,
        x:               TODAY_LABEL,
        stroke:          '#6b7280',
        strokeDasharray: '4 3',
        strokeOpacity:   0.5,
        label:           { value: '', position: 'insideTopRight' },
    });

    // ── Series — each metric uses its own unit type as yAxisId ───────────────

    const series = selectedMetrics.map(metricKey => {
        const m = METRICS.find(m => m.key === metricKey);
        if (!m) return null;

        if (chartType === 'bar') {
            return h(charts.Bar, {
                key:     metricKey,
                dataKey: metricKey,
                yAxisId: m.unit,      // ← unit type, not 'left'/'right'
                shape:   makeLiveBar(m.color),
            });
        }

        return h(charts.Line, {
            key:               metricKey,
            type:              'monotone',
            dataKey:           metricKey,
            yAxisId:           m.unit, // ← unit type, not 'left'/'right'
            stroke:            m.color,
            strokeWidth:       2,
            dot:               makeDot(m.color),
            activeDot:         { r: 5 },
            connectNulls:      false,
            animationDuration: 500,
        });
    }).filter(Boolean);

    // ── Render ───────────────────────────────────────────────────────────────

    const ChartComponent = chartType === 'line' ? charts.LineChart : charts.BarChart;

    return h('div', { className: 'aa-chart w-full', style: { height: '340px' } },
        h(charts.ResponsiveContainer, { width: '100%', height: '100%' },
            h(ChartComponent, commonProps, [
                h(charts.CartesianGrid, gridProps),
                h(charts.XAxis,   xAxisProps),
                ...yAxes,
                h(charts.Tooltip, { key: 'tooltip', content: CustomTooltip }),
                h(charts.Legend,  { key: 'legend',  content: MetricLegend  }),
                todayRefLine,
                ...series,
            ])
        )
    );
}
