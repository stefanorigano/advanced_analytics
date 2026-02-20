// Station Flow Component
// Displays passenger boarding/alighting patterns for a single route using smooth area charts

import { CONFIG } from '../config.js';
import { Dropdown } from './dropdown.jsx';
import { DropdownItem } from './dropdown-item.jsx';
import { RouteBadge } from './route-badge.jsx';
import { getRouteStationsInOrder } from '../utils/route-utils.js';
import { getStationTransferRoutes } from '../utils/transfer-utils.js';

const api = window.SubwayBuilderAPI;
const { React, icons, charts } = api.utils;


export function StationFlow() {
    const [selectedRoute, setSelectedRoute] = React.useState(null);
    const [flowData, setFlowData] = React.useState([]);

    // Get available routes from current game state
    const routes = api.gameState.getRoutes();

    // Auto-select first route on mount
    React.useEffect(() => {
        if (!selectedRoute && routes.length > 0) {
            setSelectedRoute(routes[0].id);
        }
    }, [routes, selectedRoute]);

    // Fetch and process station flow data
    React.useEffect(() => {
        if (!selectedRoute) {
            setFlowData([]);
            return;
        }

        const updateData = () => {
            try {
                // Get ridership data for selected route
                const ridershipData = api.gameState.getRouteRidership(selectedRoute);

                if (!ridershipData || !ridershipData.byStation) {
                    setFlowData([]);
                    return;
                }

                // Get stations in timetable order
                const orderedStations = getRouteStationsInOrder(selectedRoute, api);

                if (orderedStations.length === 0) {
                    setFlowData([]);
                    return;
                }

                // Build a map of station ID -> ridership data
                const ridershipMap = new Map();
                ridershipData.byStation.forEach(stationData => {
                    ridershipMap.set(stationData.stationId, {
                        popCount: stationData.popCount,
                        percent:  stationData.percent
                    });
                });

                // Process stations in timetable order, enriched with transfer info.
                // Deduplication of the loop-closure terminus is handled inside
                // getRouteStationsInOrder (route-utils.js).
                const processed = orderedStations.map((station, index) => {
                    const data      = ridershipMap.get(station.id);
                    const ridership = data?.popCount ?? 0;
                    const percent   = data?.percent != null ? parseFloat(data.percent.toFixed(2)) : null;

                    // Resolve transfers for this station
                    const transferRoutes = getStationTransferRoutes(station.id, selectedRoute, api);

                    return {
                        index,
                        name:           station.name,
                        stationId:      station.id,
                        ridership,
                        percent,
                        transferRoutes, // Array<{ routeId, routeName, bullet }>
                        hasTransfers:   transferRoutes.length > 0,
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
    }, [selectedRoute, routes]);

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between gap-4">
                {/* Left: Route selection */}
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">Route:</span>
                    <Dropdown
                        togglerIcon={icons.Route}
                        togglerText={
                            selectedRoute
                                ? (routes.find(r => r.id === selectedRoute)?.name ||
                                   routes.find(r => r.id === selectedRoute)?.bullet ||
                                   'Select route')
                                : 'Select route'
                        }
                        togglerClasses="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                        menuClasses="min-w-[200px] max-h-[300px] overflow-y-auto"
                        multiselect={false}
                        value={selectedRoute || ''}
                        onChange={setSelectedRoute}
                    >
                        {routes.map(route => (
                            <DropdownItem
                                key={route.id}
                                value={route.id}
                                text={route.name || route.bullet}
                            />
                        ))}
                    </Dropdown>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm" style={{ background: '#22c55e', opacity: 0.6 }} />
                        <span>Ridership</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-6 h-0.5" style={{ background: '#f59e0b' }} />
                        <span>% choosing metro</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none" style={{ color: '#a78bfa' }}>⊕</span>
                        <span>Transfer</span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="rounded-lg border border-border bg-background/50 p-4">
                {flowData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <icons.TrendingUp size={48} className="text-muted-foreground mb-4" />
                        <div className="text-sm text-muted-foreground">
                            {!selectedRoute ? (
                                <p>Select a route to display station flow</p>
                            ) : (
                                <p>No ridership data available for this route</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <FlowChart data={flowData} selectedRouteId={selectedRoute} />
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Custom XAxis tick factory
//
// Returns a tick component closed over `flowData` so it can look up transfer
// info per station. We use a factory (not inline) to keep the function
// reference stable across renders and avoid Recharts remounting every tick.
//
// Renders: station name rotated -45deg, and ⊕ below it for transfer stations.
// ---------------------------------------------------------------------------
function makeCustomXAxisTick(flowData) {
    return function CustomXAxisTick(props) {
        const { x, y, payload } = props;
        const h = React.createElement;

        const MAX_LEN = 14;
        const label = payload.value && payload.value.length > MAX_LEN
            ? payload.value.slice(0, MAX_LEN - 1) + '…'
            : (payload.value || '');

        const dataPoint    = flowData && flowData.find(d => d.name === payload.value);
        const hasTransfers = dataPoint?.hasTransfers ?? false;

        return h('g', { transform: `translate(${x},${y})` }, [
            // Station name, rotated -45deg
            h('text', {
                key:        'label',
                x:          0,
                y:          0,
                dy:         10,
                textAnchor: 'end',
                fill:       '#9ca3af',
                fontSize:   12,
                transform:  'rotate(-45)',
            }, label),

            // ⊕ transfer indicator — upright, centred below the tick point
            hasTransfers && h('text', {
                key:        'transfer',
                x:          0,
                y:          0,
                dy:         43,         // below the rotated label's vertical extent
                textAnchor: 'middle',
                fill:       '#a78bfa',  // purple-400
                fontSize:   20,
            }, '⊕'),
        ].filter(Boolean));
    };
}

// ---------------------------------------------------------------------------
// Flow chart display component
// ---------------------------------------------------------------------------
function FlowChart({ data, selectedRouteId }) {
    const h = React.createElement;

    // Format left Y-axis (ridership counts)
    const formatYAxisLeft = (value) => {
        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
        return value.toLocaleString();
    };

    // Format right Y-axis (percentage)
    const formatYAxisRight = (value) => `${value}%`;

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || payload.length === 0) return null;

        const ridershipEntry = payload.find(p => p.dataKey === 'ridership');
        const percentEntry   = payload.find(p => p.dataKey === 'percent');

        // Find data point to get transfer info
        const dataPoint    = data.find(d => d.name === label);
        const hasTransfers = dataPoint?.transferRoutes?.length > 0;

        return h('div', {
            className: 'bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[160px]'
        }, [
            // Station name header
            h('div', {
                key:       'label',
                className: 'text-xs font-medium mb-2'
            }, label),

            // Ridership metric
            ridershipEntry && h('div', {
                key:       'ridership',
                className: 'flex items-center justify-between gap-6 text-xs'
            }, [
                h('div', { key: 'left', className: 'flex items-center gap-1.5' }, [
                    h('div', { key: 'dot', className: 'w-2 h-2 rounded-sm', style: { background: '#22c55e' } }),
                    h('span', { key: 'lbl', className: 'text-muted-foreground' }, 'Ridership')
                ]),
                h('span', {
                    key:       'val',
                    className: 'font-mono font-medium'
                }, (ridershipEntry.value ?? 0).toLocaleString())
            ]),

            // % choosing metro metric
            percentEntry && percentEntry.value != null && h('div', {
                key:       'percent',
                className: 'flex items-center justify-between gap-6 text-xs mt-1'
            }, [
                h('div', { key: 'left', className: 'flex items-center gap-1.5' }, [
                    h('div', { key: 'dot', className: 'w-2 h-0.5', style: { background: '#f59e0b' } }),
                    h('span', { key: 'lbl', className: 'text-muted-foreground' }, '% choosing metro')
                ]),
                h('span', {
                    key:       'val',
                    className: 'font-mono font-medium'
                }, `${percentEntry.value.toFixed(2)}%`)
            ]),

            // Transfer section — separator + badges
            hasTransfers && h('div', {
                key:       'transfers-section',
                className: 'mt-2 pt-2 border-t border-border'
            }, [
                h('div', {className: 'mb-2'}, [
                    h('span', {
                        key:       'transfers-symbol',
                        style: { color: '#a78bfa' },
                        className: 'mr-1.5'
                    }, '⊕'),
                    h('span', {
                        key:       'transfers-label',
                        className: 'text-xs font-medium'
                    }, 'Transfers'),
                ]),
                h('div', {
                    key:       'badges',
                    className: 'flex items-center flex-wrap gap-1'
                },
                    dataPoint.transferRoutes.map(tr =>
                        h(RouteBadge, {
                            key:     tr.routeId,
                            routeId: tr.routeId,
                            size:    '1.4rem'
                        })
                    )
                )
            ])
        ].filter(Boolean));
    };

    return h('div', {
        className: 'w-full',
        style:     { height: '400px' }
    },
        h(charts.ResponsiveContainer, {
            key:    'chart',
            width:  '100%',
            height: '100%'
        },
            h(charts.ComposedChart, {
                data:   data,
                margin: { top: 30, right: 20, left: 0, bottom: 10 }
            }, [
                h(charts.CartesianGrid, {
                    key:             'grid',
                    strokeDasharray: '3 3',
                    stroke:          '#374151',
                    opacity:         0.3
                }),

                // X axis — custom tick renders station name + ⊕ for transfers
                h(charts.XAxis, {
                    key:      'xaxis',
                    dataKey:  'name',
                    stroke:   '#9ca3af',
                    interval: 0,
                    height:   80,
                    tick:     makeCustomXAxisTick(data),
                }),

                // Left Y axis — ridership
                h(charts.YAxis, {
                    key:           'yaxis-left',
                    yAxisId:       'left',
                    stroke:        '#9ca3af',
                    fontSize:      12,
                    tickFormatter: formatYAxisLeft
                }),

                // Right Y axis — percentage
                h(charts.YAxis, {
                    key:           'yaxis-right',
                    yAxisId:       'right',
                    orientation:   'right',
                    stroke:        '#f59e0b',
                    fontSize:      12,
                    tickFormatter: formatYAxisRight,
                    domain:        [0, 100]
                }),

                h(charts.Tooltip, {
                    key:     'tooltip',
                    content: CustomTooltip
                }),

                // Ridership area (left axis)
                h(charts.Area, {
                    key:         'ridership',
                    yAxisId:     'left',
                    type:        'monotone',
                    dataKey:     'ridership',
                    stroke:      '#22c55e',
                    strokeWidth: 2,
                    fill:        '#22c55e',
                    fillOpacity: 0.3
                }),

                // Percentage line (right axis)
                h(charts.Line, {
                    key:          'percent',
                    yAxisId:      'right',
                    type:         'monotone',
                    dataKey:      'percent',
                    stroke:       '#f59e0b',
                    strokeWidth:  2,
                    dot:          { r: 3, fill: '#f59e0b' },
                    activeDot:    { r: 5 },
                    connectNulls: false
                }),
            ])
        )
    );
}
