// Analytics Panel — unified single-panel entry point
//
// Every view is a descriptor: { title: ReactNode, renderContent: (lrd, hd) => ReactNode }
// AnalyticsPanel holds no view-specific logic; each view factory owns its breadcrumb and content.
//
// NAVIGATION (all via window.AdvancedAnalytics global API)
//   openDialog()             — open panel, go to dashboard view
//   closeDialog()            — close panel
//   toggleDialog()           — toggle; opens to dashboard when currently closed
//   openRouteDialog(id)      — open panel, go to route view for `id`
//   closeRouteDialog()       — navigate back to dashboard (panel stays open)
//   openTimetableDialog()    — open panel, go to timetable view
//   openView(title, Content) — open panel with arbitrary title + ContentComponent (used by AB)
//   closeView()              — navigate back to dashboard (panel stays open)
//
// DATA OWNERSHIP
//   liveRouteData    — always polling; passed to renderContent so dashboard always gets fresh data
//   historicalData   — polled while open; passed to renderContent alongside liveRouteData

import { StaticPanel }     from '../components/static-panel.jsx';
import { Dropdown }        from '../components/dropdown.jsx';
import { DropdownItem }    from '../components/dropdown-item.jsx';
import { RouteBadge }      from '../components/route-badge.jsx';
import { DashboardContent } from './dashboard.jsx';
import { RouteContent }    from './route/route-dialog.jsx';
import { TimetableView }   from './timetable/timetable-view.jsx';
import { useRouteMetrics } from '../hooks/useRouteMetrics.js';
import { getStorage }      from '../core/lifecycle.js';
import { INITIAL_STATE }   from '../config.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ── Breadcrumb components ─────────────────────────────────────────────────────
// Each navigates via window.AdvancedAnalytics — no callbacks from parent.

function DashboardBreadcrumb() {
    return (
        <span className="flex items-center gap-1.5">
            <icons.Eclipse size={14} className="shrink-0" />
            <span className="text-muted-foreground text-xs">Advanced Analytics</span>
            <span className="border-foreground/20 border-r py-20 mx-4" />
            <span className="text-xs text-muted-foreground">Dashboard</span>
        </span>
    );
}

function RouteBreadcrumb({ routeId }) {
    const routes = api.gameState.getRoutes();
    return (
        <span className="flex items-center gap-1.5">
            <icons.Eclipse size={14} className="shrink-0" />
            <span className="text-muted-foreground text-xs">Advanced Analytics</span>
            <span className="border-foreground/20 border-r py-20 mx-4" />
            <button
                className="text-xs text-foreground/70 hover:text-foreground hover:underline underline-offset-2 transition-colors"
                onClick={() => window.AdvancedAnalytics.openDialog()}
            >
                Dashboard
            </button>
            {React.createElement(icons.ChevronRight, { size: 20, className: 'text-muted-foreground shrink-0' })}
            <span className="text-xs">Route</span>
            <Dropdown
                togglerClasses="flex items-center gap-1 rounded hover:bg-accent px-1.5 py-0.5 transition-colors"
                togglerContent={
                    routeId
                        ? <RouteBadge routeId={routeId} size="1rem" interactive={false} />
                        : <span className="text-muted-foreground text-xs">Select</span>
                }
                value={routeId}
                onChange={(id) => window.AdvancedAnalytics.openRouteDialog(id)}
            >
                {routes.map(r => (
                    <DropdownItem key={r.id} value={r.id} route={r} />
                ))}
            </Dropdown>
        </span>
    );
}

function TimetableBreadcrumb() {
    return (
        <span className="flex items-center gap-1.5">
            <icons.Eclipse size={14} className="shrink-0" />
            <span className="text-muted-foreground text-xs">Advanced Analytics</span>
            <span className="border-foreground/20 border-r py-20 mx-4" />
            <button
                className="text-xs text-foreground/70 hover:text-foreground hover:underline underline-offset-2 transition-colors"
                onClick={() => window.AdvancedAnalytics.openDialog()}
            >
                Dashboard
            </button>
            {React.createElement(icons.ChevronRight, { size: 20, className: 'text-muted-foreground shrink-0' })}
            <span className="text-xs">Timetable Adherence</span>
        </span>
    );
}

// ── View factories ────────────────────────────────────────────────────────────
// Pure module-level functions — no closures over component state.
// renderContent receives (liveRouteData, historicalData) on every render so
// DashboardContent always gets fresh data without stale closures.

function createDashboardView() {
    return {
        title: React.createElement(DashboardBreadcrumb),
        renderContent: (lrd, hd) => React.createElement(DashboardContent, { liveRouteData: lrd, historicalData: hd }),
    };
}

function createRouteView(routeId) {
    return {
        title: React.createElement(RouteBreadcrumb, { routeId }),
        renderContent: () => React.createElement(RouteContent, { routeId }),
    };
}

function createTimetableView() {
    return {
        title: React.createElement(TimetableBreadcrumb),
        renderContent: () => React.createElement(TimetableView),
    };
}

// ── Root component ────────────────────────────────────────────────────────────

export function AnalyticsPanel() {
    const [isOpen,         setIsOpen]         = React.useState(false);
    const [viewDef,        setViewDef]        = React.useState(() => createDashboardView());
    const [historicalData, setHistoricalData] = React.useState({ days: {} });

    const storage = getStorage();

    const emptyHistoricalData = React.useMemo(() => ({ days: {} }), []);
    const { tableData: liveRouteData } = useRouteMetrics({
        sortState:      INITIAL_STATE.sort,
        timeframeState: 'last24h',
        compareMode:    false,
        historicalData: emptyHistoricalData,
    });

    // Historical data — poll while panel is open
    React.useEffect(() => {
        if (!isOpen || !storage) return;
        const load = async () => {
            const data = await storage.get('historicalData', { days: {} });
            setHistoricalData(data);
        };
        load();
        const id = setInterval(load, 2000);
        return () => clearInterval(id);
    }, [isOpen, storage]);

    // Global API
    React.useEffect(() => {
        window.AdvancedAnalytics = window.AdvancedAnalytics || {};

        window.AdvancedAnalytics.openDialog = () => {
            setViewDef(createDashboardView());
            setIsOpen(true);
        };
        window.AdvancedAnalytics.closeDialog = () => setIsOpen(false);
        window.AdvancedAnalytics.toggleDialog = () => {
            setIsOpen(prev => {
                if (!prev) setViewDef(createDashboardView());
                return !prev;
            });
        };
        window.AdvancedAnalytics.openRouteDialog = (id) => {
            setViewDef(createRouteView(id));
            setIsOpen(true);
        };
        window.AdvancedAnalytics.closeRouteDialog = () => setViewDef(createDashboardView());
        window.AdvancedAnalytics.openTimetableDialog = () => {
            setViewDef(createTimetableView());
            setIsOpen(true);
        };
        window.AdvancedAnalytics.openView = (title, Content) => {
            setViewDef({ title, renderContent: () => React.createElement(Content) });
            setIsOpen(true);
        };
        window.AdvancedAnalytics.closeView = () => setViewDef(createDashboardView());

        return () => {
            delete window.AdvancedAnalytics.openDialog;
            delete window.AdvancedAnalytics.closeDialog;
            delete window.AdvancedAnalytics.toggleDialog;
            delete window.AdvancedAnalytics.openRouteDialog;
            delete window.AdvancedAnalytics.closeRouteDialog;
            delete window.AdvancedAnalytics.openTimetableDialog;
            delete window.AdvancedAnalytics.openView;
            delete window.AdvancedAnalytics.closeView;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <StaticPanel
            id="aa-analytics"
            title={viewDef.title}
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            size={1280}
            staticPanelPaddingClasses="pb-4"
        >
            {isOpen && viewDef.renderContent(liveRouteData, historicalData)}
        </StaticPanel>
    );
}
