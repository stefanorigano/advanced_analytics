// Lite analytics panel component for toolbar
// Shows only performance metrics, no state persistence

import { CONFIG, INITIAL_STATE } from '../config.js';
import { AnalyticsGuide } from './analytics-guide.jsx';
import { SortableTable } from './table.jsx';
import { useRouteMetrics } from '../hooks/useRouteMetrics.js';

import { Tooltip } from './tooltip.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;


export function AnalyticsPanel() {
    // Local state only - no persistence, resets on each render
    const [sortState, setSortState] = React.useState(INITIAL_STATE.sort);
    
    // Memoize empty historical data to prevent re-renders
    const emptyHistoricalData = React.useMemo(() => ({ days: {} }), []);
    
    // Track if component is mounted
    const isMountedRef = React.useRef(true);
    
    // USE CUSTOM HOOK - Same data fetching logic as analytics-table!
    // Only live data mode for the lite panel (no historical/comparison)
    const { tableData } = useRouteMetrics({
        sortState,
        timeframeState: 'last24h',  // Always live data
        compareMode: false,          // No comparison mode
        historicalData: emptyHistoricalData // Memoized empty object
    });

    // Setup wrapper classes on mount - FIXED VERSION
    React.useEffect(() => {
        if (!isMountedRef.current) return;
        
        // Use RAF to defer DOM manipulation
        const rafId = requestAnimationFrame(() => {
            const ourContent = document.getElementById('aa-panel');
            if (!ourContent) return;
            
            const wrapper = ourContent.parentElement;
            if (wrapper && !wrapper.id) {
                wrapper.id = 'sb-aa-panel-wrapper';
                wrapper.classList.remove('p-2');
                wrapper.classList.add('max-h-[80vh]');
                wrapper.classList.add('overflow-auto');
            }

            const mainPanel = ourContent.closest('.fixed.z-50');
            if (mainPanel && !mainPanel.id) {
                mainPanel.id = 'sb-aa-panel-wrapper-main';
                const maxWidth = mainPanel.style.width;
                if (maxWidth) {
                    mainPanel.style.width = '';
                    mainPanel.style.maxWidth = maxWidth;
                }
            }
        });
        
        return () => {
            cancelAnimationFrame(rafId);
            isMountedRef.current = false;
        };
    }, []); // Runs only once on mount
    
    // Handle sort changes (no persistence)
    const handleSortChange = React.useCallback((newState) => {
        if (isMountedRef.current) {
            setSortState(newState);
        }
    }, []);
    
    return (
        <div id="aa-panel" className="flex flex-col h-full">
            {/* Status indicator */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
                <AnalyticsGuide/>
                <Tooltip content="Open the full analytics dialog with all metrics" side="left" delayDuration={300}>
                    <button
                        onClick={() => window.AdvancedAnalytics?.openDialog?.()}
                        className="[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 bg-background border border-input disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none font-medium gap-2 h-7 hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center p-0 px-4 rounded-md text-xs transition-colors whitespace-nowrap"
                    >
                        Open Dialog
                    </button>
                </Tooltip>
            </div>
            
            {/* Table */}
            <div className="scrollbar-thin flex-1 overflow-auto">
                <SortableTable
                    data={tableData}
                    sortState={sortState}
                    onSortChange={handleSortChange}
                    groups={['performance']}
                    compareShowPercentages={true}
                />
            </div>
        </div>
    );
}