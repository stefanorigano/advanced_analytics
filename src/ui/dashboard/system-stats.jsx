// System Stats — top-of-dashboard network overview
//
// Shows two headline metrics + a row of quick-stat chips.
//
// ── SYSTEM LOAD FACTOR ───────────────────────────────────────────────────────
//   Ridership-weighted average of per-route load factors.
//   Each route's load factor = peak segment load ÷ train capacity, so this
//   answers "across the whole network, how full are trains at their busiest
//   point on each route, weighted by how many people ride each route?"
//   Zones: <20% under-served · 20–40% light · 40–80% healthy · 80–95% heavy
//          >95% overcrowded
//
// ── NETWORK HEALTH SCORE ─────────────────────────────────────────────────────
//   Ridership-weighted average of a per-route "health" function that rewards
//   load factor in the 40–80% sweet spot and penalises both waste and crowding:
//
//     score(u) = 0               u ≤ 20%
//              = (u-20)/20 × 0.5  20 < u ≤ 40%   (ramp up)
//              = 1.0              40 < u ≤ 80%   (perfect)
//              = 1 - (u-80)/15×0.3  80 < u ≤ 95% (mild crowding)
//              = 0.7 - (u-95)/25×0.7 95 < u ≤ 120%(severe crowding)
//              = 0               u > 120%
//
//   Network Health = Σ(ridership_i × score_i) / Σridership_i  × 100   (0–100)
//
//   Displayed as a semi-circle gauge + a word rating (Poor → Excellent).

import { getTransferGroups } from '../../utils/station-groups.js';
import { formatCurrencyCompact } from '../../utils/formatting.js';
import { getCurrentPhaseName } from '../../core/lifecycle.js';
import { routeHealthScore, computeSystemAggregates } from '../../metrics/system-aggregates.js';
import { computeAdherenceSnapshot } from '../../metrics/historical-data.js';
import { useABIntegration } from '../../hooks/useABIntegration.js';
import { CONFIG } from '../../config.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Health score / load factor display helpers ────────────────────────────────
// routeHealthScore() is imported from ../../metrics/system-aggregates.js

function healthColor(score) {
    if (score < 40) return '#ef4444';
    if (score < 60) return '#f59e0b';
    if (score < 75) return '#84cc16';
    return '#22c55e';
}

function healthLabel(score) {
    if (score < 40) return 'Poor';
    if (score < 60) return 'Fair';
    if (score < 75) return 'Good';
    if (score < 90) return 'Very Good';
    return 'Excellent';
}

// ── Load factor helpers ───────────────────────────────────────────────────────

function loadColor(pct) {
    if (pct < 20) return '#ef4444';
    if (pct < 40) return '#f59e0b';
    if (pct < 80) return '#22c55e';
    if (pct < 95) return '#f59e0b';
    return '#ef4444';
}

function loadLabel(pct) {
    if (pct < 20) return 'Under-served';
    if (pct < 40) return 'Light';
    if (pct < 80) return 'Healthy';
    if (pct < 95) return 'Heavy';
    return 'Overcrowded';
}

// ── Helper ───────────────────────────────────────────────────────

const getCityName = (cityCode) => {
    if (!cityCode) return 'Unknown';
    const cities = api.utils.getCities();
    const city   = cities.find(c => c.code === cityCode);
    return city ? city.name : cityCode;
};

// ── Semi-circle gauge ─────────────────────────────────────────────────────────
// Drawn inside a 120 × 72 viewBox.
// The arc starts at the left (10, 62), sweeps counter-clockwise upward,
// and ends at the right (110, 62) when score = 100.

function GaugeArc({ score }) {
    const cx = 60, cy = 62, r = 48, sw = 6;
    const s  = Math.max(0, Math.min(1, score / 100));
    const c  = healthColor(score);

    // Background: full semi-circle
    const bg = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

    // Fill arc for score s (clockwise from left, through top, to score-angle)
    let fill = null;
    if (s > 0.001) {
        const angle = Math.PI * (1 - s);
        const ex    = +(cx + r * Math.cos(angle)).toFixed(2);
        const ey    = +(cy - r * Math.sin(angle)).toFixed(2);
        fill = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`;
    }

    return (
        <svg viewBox="0 0 120 72" style={{ width: '100%', maxHeight: 72 }}>
            {/* Zone ticks at 20 / 40 / 80 / 95 */}
            {[20, 40, 80, 95].map(t => {
                const a = Math.PI * (1 - t / 100);
                const x1 = cx + (r - sw / 2 ) * Math.cos(a);
                const y1 = cy - (r - sw / 2 ) * Math.sin(a);
                const x2 = cx + (r + sw / 2 ) * Math.cos(a);
                const y2 = cy - (r + sw / 2 ) * Math.sin(a);
                return (
                    <line
                        key={t}
                        x1={x1.toFixed(1)} y1={y1.toFixed(1)}
                        x2={x2.toFixed(1)} y2={y2.toFixed(1)}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        opacity="0.25"
                    />
                );
            })}

            {/* Background arc */}
            <path d={bg} fill="none" stroke="#94a3b8" strokeWidth={sw}
                  strokeLinecap="round" opacity="0.25" />

            {/* Filled arc */}
            {fill && (
                <path d={fill} fill="none" stroke={c} strokeWidth={sw}
                      strokeLinecap="round" />
            )}

            {/* Score */}
            <text x={cx} y={cy - 6}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="20" fontWeight="700"
                  fill={s > 0.001 ? c : '#94a3b8'}
                  style={{ fontFamily: 'inherit' }}
            >
                {Math.round(score)}
            </text>
            <text x={cx} y={cy + 9}
                  textAnchor="middle"
                  fontSize="7.5" fill="#94a3b8"
                  style={{ fontFamily: 'inherit' }}
            >
                / 100
            </text>
        </svg>
    );
}

// ── Load factor bar ───────────────────────────────────────────────────────────

// Zone segments as percentage-of-100 widths
const ZONE_SEGMENTS = [
    { width: 20, color: '#ef4444' },  // 0 – 20%
    { width: 20, color: '#f59e0b' },  // 20 – 40%
    { width: 40, color: '#22c55e' },  // 40 – 80%
    { width: 15, color: '#f59e0b' },  // 80 – 95%
    { width:  5, color: '#ef4444' },  // 95 – 100%
];

function LoadFactorBar({ pct }) {
    const color    = loadColor(pct);
    const label    = loadLabel(pct);
    const fillPct  = Math.min(pct, 100);          // cap visual fill at 100%
    const overCap  = pct > 100;

    return (
        <div className="space-y-2">
            {/* Headline number */}
            <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tabular-nums leading-none"
                      style={{ color }}>
                    {pct.toFixed(1)}
                </span>
                <span className="text-base font-semibold" style={{ color }}>%</span>
                <span className="text-xs text-muted-foreground ml-1">{label}</span>
            </div>

            {/* Zoned progress bar */}
            <div className="relative h-4 rounded-[3px] overflow-hidden">
                {/* Zone backgrounds */}
                <div className="absolute inset-0 flex">
                    {ZONE_SEGMENTS.map((z, i) => (
                        <div key={i} className="h-full"
                             style={{ width: `${z.width}%`, background: z.color, opacity: 0.28 }} />
                    ))}
                </div>
                {/* Fill */}
                <div className="absolute inset-y-0 left-0 rounded-[3px] rounded-r-none transition-all duration-700"
                     style={{ width: `${fillPct}%`, background: color, opacity: 0.85 }} />
                {/* Over-capacity hatch */}
                {overCap && (
                    <div className="absolute inset-y-0 right-0 w-5"
                         style={{
                             background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 3px, transparent 3px, transparent 6px)',
                         }} />
                )}
                {/* Zone dividers */}
                {[20, 40, 80, 95].map(t => (
                    <div key={t} className="absolute inset-y-0 w-px bg-background/50"
                         style={{ left: `${t}%` }} />
                ))}
            </div>

            {/* Zone labels */}
            <div className="flex justify-between text-[9px] text-muted-foreground select-none">
                <span>0%</span>
                <span>Healthy zone: 40–80%</span>
                <span>100%</span>
            </div>
        </div>
    );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ Icon, label, value, daily = false }) {
    return (
        <div className="flex gap-2 pl-3 pr-4 py-2 rounded border border-border bg-muted/20">
            {Icon && <Icon size={13} className="shrink-0 mt-0.5" />}
            <div className="leading-none mt-0.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                    {label}
                </div>
                <div className="text-sm font-semibold tabular-nums">
                    {value} { daily && (<span className={`text-[0.7rem] font-medium text-muted-foreground`}>/day</span>)}
                </div>
            </div>
        </div>
    );
}

// ── Timetable adherence helpers ───────────────────────────────────────────────

function adherenceColor(score) {
    if (score >= 90) return '#22c55e';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
}

function adherenceLabel(score) {
    if (score >= 90) return 'Good';
    if (score >= 70) return 'Fair';
    return 'Poor';
}

function useAdherenceScore() {
    const [score, setScore] = React.useState(null);
    React.useEffect(() => {
        const compute = () => {
            const snap = computeAdherenceSnapshot(api);
            setScore(snap.systemAdherenceScore);
        };
        compute();
        const id = setInterval(compute, 5000);
        return () => clearInterval(id);
    }, []);
    return score;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SystemStats({ liveRouteData }) {
    const stats = React.useMemo(() => {
        const agg = computeSystemAggregates(liveRouteData);
        if (agg.totalLines === 0) return null;

        let hubCount = 0;
        try {
            hubCount = getTransferGroups().length;
        } catch { /* non-fatal */ }

        return { ...agg, hubCount };
    }, [liveRouteData]);

    const adherenceScore = useAdherenceScore();
    const { CompanyBadge } = useABIntegration();

    if (!stats) return null;

    return (
        <div className="space-y-5 py-6 px-6">
            <div className="flex gap-4">
                {/* ── Stat chips ─────────────────────────────────────────────── */}
                <div className="flex items-center mr-auto">
                    <div>
                        <div className={'whitespace-nowrap text-xl font-semibold tracking-tight leading-none mb-1.5'}>
                            {getCityName(api.utils.getCityCode())}
                        </div>
                        {/* Advanced Bureau slot — company badge (logo, name, rebrand) */}
                        {CompanyBadge && <CompanyBadge />}
                        <div className={'text-xs text-muted-foregound'}>
                            Day {api.gameState.getCurrentDay()}
                            {getCurrentPhaseName() && (
                                <span className={'text-xs text-muted-foreground ml-1'}>
                                - {getCurrentPhaseName()}
                            </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3">
                    <StatChip Icon={icons.Route}      label="Routes"    value={stats.totalLines} />
                    <StatChip Icon={icons.TramFront}  label="Trains"    value={stats.totalTrains.toLocaleString()} />
                    <StatChip Icon={icons.Component}  label="Hubs"      value={stats.hubCount} />
                    <StatChip Icon={icons.Users}      label="Ridership" value={Math.round(stats.totalRidership).toLocaleString()} daily={true} />
                    <StatChip Icon={icons.TrendingUp} label="Revenue"   value={formatCurrencyCompact(stats.totalRevenue)} daily={true} />
                </div>
            </div>

            {/* ── Metric cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-12 gap-3">

                {/* Load Factor */}
                <div className="col-span-4 rounded border border-border bg-muted/20 px-4 py-3 space-y-1">
                    <div className="flex gap-3">
                        <icons.Gauge size={38} strokeWidth={1} className="shrink-0" />
                        <div className="flex flex-col gap-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider">
                                System Load Factor
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 pb-3">
                                Ridership-weighted avg. peak segment load
                            </p>
                        </div>
                    </div>
                    <LoadFactorBar pct={stats.loadFactor} />
                </div>

                {/* Network Health Score */}
                <div
                    className="rounded border border-border bg-muted/20 px-4 py-3"
                    style={{ gridColumn: 'span 5 / span 4'}}
                >
                    <div className="flex gap-3">
                        <icons.HeartPulse size={38} strokeWidth={1} className="shrink-0" />
                        <div className="flex flex-col gap-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider">
                                Network Health Score
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 pb-3">
                                Ridership-weighted load factor quality (0–100)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="w-28 shrink-0">
                            <GaugeArc score={stats.healthScore} />
                        </div>
                        <div>
                            <p className="font-bold leading-none pt-2"
                               style={{ color: healthColor(stats.healthScore) }}>
                                {healthLabel(stats.healthScore)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                Routes with load factor 40–80% score highest.<br/>
                                Under-served or overcrowded routes lower the score.
                            </p>
                        </div>
                    </div>
                </div>
                {/* Timetable Adherence — click to open heatmap */}
                <div
                    className="col-span-3 rounded border border-border bg-muted/20 px-4 py-3 cursor-pointer hover:bg-accent/50 hover:border-muted-foreground/50"
                    onClick={() => window.AdvancedAnalytics?.openTimetableDialog?.()}
                    title="Open Timetable Adherence view"
                >
                    <div className="flex gap-3">
                        <icons.CalendarClock size={36} strokeWidth={1} className="shrink-0" />
                        <div className="flex flex-col gap-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider">
                                Timetable Adherence
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                % of stops within ±{CONFIG.ADHERENCE_THRESHOLDS.ON_TIME_SEC}s of schedule
                            </p>
                        </div>
                    </div>

                    <div className="mt-8">
                        {adherenceScore !== null ? (
                            <div className="flex items-baseline gap-1.5">
                                <span
                                    className="text-5xl font-bold tabular-nums leading-none"
                                    style={{ color: adherenceColor(adherenceScore) }}
                                >
                                    {adherenceScore}
                                </span>
                                <span
                                    className="text-base font-semibold"
                                    style={{ color: adherenceColor(adherenceScore) }}
                                >
                                    %
                                </span>
                                <span className="text-xs text-muted-foreground ml-1">
                                    {adherenceLabel(adherenceScore)}
                                </span>
                                <p className="ml-auto text-[9px] text-muted-foreground">
                                    Full heatmap →
                                </p>
                            </div>
                        ) : (
                            <span className="text-sm text-muted-foreground">Waiting for data…</span>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
