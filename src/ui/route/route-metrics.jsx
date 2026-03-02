// Route Metrics Chart
// Time-series chart for a single route with multiple selectable metrics.
//
// Differences from DashboardTrends:
//   • Fixed to the route passed via props (no route selector)
//   • Multiple metrics selectable simultaneously via toggle chips
//   • Dual Y axes: left = count/currency, right = percent (Usage %)
//   • Default selection: Ridership, Usage %, Daily Profit

import { CONFIG } from '../../config.js';
import { getAvailableDays } from '../../utils/formatting.js';
import { ButtonsGroup, ButtonsGroupItem } from '../../components/buttons-group.jsx';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from '../../metrics/route-metrics.js';
import { getStorage } from '../../core/lifecycle.js';

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;

// ── Metric definitions ───────────────────────────────────────────────────────

const METRICS = [
    { key: 'ridership',    label: 'Ridership',     color: '#3b82f6', yAxis: 'left',  unit: 'count'    },
    { key: 'capacity',     label: 'Throughput',    color: '#8b5cf6', yAxis: 'left',  unit: 'count'    },
    { key: 'utilization',  label: 'Usage %',       color: '#22c55e', yAxis: 'right', unit: 'percent'  },
    { key: 'dailyCost',    label: 'Daily Cost',    color: '#ef4444', yAxis: 'left',  unit: 'currency' },
    { key: 'dailyRevenue', label: 'Daily Revenue', color: '#10b981', yAxis: 'left',  unit: 'currency' },
    { key: 'dailyProfit',  label: 'Daily Profit',  color: '#06b6d4', yAxis: 'left',  unit: 'currency' },
];

const DEFAULT_METRICS = ['ridership', 'utilization', 'dailyProfit'];

const TIMEFRAMES = [
    { key: '7',   label: '7 Days'  },
    { key: '14',  label: '14 Days' },
    { key: 'all', label: 'All Time'},
];

const TODAY_LABEL = 'Today';

// ── Data hook ────────────────────────────────────────────────────────────────

/**
 * Polls both historical storage data and live game state for a single route.
 * Returns { historicalData, liveData } where liveData has all metric keys.
 */
function useRouteMetricsData(routeId) {
    const [historicalData, setHistoricalData] = React.useState({ days: {} });
    const [liveData, setLiveData] = React.useState(null);

    // Poll historical from storage (less frequently — it only updates end-of-day)
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

            const trainTypes              = api.trains.getTrainTypes();
            const lineMetrics             = api.gameState.getLineMetrics();
            const { timeWindowHours }     = api.gameState.getRidershipStats();

            const m            = lineMetrics.find(lm => lm.routeId === routeId);
            const ridership    = m ? m.ridersPerHour * timeWindowHours : 0;
            const dailyRevenue = m ? m.revenuePerHour * 24 : 0;
            const trainType    = trainTypes[route.trainType];

            if (!trainType || !validateRouteData(route)) {
                setLiveData({ ridership, dailyRevenue, ...getEmptyMetrics() });
                return;
            }

            const calculated = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
            setLiveData({ ridership, dailyRevenue, ...calculated });
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

    // Days to show based on timeframe (Today is appended separately)
    const daysToShow = React.useMemo(() => {
        if (timeframe === 'all') return allDays;
        const limit = parseInt(timeframe) - 1; // e.g. "7 Days" = 6 historical + Today
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
            return point;
        }).filter(Boolean);

        if (liveData) {
            const todayPoint = { day: TODAY_LABEL, isLive: true };
            METRICS.forEach(m => { todayPoint[m.key] = liveData[m.key] ?? null; });
            historical.push(todayPoint);
        }

        return historical;
    }, [routeId, daysToShow, historicalData, liveData]);

    const toggleMetric = (key) => {
        setSelectedMetrics(prev =>
            prev.includes(key)
                ? prev.length > 1 ? prev.filter(k => k !== key) : prev   // keep ≥1 active
                : [...prev, key]
        );
    };

    const hasRightAxis = selectedMetrics.some(k => METRICS.find(m => m.key === k)?.yAxis === 'right');
    const hasLeftAxis  = selectedMetrics.some(k => METRICS.find(m => m.key === k)?.yAxis === 'left');

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
                        hasLeftAxis={hasLeftAxis}
                        hasRightAxis={hasRightAxis}
                    />
                )}
            </div>
        </div>
    );
}

// ── Chart sub-component ───────────────────────────────────────────────────────

function RouteMetricsChart({ data, selectedMetrics, chartType, hasLeftAxis, hasRightAxis }) {
    const h = React.createElement;

    // ── Value formatters ─────────────────────────────────────────────────────

    const formatLeftAxis = (value) => {
        if (value == null) return '';
        // Show $ prefix only when every left-axis selected metric is currency
        const leftKeys   = selectedMetrics.filter(k => METRICS.find(m => m.key === k)?.yAxis === 'left');
        const allCurrency = leftKeys.length > 0 && leftKeys.every(k => METRICS.find(m => m.key === k)?.unit === 'currency');
        const prefix = allCurrency ? '$' : '';
        if (Math.abs(value) >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
        if (Math.abs(value) >= 1_000)     return `${prefix}${(value / 1_000).toFixed(0)}k`;
        return `${prefix}${value.toLocaleString()}`;
    };

    const formatRightAxis = (value) => value == null ? '' : `${value}%`;

    const formatMetricValue = (metricKey, value) => {
        if (value == null) return '—';
        const m = METRICS.find(m => m.key === metricKey);
        if (!m) return String(value);
        if (m.unit === 'currency') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        if (m.unit === 'percent')  return `${value.toFixed(1)}%`;
        return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    };

    // ── Custom tooltip ───────────────────────────────────────────────────────

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        const isLivePoint = label === TODAY_LABEL;

        return h('div', {
            className: 'bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[170px]'
        }, [
            // Header row with optional LIVE badge
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

            // One row per selected metric
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

    // ── Shared axis / grid props ─────────────────────────────────────────────

    const rightMargin = hasRightAxis ? 55 : 0;

    const commonProps = {
        data,
        margin: { top: 20, right: rightMargin, left: 0, bottom: 20 },
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

    const leftYAxisProps = {
        key:           'yaxis-left',
        yAxisId:       'left',
        stroke:        '#9ca3af',
        fontSize:      12,
        tickFormatter: formatLeftAxis,
        axisLine:      false,
        tickLine:      false,
        hide:          !hasLeftAxis,
    };

    const rightYAxisProps = {
        key:           'yaxis-right',
        yAxisId:       'right',
        orientation:   'right',
        stroke:        '#9ca3af',
        fontSize:      12,
        tickFormatter: formatRightAxis,
        axisLine:      false,
        tickLine:      false,
    };

    const gridProps = {
        key:             'grid',
        strokeDasharray: '3 3',
        stroke:          '#374151',
        opacity:         0.3,
    };

    // The ReferenceLine must reference a valid yAxisId that exists in the chart
    const todayRefLine = h(charts.ReferenceLine, {
        key:             'today-ref',
        yAxisId:         hasLeftAxis ? 'left' : 'right',
        x:               TODAY_LABEL,
        stroke:          '#6b7280',
        strokeDasharray: '4 3',
        strokeOpacity:   0.5,
        label:           { value: '', position: 'insideTopRight' },
    });

    // ── Custom dot (dims live point) ─────────────────────────────────────────

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

    // ── Custom bar shape (dims live bar) ─────────────────────────────────────

    const makeLiveBar = (color) => function LiveBar(props) {
        const { x, y, width, height, payload } = props;
        if (!width || !height) return null;
        const rectY      = height < 0 ? y + height : y;
        const rectHeight = Math.abs(height);
        const fillOpacity   = payload?.isLive ? 0.2 : 0.3;
        const strokeDasharray = payload?.isLive ? '3 3' : undefined;
        return h('rect', {
            x, y: rectY, width, height: rectHeight, rx: 2, ry: 2,
            fill: color, stroke: color, strokeWidth: 1,
            fillOpacity, strokeDasharray,
        });
    };

    // ── Metric colour legend ─────────────────────────────────────────────────

    const MetricLegend = () =>
        h('div', { className: 'flex items-center justify-center gap-4 flex-wrap pt-1' },
            selectedMetrics.map(key => {
                const m = METRICS.find(m => m.key === key);
                if (!m) return null;
                return h('div', {
                    key,
                    className: 'flex items-center gap-1.5 text-xs text-muted-foreground'
                }, [
                    h('div', { key: 'dot', className: 'w-2.5 h-2.5 rounded-full', style: { backgroundColor: m.color } }),
                    h('span', { key: 'label' }, m.label)
                ]);
            }).filter(Boolean)
        );

    // ── Series (Lines or Bars) ───────────────────────────────────────────────

    const series = selectedMetrics.map(metricKey => {
        const m = METRICS.find(m => m.key === metricKey);
        if (!m) return null;

        if (chartType === 'bar') {
            return h(charts.Bar, {
                key:     metricKey,
                dataKey: metricKey,
                yAxisId: m.yAxis,
                shape:   makeLiveBar(m.color),
            });
        }

        return h(charts.Line, {
            key:               metricKey,
            type:              'monotone',
            dataKey:           metricKey,
            yAxisId:           m.yAxis,
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

    // Always mount both yAxisId='left' and yAxisId='right' so that any series
    // referencing them never points at a missing axis. The left axis is hidden
    // when no left-axis metric is selected (but still present in the DOM).
    const yAxes = [
        h(charts.YAxis, leftYAxisProps),
        hasRightAxis ? h(charts.YAxis, rightYAxisProps) : null,
    ].filter(Boolean);

    return h('div', { className: 'aa-chart w-full', style: { height: '340px' } },
        h(charts.ResponsiveContainer, { width: '100%', height: '100%' },
            h(ChartComponent, commonProps, [
                h(charts.CartesianGrid, gridProps),
                h(charts.XAxis,    xAxisProps),
                ...yAxes,
                h(charts.Tooltip,  { key: 'tooltip', content: CustomTooltip }),
                h(charts.Legend,   { key: 'legend',  content: MetricLegend  }),
                todayRefLine,
                ...series,
            ])
        )
    );
}
