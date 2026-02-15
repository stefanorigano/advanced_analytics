// Lite analytics panel component for toolbar
// Shows only performance metrics, no state persistence

import { CONFIG, INITIAL_STATE } from '../config.js';
import { SortableTable } from './table.jsx';
import { calculateTransfers } from '../metrics/transfers.js';
import { calculateRouteMetrics, validateRouteData, getEmptyMetrics } from '../metrics/route-metrics.js';
import { sortTableData } from '../utils/sorting.js';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function AnalyticsPanel() {
    // Local state only - no persistence, resets on each render
    const [tableData, setTableData] = React.useState([]);
    const [sortState, setSortState] = React.useState(INITIAL_STATE.sort);
    
    // Data fetching (live data only)
    React.useEffect(() => {
        if (CONFIG.debug) {
            console.log(`${CONFIG.LOG_PREFIX} Debug mode enabled - lite panel updates paused`);
            return;
        }
        
        const updateData = () => {
            const routes = api.gameState.getRoutes();
            const trainTypes = api.trains.getTrainTypes();
            const lineMetrics = api.gameState.getLineMetrics();
            const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;
            
            const transfersMap = calculateTransfers(routes, api);
            const processedData = [];
            
            routes.forEach(route => {
                const metrics = lineMetrics.find(m => m.routeId === route.id);
                const ridership = metrics ? metrics.ridersPerHour * timeWindowHours : 0;
                const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
                const dailyRevenue = revenuePerHour * 24;
                
                if (!validateRouteData(route)) {
                    processedData.push({
                        id: route.id,
                        name: route.name || route.bullet,
                        ridership,
                        dailyRevenue,
                        deleted: false,
                        transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                        ...getEmptyMetrics()
                    });
                    return;
                }
                
                const trainType = trainTypes[route.trainType];
                if (!trainType) {
                    processedData.push({
                        id: route.id,
                        name: route.name || route.bullet,
                        ridership,
                        dailyRevenue,
                        deleted: false,
                        transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                        ...getEmptyMetrics()
                    });
                    return;
                }
                
                const calculatedMetrics = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
                
                processedData.push({
                    id: route.id,
                    name: route.name || route.bullet,
                    ridership,
                    dailyRevenue,
                    deleted: false,
                    transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                    ...calculatedMetrics
                });
            });
            
            const sortedData = sortTableData(processedData, sortState);
            setTableData(sortedData);
        };
        
        updateData();
        const interval = setInterval(updateData, CONFIG.REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [sortState]);

    // Setup wrapper classes on mount
    React.useEffect(() => {
        const ourContent = document.getElementById('aa-panel');
        if (!ourContent) return;
        
        const wrapper = ourContent.parentElement;
        if (wrapper && !wrapper.id) {
            wrapper.id = 'sb-aa-panel-wrapper';
            wrapper.classList.remove('p-2');
            wrapper.classList.add('max-h-[80vh]');
            wrapper.classList.add('overflow-auto');
        }

        const mainPanel = ourContent.closest('.fixed.z-50 ');
        if (mainPanel) {
            mainPanel.id = 'sb-aa-panel-wrapper-main';
            const maxWidth = mainPanel.style.width;
            if (maxWidth) {
                mainPanel.style.width = '';
                mainPanel.style.maxWidth = maxWidth;
            }
        }
    }, []);
    
    // Handle sort changes (no persistence)
    const handleSortChange = (newState) => {
        setSortState(newState);
    };
    
    return (
        <div id="aa-panel" className="flex flex-col h-full">
            {/* Status indicator */}
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-border bg-muted/30">
                <button
                    onClick={() => window.AdvancedAnalytics?.openDialog?.()}
                    className="[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 bg-background border border-input disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none font-medium gap-2 h-7 hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center p-0 px-4 rounded-md text-xs transition-colors whitespace-nowrap"
                >
                    Open Dialog
                </button>
            </div>
            
            {/* Table */}
            <div className="flex-1 overflow-auto">
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