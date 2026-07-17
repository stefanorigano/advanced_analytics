// GuideDialog component
// Inline user guide with sidebar navigation and scrollable content

import { Dialog } from '../../components/dialog.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ---------------------------------------------------------------------------
// Sidebar helpers
// ---------------------------------------------------------------------------

function NavSection({ id, label, scrollTo }) {
    return (
        <li>
            <button
                onClick={() => scrollTo(id)}
                className="px-2 w-full text-left font-semibold text-foreground/80 hover:text-foreground py-1 rounded-md hover:bg-accent"
            >
                {label}
            </button>
        </li>
    );
}

function NavItem({ id, label, icon, scrollTo }) {
    return (
        <li className={'ml-2'}>
            <button
                onClick={() => scrollTo(id)}
                className="flex gap-1 items-center w-full text-left py-1.5 pl-2 text-foreground/80 hover:text-foreground text-xs rounded-md hover:bg-accent"
            >
                {icon && React.createElement(icons[icon], { size: 14 })}
                {label}
            </button>
        </li>
    );
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

function SectionTitle({ id, children }) {
    return (
        <h2 id={id} className="text-3xl font-semibold mt-6 pt-6 mb-5 pb-3 border-b border-border">
            {children}
        </h2>
    );
}

function MetricEntry({ id, label, icon, children }) {
    return (
        <div id={id} className="mb-5 pt-2 pb-6">
            <div className={"flex gap-2"}>
                {icon && React.createElement(icons[icon], { size: 20, className: 'mt-1 shrink-0 '})}
                <div>
                    <h3 className="text-lg font-semibold mb-1 gap-2">
                        {label}
                    </h3>
                    <div className="text-foreground/80 leading-relaxed space-y-1.5 text-sm">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Note({ children }) {
    return (
        <div
            className="border border-l-4 flex gap-3 pl-3 pr-4 py-3 rounded-l-none rounded-lg text-sm text-blue-500"
            style={{borderColor: 'currentColor', backgroundColor: 'color-mix(in srgb, currentColor, transparent 95%)'}}
        >
            <icons.Info size={20} className="shrink-0"/>
            <p className="text-foreground">
                {children}
            </p>
        </div>
    );
}

function Warning({ children }) {
    return (
        <div
            className="border border-l-4 flex gap-3 pl-3 pr-4 py-3 rounded-l-none rounded-lg text-sm text-orange-400"
            style={{borderColor: 'currentColor', backgroundColor: 'color-mix(in srgb, currentColor, transparent 95%)'}}
        >
            <icons.TriangleAlert size={20} className="shrink-0"/>
            <p className="text-foreground">
                {children}
            </p>
        </div>
    );
}

function LoadFactorBar() {
    const zones = [
        { flex: 20, bg: '#ef4444', label: 'Under-served', textColor: '#fff' },
        { flex: 20, bg: '#f59e0b', label: 'Light',        textColor: '#000' },
        { flex: 40, bg: '#22c55e', label: 'Healthy',      textColor: '#fff' },
        { flex: 15, bg: '#f59e0b', label: 'Heavy',        textColor: '#000' },
        { flex:  5, bg: '#ef4444', label: 'Over',         textColor: '#fff' },
    ];
    const ticks = [
        { pct: 0,   label: '0%'   },
        { pct: 20,  label: '20%'  },
        { pct: 40,  label: '40%'  },
        { pct: 80,  label: '80%'  },
        { pct: 95,  label: '95%'  },
        { pct: 100, label: '100%' },
    ];
    return (
        <div className="my-4 select-none">
            <div className="flex h-7 rounded overflow-hidden" style={{ gap: '1px' }}>
                {zones.map((z, i) => (
                    <div key={i}
                         className="flex items-center justify-center text-xs font-semibold overflow-hidden"
                         style={{ flex: z.flex, backgroundColor: z.bg, color: z.textColor }}>
                        {z.label}
                    </div>
                ))}
            </div>
            <div className="relative" style={{ height: 28 }}>
                {ticks.map((t, i) => (
                    <div key={i} className="absolute top-0 flex flex-col items-center"
                         style={{
                             left: `${t.pct}%`,
                             transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                         }}>
                        <div style={{ width: 1, height: 6, backgroundColor: 'currentColor' }} />
                        <span className="text-xs text-foreground" style={{ whiteSpace: 'nowrap' }}>{t.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function HealthScoreBar() {
    // Visual bands map the per-route load factor ranges to their score contribution
    const bands = [
        { flex: 20, bg: '#ef4444', label: '≤20%: 0 pts',    textColor: '#fff' },
        { flex: 20, bg: '#f59e0b', label: '20–40%: ramp',   textColor: '#000' },
        { flex: 40, bg: '#22c55e', label: '40–80%: full',   textColor: '#fff' },
        { flex: 15, bg: '#f59e0b', label: '80–95%: −30%',   textColor: '#000' },
        { flex: 25, bg: '#ef4444', label: '95–120%: −100%', textColor: '#fff' },
    ];
    const ticks = [
        { pct: 0,    label: '0%'    },
        { pct: 20,   label: '20%'   },
        { pct: 40,   label: '40%'   },
        { pct: 80,   label: '80%'   },
        { pct: 95,   label: '95%'   },
        { pct: 100,  label: '120%+' },
    ];
    return (
        <div className="my-4 select-none">
            <div className="flex h-7 rounded overflow-hidden" style={{ gap: '1px' }}>
                {bands.map((z, i) => (
                    <div key={i}
                         className="flex items-center justify-center text-xs font-semibold overflow-hidden"
                         style={{ flex: z.flex, backgroundColor: z.bg, color: z.textColor }}>
                        {z.label}
                    </div>
                ))}
            </div>
            <div className="relative" style={{ height: 28 }}>
                {ticks.map((t, i) => (
                    <div key={i} className="absolute top-0 flex flex-col items-center"
                         style={{
                             left: `${t.pct}%`,
                             transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                         }}>
                        <div style={{ width: 1, height: 6, backgroundColor: 'currentColor' }} />
                        <span className="text-xs text-foreground" style={{ whiteSpace: 'nowrap' }}>{t.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}


function Badge({ style, children }) {
    return (
        <span
            className={`px-2 py-1 font-bold rounded-full ${style ? style : 'bg-primary text-primary-foreground'}`}
        >
            {children}
        </span>
    );
}

function InternalLink({ id, children }) {
    return (
        <button
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="underline text-foreground hover:text-foreground/70"
        >
            {children}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GuideDialog({ isOpen, onClose }) {

    const scrollTo = (id) => {
        if (!id) return;
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <Dialog
            id="aa-guide-dialog"
            title="User Guide"
            size={1180}
            noPadding={true}
            isOpen={isOpen}
            onClose={onClose}
            backdropClasses="bg-black/80"
        >
            <section className="flex min-h-0 h-[80vh]">

                {/* ── Sidebar ── */}
                <aside className="relative shrink-0 h-full">
                    <div className="bg-background border-border border-r flex h-full inset-0 justify-center overflow-y-auto p-3 pl-5 pr-8">
                        <ul className="space-y-0.5">
                            <NavSection id="aa-guide-intro"       label="Introduction"  scrollTo={scrollTo} />
                            <NavSection id="aa-guide-data-modes"  label="Data Modes"    scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-last24h"        label="Last 24h (live)"  icon="Clock"             scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-historical"     label="Historical"       icon="Calendar"          scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-comparison"     label="Comparison"       icon="GitCompareArrows"  scrollTo={scrollTo} />
                            <NavSection id="aa-guide-network"     label="Network Overview" scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-load-factor"    label="Load Factor"     icon="Gauge"        scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-health-score"   label="Health Score"    icon="HeartPulse"   scrollTo={scrollTo} />
                            <NavSection id="aa-guide-metrics"     label="Metrics"       scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-ridership"       label="Ridership"   icon="Route"    scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-throughput"      label="Throughput" icon="Container"     scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-load-factor-route" label="Load Factor" icon="Gauge"  scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-usage"           label="Performance"  icon="Zap"     scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-trains"          label="Trains" icon="TramFront"         scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-stations"        label="Stations" icon="Building2"       scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-transfers"       label="Transfers" icon="Component"     scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-revenue"         label="Revenue" icon="ArrowBigUpDash"        scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-cost"            label="Cost" icon="ArrowBigDownDash"           scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-profit"          label="Profit" icon='HandCoins'         scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-profit-train"    label="Profit / Train" icon='TrainFrontTunnel' scrollTo={scrollTo} />
                            <NavSection id="aa-guide-timetable"   label="Timetable Analysis" scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-headway"          label="Headway Regularity" icon="UnfoldHorizontal"  scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-schedule-drift"   label="Schedule Drift"     icon="CalendarClock"     scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-delay-profile"    label="Delay Profile"      icon="Timer" scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-dwell-compliance" label="Dwell Compliance"   icon="CirclePause" scrollTo={scrollTo} />
                            <NavSection id="aa-guide-storage"     label="Storage"       scrollTo={scrollTo} />
                        </ul>
                    </div>
                </aside>

                {/* ── Content ── */}
                <div className="flex-1 overflow-y-auto px-6">

                    {/* ── Introduction ── */}
                    <SectionTitle id="aa-guide-intro">Introduction</SectionTitle>
                    <p className=" text-foreground/80">
                        <strong>Advanced Analytics</strong> adds historical per-route advanced analytics to Subway Builder.
                    </p>
                    <p className=" text-foreground/80 mt-2">
                        It tracks ridership, capacity, financial metrics, and transfer connections,
                        and records end-of-day snapshots so you can review how your network evolved
                        over time and compare any two days side by side.
                    </p>
                    <p className=" text-foreground/80 mt-2">
                        The panel sits alongside the game UI and updates automatically.<br/>
                        All data persists across game restarts.
                    </p>

                    {/* ── Data Modes ── */}
                    <SectionTitle id="aa-guide-data-modes">Data Modes</SectionTitle>

                    <MetricEntry id="aa-guide-m-last24h" label="Last 24h (live)" icon="Clock">
                        Shows current metrics computed in real time against the game's
                        rolling 24-hour ridership window. Routes built during the current day
                        show figures adjusted to the time elapsed since they were created, so
                        newly opened lines are not penalised by a full-day cost projection.
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-historical" label="Historical" icon="Calendar">
                        End-of-day snapshots captured automatically when each in-game day
                        ends. Pick any recorded day from the selector to review how every route
                        performed on that day. Historical data accumulates as you play; the mod
                        keeps the most recent days and prunes older ones to avoid unbounded
                        storage growth.
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-comparison" label="Comparison" icon="GitCompareArrows">
                        Places two historical days side by side. Each metric shows the
                        absolute value alongside a percentage change arrow. Green means
                        improvement, red means decline (accounting for metric direction —
                        a cost increase is negative, a revenue increase is positive). Routes
                        that were created or deleted between the two days are flagged as <span className="text-purple-500 dark:text-purple-400 font-medium border py-0.5 px-1 mx-1">NEW</span> or <span className="text-gray-400 font-medium border py-0.5 px-1 mx-1">DELETED</span>.
                    </MetricEntry>

                    {/* ── Network Overview ── */}
                    <SectionTitle id="aa-guide-network">Network Overview</SectionTitle>
                    <p className="text-foreground/80 mb-4">
                        The top of the dashboard shows two system-wide headline metrics that
                        summarise the health of your entire network at a glance, alongside
                        quick-stat chips for routes, trains, hubs, ridership, and revenue.
                    </p>

                    <MetricEntry id="aa-guide-m-load-factor" label="System Load Factor" icon="Gauge">
                        <p>
                            A system-wide view of train crowding — how full trains are at their
                            busiest point across every route in your network. Computed as a
                            ridership-weighted average of each route's individual Load Factor:
                        </p>
                        <div className="flex items-center gap-2 pt-3 pb-4 text-foreground font-bold flex-wrap">
                            <span>Σ (</span>
                            <Badge style="text-xs bg-foreground text-background">route ridership</Badge>
                            <span>×</span>
                            <Badge style="text-xs bg-foreground text-background">route load factor</Badge>
                            <span>) ÷</span>
                            <Badge style="text-xs bg-foreground text-background">total ridership</Badge>
                        </div>
                        <p className="pb-1">
                            Because it is ridership-weighted, routes that carry more passengers
                            have more influence on the result. A single very busy and crowded route
                            will pull the figure up even if other routes are lightly loaded.
                        </p>
                        <p className="pb-1">
                            This metric measures actual <em>crowding</em>, not schedule fill.
                            It answers the question: "across the whole network, how packed are
                            trains at their busiest point?" See the per-route{' '}
                            <InternalLink id="aa-guide-m-load-factor-route">Load Factor</InternalLink>{' '}
                            metric for how each route's value is computed.
                        </p>
                        <LoadFactorBar />
                        <ul className="list-disc pb-1">
                            <li><span className="text-green-500 font-medium">Green (40–80%)</span> — healthy. Trains are well-loaded without overcrowding.</li>
                            <li><span className="text-yellow-500 font-medium">Amber (20–40%)</span> — light. Trains are running with plenty of spare room.</li>
                            <li><span className="text-yellow-500 font-medium">Amber (80–95%)</span> — heavy. Some routes are getting crowded at peak.</li>
                            <li><span className="text-red-500 font-medium">Red (&lt;20%)</span> — under-served. Trains are mostly empty; consider fewer or smaller trains.</li>
                            <li><span className="text-red-500 font-medium">Red (&gt;95%)</span> — overcrowded. Passengers are being left behind; add trains or capacity.</li>
                        </ul>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-health-score" label="Network Health Score" icon="HeartPulse">
                        <p>
                            A 0–100 score that measures how well your routes are operating
                            in their ideal crowding range. Unlike System Load Factor (which reports
                            average crowding), the Health Score <em>penalises</em> routes that
                            are either nearly empty or overcrowded, rewarding balanced,
                            well-utilised service.
                        </p>
                        <p className="pt-2 pb-1">
                            Each route earns a score based on its <strong>Load Factor</strong> — how full
                            trains are at their busiest segment:
                        </p>
                        <HealthScoreBar />
                        <ul className="list-disc pb-1">
                            <li><strong>40–80% load factor</strong>: full score (1.0) — trains are well-loaded without crowding.</li>
                            <li><strong>20–40% load factor</strong>: partial score (ramp 0 → 0.5) — route is lightly loaded but functional.</li>
                            <li><strong>80–95% load factor</strong>: mild penalty — peak trains are getting crowded.</li>
                            <li><strong>95–120% load factor</strong>: severe penalty — trains are overcrowded at peak, likely suppressing demand.</li>
                            <li><strong>Below 20% or above 120%</strong>: score of 0 — trains are critically empty or severely overcrowded.</li>
                        </ul>
                        <p className="pb-1">
                            Individual route scores are then averaged across the network,
                            weighted by each route's ridership, so busy routes matter more
                            than quiet ones. The result is multiplied by 100 to give a 0–100
                            scale.
                        </p>
                        <div className="grid grid-cols-5 gap-2 text-xs text-center pt-2 pb-4 select-none">
                            {[
                                { range: '0–40',  label: 'Poor',      color: '#ef4444' },
                                { range: '40–60', label: 'Fair',      color: '#f59e0b' },
                                { range: '60–75', label: 'Good',      color: '#84cc16' },
                                { range: '75–90', label: 'Very Good', color: '#22c55e' },
                                { range: '90–100',label: 'Excellent', color: '#22c55e' },
                            ].map(b => (
                                <div key={b.label} className="rounded p-1.5"
                                     style={{ backgroundColor: `color-mix(in srgb, ${b.color}, transparent 80%)`, border: `1px solid ${b.color}` }}>
                                    <div className="font-bold" style={{ color: b.color }}>{b.label}</div>
                                    <div className="text-foreground/60">{b.range}</div>
                                </div>
                            ))}
                        </div>
                        <Warning>
                            The Health Score rewards <em>balanced</em> routes — it does not
                            reward simply maximising ridership. A route whose busiest train is
                            at 150% capacity scores zero because overcrowding suppresses
                            further demand growth. Adding trains or capacity to those routes
                            will raise the score.
                        </Warning>
                    </MetricEntry>

                    {/* ── Metrics ── */}
                    <SectionTitle id="aa-guide-metrics">Metrics</SectionTitle>

                    <MetricEntry id="aa-guide-m-ridership" label="Ridership" icon="Route">
                        <p>
                            The number of passengers carried in the current rolling 24-hour window,
                            as reported directly by the game. This is the primary measure of how
                            well a route is serving demand.
                        </p>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-throughput" label="Throughput" icon="Container">
                        <p>
                            The theoretical maximum number of passengers the route could carry in
                            24 hours at its current train frequency, in one direction. Calculated
                            by summing four game periods:
                        </p>
                        <ul className="list-disc">
                           <li><span className="font-bold text-red-500">High</span> (rush
                            hours — 6h total)</li>
                            <li><span className="font-bold text-orange-400">Medium</span> (shoulder
                            hours — 8h total)</li>
                            <li><span className="font-bold text-green-600 dark:text-green-400">Low</span> (overnight
                            — 6h total)</li>
                            <li><span className="font-bold text-blue-600 dark:text-blue-400">Very Low</span> (deep
                            overnight — 4h total).</li>
                        </ul>
                        <p>
                            For each period, the formula is:
                        </p>
                        <div className='flex items-center gap-2 pt-3 pb-4 text-foreground font-bold'>
                            <Badge style='text-xs bg-foreground text-background'>trains in that tier</Badge>⨉
                            <Badge style="text-xs bg-foreground text-background">loops per hour</Badge>⨉
                            <Badge style='text-xs bg-foreground text-background'>cars per train</Badge>⨉
                            <Badge style='text-xs bg-foreground text-background'>capacity per car</Badge>⨉
                            <Badge style='text-xs bg-foreground text-background'>hours in period</Badge>
                        </div>
                        <p className='pb-1'>
                            The loop time comes from the route's station timings; a shorter loop
                            means more round trips per hour and higher throughput.
                        </p>
                        <Note>
                            When ridership approaches throughput, adding trains or longer consists
                            will increase headroom before the route becomes a bottleneck.
                        </Note>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-load-factor-route" label="Load Factor" icon="Gauge">
                        <p className="pb-1">
                            The primary crowding metric. It measures how full trains are at
                            the <em>busiest segment</em> on the route — the stretch of track
                            between two consecutive stations where the most passengers are on
                            board simultaneously:
                        </p>
                        <div className="flex items-center gap-2 pt-3 pb-4 text-foreground font-bold flex-wrap">
                            <Badge style="text-xs bg-foreground text-background">peak segment load</Badge>
                            <span>÷</span>
                            <Badge style="text-xs bg-foreground text-background">train capacity</Badge>
                            <span>× 100</span>
                        </div>
                        <p className="pb-1">
                            A value of 100% means trains are exactly at capacity at their
                            busiest point. Values above 100% indicate overcrowding.
                        </p>
                        <LoadFactorBar />

                        <p className="font-semibold pt-1 pb-1 text-primary">How direction affects the calculation</p>
                        <p className="pb-2">
                            Subway Builder routes come in two shapes, and the calculation
                            handles them differently:
                        </p>
                        <div className="grid grid-cols-2 gap-3 pb-3">
                            <div className="rounded-lg border border-border p-3 space-y-1">
                                <p className="font-semibold text-foreground">Back-and-forth (pendulum)</p>
                                <p className="text-foreground/70 text-xs">
                                    Trains go A → B → A. Passengers travel in both directions
                                    through the same stations, so HW and WH commuters are
                                    counted separately. The peak load in each direction is found
                                    independently, and the higher of the two is used.
                                    This prevents outbound and inbound passengers from
                                    cancelling each other out in the maths.
                                </p>
                            </div>
                            <div className="rounded-lg border border-border p-3 space-y-1">
                                <p className="font-semibold text-foreground">Loop (circular)</p>
                                <p className="text-foreground/70 text-xs">
                                    Trains always travel in one direction around the loop.
                                    All passengers are flowing the same way, so no direction
                                    split is needed — the peak segment load is read directly
                                    from the cumulative journey data.
                                </p>
                            </div>
                        </div>

                        <p className="font-semibold pt-1 pb-1 text-primary">Data source and accuracy</p>
                        <p className="pb-2">
                            Load Factor is derived from the game's completed-commutes records,
                            which accumulate over all game days. To avoid values growing with
                            game time, the calculation normalises the peak segment load as a
                            fraction of total boardings on that route, then scales it against
                            the current ridership/capacity ratio. The result is a stable percentage that
                            does not inflate as the game progresses.
                        </p>
                        <Note>
                            Because the commute data has no timestamps, Load Factor reflects
                            an <em>average</em> picture across the whole day — not the literal
                            instantaneous peak. A route that is completely packed only during
                            rush hour will show a lower Load Factor than the rush-hour crowd
                            alone would suggest.
                        </Note>

                        <p className="font-semibold pt-3 pb-1">Load Factor vs Performance — when to use each</p>
                        <div className="grid grid-cols-2 gap-3 pb-1">
                            <div className="rounded-lg border border-border p-3 space-y-1.5">
                                <p className="font-semibold text-foreground">Use Load Factor when…</p>
                                <ul className="list-disc text-foreground/70 space-y-1">
                                    <li>Checking whether passengers are being left behind at stops.</li>
                                    <li>Deciding if you need to add trains or longer consists to a specific segment.</li>
                                    <li>Comparing two routes' actual service quality.</li>
                                    <li>Looking at the Network Health Score, which is also based on Load Factor.</li>
                                </ul>
                            </div>
                            <div className="rounded-lg border border-border p-3 space-y-1.5">
                                <p className="font-semibold text-foreground">Use Performance when…</p>
                                <ul className="list-disc text-foreground/70 space-y-1">
                                    <li>Evaluating how well ridership justifies your schedule (are you running too many trains?).</li>
                                    <li>Doing financial analysis — cost scales with trains, not with crowding at one segment.</li>
                                    <li>Identifying routes with high passenger turnover that generate a lot of ridership relative to their capacity.</li>
                                </ul>
                            </div>
                        </div>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-usage" label="Performance" icon="Zap">
                        <p className='pb-1'>
                            A dimensionless multiplier that measures how much ridership a route generates
                            relative to its bidirectional throughput capacity:
                        </p>
                        <div className="flex items-center gap-2 pt-3 pb-4 text-foreground font-bold flex-wrap">
                            <Badge style="text-xs bg-foreground text-background">daily ridership</Badge>
                            <span>÷</span>
                            <span>(</span>
                            <Badge style="text-xs bg-foreground text-background">24 h throughput ceiling</Badge>
                            <span>× 2)</span>
                        </div>
                        <ul className="list-disc pb-1">
                            <li>
                                <strong>1.0×</strong> — every seat is filled end-to-end in both directions.
                                This is the baseline for a simple two-terminal route at full utilisation.
                            </li>
                            <li>
                                <strong className="text-green-600 dark:text-green-400">Above 1.0×</strong> — high passenger turnover: more people board and alight at intermediate stops,
                                multiplying the effective ridership beyond the raw seat count.
                                A value of <strong>2.3×</strong> is excellent, not a warning sign.
                            </li>
                            <li>
                                <strong className="text-yellow-500">Below 1.0×</strong> — some capacity is going unused on at least one direction or time period.
                            </li>
                            <li>
                                <strong className="text-red-500">Below 0.3×</strong> — route is significantly underperforming relative to its schedule cost.
                            </li>
                        </ul>

                        <p className="font-semibold pt-3 pb-1 text-primary">Why ÷ 2?</p>
                        <p className="pb-2 text-foreground/70 text-xs">
                            The throughput ceiling counts <em>one-directional</em> seat capacity.
                            A train running A → B → A serves passengers in both directions, so the
                            true bidirectional ceiling is twice that figure. Dividing by 2 × capacity
                            anchors the metric at 1.0× for a route where every seat is filled
                            end-to-end in each direction — a natural, intuitive baseline.
                        </p>

                        <p className="font-semibold pt-2 pb-1 text-primary">Strengths</p>
                        <ul className="list-disc pb-1">
                            <li>Directly tied to financials — a low Performance route is likely losing money on operational costs.</li>
                            <li>Rewards long routes serving many transfer hubs: high turnover pushes the multiplier well above 1×.</li>
                            <li>Stable over time: it normalises automatically as ridership and capacity both grow.</li>
                            <li>No artificial cap — high values are always good and reflect genuine ridership generation.</li>
                        </ul>

                        <p className="font-semibold pt-2 pb-1 text-primary">Limitations</p>
                        <ul className="list-disc pb-2">
                            <li>
                                <strong>Hides uneven passenger distribution.</strong> A crowded single segment
                                can produce a decent Performance score while the rest of the route runs empty.
                                Load Factor exposes this asymmetry.
                            </li>
                            <li>
                                <strong>Not a crowding indicator.</strong> A high multiplier means high ridership
                                relative to schedule cost — it does not tell you whether any individual
                                train is overloaded. Use Load Factor for that.
                            </li>
                        </ul>
                        <Warning>
                            Performance and Load Factor measure different things. A commuter route where
                            everyone boards at the terminus and rides to the end will show a <em>lower</em>{' '}
                            Performance (the return leg is empty) but a high Load Factor at peak.
                            A busy multi-stop interchange route can show a very high Performance (2× or more)
                            while keeping Load Factor comfortably in the green zone.
                            Use both metrics together for a complete picture.
                        </Warning>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-trains" label="Trains" icon="TramFront">
                        <p>
                            The number of trains assigned to each demand tier.<br/>Displayed as four
                            values: <span className="text-red-500">High</span> /
                            {' '}<span className="text-orange-400">Medium</span> /
                            {' '}<span className="text-green-600 dark:text-green-400">Low</span> /
                            {' '}<span className="text-blue-600 dark:text-blue-400">Very Low</span>. The tiers correspond to fixed time windows in the game day.
                        </p>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-stations" label="Stations" icon="Building2">
                        <p>
                            The number of stations on the route, counting both termini and all
                            intermediate stops.
                        </p>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-transfers" label="Transfers" icon="Component">
                        <p>
                            The number of interchange connections this route shares with other
                            lines. A station is counted as a transfer point when any of the
                            following is true:
                        </p>
                        <ul className="list-disc">
                            <li>
                                <strong>Two or more routes stop at the exact same station</strong> (for example, a
                                shared terminus).
                            </li>
                            <li>
                                <strong>The station belongs to a "Station Group"</strong>.
                            </li>
                            <li>
                                <strong>The station has another route's station within a short walking
                                distance</strong> (less than 100 seconds on foot).
                            </li>
                        </ul>
                        <p>
                            Each qualifying station is counted <b>once</b> per connected route. The
                            tooltip on the Transfers cell lists which routes are reachable.
                        </p>
                        <p className='pb-1'>
                            In the Station Flow chart, transfer stations are marked with a small
                            circle on the bottom axis, and the chart tooltip lists the connecting
                            route badges when you hover over a transfer station.
                        </p>
                        <Note>
                            Only direct interchanges are counted. Passengers may walk further
                            to reach other lines not listed here.
                        </Note>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-revenue" label="Revenue" icon="ArrowBigUpDash">
                        <p>
                            Total fare income for the day, taken from the game's
                            revenue-per-hour figure and extrapolated to 24 hours. This value
                            is determined by the game's fare model and passenger mix — the
                            mod reads it directly without modification.
                        </p>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-cost" label="Cost" icon="ArrowBigDownDash">
                        <p>
                            The daily operational cost of running the route. For each demand phase, it's calculated as:
                        </p>
                        <div className='flex items-center gap-2 pt-3 pb-4 text-foreground font-bold'>
                            <Badge style='text-xs bg-foreground text-background'>trains</Badge>⨉
                            <Badge style="text-xs bg-foreground text-background">duration</Badge>⨉
                            <Badge style='text-xs bg-purple-600 text-white'>cost per train-hour</Badge>
                        </div>
                        <p>

                            The <Badge style='text-xs bg-purple-600 text-white'>cost per train-hour</Badge> combines a fixed locomotive cost and a
                            per-car cost (both from the train type's stats), multiplied by the
                            game's pricing factor.
                        </p>
                        <p>
                            If you change the train schedule during the day, the mod records
                            the exact minute of each change and computes cost against the actual
                            configuration timeline rather than the end-of-day snapshot. This
                            prevents inflated cost figures after reducing trains late in the day.
                        </p>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-profit" label="Profit" icon='HandCoins'>
                        <p>
                            Revenue minus Cost. A negative value means the route is running at
                            a loss and is shown in red. Profit integrates all operational costs,
                            so a route with healthy ridership can still lose money if it runs
                            too many trains or uses an expensive train type on a short loop.
                        </p>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-profit-train" label="Profit / Train" icon='TrainFrontTunnel'>
                        <p>
                            Daily profit divided by the total number of trains deployed across
                            all three demand tiers. Shows how much each individual train
                            contributes to the bottom line. Useful for evaluating whether
                            adding trains to a route is financially worthwhile.
                        </p>
                        <Note>
                            A <b>small</b> route with high profit per train may be a candidate
                            for expansion. A large route with negative profit per train
                            is costing more the more it is used.
                        </Note>
                    </MetricEntry>

                    {/* ── Timetable Analysis ── */}
                    <SectionTitle id="aa-guide-timetable">Timetable Analysis</SectionTitle>
                    <p className="text-foreground/80 mb-2">
                        Ridership and load factor tell you how many passengers your routes are carrying.
                        Timetable Analysis tells you whether those passengers are getting a reliable
                        service — whether trains arrive on time and, critically, whether the gaps
                        between them are consistent.
                    </p>
                    <p className="text-foreground/80 mb-4">
                        These four metrics appear in the Route panel and update continuously throughout
                        the day as trains complete each stop. They reset at midnight so they always
                        reflect today's operation.
                    </p>

                    <MetricEntry id="aa-guide-m-headway" label="Headway Regularity" icon="UnfoldHorizontal">
                        <p className="pb-1">
                            Headway is the gap between two consecutive trains arriving at the same stop.
                            Headway Regularity measures how <em>consistent</em> those gaps are — not whether
                            trains are on time, but whether they are evenly spaced.
                        </p>
                        <p className="pb-1">
                            Imagine waiting on a platform. Two trains 4 minutes apart, followed by two
                            trains 4 minutes apart, is a reliable service. The same four trains arriving
                            as 1 min, 7 min, 2 min, 6 min gaps makes the service feel unpredictable and
                            forces passengers to wait far longer on average — even though the total number
                            of trains is identical.
                        </p>
                        <p className="font-semibold pt-2 pb-1 text-primary">How it is calculated</p>
                        <p className="pb-1">
                            The mod collects the arrival times of every active train at the first stop
                            of the route and measures consecutive gaps. It then computes the{' '}
                            <strong>coefficient of variation</strong> (CV) — the ratio of the standard
                            deviation of those gaps to their mean:
                        </p>
                        <div className="flex items-center gap-2 pt-3 pb-4 text-foreground font-bold flex-wrap">
                            <span>CV =</span>
                            <Badge style="text-xs bg-foreground text-background">std deviation of gaps</Badge>
                            <span>÷</span>
                            <Badge style="text-xs bg-foreground text-background">mean gap</Badge>
                        </div>
                        <p className="pb-1">
                            A CV of 0 means perfect regularity — all gaps are identical. The higher the
                            CV, the more uneven the spacing.
                        </p>
                        <ul className="list-disc pb-1">
                            <li><span className="text-green-500 font-medium">Regular (CV &lt; 0.10)</span> — trains are evenly spaced. Passengers face predictable, short waits.</li>
                            <li><span className="text-yellow-500 font-medium">Irregular (CV 0.10–0.25)</span> — noticeable unevenness. Some passengers will wait significantly longer than others.</li>
                            <li><span className="text-red-500 font-medium">Bunching (CV &gt; 0.25)</span> — trains are clustering. Heavily loaded trains attract more passengers, slowing them further, which pulls the next train closer — a self-reinforcing cycle.</li>
                        </ul>
                        <p className="font-semibold pt-2 pb-1 text-primary">When to act on it</p>
                        <p className="pb-1">
                            Bunching on short, busy routes is common. The fix is usually to
                            add more trains — smaller gaps reduce the snowball effect — or to
                            review the timetable spacing. Routes with only two trains are
                            especially susceptible, because one slow lap immediately pushes the
                            two trains together.
                        </p>
                        <Note>
                            Headway Regularity requires at least two trains on the route to produce
                            a reading. Routes with a single train show N/A — there is no gap to measure.
                        </Note>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-schedule-drift" label="Schedule Drift" icon="CalendarClock">
                        <p className="pb-1">
                            Schedule Drift measures whether the entire route is running ahead of
                            or behind its timetable — not at one specific stop, but on average
                            across all trains and all stops.
                        </p>
                        <p className="pb-1">
                            Where Headway Regularity asks "are trains evenly spaced?", Schedule Drift
                            asks "has the whole timetable shifted?". A route with zero drift is
                            running exactly on schedule. A positive drift means trains are
                            systematically late; a negative drift means they are running early.
                        </p>
                        <p className="font-semibold pt-2 pb-1 text-primary">How it is calculated</p>
                        <p className="pb-1">
                            For every stop on every train, the mod compares the adjusted expected
                            arrival time (what the schedule says after accounting for the current
                            game time) against the original timetable baseline. The drift is
                            averaged across all trains and all stops to produce a single figure:
                        </p>
                        <div className="flex items-center gap-2 pt-3 pb-4 text-foreground font-bold flex-wrap">
                            <span>Drift =</span>
                            <span>mean of (</span>
                            <Badge style="text-xs bg-foreground text-background">adjusted expected arrival</Badge>
                            <span>−</span>
                            <Badge style="text-xs bg-foreground text-background">original scheduled arrival</Badge>
                            <span>)</span>
                        </div>
                        <ul className="list-disc pb-1">
                            <li><span className="text-green-500 font-medium">Good (&lt; 30 s)</span> — trains are running very close to schedule.</li>
                            <li><span className="text-yellow-500 font-medium">Warning (30 s – 2 min)</span> — the timetable has slipped. Noticeable to passengers at stops that are already close together.</li>
                            <li><span className="text-red-500 font-medium">Critical (&gt; 2 min)</span> — the route is significantly behind schedule. Connection passengers at interchange stations may be affected.</li>
                        </ul>
                        <p className="font-semibold pt-2 pb-1 text-primary">When to act on it</p>
                        <p className="pb-1">
                            Consistent drift usually means the scheduled loop time is tighter than what
                            the route can physically achieve at its current speed and dwell times.
                            Check the Delay Profile chart for which stops are contributing most.
                            Increasing the number of trains does not fix drift — it only helps if
                            the route is too busy for the current headway.
                        </p>

                        <p className="font-semibold pt-3 pb-2">Headway Regularity vs Schedule Drift — when to use each</p>
                        <div className="grid grid-cols-2 gap-3 pb-2">
                            <div className="rounded-lg border border-border p-3 space-y-1.5">
                                <p className="font-semibold text-foreground">Use Headway Regularity when…</p>
                                <ul className="list-disc text-foreground/70 space-y-1 text-xs">
                                    <li>Passengers are complaining about unpredictable waits on a route that seems to have enough trains.</li>
                                    <li>You suspect trains are clustering — look for a high CV even if delays are small.</li>
                                    <li>Deciding whether to add more trains to break up a bunch.</li>
                                    <li>Comparing two routes that have the same average headway but different reliability.</li>
                                </ul>
                            </div>
                            <div className="rounded-lg border border-border p-3 space-y-1.5">
                                <p className="font-semibold text-foreground">Use Schedule Drift when…</p>
                                <ul className="list-disc text-foreground/70 space-y-1 text-xs">
                                    <li>Trains are evenly spaced but still feel slow — the whole route may be running late.</li>
                                    <li>You have changed a route (added a stop, extended it) and want to check whether the timetable needs updating.</li>
                                    <li>Investigating whether a route's connections to other lines are being met on time.</li>
                                    <li>Looking for routes where the scheduled loop time is unrealistically optimistic.</li>
                                </ul>
                            </div>
                        </div>
                        <Warning>
                            A route can score well on one metric while failing the other.
                            Even spacing (good Headway) does not mean trains are on time (Schedule Drift).
                            And a route running consistently 3 minutes late everywhere (bad Drift) can
                            still have perfectly regular spacing (good Headway). Use both metrics together.
                        </Warning>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-delay-profile" label="Delay Profile" icon="Timer">
                        <p className="pb-1">
                            The Delay Profile chart breaks Schedule Drift down stop by stop. Instead of
                            a single network-average figure, it shows the average arrival delay at
                            each individual station on the route, accumulated across every train lap
                            completed today.
                        </p>
                        <p className="pb-1">
                            Each bar represents one station. A bar extending to the right means trains
                            are arriving late at that stop; a bar to the left means they are
                            arriving early. The colour follows the same thresholds as Schedule Drift:
                            green for minor delays, yellow for noticeable, red for critical.
                        </p>
                        <p className="font-semibold pt-2 pb-1 text-primary">What to look for</p>
                        <ul className="list-disc pb-1">
                            <li>
                                <strong>Delay growing progressively along the route</strong> — each stop is
                                a little later than the previous one. This is a sign that the overall
                                loop time is too tight; trains cannot recover between stops.
                            </li>
                            <li>
                                <strong>A single stop with a sharp spike</strong> — one station is causing
                                a disproportionate delay. This often points to a dwell problem at that
                                stop (see Dwell Compliance below).
                            </li>
                            <li>
                                <strong>Delay resetting to near-zero mid-route</strong> — a terminus or
                                layover point where trains sit for a few minutes gives the schedule time
                                to recover. If that recovery station disappears, delays can accumulate again.
                            </li>
                        </ul>
                        <Note>
                            The Delay Profile accumulates from the first completed stop of the day and
                            resets at midnight. Early in a new day, stops that have not yet been
                            visited by any train will not appear in the chart.
                        </Note>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-dwell-compliance" label="Dwell Compliance" icon="CirclePause">
                        <p className="pb-1">
                            Dwell time is the period a train spends stationary at a platform —
                            from the moment it arrives to the moment it departs. The game assigns
                            each stop a scheduled dwell time based on the route timetable.
                            Dwell Compliance measures the gap between what was scheduled and
                            what actually happened, averaged across all train laps today.
                        </p>
                        <p className="pb-1">
                            A positive value means the train spent <em>longer</em> than scheduled at
                            that stop — typically because there were more passengers boarding or
                            alighting than the schedule anticipated. A negative value means the
                            train left faster than scheduled, which can happen at quiet stops with
                            little passenger activity.
                        </p>
                        <p className="font-semibold pt-2 pb-1 text-primary">Why it matters</p>
                        <p className="pb-1">
                            Dwell overruns are one of the most common sources of delay in urban rail.
                            A train that spends 30 extra seconds at a busy station doesn't just
                            arrive late at the next stop — it may push the following train closer,
                            contributing to bunching further down the line. Repeated dwell overruns at
                            the same station are a strong signal that the stop is under-served:
                            either too many passengers are crowding the platform, or the scheduled
                            dwell time is simply too short for the volume of passengers.
                        </p>
                        <ul className="list-disc pb-1">
                            <li>
                                <strong>Large positive dwell</strong> at a high-ridership station — the platform may be overcrowded. Consider adding trains to reduce crowding, or check whether the Load Factor for that segment is in the red.
                            </li>
                            <li>
                                <strong>Consistent negative dwell</strong> at a quiet terminus — trains are ready to leave before the schedule expects. This spare time could absorb delays from earlier stops.
                            </li>
                        </ul>

                        <p className="font-semibold pt-3 pb-2">Delay Profile vs Dwell Compliance — when to use each</p>
                        <div className="grid grid-cols-2 gap-3 pb-2">
                            <div className="rounded-lg border border-border p-3 space-y-1.5">
                                <p className="font-semibold text-foreground">Use Delay Profile when…</p>
                                <ul className="list-disc text-foreground/70 space-y-1 text-xs">
                                    <li>You want to see where delays are <em>arriving</em> — which stations trains are running late into.</li>
                                    <li>Diagnosing whether delays are cumulative (growing stop by stop) or isolated to one point on the route.</li>
                                    <li>Checking whether the route can recover delays at layover points.</li>
                                </ul>
                            </div>
                            <div className="rounded-lg border border-border p-3 space-y-1.5">
                                <p className="font-semibold text-foreground">Use Dwell Compliance when…</p>
                                <ul className="list-disc text-foreground/70 space-y-1 text-xs">
                                    <li>You want to see where delays are <em>created</em> — which stations are holding trains longer than planned.</li>
                                    <li>Identifying overcrowded platforms that are slowing the entire route.</li>
                                    <li>Checking whether any stop is consistently causing the downstream delay spikes you see in the Delay Profile.</li>
                                </ul>
                            </div>
                        </div>
                        <Note>
                            Read both charts together for the most useful diagnosis. A spike in Dwell
                            Compliance at stop A, followed by a spike in Delay Profile at stop B,
                            is a strong signal that A is the root cause of delays at B and beyond.
                        </Note>
                    </MetricEntry>

                    {/* ── Storage ── */}
                    <SectionTitle id="aa-guide-storage">Storage Manager</SectionTitle>
                    <div className=" text-foreground/80 leading-relaxed space-y-3">
                        <p>
                            The game does not provide a way for mods to write data into the save
                            file directly. <strong>Advanced Analytics</strong> stores all its data in IndexedDB,
                            the browser's built-in persistent database embedded in the game's
                            Electron runtime.
                        </p>
                        <p>
                            Data survives game restarts and has no practical size limit for the amount of analytics data this mod generates.
                        </p>
                        <p className={'text-sm'}>
                            Data is organised by save name. When the game loads, the mod reads
                            the current save name and uses it as the storage key. <strong className="text-foreground">Save your
                            game at least once to associate data to your save</strong> — an unsaved
                            session has no stable name, and the mod warns you with a banner in
                            the Storage Manager if this is the case.
                        </p>
                        <p className={'text-sm'}>
                            Over time, data from multiple saves or cities accumulates. The Storage
                            Manager (accessible from the toolbar) lists all tracked saves with
                            their city, last modified date, number of historical days recorded,
                            and estimated data size. From there you can:
                        </p>
                        <ul className="space-y-1.5 pl-3 text-sm">
                            <li>
                                <span className="font-medium text-foreground">Delete</span> — permanently
                                removes selected saves and all their historical data.
                            </li>
                            <li>
                                <span className="font-medium text-foreground">Clear All Except Current</span> — removes
                                data from all saves other than the active one. Useful for cleaning
                                up after starting a new city or abandoning a run.
                            </li>
                            <li>
                                <span className="font-medium text-foreground">Export</span> — downloads
                                selected saves as a JSON file. Use this to back up data before
                                reinstalling the game or the mod, or to move data between machines.
                            </li>
                            <li>
                                <span className="font-medium text-foreground">Import</span> — loads a
                                previously exported JSON file. If a save with the same name already
                                exists, you will be asked to confirm before overwriting.
                            </li>
                        </ul>
                        <div className="pt-2"/>
                        <Note>
                            Deleting a save here only removes the mod's analytics data — it does
                            not affect the game save file itself.
                        </Note>
                    </div>

                    <div className="pt-8" />

                </div>
            </section>
        </Dialog>
    );
}
