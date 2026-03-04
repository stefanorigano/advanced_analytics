// Route Dialog
// Shows real-time stats for a single route.
// Opened by clicking any interactive RouteBadge.
// Exposed globally as window.AdvancedAnalytics.openRouteDialog(routeId).

import { Dialog }       from '../../components/dialog.jsx';
import { Dropdown }     from '../../components/dropdown.jsx';
import { DropdownItem } from '../../components/dropdown-item.jsx';
import { RouteBadge }   from '../../components/route-badge.jsx';
import { CONFIG }       from '../../config.js';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from '../../metrics/route-metrics.js';
import { calculateTransfers }   from '../../metrics/transfers.js';
import { formatCurrencyCompact, calculateTotalTrains } from '../../utils/formatting.js';
import { getStorage }   from '../../core/lifecycle.js';
import { getAccumulatedRevenue } from '../../metrics/accumulator.js';
import { getRouteStationsInOrder } from '../../utils/route-utils.js';
import { StationFlow }   from './station-flow.jsx';
import { CommuteFlow }   from './commute-flow.jsx';
import { RouteMetrics }  from './route-metrics.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Live data hook ─────────────────────────────────────────────────────────────
// Polls the game state every second and returns processed metrics for one route.

function useRouteData(routeId) {
    const [data, setData] = React.useState(null);

    React.useEffect(() => {
        if (!routeId) { setData(null); return; }

        const update = async () => {
            const routes      = api.gameState.getRoutes();
            const route       = routes.find(r => r.id === routeId);
            if (!route) return;

            const trainTypes       = api.trains.getTrainTypes();
            const lineMetrics      = api.gameState.getLineMetrics();

            const m               = lineMetrics.find(lm => lm.routeId === routeId);
            const ridership       = api.gameState.getRouteRidership(routeId).total;
            const revenuePerHour  = m ? m.revenuePerHour : 0;
            const accumulated     = getAccumulatedRevenue(routeId);
            const dailyRevenue    = accumulated > 0 ? accumulated : revenuePerHour * 24;

            const transfersMap = calculateTransfers(routes, api);
            const transfers    = transfersMap[routeId] || { count: 0, routes: [], routeIds: [], stationIds: [] };

            const trainType = trainTypes[route.trainType];

            // ── Route Info ──────────────────────────────────────────────────
            const currentDay = api.gameState.getCurrentDay();
            const storage    = getStorage();
            let createdDay   = null;
            if (storage) {
                const routeStatuses = await storage.get('routeStatuses', {});
                createdDay = routeStatuses[routeId]?.createdDay ?? null;
            }

            const trainTypeInfo = trainType ? {
                name:        trainType.name,
                description: trainType.description,
                color:       trainType.appearance?.color || '#666666',
            } : null;

            const routeInfo = {
                bullet:               route.bullet || null,
                createdDay,
                daysInService:        createdDay != null ? currentDay - createdDay : null,
                stationCount:         getRouteStationsInOrder(routeId, api).length,
                trainTypeName:        trainTypeInfo?.name        || null,
                trainTypeDescription: trainTypeInfo?.description || null,
                trainTypeColor:       trainTypeInfo?.color       || null,
            };

            if (!trainType || !validateRouteData(route)) {
                setData({ route, ridership, dailyRevenue, transfers, routeInfo, ...getEmptyMetrics() });
                return;
            }

            const calculated = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
            setData({ route, ridership, dailyRevenue, transfers, routeInfo, ...calculated });
        };

        update();
        const interval = setInterval(update, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [routeId]);

    return data;
}

// ── Utilization helpers ────────────────────────────────────────────────────────

function getUtilColors(u) {
    const { CRITICAL_LOW, WARNING_LOW, WARNING_HIGH, CRITICAL_HIGH } = CONFIG.UTILIZATION_THRESHOLDS;
    if (u < CRITICAL_LOW || u > CRITICAL_HIGH) return { bar: 'bg-red-500',   text: 'text-red-500'   };
    if (u < WARNING_LOW  || u > WARNING_HIGH)  return { bar: 'bg-amber-500', text: 'text-amber-500' };
    return                                            { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
}

function getUtilLabel(u) {
    const { CRITICAL_LOW, WARNING_LOW, WARNING_HIGH, CRITICAL_HIGH } = CONFIG.UTILIZATION_THRESHOLDS;
    if (u < CRITICAL_LOW)  return 'Critically Underused';
    if (u < WARNING_LOW)   return 'Underused';
    if (u > CRITICAL_HIGH) return 'Overcrowded';
    if (u > WARNING_HIGH)  return 'Near Capacity';
    return 'Healthy';
}

// ── Usage gauge (hero metric) ──────────────────────────────────────────────────

function UsageGauge({ utilization, ridership, capacity }) {
    const pct      = Math.max(utilization || 0, 0);
    const barWidth = Math.min(pct, 100);
    const overflow = pct > 100;
    const colors   = getUtilColors(pct);
    const label    = getUtilLabel(pct);
    const { WARNING_LOW, WARNING_HIGH } = CONFIG.UTILIZATION_THRESHOLDS;

    return (
        <div className="rounded flex flex-col border bg-muted/30 px-6 py-5">
            {/* Header row */}
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Usage
            </div>
            <div className={"my-auto"}>
                <div className="flex justify-between">
                    <div className={`font-bold ${colors.text}`}>{label}</div>
                    <div className={`text-5xl font-bold tabular-nums leading-none ${colors.text}`}>
                        {pct.toFixed(1)}
                        <span className="text-2xl font-medium ml-0.5">%</span>
                    </div>
                </div>

                {/* Progress bar — bar fills to 100 %; a striped overflow indicator
                    appears on the right edge when the route is over capacity. */}
                <div
                    className="relative h-3 rounded overflow-hidden mb-2"
                    style={{backgroundColor: 'rgba(128,128,128,0.15)'}}
                >
                    <div
                        className={`absolute inset-y-0 left-0 transition-all duration-500 ${colors.bar} ${overflow ? '' : 'rounded'}`}
                        style={{width: `${barWidth}%`}}
                    />
                    {/* Over-capacity stripes on the right edge */}
                    {overflow && (
                        <div
                            className="absolute inset-y-0 right-0 w-6"
                            style={{
                                background: 'repeating-linear-gradient(135deg, hsl(var(--background) / 0.5) 0px, hsl(var(--background) / 0.5) 3px, transparent 3px, transparent 6px)',
                            }}
                        />
                    )}
                    {/* Threshold markers */}
                    <div className="absolute inset-y-0 w-px bg-foreground/25" style={{left: `${WARNING_LOW}%`}}/>
                    <div className="absolute inset-y-0 w-px bg-foreground/25" style={{left: `${WARNING_HIGH}%`}}/>
                </div>

                {/* Footer */}
                <div className="flex justify-between text-xs text-muted-foreground mt-3">
                    <span>Healthy range: {WARNING_LOW}–{WARNING_HIGH}%</span>
                    <span>{Math.round(ridership || 0).toLocaleString()} riders {' / '} {(capacity || 0).toLocaleString()} capacity</span>
                </div>
            </div>
        </div>
    );
}

// ── Small stat card ────────────────────────────────────────────────────────────

function StatCard({ label, icon, value, sub, children, valueClass = '' }) {
    return (
        <div className="flex gap-2 rounded border bg-muted/20 p-4 h-full">
            {icon && React.createElement(icons[icon], { size: 14, className: 'mt-0.5 shrink-0' })}
            <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {label}
                </div>
                {value && <div className={`text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>}
                {children}
                {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

// ── Route content ──────────────────────────────────────────────────────────────

function RouteContent({ routeId }) {
    const data = useRouteData(routeId);

    // Tracks which station was last clicked in StationFlow so CommuteFlow can sync.
    // Reset to null whenever the route changes so CommuteFlow falls back to its default.
    const [clickedStationId, setClickedStationId] = React.useState(null);
    React.useEffect(() => { setClickedStationId(null); }, [routeId]);

    // Ref on the Commute Flows section — scrolled into view on bar click.
    const commuteFlowRef = React.useRef(null);
    const handleStationClick = React.useCallback((stationId) => {
        setClickedStationId(stationId);
        commuteFlowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    if (!data) {
        return (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Loading…
            </div>
        );
    }

    const totalTrains  = calculateTotalTrains(data);
    const profitClass  = data.dailyProfit >= 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-500';

    return (
        <div className={"pb-6"}>
            <section className={'grid grid-cols-2 gap-4'}>
                {/* ── Usage (hero) ── */}
                <UsageGauge
                    utilization={data.utilization}
                    ridership={Math.round(data.ridership)}
                    capacity={data.capacity}
                />

                {/* ── Operational stats --- First row ── */}
                <div className="grid grid-cols-3 gap-3">
                    <div className={"flex flex-col gap-3"}>
                        <StatCard
                            label="Ridership"
                            icon="Route"
                            value={Math.round(data.ridership).toLocaleString()}
                            sub="riders / last 24h"
                        />
                        <StatCard
                            label="Throughput"
                            icon="Container"
                            value={(data.capacity || 0).toLocaleString()}
                            sub="daily capacity"
                        />
                    </div>
                    <div className={"col-span-2 pl-4"}>
                        <StatCard
                            label="Route Info"
                            icon="Info"
                        >
                            <div className="flex flex-col gap-2 pt-1">

                                {/* Route name — or badge fallback */}
                                <div className="flex items-center gap-1.5">
                                    {data.routeInfo?.bullet
                                        ? <span className="text-base font-semibold leading-tight">{data.routeInfo.bullet}</span>
                                        : <RouteBadge routeId={routeId} size="1.2rem" interactive={false} />
                                    }
                                </div>

                                {/* Creation day + time in service */}
                                {data.routeInfo?.createdDay != null && (
                                    <div className="flex gap-4 text-xs pt-1 mb-3">
                                        <span className="text-muted-foreground">
                                            Created&nbsp;
                                            <span className="text-foreground font-medium">
                                                Day {data.routeInfo.createdDay}
                                            </span>
                                        </span>
                                        {data.routeInfo.daysInService != null && (
                                            <span className="text-muted-foreground">
                                                In service&nbsp;
                                                <span className="text-foreground font-medium">
                                                    {data.routeInfo.daysInService > 0
                                                        ? `${data.routeInfo.daysInService} day${data.routeInfo.daysInService !== 1 ? 's' : ''}`
                                                        : 'since today'}
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Train type */}
                                {data.routeInfo?.trainTypeName && (
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ background: data.routeInfo.trainTypeColor }}
                                        />
                                        <span className="font-medium">{data.routeInfo.trainTypeName}</span>
                                    </div>
                                )}

                                {/* Train type description */}
                                {data.routeInfo?.trainTypeDescription && (
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {data.routeInfo.trainTypeDescription}
                                    </p>
                                )}

                            </div>
                        </StatCard>
                    </div>
                </div>
                {/* ── Financial stats ── */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                    <StatCard
                        label="Daily Revenue"
                        icon="ArrowBigUpDash"
                        value={formatCurrencyCompact(data.dailyRevenue)}
                        sub="/ day"
                    />
                    <StatCard
                        label="Daily Cost"
                        icon="ArrowBigDownDash"
                        value={formatCurrencyCompact(data.dailyCost)}
                        sub="/ day"
                    />
                    <StatCard
                        label="Daily Profit"
                        icon='HandCoins'
                        value={formatCurrencyCompact(data.dailyProfit)}
                        sub="/ day"
                        valueClass={profitClass}
                    />
                </div>
                {/* ── Infrastructure ── */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                    <StatCard
                        label="Trains"
                        icon="TramFront"
                        value={totalTrains}
                        sub={`${data.trainsHigh}H · ${data.trainsMedium}M · ${data.trainsLow}L`}
                    />
                    <StatCard
                        label="Stops"
                        icon="FlagTriangleRight"
                        value={data.stations || '–'}
                        sub={`${data.routeInfo?.stationCount ?? '–'} station${data.routeInfo?.stationCount !== 1 ? 's' : ''}`}
                    />
                    <StatCard
                        label="Transfers"
                        icon="Circle"
                    >
                        {(() => {
                            const routeIds = data.transfers?.routeIds ?? [];
                            if (routeIds.length === 0) {
                                return <div className="text-xl font-semibold tabular-nums">0</div>;
                            }
                            const allRoutes = api.gameState.getRoutes();
                            return (
                                <Dropdown
                                    togglerContent={
                                        <span className="text-xl font-semibold tabular-nums">
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
                    </StatCard>
                </div>



            </section>

            {/* ── Route Metrics chart ── */}
            <div className="pt-8">
                <div className="py-5">
                    <h3 className="text-2xl font-semibold leading-none tracking-tight">Route Metrics</h3>
                    <p className="text-sm text-muted-foreground mt-1">Historical trends for key performance indicators</p>
                </div>
                <RouteMetrics routeId={routeId} />
            </div>

            {/* ── Station Flow chart ── */}
            <div className="pt-8">
                <div className="py-5">
                    <h3 className="text-2xl font-semibold leading-none tracking-tight">Stations Flow</h3>
                    <p className="text-sm text-muted-foreground mt-1">Network schematic map</p>
                </div>
                <StationFlow routeId={routeId} onStationClick={handleStationClick} />
            </div>

            {/* ── Commute Flow chart ── */}
            <div ref={commuteFlowRef} className="pt-8">
                <div className="py-5">
                    <h3 className="text-2xl font-semibold leading-none tracking-tight">Commute Flows</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Completed commuter journeys boarding and alighting at each station
                    </p>
                </div>
                <CommuteFlow routeId={routeId} externalStationId={clickedStationId} />
            </div>
        </div>
    );
}

// ── Dialog title: route switcher dropdown + route name ─────────────────────────

function RouteDialogTitle({ routeId, onRouteChange }) {
    const routes  = api.gameState.getRoutes();
    const current = routes.find(r => r.id === routeId);

    return (
        <div className="flex items-center gap-2 min-w-0">
            <Dropdown
                togglerClasses="flex items-center border gap-1 rounded-md hover:bg-accent px-2 py-1.5 transition-colors text-xs"
                togglerContent={
                    routeId
                        ? <RouteBadge routeId={routeId} size="1.2rem" interactive={false} />
                        : <span className="text-muted-foreground text-sm">Select</span>
                }
                value={routeId}
                onChange={onRouteChange}
            >
                {routes.map(r =>
                    <DropdownItem key={r.id} value={r.id} route={r} />
                )}
            </Dropdown>

            {current && (
                <span className="font-semibold text-lg truncate">
                    Route Analytics
                </span>
            )}
        </div>
    );
}

// ── Root component ─────────────────────────────────────────────────────────────

export function RouteDialog() {
    const [isOpen,  setIsOpen]  = React.useState(false);
    const [routeId, setRouteId] = React.useState(null);

    // Expose global control functions so any RouteBadge can open this dialog
    React.useEffect(() => {
        window.AdvancedAnalytics = window.AdvancedAnalytics || {};
        window.AdvancedAnalytics.openRouteDialog  = (id) => { setRouteId(id); setIsOpen(true); };
        window.AdvancedAnalytics.closeRouteDialog = ()   => setIsOpen(false);

        return () => {
            delete window.AdvancedAnalytics.openRouteDialog;
            delete window.AdvancedAnalytics.closeRouteDialog;
        };
    }, []);

    return (
        <Dialog
            id="aa-dialog-route"
            title={
                <RouteDialogTitle
                    routeId={routeId}
                    onRouteChange={id => setRouteId(id)}
                />
            }
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            size={1280}
        >
            {isOpen && routeId && <RouteContent routeId={routeId} />}
        </Dialog>
    );
}
