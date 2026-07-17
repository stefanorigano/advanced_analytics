// Route Dialog
// Shows real-time stats for a single route.
// Opened by clicking any interactive RouteBadge.
// Exposed globally as window.AdvancedAnalytics.openRouteDialog(routeId).

import { StaticPanel }  from '../../components/static-panel.jsx';
import { Tooltip }      from '../../components/tooltip.jsx';
import { Dropdown }     from '../../components/dropdown.jsx';
import { DropdownItem } from '../../components/dropdown-item.jsx';
import { RouteBadge }   from '../../components/route-badge.jsx';
import { CONFIG }       from '../../config.js';
import { formatCurrencyCompact, calculateTotalTrains, formatSecondsAsTime } from '../../utils/formatting.js';
import { getEfficiencyClasses } from '../../utils/colors.js';
import { getStorage }   from '../../core/lifecycle.js';
import { getRoute24hStats, getTrainsForRoute, getTimetableAccum } from '../../metrics/accumulator.js';
import { getRouteLifetimeProfit } from '../../metrics/historical-data.js';
import { computeHeadwayRegularity, computeScheduleDrift } from '../../metrics/timetable-metrics.js';
import { TimetableCharts } from './timetable-charts.jsx';
import { getRouteStationsInOrder } from '../../utils/route-utils.js';
import { perTierField } from '../../utils/demand-tiers.js';
import { StationFlow }   from './station-flow.jsx';
import { CommuteFlow }   from './commute-flow.jsx';
import { RouteMetrics }  from './route-metrics.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;



// ── Live data hook ─────────────────────────────────────────────────────────────
// Polls game state every second and returns processed metrics for one route.
// All financial and capacity data comes from getRoute24hStats (rolling 24h window).

function useRouteData(routeId) {
    const [data, setData] = React.useState(null);

    React.useEffect(() => {
        if (!routeId) { setData(null); return; }

        const update = async () => {
            const routes = api.gameState.getRoutes();
            const route  = routes.find(r => r.id === routeId);
            if (!route) return;

            // ── Rolling 24h stats (single source of truth) ──────────────────
            const stats = getRoute24hStats(routeId);

            // ── Timetable snapshot metrics ──────────────────────────────────
            const routeTrains  = getTrainsForRoute(routeId);
            const headway      = computeHeadwayRegularity(routeTrains);
            const drift        = computeScheduleDrift(routeTrains);
            const timetableAccum = getTimetableAccum(routeId);

            // ── Route creation info (for the info card only) ─────────────────
            const currentDay    = api.gameState.getCurrentDay();
            const storage       = getStorage();
            let createdDay      = null;
            let lifetimeProfit  = null;
            if (storage) {
                const [routeStatuses, historicalData] = await Promise.all([
                    storage.get('routeStatuses', {}),
                    storage.get('historicalData', { days: {} }),
                ]);
                createdDay = routeStatuses[routeId]?.createdDay ?? null;
                if (createdDay != null) {
                    lifetimeProfit = getRouteLifetimeProfit(routeId, createdDay, historicalData, currentDay);
                }
            }

            // ── Train type metadata (for the info card only) ─────────────────
            const trainTypes    = api.trains.getTrainTypes();
            const trainType     = trainTypes[route.trainType];
            const trainTypeInfo = trainType ? {
                name:        trainType.name,
                description: trainType.description,
                color:       trainType.appearance?.color || '#666666',
            } : null;

            const routeInfo = {
                bullet:               route.bullet || null,
                createdDay,
                daysInService:        createdDay != null ? currentDay - createdDay : null,
                lifetimeProfit,
                stationCount:         getRouteStationsInOrder(routeId, api).length,
                trainTypeName:        trainTypeInfo?.name        || null,
                trainTypeDescription: trainTypeInfo?.description || null,
                trainTypeColor:       trainTypeInfo?.color       || null,
            };

            setData({ route, routeInfo, headway, drift, timetableAccum, ...stats });
        };

        update();
        const interval = setInterval(update, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [routeId]);

    return data;
}

// ── Load Factor helpers ────────────────────────────────────────────────────────

function getLoadFactorColors(pct) {
    const { CRITICAL_LOW, WARNING_LOW, WARNING_HIGH, CRITICAL_HIGH } = CONFIG.LOAD_FACTOR_THRESHOLDS;
    if (pct < CRITICAL_LOW || pct > CRITICAL_HIGH) return { bar: 'bg-red-500',   text: 'text-red-500'   };
    if (pct < WARNING_LOW  || pct > WARNING_HIGH)  return { bar: 'bg-amber-500', text: 'text-amber-500' };
    return                                                { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400' };
}

function getLoadFactorLabel(pct) {
    const { CRITICAL_LOW, WARNING_LOW, WARNING_HIGH, CRITICAL_HIGH } = CONFIG.LOAD_FACTOR_THRESHOLDS;
    if (pct < CRITICAL_LOW)  return 'Critically Underused';
    if (pct < WARNING_LOW)   return 'Underused';
    if (pct > CRITICAL_HIGH) return 'Overcrowded';
    if (pct > WARNING_HIGH)  return 'Near Capacity';
    return 'Healthy';
}

// ── Headway & drift color helpers ─────────────────────────────────────────────

function getHeadwayColor(label) {
    const c = CONFIG.COLORS.HEADWAY;
    if (label === 'Regular')   return c.REGULAR;
    if (label === 'Irregular') return c.IRREGULAR;
    if (label === 'Bunching')  return c.BUNCHING;
    return '';
}

function getDriftColor(absSec) {
    const { GOOD, WARNING } = CONFIG.SCHEDULE_DRIFT_THRESHOLDS;
    const c = CONFIG.COLORS.DRIFT;
    if (absSec < GOOD)    return c.GOOD;
    if (absSec < WARNING) return c.WARNING;
    return c.CRITICAL;
}

// ── Load Factor gauge (hero metric) ───────────────────────────────────────────

function UsageGauge({ data, trainsTotal }) {
    const pct      = Math.max(data.loadFactor || 0, 0);
    const barWidth = Math.min(pct, 100);
    const overflow = pct > 100;
    const colors   = getLoadFactorColors(pct);
    const label    = getLoadFactorLabel(pct);
    const { WARNING_LOW, WARNING_HIGH } = CONFIG.LOAD_FACTOR_THRESHOLDS;

    return (
        <div className={`rounded flex flex-col border bg-muted/30 px-5 py-4 flex-1`}>
            {/* Header row */}
            <section className="flex gap-3 flex-1">
                <icons.Gauge size={22} className={'mt-0.5 shrink-0'}/>
                <div className="flex flex-1 text-muted-foreground justify-between">
                    <div>
                        <div className={"uppercase text-[10px] font-semibold tracking-wider mb-1"}>Load Factor</div>
                        <span className={`text-xl font-semibold ${pct > 0 ? colors.text : 'text-muted-foreground'}`}>
                            {pct > 0 ? label : 'No data yet'}
                        </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Peak train load ÷ train capacity</span>
                </div>
            </section>
            <div className={"my-auto"}>
                <div className="flex justify-between items-end mb-2">
                    <div className={`text-xl ${pct > 0 ? colors.text : 'text-muted'}`}>
                        <div
                            className={`flex items-center gap-1 shrink-0`}>
                            <icons.TramFront size={12} className={'text-muted-foreground'}/>
                             <span className={`text-xs text-foreground`}>
                                <span className={'font-semibold'}>{trainsTotal} </span>
                                (24h)
                            </span>
                        </div>
                    </div>
                    <div className={`text-5xl font-semibold tabular-nums leading-none ${pct > 0 ? colors.text : 'text-muted'}`}>
                        {pct > 0 ? pct.toFixed(1) : '—'}
                        {pct > 0 && <span className="text-2xl font-medium ml-0.5">%</span>}
                    </div>
                </div>

                {/* Progress bar — bar fills to 100 %; a striped overflow indicator
                appears on the right edge when the route is over capacity. */}
                <div
                    className="relative h-4 rounded overflow-hidden mb-6"
                    style={{backgroundColor: 'rgba(128,128,128,0.15)'}}
                >
                    <div
                        className={`absolute inset-y-0 left-0 transition-all duration-500 ${colors.bar} ${overflow ? '' : 'rounded rounded-r-none'}`}
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

                {/* Phase breakdown bars — one equal-width bar per demand tier */}
                {CONFIG.TIERS.some(t => (data[perTierField('loadFactor', t.key)] || 0) > 0) && (
                    <div className="grid gap-6 mt-2 mb-1"
                         style={{gridTemplateColumns: `repeat(${CONFIG.TIERS.length}, minmax(0, 1fr))`}}>
                        {CONFIG.TIERS.map((tier) => {
                            const pctT         = data[perTierField('loadFactor', tier.key)] || 0;
                            const trainsNumber = data[perTierField('trains', tier.key)] || 0;
                            const demandHours  = CONFIG.DEMAND_HOURS[tier.key];
                            const c    = getLoadFactorColors(pctT);
                            const Icon = icons[tier.icon] || icons.Moon;
                            const tip = (
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-semibold">{tier.label} Demand Phase</span>
                                    <span className={c.text}>{pctT}%</span>
                                    <span className="text-xs opacity-70">
                                        How full trains run during {tier.label.toLowerCase()}-demand hours relative to the capacity scheduled for that period.
                                    </span>
                                </div>
                            );
                            return (
                                <Tooltip key={tier.key} side="bottom" delayDuration={50} content={tip}>
                                    <div className="flex flex-col gap-1.5 cursor-default">
                                        <div className="relative w-full h-3 rounded-[2px] overflow-hidden"
                                             style={{backgroundColor: 'rgba(128,128,128,0.15)'}}>
                                            <div
                                                className={`absolute inset-y-0 left-0 rounded-[2px] rounded-r-none ${c.bar}`}
                                                style={{width: `${Math.min(pctT, 100)}%`}}/>
                                        </div>
                                        <div className={`flex items-center justify-between`}>
                                            <div
                                                className={`flex items-center gap-1 shrink-0 text-muted`}>
                                                {React.createElement(Icon, {size: 11, className: 'text-muted-foreground'})}
                                                <span className={`text-[0.65rem]`}>
                                                    <span className={'font-semibold'}>{tier.label} </span>
                                                    ({demandHours}h)
                                                </span>
                                            </div>
                                            <div
                                                className={`flex items-center gap-1 shrink-0 text-muted`}>
                                                <icons.TramFront size={11} className={'text-muted-foreground'}/>
                                                <span className={`text-[0.65rem] font-semibold tabular-nums`}>{trainsNumber}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Tooltip>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Small stat card ────────────────────────────────────────────────────────────

function StatCard({ label, icon, value, sub, children, valueClass = '', tooltip }) {
    const valueEl = value && (
        <div className={`text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
    );
    return (
        <div className="flex gap-3 rounded border bg-muted/20 p-4 pl-3 h-full">
            {icon && React.createElement(icons[icon], { size: 22, className: 'mt-0.5 shrink-0' })}
            <div class={"flex-1 flex flex-col"}>
                {label && <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {label}
                </div>}
                {tooltip
                    ? <Tooltip side="left" delayDuration={150} content={tooltip}>{valueEl}</Tooltip>
                    : valueEl
                }
                {children}
                {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

// ── Route content ──────────────────────────────────────────────────────────────

export function RouteContent({ routeId }) {
    const data = useRouteData(routeId);

    // Tracks which station was last clicked in StationFlow so CommuteFlow can sync.
    // Reset to null whenever the route changes so CommuteFlow falls back to its default.
    const [clickedStationId, setClickedStationId] = React.useState(null);
    React.useEffect(() => { setClickedStationId(null); }, [routeId]);

    // ── Route note ─────────────────────────────────────────────────────────────
    // Independent from the polling hook — loads once per routeId, saves on blur.
    const [note, setNote] = React.useState('');
    React.useEffect(() => {
        const storage = getStorage();
        if (!storage || !routeId) return;
        storage.get('routeNotes', {}).then(notes => setNote(notes[routeId] ?? ''));
    }, [routeId]);

    const saveNote = React.useCallback(async (text) => {
        const storage = getStorage();
        if (!storage) return;
        const notes = await storage.get('routeNotes', {});
        notes[routeId] = text;
        await storage.set('routeNotes', notes);
    }, [routeId]);

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
        <div className={"pb-6 px-6 pt-4"}>
            <section className={'grid grid-cols-2 gap-4'}>
                <div className="flex flex-col">
                    {/* ── Load Factor (hero) ── */}
                    <UsageGauge
                        data={data}
                        trainsTotal={totalTrains}
                    />
                </div>

                {/* ── Operational stats --- First row ── */}
                <div className="grid grid-cols-2 gap-3">
                    <StatCard
                        label="Ridership"
                        icon="Route"
                        value={Math.round(data.ridership).toLocaleString()}
                        sub="/ last 24h"
                    />
                    <StatCard
                        label="Stops"
                        icon="GitCommitVertical"
                        value={data.stations || '–'}
                        sub={`${data.routeInfo?.stationCount ?? '–'} station${data.routeInfo?.stationCount !== 1 ? 's' : ''}`}
                    />
                    <StatCard
                        label="Throughput"
                        icon="Container"
                        value={(data.capacity || 0).toLocaleString()}
                        sub="daily capacity / direction"
                    />
                    <StatCard
                        label="Transfers"
                        icon="Component"
                        sub="Connection Hubs"
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

                {/* ── Info ── */}
                <StatCard
                >
                    <div className="flex flex-col gap-3">
                        <div className="pl-2 flex gap-6">
                            {/* Route name */}
                            <div className="shrink-0">
                                <RouteBadge routeId={routeId} size="1.4rem" interactive={false}/>
                            </div>
                            <div className={`flex-1`}>
                                <div>
                                    {/* Train type */}
                                    {data.routeInfo?.trainTypeName && (
                                        <Tooltip content={data.routeInfo?.trainTypeDescription}>
                                            <div className="flex items-center gap-1.5 text-xs mb-2">
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0"
                                                        style={{background: data.routeInfo.trainTypeColor}}
                                                    />
                                                <span className="font-medium">{data.routeInfo.trainTypeName}</span>
                                            </div>
                                        </Tooltip>
                                    )}
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
                                        {data.routeInfo.lifetimeProfit != null && (
                                            <span className="text-muted-foreground">
                                            Overall Profit&nbsp;
                                                <span
                                                    className={`font-medium ${data.routeInfo.lifetimeProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                                                {formatCurrencyCompact(data.routeInfo.lifetimeProfit)}
                                            </span>
                                        </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Notes ── */}
                        <div className="flex flex-col flex-1 h-full w-full">
                            <div
                                class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notes
                            </div>
                            <div className={"relative flex-1 h-full border border-border rounded px-3 py-2 pb-6"}>
                                <textarea
                                    className="w-full text-xs font-mono bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/40 text-foreground"
                                    placeholder="Add route notes…"
                                    maxLength={200}
                                    rows={4}
                                    style={{resize: 'none'}}
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    onBlur={e => saveNote(e.target.value)}
                                />
                                {note.length > 0 && (
                                    <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 pointer-events-none tabular-nums">
                                        {note.length}/200
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </StatCard>
                {/* ── Timetable metrics ── */}
                <div className="grid grid-cols-3 gap-3">
                    <StatCard
                        label="Performance"
                        icon="Zap"
                        value={data.efficiency > 0 ? `${data.efficiency.toFixed(2)}×` : '—'}
                        sub={data.efficiency >= 1 ? 'High turnover' : data.efficiency > 0 ? 'Room to grow' : 'No data yet'}
                        valueClass={getEfficiencyClasses(data.efficiency || 0)}
                    />
                    <StatCard
                        label="Headway"
                        icon="UnfoldHorizontal"
                        value={data.headway.meanHeadwaySec != null
                            ? formatSecondsAsTime(data.headway.meanHeadwaySec)
                            : '—'}
                        sub={data.headway.label}
                        valueClass={getHeadwayColor(data.headway.label)}
                        tooltip={
                            <div className="flex flex-col gap-0.5">
                                <span className="font-semibold">Headway Regularity</span>
                                <span className="text-xs opacity-70">
                                    Average time between consecutive train arrivals at the first stop.
                                    Lower variation = more evenly spaced trains.
                                </span>
                                {data.headway.cvHeadway != null && (
                                    <span className="text-xs mt-1">CV: {data.headway.cvHeadway.toFixed(3)}</span>
                                )}
                            </div>
                        }
                    />
                    <StatCard
                        label="Schedule Drift"
                        icon="CalendarClock"
                        value={formatSecondsAsTime(data.drift.meanDriftSec, true)}
                        sub={data.drift.maxDriftSec > 0
                            ? `max ${formatSecondsAsTime(data.drift.maxDriftSec, true)}`
                            : 'On schedule'}
                        valueClass={getDriftColor(Math.abs(data.drift.meanDriftSec))}
                        tooltip={
                            <div className="flex flex-col gap-0.5">
                                <span className="font-semibold">Schedule Drift</span>
                                <span className="text-xs opacity-70">
                                    How much the game scheduler has adjusted arrival times
                                    from the original timetable. A large drift indicates
                                    structural route stress.
                                </span>
                            </div>
                        }
                    />
                    <StatCard
                        label="Revenue"
                        icon="ArrowBigUpDash"
                        value={formatCurrencyCompact(data.dailyRevenue)}
                        sub="/ last 24h"
                    />
                    <StatCard
                        label="Cost"
                        icon="ArrowBigDownDash"
                        value={formatCurrencyCompact(data.dailyCost)}
                        sub="/ last 24h"
                    />
                    <StatCard
                        label="Profit"
                        icon='HandCoins'
                        value={formatCurrencyCompact(data.dailyProfit)}
                        sub="/ last 24h"
                        valueClass={profitClass}
                    />
                </div>
            </section>

            {/* ── Route Metrics chart ── */}
            <div className="pt-8">
                <div className="py-5 flex items-baseline gap-3">
                    <h3 className="text-xl font-semibold leading-none tracking-tight">Route Metrics</h3>
                    <p className="text-xs text-muted-foreground mt-1">Historical trends for key performance indicators</p>
                </div>
                <RouteMetrics routeId={routeId} />
            </div>

            {/* ── Timetable Analysis ── */}
            <div className="pt-8">
                <div className="py-5 flex items-baseline gap-3">
                    <h3 className="text-xl font-semibold leading-none tracking-tight">Realtime Timetable Analysis</h3>
                    <p className="text-xs text-muted-foreground mt-1">Per-stop delay and dwell, averaged across completed laps today</p>
                </div>
                <TimetableCharts routeId={routeId} accum={data.timetableAccum} />
            </div>


            {/* ── Station Flow chart ── */}
            <div className="pt-8">
                <div className="py-5 flex items-baseline gap-3">
                    <h3 className="text-xl font-semibold leading-none tracking-tight">Stations Flow</h3>
                </div>
                <StationFlow routeId={routeId} onStationClick={handleStationClick} />
            </div>

            {/* ── Commute Flow chart ── */}
            <div ref={commuteFlowRef} className="pt-8">
                <div className="py-5 flex items-baseline gap-3">
                    <h3 className="text-xl font-semibold leading-none tracking-tight">Commute Flows</h3>
                    <p className="text-xs text-muted-foreground mt-1">
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
                togglerClasses="flex items-center gap-1 rounded-md hover:bg-accent px-2 py-1.5 transition-colors text-xs"
                togglerContent={
                    routeId
                        ? <RouteBadge routeId={routeId} size="1rem" interactive={false} />
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
                <span className="font-semibold">
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
        <StaticPanel
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
        </StaticPanel>
    );
}
