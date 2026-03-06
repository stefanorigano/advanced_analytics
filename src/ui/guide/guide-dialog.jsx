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

function UsageThresholdBar() {
    // Zone widths are proportional to their actual percentage ranges (total = 100)
    const zones = [
        { bg: '#ef4444', flex: 30, text: 'Critical',   textColor: 'rgb(255,255,255)' },
        { bg: '#eab308', flex: 15, text: 'Under-used', textColor: 'rgb(0,0,0)'      },
        { bg: '#16a34a', flex: 40, text: 'Healthy',    textColor: 'rgb(255,255,255)' },
        { bg: '#eab308', flex: 10, text: 'Busy',       textColor: 'rgb(0,0,0)'      },
        { bg: '#ef4444', flex: 5,  text: '!',          textColor: 'rgb(255,255,255)' },
    ];
    const ticks = [
        { pct: 0,  label: '0%'   },
        { pct: 30, label: '30%'  },
        { pct: 45, label: '45%'  },
        { pct: 85, label: '85%'  },
        { pct: 97.4, label: '95%+' },
    ];
    return (
        <div className="my-4 select-none">
            {/* Colored bar */}
            <div className="flex h-7 rounded overflow-hidden" style={{ gap: '1px' }}>
                {zones.map((z, i) => (
                    <div
                        key={i}
                        className="flex items-center justify-center text-xs font-semibold overflow-hidden"
                        style={{ flex: z.flex, backgroundColor: z.bg, color: z.textColor }}
                    >
                        {z.text}
                    </div>
                ))}
            </div>
            {/* Tick marks + threshold labels */}
            <div className="relative" style={{ height: '28px' }}>
                {ticks.map((t, i) => (
                    <div
                        key={i}
                        className="absolute top-0 flex flex-col items-center"
                        style={{
                            left: `${t.pct}%`,
                            transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                        }}
                    >
                        <div style={{ width: 1, height: 6, backgroundColor: 'currentColor' }} />
                        <span className="text-xs text-foreground" style={{ whiteSpace: 'nowrap' }}>
                            {t.label}
                        </span>
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
            size={980}
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
                            <NavSection id="aa-guide-metrics"     label="Metrics"       scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-ridership"       label="Ridership"   icon="Route"    scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-throughput"      label="Throughput" icon="Container"     scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-usage"           label="Usage" icon="Scale"          scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-trains"          label="Trains" icon="TramFront"         scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-stations"        label="Stations" icon="Building2"       scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-transfers"       label="Transfers" icon="Component"     scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-revenue"         label="Revenue" icon="ArrowBigUpDash"        scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-cost"            label="Cost" icon="ArrowBigDownDash"           scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-profit"          label="Profit" icon='HandCoins'         scrollTo={scrollTo} />
                            <NavItem    id="aa-guide-m-profit-train"    label="Profit / Train" icon='TrainFrontTunnel' scrollTo={scrollTo} />
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
                            24 hours at its current train frequency — the ceiling above current
                            ridership. Calculated by summing three game periods:
                        </p>
                        <ul className="list-disc">
                           <li><span className="font-bold text-red-500">High</span> (rush
                            hours — 6h total)</li>
                            <li><span className="font-bold text-orange-400">Medium</span> (shoulder
                            hours — 9h total)</li>
                            <li><span className="font-bold text-green-600 dark:text-green-400">Low</span> (overnight
                            — 9h total).</li>
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

                    <MetricEntry id="aa-guide-m-usage" label="Usage" icon="Scale">
                        <p className='pb-1'>
                            Ridership as a percentage of throughput — how full the route is relative
                            to its capacity. Color-coded for quick reading:
                        </p>
                        <UsageThresholdBar />
                        <ul className="list-disc pb-1">
                            <li>
                                <span className="text-green-600 dark:text-green-400 font-medium">Green</span> (45–85%): healthy usage range.
                            </li>
                            <li>
                                <span className="text-yellow-500 font-medium">Yellow</span>: the route is getting busy (85–95%) or under-used (30–45%).
                            </li>
                            <li>
                                <span className="text-red-500 font-medium">Red</span>: near or over capacity (above 95%) or critically under-used (below 30%).
                            </li>
                        </ul>
                        <p className="pt-1">
                            Very low usage is not inherently bad since a new route takes time to attract
                            passengers. Give new routes time to grow. Very high usage is a service quality risk and may suppress
                            further ridership growth.
                        </p>
                        <Warning>
                            <b>Use this value as a performance indicator rather than an overload warning.</b>
                            The value is a median computed for the entire day. A route might experience overload during rush hours and be underutilized during the night, yet still be ranked as “healthy.”
                        </Warning>
                    </MetricEntry>

                    <MetricEntry id="aa-guide-m-trains" label="Trains" icon="TramFront">
                        <p>
                            The number of trains assigned to each demand tier.<br/>Displayed as three
                            values: <span className="text-red-500">High</span> /
                            {' '}<span className="text-orange-400">Medium</span> /
                            {' '}<span className="text-green-600 dark:text-green-400">Low</span>. The tiers correspond to fixed time windows in the game day.
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
