// Advanced Analytics Mod for Subway Builder v4.5.0
// Phase 4: Route Status Tracking System - properly detect NEW/DELETED routes using lifecycle hooks
// Status lifecycle: 'new' (created) → 'ongoing' (after day change) → 'deleted' (if deleted)
// v4.1.0: Code cleanup - removed debug logs, added utility functions and section comments
// v4.2.0: Method extraction - buildComparisonRow (~160 lines), renderDayDropdown, JSDoc comments
// v4.2.1: Fix - added $ currency formatting to finance columns in absolute comparison mode
// v4.3.0: Cell consolidation - formatCurrency utility, removed Cost/Revenue wrappers, added JSDoc
// v4.4.1: Bug fixes - restored arrow characters, fixed transfers using getStations() API, hide NEW routes in compare mode
// v4.4.2: Bug fixes - Steno fixed the arrows
// v4.4.3-debug: Debug version with comprehensive console logging for NEW route filtering
// v4.4.4-debug: Fix - filter routes with zero ridership in EITHER comparison day (incomplete data)
// v4.5.0: Fix - properly filter routes that were 'new' in either comparison day

const AdvancedAnalytics = {
    // API References (cached on init)
    api: null,
    React: null,
    h: null,
    
    // States (initial values only - React will manage actual state)
    initialSortState: {
        column: 'ridership',
        order: 'desc'
    },
    initialGroupState: {
        trains: true,
        finance: true,
        performance: true
    },
    initialTimeframeState: 'last24h',
    
    // State cache (survives component remounts during drag/resize)
    StateCache: {
        sortState: null,
        groupState: null,
        timeframeState: null,
        historicalData: null,  // { days: { '42': { routes: [...] }, '43': {...} } }
        historicalDataVersion: 0,  // Increment this to trigger component refresh
        isInitialized: false,
        currentSaveName: null,  // Track which save we're in
        tempSaveId: null,  // Temporary ID before first save
        compareMode: false,  // Comparison mode enabled
        comparePrimaryDay: null,  // Primary day (newer)
        compareSecondaryDay: null  // Compare day (older)
    },
    
    // Debug mode: Set to true to pause data updates (useful for inspecting data in console)
    debug: false,

    // Configuration
    CONFIG: {
        UTILIZATION_THRESHOLDS: {
            CRITICAL_LOW: 30,
            CRITICAL_HIGH: 95,
            WARNING_LOW: 45,
            WARNING_HIGH: 85
        },
        REFRESH_INTERVAL: 1000,
        LOG_PREFIX: '[AA]',
        COST_MULTIPLIER: 365,
        DEMAND_HOURS: {
            low: 9,      // midnight-5am (5h) + 8pm-midnight (4h)
            medium: 9,   // 5am-6am (1h) + 9am-4pm (7h) + 7pm-8pm (1h)
            high: 6      // 6am-9am (3h) + 4pm-7pm (3h)
        },
        COLORS: {
            // Train Schedule Colors (Labels only)
            TRAINS: {
                HIGH: 'text-red-600 dark:text-red-400',
                MEDIUM: 'text-orange-500 dark:text-orange-400',
                LOW: 'text-green-600 dark:text-green-400'
            },
            // Utilization status colors
            UTILIZATION: {
                CRITICAL: 'text-red-600 dark:text-red-400',
                WARNING: 'text-yellow-600 dark:text-yellow-400',
                GOOD: 'text-green-600 dark:text-green-400'
            },
            // Percentage change colors
            PERCENTAGE: {
                POSITIVE: 'text-green-600 dark:text-green-400',
                NEGATIVE: 'text-red-600 dark:text-red-400'
            },
            // Value colors
            VALUE: {
                NEGATIVE: 'text-red-600 dark:text-red-400',
                DEFAULT: ''
            },
            // Comparison mode colors
            COMPARE: {
                POSITIVE: 'text-green-600 dark:text-green-400',  // Good improvement
                NEGATIVE: 'text-red-600 dark:text-red-400',      // Decline
                NEUTRAL: 'text-muted-foreground',                // No change (0%)
                NEW: 'text-purple-600 dark:text-purple-400',     // New route
                DELETED: 'text-gray-400 dark:text-gray-500'      // Deleted route
            }
        },
        ARROWS: {
            UP: '↑',
            DOWN: '↓',
            NEUTRAL: '='
        },
        STYLES: {
            PERCENTAGE_FONT_SIZE: 'text-[10px]'
        },
        TABLE_HEADERS: [
            { key: 'name', label: 'Route', align: 'right'},
            { key: 'ridership', label: 'Ridership', align: 'right', group: 'performance' },
            { key: 'capacity', label: 'Capacity', align: 'right', group: 'trains' },
            { key: 'utilization', label: 'Usage', align: 'right', group: 'performance' },
            { key: 'stations', label: 'Stations', align: 'right', group: 'trains' },
            { key: 'trainSchedule', label: 'Trains', small: '(High, Medium, Low)', align: 'center', group: 'trains' },
            { key: 'transfers', label: 'Transfers', align: 'right', group: 'trains' },
            { key: 'dailyCost', label: 'Cost', align: 'right', group: 'finance' },
            { key: 'dailyRevenue', label: 'Revenue', align: 'right', group: 'finance' },
            { key: 'dailyProfit', label: 'Profit', align: 'right', group: 'finance' },
            { key: 'profitPerPassenger', label: 'Profit/Pax', align: 'right', group: 'performance' },
            { key: 'profitPerTrain', label: 'Profit/Train', align: 'right', group: 'performance' }
        ]
    },

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    // Calculate total trains for a route
    calculateTotalTrains(route) {
        if (!route) return 0;
        return (route.trainsHigh || 0) + (route.trainsMedium || 0) + (route.trainsLow || 0);
    },

    // Get all available days from historical data (sorted newest to oldest)
    getAvailableDays(historicalData) {
        return Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
    },

    // Format day label with "Yesterday" indicator
    formatDayLabel(day, mostRecentDay) {
        return day === mostRecentDay ? `Day ${day} (Yesterday)` : `Day ${day}`;
    },

    /**
     * Render a day selection dropdown for comparison mode
     * Automatically formats labels with "Yesterday" for most recent day
     * 
     * @param {Function} h - React.createElement function
     * @param {Object} options - Configuration object containing key, value, onChange, etc.
     * @returns {ReactElement} Dropdown select element
     */
    renderDayDropdown(h, options) {
        const {
            key,
            value,
            onChange,
            availableDays,
            mostRecentDay,
            placeholder,
            btnBaseClasses,
            btnClasses,
            disabled = false,
            title = ''
        } = options;

        const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

        return h('select', {
            key,
            className: `${btnBaseClasses} ${btnClasses} ${disabledClass}`,
            disabled,
            value: value || '',
            onChange,
            title
        }, [
            h('option', { key: 'placeholder', value: '', disabled: true }, placeholder),
            ...availableDays.map(day => {
                const label = this.formatDayLabel(day, mostRecentDay);
                return h('option', { key: day, value: day }, label);
            })
        ]);
    },

    /**
     * Format a number as currency with proper decimals
     * 
     * @param {number} value - The value to format
     * @param {number} decimals - Number of decimal places (default: 0)
     * @returns {string} Formatted currency string (e.g., "$1,234" or "$1.23")
     */
    formatCurrency(value, decimals = 0) {
        const absValue = Math.abs(value);
        const formatted = absValue.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
        const sign = value < 0 ? '-' : '';
        return `${sign}$${formatted}`;
    },

    // Check if route was new on a specific day
    wasRouteNewOnDay(routeId, day, routeStatuses) {
        const status = routeStatuses[routeId];
        const result = status && status.status === 'ongoing' && status.createdDay === day;
        console.log(`[wasRouteNewOnDay] Route ${routeId} on day ${day}:`, {
            status: status?.status,
            createdDay: status?.createdDay,
            checkingDay: day,
            result
        });
        return result;
    },

    // Check if route was deleted on a specific day
    wasRouteDeletedOnDay(routeId, day, routeStatuses) {
        const status = routeStatuses[routeId];
        return status && status.status === 'deleted' && status.deletedDay === day;
    },

    /**
     * Calculate transfer connections between routes using station routeIds
     * Returns a map of route IDs to transfer data including count, connected routes, and station IDs
     * 
     * @param {Array} routes - Array of route objects
     * @returns {Object} Map of routeId -> { count, routes, stationIds }
     */
    calculateTransfers(routes) {
        const api = this.api;
        const stations = api.gameState.getStations();
        
        // Build transfer map for each route
        const transferMap = {};
        
        routes.forEach(route => {
            // Map of otherRouteId -> [shared station IDs]
            const sharedStations = new Map();
            
            // Find all stations that have this route
            stations.forEach(station => {
                if (!station.routeIds || station.routeIds.length < 2) return;
                
                // Check if this station is used by the current route
                if (station.routeIds.includes(route.id)) {
                    // Find other routes that share this station
                    station.routeIds.forEach(otherRouteId => {
                        if (otherRouteId === route.id) return; // Skip self
                        
                        if (!sharedStations.has(otherRouteId)) {
                            sharedStations.set(otherRouteId, []);
                        }
                        sharedStations.get(otherRouteId).push(station.id);
                    });
                }
            });
            
            // Count total shared stations and collect route info
            let totalCount = 0;
            const connectedRouteData = [];
            const allStationIds = [];
            
            sharedStations.forEach((stationIds, otherRouteId) => {
                const otherRoute = routes.find(r => r.id === otherRouteId);
                totalCount += stationIds.length;
                connectedRouteData.push({
                    routeId: otherRouteId,
                    routeName: otherRoute ? (otherRoute.name || otherRoute.bullet) : otherRouteId,
                    sharedCount: stationIds.length
                });
                allStationIds.push(...stationIds);
            });
            
            // Sort by shared count (descending), then alphabetically
            connectedRouteData.sort((a, b) => {
                if (b.sharedCount !== a.sharedCount) {
                    return b.sharedCount - a.sharedCount;
                }
                return a.routeName.localeCompare(b.routeName);
            });
            
            transferMap[route.id] = {
                count: totalCount,
                routes: connectedRouteData.map(r => r.routeName),
                stationIds: [...new Set(allStationIds)] // Remove duplicates
            };
        });
        
        return transferMap;
    },

    /**
     * Build a comparison row for a route
     * Handles three cases: NEW routes, DELETED routes, and normal comparison with percentage changes
     * 
     * @param {Object} row - Row object containing primaryRoute and secondaryRoute
     * @param {Object} routeStatuses - Map of route IDs to their status objects
     * @param {number} comparePrimaryDay - Primary comparison day (newer)
     * @param {number} compareSecondaryDay - Secondary comparison day (older)
     * @returns {Object} Formatted comparison row with metrics
     */
    buildComparisonRow(row, routeStatuses, comparePrimaryDay, compareSecondaryDay) {
        const { primaryRoute, secondaryRoute } = row;
        
        // Determine route status for comparison
        const wasNewOnSecondaryDay = this.wasRouteNewOnDay(row.id, compareSecondaryDay, routeStatuses);
        const isDeletedOnPrimaryDay = this.wasRouteDeletedOnDay(row.id, comparePrimaryDay, routeStatuses);
        
        const routeStatus = routeStatuses[row.id];
        console.log(`[buildComparisonRow] Route ${row.id} (${row.name}):`, {
            routeStatus,
            wasNewOnSecondaryDay,
            isDeletedOnPrimaryDay,
            hasPrimaryRoute: !!primaryRoute,
            hasSecondaryRoute: !!secondaryRoute,
            comparePrimaryDay,
            compareSecondaryDay
        });
        
        // NEW route (was created on secondary day OR exists in primary but not secondary)
        if (wasNewOnSecondaryDay || (primaryRoute && !secondaryRoute)) {
            console.log(`  → Marking as NEW route`);
            return {
                id: row.id,
                name: row.name,
                ridership: 'NEW',
                capacity: 'NEW',
                utilization: 'NEW',
                stations: 'NEW',
                trainSchedule: 'NEW',
                transfers: 'NEW',
                dailyCost: 'NEW',
                dailyRevenue: 'NEW',
                dailyProfit: 'NEW',
                profitPerPassenger: 'NEW',
                profitPerTrain: 'NEW',
                primaryValues: {
                    ridership: primaryRoute.ridership,
                    capacity: primaryRoute.capacity,
                    utilization: primaryRoute.utilization,
                    stations: primaryRoute.stations,
                    trainSchedule: this.calculateTotalTrains(primaryRoute),
                    transfers: primaryRoute.transfers,
                    dailyCost: primaryRoute.dailyCost,
                    dailyRevenue: primaryRoute.dailyRevenue,
                    dailyProfit: primaryRoute.dailyProfit,
                    profitPerPassenger: primaryRoute.profitPerPassenger,
                    profitPerTrain: primaryRoute.profitPerTrain
                },
                secondaryValues: {
                    ridership: secondaryRoute?.ridership || 0,
                    capacity: secondaryRoute?.capacity || 0,
                    utilization: secondaryRoute?.utilization || 0,
                    stations: secondaryRoute?.stations || 0,
                    trainSchedule: this.calculateTotalTrains(secondaryRoute),
                    transfers: secondaryRoute?.transfers || { count: 0, routes: [], stationIds: [] },
                    dailyCost: secondaryRoute?.dailyCost || 0,
                    dailyRevenue: secondaryRoute?.dailyRevenue || 0,
                    dailyProfit: secondaryRoute?.dailyProfit || 0,
                    profitPerPassenger: secondaryRoute?.profitPerPassenger || 0,
                    profitPerTrain: secondaryRoute?.profitPerTrain || 0
                },
                deleted: false,
                isNew: true,
                isComparison: true
            };
        }
        
        // DELETED route (was deleted on primary day OR missing from primary)
        if (isDeletedOnPrimaryDay || (!primaryRoute && secondaryRoute)) {
            return {
                id: row.id,
                name: row.name,
                ridership: 'DELETED',
                capacity: 'DELETED',
                utilization: 'DELETED',
                stations: 'DELETED',
                trainSchedule: 'DELETED',
                transfers: 'DELETED',
                dailyCost: 'DELETED',
                dailyRevenue: 'DELETED',
                dailyProfit: 'DELETED',
                profitPerPassenger: 'DELETED',
                profitPerTrain: 'DELETED',
                primaryValues: {
                    ridership: 0,
                    capacity: 0,
                    utilization: 0,
                    stations: 0,
                    trainSchedule: 0,
                    transfers: { count: 0, routes: [], stationIds: [] },
                    dailyCost: 0,
                    dailyRevenue: 0,
                    dailyProfit: 0,
                    profitPerPassenger: 0,
                    profitPerTrain: 0
                },
                secondaryValues: {
                    ridership: secondaryRoute.ridership,
                    capacity: secondaryRoute.capacity,
                    utilization: secondaryRoute.utilization,
                    stations: secondaryRoute.stations,
                    trainSchedule: this.calculateTotalTrains(secondaryRoute),
                    transfers: secondaryRoute.transfers,
                    dailyCost: secondaryRoute.dailyCost,
                    dailyRevenue: secondaryRoute.dailyRevenue,
                    dailyProfit: secondaryRoute.dailyProfit,
                    profitPerPassenger: secondaryRoute.profitPerPassenger,
                    profitPerTrain: secondaryRoute.profitPerTrain
                },
                deleted: true,
                isDeleted: true,
                isComparison: true
            };
        }
        
        // Normal comparison - calculate percentages for all metrics
        const metrics = {
            ridership: this.calculatePercentageChange(primaryRoute.ridership, secondaryRoute.ridership, 'ridership'),
            capacity: this.calculatePercentageChange(primaryRoute.capacity, secondaryRoute.capacity, 'capacity'),
            utilization: this.calculatePercentageChange(primaryRoute.utilization, secondaryRoute.utilization, 'utilization'),
            stations: this.calculatePercentageChange(primaryRoute.stations, secondaryRoute.stations, 'stations'),
            trainSchedule: this.calculatePercentageChange(
                this.calculateTotalTrains(primaryRoute),
                this.calculateTotalTrains(secondaryRoute),
                'trainSchedule'
            ),
            transfers: this.calculatePercentageChange(primaryRoute.transfers?.count || 0, secondaryRoute.transfers?.count || 0, 'transfers'),
            dailyCost: this.calculatePercentageChange(primaryRoute.dailyCost, secondaryRoute.dailyCost, 'dailyCost'),
            dailyRevenue: this.calculatePercentageChange(primaryRoute.dailyRevenue, secondaryRoute.dailyRevenue, 'dailyRevenue'),
            dailyProfit: this.calculatePercentageChange(primaryRoute.dailyProfit, secondaryRoute.dailyProfit, 'dailyProfit'),
            profitPerPassenger: this.calculatePercentageChange(primaryRoute.profitPerPassenger, secondaryRoute.profitPerPassenger, 'profitPerPassenger'),
            profitPerTrain: this.calculatePercentageChange(primaryRoute.profitPerTrain, secondaryRoute.profitPerTrain, 'profitPerTrain')
        };
        
        return {
            id: row.id,
            name: row.name,
            ...metrics,
            primaryValues: {
                ridership: primaryRoute.ridership,
                capacity: primaryRoute.capacity,
                utilization: primaryRoute.utilization,
                stations: primaryRoute.stations,
                trainSchedule: this.calculateTotalTrains(primaryRoute),
                transfers: primaryRoute.transfers,
                dailyCost: primaryRoute.dailyCost,
                dailyRevenue: primaryRoute.dailyRevenue,
                dailyProfit: primaryRoute.dailyProfit,
                profitPerPassenger: primaryRoute.profitPerPassenger,
                profitPerTrain: primaryRoute.profitPerTrain
            },
            secondaryValues: {
                ridership: secondaryRoute.ridership,
                capacity: secondaryRoute.capacity,
                utilization: secondaryRoute.utilization,
                stations: secondaryRoute.stations,
                trainSchedule: this.calculateTotalTrains(secondaryRoute),
                transfers: secondaryRoute.transfers,
                dailyCost: secondaryRoute.dailyCost,
                dailyRevenue: secondaryRoute.dailyRevenue,
                dailyProfit: secondaryRoute.dailyProfit,
                profitPerPassenger: secondaryRoute.profitPerPassenger,
                profitPerTrain: secondaryRoute.profitPerTrain
            },
            deleted: false,
            isComparison: true
        };
    },

    // ============================================================================
    // INITIALIZATION & LIFECYCLE HOOKS
    // ============================================================================

    init() {
        if (!window.SubwayBuilderAPI) {
            console.error(`${this.CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }

        // Cache API references for reuse throughout the module
        this.api = window.SubwayBuilderAPI;
        this.React = this.api.utils.React;
        this.h = this.React.createElement;

        this.api.hooks.onGameInit(() => {
            this.injectStyles();
            
            if (typeof this.api.ui.addFloatingPanel === 'function') {
                this.api.ui.addFloatingPanel({
                    id: 'advanced-analytics',
                    title: 'Advanced Route Analytics',
                    icon: 'ChartPie',
                    width: 950,
                    height: 600,
                    render: () => this.renderAnalyticsPanel()
                });
                console.log(`${this.CONFIG.LOG_PREFIX} Floating panel registered`);
            } else {
                console.error(`${this.CONFIG.LOG_PREFIX} addFloatingPanel not available`);
                this.api.ui.showNotification('Advanced Analytics requires newer game version', 'error');
            }
        });

        // Register day change hook to capture historical data (works even when panel closed)
        this.api.hooks.onDayChange(async (dayThatEnded) => {
            this.captureHistoricalData(dayThatEnded);
            
            // Transition all 'new' routes to 'ongoing' at day change
            await this.transitionNewRoutesToOngoing();
        });

        // Track which save is loaded and restore from backup
        this.api.hooks.onGameLoaded(async (saveName) => {
            // Update current save name for storage scoping
            this.StateCache.currentSaveName = saveName;
            
            // Restore from backup (clears working data, loads backup)
            await this.restoreFromBackup();
            
            // Reset initialization flag so component reloads data for this save
            this.StateCache.isInitialized = false;
        });

        // Update save name when game is saved and backup data
        this.api.hooks.onGameSaved(async (saveName) => {
            const oldSaveName = this.StateCache.currentSaveName;
            
            // If save name changed, migrate the data
            if (oldSaveName && oldSaveName !== saveName) {
                const storage = this.getStorage();
                
                if (storage.saves[oldSaveName]) {
                    // Move data from old save to new save name
                    storage.saves[saveName] = storage.saves[oldSaveName];
                    
                    // Only delete old save if it was a temp ID (contains timestamp)
                    // Keep old save if it's a real save name (user might want both)
                    if (oldSaveName.match(/\d{13}/)) {
                        delete storage.saves[oldSaveName];
                        console.log(`${this.CONFIG.LOG_PREFIX} Migrated data from temp save "${oldSaveName}" to: "${saveName}"`);
                    } else {
                        console.log(`${this.CONFIG.LOG_PREFIX} Copied data from "${oldSaveName}" to: "${saveName}" (keeping both)`);
                    }
                    
                    this.setStorage(storage);
                }
            }
            
            this.StateCache.currentSaveName = saveName;
            
            // Backup working data to backup
            await this.backupToStorage();
        });

        // Route Status Tracking Hooks
        this.api.hooks.onRouteCreated((route) => {
            const currentDay = this.api.gameState.getCurrentDay();
            this.setRouteStatus(route.id, 'new', currentDay);
        });

        this.api.hooks.onRouteDeleted((routeId, routeBullet) => {
            const currentDay = this.api.gameState.getCurrentDay();
            this.setRouteStatus(routeId, 'deleted', currentDay);
        });
    },

    async captureHistoricalData(day) {
        try {
            // If no save name is set yet (new game not saved), use a temp identifier
            if (!this.StateCache.currentSaveName) {
                const routes = this.api.gameState.getRoutes();
                const cityCode = routes[0]?.cityCode || 'UNKNOWN';
                if (!this.StateCache.tempSaveId) {
                    this.StateCache.tempSaveId = `${cityCode}-${Date.now()}`;
                }
                this.StateCache.currentSaveName = this.StateCache.tempSaveId;
            }
            
            // Get current snapshot of data
            const routes = this.api.gameState.getRoutes();
            const trainTypes = this.api.trains.getTrainTypes();
            const lineMetrics = this.api.gameState.getLineMetrics();
            const timeWindowHours = this.api.gameState.getRidershipStats().timeWindowHours;

            // Calculate transfers for all routes
            const transfersMap = this.calculateTransfers(routes);

            const processedData = [];

            routes.forEach(route => {
                const metrics = lineMetrics.find(m => m.routeId === route.id);
                const ridership = metrics ? metrics.ridersPerHour * timeWindowHours : 0;
                const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
                const dailyRevenue = revenuePerHour * 24;

                if (!this.validateRouteData(route)) {
                    processedData.push({
                        id: route.id,
                        name: route.name || route.bullet,
                        ridership,
                        dailyRevenue,
                        transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                        ...this.getEmptyMetrics()
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
                        transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                        ...this.getEmptyMetrics()
                    });
                    return;
                }

                const calculatedMetrics = this.calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
                
                processedData.push({
                    id: route.id,
                    name: route.name || route.bullet,
                    ridership,
                    dailyRevenue,
                    transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                    ...calculatedMetrics
                });
            });

            // Load existing historical data
            const historicalData = await this.safeStorageGet('historicalData', { days: {} });
            
            // Store snapshot for this day
            historicalData.days[day] = {
                timestamp: Date.now(),
                routes: processedData
            };

            // Update cache
            this.StateCache.historicalData = historicalData;
            this.StateCache.historicalDataVersion++;

            // Save to storage
            await this.safeStorageSet('historicalData', historicalData);
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Failed to capture historical data:`, error);
        }
    },

    async loadHistoricalData() {
        try {
            const historicalData = await this.safeStorageGet('historicalData', { days: {} });
            this.StateCache.historicalData = historicalData;
            return historicalData;
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Failed to load historical data:`, error);
            return { days: {} };
        }
    },

    // Get comparison data for two days
    getComparisonData(primaryDay, secondaryDay, historicalData) {
        const primaryData = historicalData.days[primaryDay];
        const secondaryData = historicalData.days[secondaryDay];
        
        if (!primaryData || !secondaryData) {
            return null;
        }

        // Build map of secondary routes by ID for quick lookup
        const secondaryRoutes = new Map();
        secondaryData.routes.forEach(route => {
            secondaryRoutes.set(route.id, route);
        });

        // Build map of primary routes by ID
        const primaryRoutes = new Map();
        primaryData.routes.forEach(route => {
            primaryRoutes.set(route.id, route);
        });

        // Combine all routes
        const allRouteIds = new Set([...primaryRoutes.keys(), ...secondaryRoutes.keys()]);
        
        const comparisonRows = [];
        
        allRouteIds.forEach(routeId => {
            const primaryRoute = primaryRoutes.get(routeId);
            const secondaryRoute = secondaryRoutes.get(routeId);
            
            // Filter out routes that don't exist in either day
            if (!primaryRoute && !secondaryRoute) {
                return;
            }
            
            comparisonRows.push({
                id: routeId,
                name: (primaryRoute || secondaryRoute).name,
                primaryRoute,
                secondaryRoute
            });
        });
        
        return comparisonRows;
    },

    /**
     * Calculate percentage change between two values with proper handling of edge cases
     * Determines if change is an improvement based on metric type
     * 
     * @param {number} primaryValue - Current/newer value
     * @param {number} secondaryValue - Previous/older value  
     * @param {string} metricKey - Metric identifier (e.g., 'ridership', 'dailyCost')
     * @returns {Object} {type: string, value: number, isImprovement: boolean}
     */
    calculatePercentageChange(primaryValue, secondaryValue, metricKey) {
        // Handle special cases
        if (primaryValue === null || primaryValue === undefined || 
            secondaryValue === null || secondaryValue === undefined) {
            return { type: 'missing', value: 0 };
        }

        // Route exists in primary but not secondary = NEW
        if (secondaryValue === 0 && primaryValue > 0) {
            return { type: 'new', value: 0 };
        }

        // Route exists in secondary but not primary = DELETED
        if (primaryValue === 0 && secondaryValue > 0) {
            return { type: 'deleted', value: 0 };
        }

        // Both zero
        if (primaryValue === 0 && secondaryValue === 0) {
            return { type: 'zero', value: 0 };
        }

        // Calculate percentage
        const percentage = ((primaryValue - secondaryValue) / secondaryValue) * 100;
        
        // Determine if positive change is good or bad
        const isGoodWhenHigh = this.isMetricGoodWhenHigh(metricKey);
        
        return {
            type: 'normal',
            value: percentage,
            isImprovement: isGoodWhenHigh ? percentage > 0 : percentage < 0
        };
    },

    // Determine if a metric is good when high (vs good when low like costs)
    isMetricGoodWhenHigh(metricKey) {
        const goodWhenLow = ['dailyCost'];  // Removed costPerPassenger, profit metrics are positive
        return !goodWhenLow.includes(metricKey);
    },

    // Storage key
    STORAGE_KEY: 'AdvancedAnalytics',

    // Get the entire storage object
    getStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : { ui: {}, saves: {} };
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Failed to parse storage:`, error);
            return { ui: {}, saves: {} };
        }
    },

    // Save the entire storage object
    setStorage(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Failed to save storage:`, error);
        }
    },

    // Get UI state (shared across saves)
    async safeStorageGetUI(key, defaultValue) {
        try {
            const storage = this.getStorage();
            return storage.ui[key] !== undefined ? storage.ui[key] : defaultValue;
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} localStorage UI get failed for '${key}':`, error);
            return defaultValue;
        }
    },

    async safeStorageSetUI(key, value) {
        try {
            const storage = this.getStorage();
            storage.ui[key] = value;
            this.setStorage(storage);
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} localStorage UI set failed for '${key}':`, error);
        }
    },

    // Get save-specific data (working copy)
    async safeStorageGet(key, defaultValue) {
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            const storage = this.getStorage();
            
            if (!storage.saves[savePrefix]) {
                return defaultValue;
            }
            
            const saveData = storage.saves[savePrefix];
            const workingData = saveData.working || {};
            return workingData[key] !== undefined ? workingData[key] : defaultValue;
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} localStorage get failed for '${key}':`, error);
            return defaultValue;
        }
    },

    async safeStorageSet(key, value) {
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            const storage = this.getStorage();
            
            if (!storage.saves[savePrefix]) {
                storage.saves[savePrefix] = { working: {}, backup: {} };
            }
            
            if (!storage.saves[savePrefix].working) {
                storage.saves[savePrefix].working = {};
            }
            
            storage.saves[savePrefix].working[key] = value;
            this.setStorage(storage);
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} localStorage set failed for '${key}':`, error);
        }
    },

    // Route Status Tracking Methods
    async getRouteStatus(routeId) {
        const statuses = await this.safeStorageGet('routeStatuses', {});
        return statuses[routeId] || null;
    },

    async setRouteStatus(routeId, status, day) {
        const statuses = await this.safeStorageGet('routeStatuses', {});
        
        if (status === 'new') {
            statuses[routeId] = {
                status: 'new',
                createdDay: day,
                deletedDay: null
            };
        } else if (status === 'ongoing') {
            if (statuses[routeId]) {
                statuses[routeId].status = 'ongoing';
            }
        } else if (status === 'deleted') {
            if (statuses[routeId]) {
                statuses[routeId].status = 'deleted';
                statuses[routeId].deletedDay = day;
            }
        }
        
        await this.safeStorageSet('routeStatuses', statuses);
    },

    async getAllRouteStatuses() {
        return await this.safeStorageGet('routeStatuses', {});
    },

    async transitionNewRoutesToOngoing() {
        const statuses = await this.safeStorageGet('routeStatuses', {});
        let updated = false;
        
        for (const routeId in statuses) {
            if (statuses[routeId].status === 'new') {
                statuses[routeId].status = 'ongoing';
                updated = true;
            }
        }
        
        if (updated) {
            await this.safeStorageSet('routeStatuses', statuses);
        }
    },

    // Backup working data to backup (called on game save)
    async backupToStorage() {
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            const storage = this.getStorage();
            
            if (storage.saves[savePrefix] && storage.saves[savePrefix].working) {
                storage.saves[savePrefix].backup = JSON.parse(JSON.stringify(storage.saves[savePrefix].working));
                this.setStorage(storage);
            }
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Backup failed:`, error);
        }
    },

    // Restore backup data to working (called on game load)
    async restoreFromBackup() {
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            const storage = this.getStorage();
            
            if (storage.saves[savePrefix] && storage.saves[savePrefix].backup) {
                storage.saves[savePrefix].working = JSON.parse(JSON.stringify(storage.saves[savePrefix].backup));
                this.setStorage(storage);
            }
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Restore failed:`, error);
        }
    },

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            html.dark #advanced-analytics {
                color-scheme: dark;
            }
            
            /* Table styling */
            #advanced-analytics {
                scrollbar-width: thin;
                width: auto;
            }
            #advanced-analytics thead tr,
            #advanced-analytics th:first-child,
            #advanced-analytics td:first-child {
                position: sticky;
                left: 0;
            }
            
            /* Panel wrapper styling */
            #advanced-analytics-panel {
                background-color: transparent;
            }
            #advanced-analytics-panel > div:first-child {
                background-color: hsl(var(--background));
            }
            
            /* Wrapper (immediate parent of table) styling */
            #advanced-analytics-wrapper {
                padding: 0;
                width: auto;
            }

            /* Toolbar checkbox styling */
            .aa-toolbar-checkbox {
                appearance: none;
                width: 0;
                height: 0;
                position: absolute;
            }
        `;
        document.head.appendChild(style);
    },

    // ============================================================================
    // MAIN PANEL RENDER
    // ============================================================================

    renderAnalyticsPanel() {
        const api = this.api;
        const { React } = this;
        const h = this.h;
        const self = this; // Reference for closures

        const AnalyticsPanel = () => {
            // --- State Management ---
            const [tableData, setTableData] = React.useState([]);
            // Initialize from cache or fallback to initial values
            const [sortState, setSortState] = React.useState(
                self.StateCache.sortState || self.initialSortState
            );
            const [groupState, setGroupState] = React.useState(
                self.StateCache.groupState || self.initialGroupState
            );
            const [timeframeState, setTimeframeState] = React.useState(
                self.StateCache.timeframeState || self.initialTimeframeState
            );
            const [historicalData, setHistoricalData] = React.useState(
                self.StateCache.historicalData || { days: {} }
            );
            const [compareMode, setCompareMode] = React.useState(
                self.StateCache.compareMode || false
            );
            const [comparePrimaryDay, setComparePrimaryDay] = React.useState(
                self.StateCache.comparePrimaryDay || null
            );
            const [compareSecondaryDay, setCompareSecondaryDay] = React.useState(
                self.StateCache.compareSecondaryDay || null
            );
            const [compareShowPercentages, setCompareShowPercentages] = React.useState(
                self.StateCache.compareShowPercentages !== undefined ? self.StateCache.compareShowPercentages : true
            );

            // --- Effect: Initialize state from storage (once per page load) ---
            React.useEffect(() => {
                const initState = async () => {
                    if (!self.StateCache.isInitialized) {
                        try {
                            const storedSort = await self.safeStorageGetUI('sortState', self.initialSortState);
                            const storedGroup = await self.safeStorageGetUI('groupState', self.initialGroupState);
                            const storedTimeframe = await self.safeStorageGetUI('timeframeState', self.initialTimeframeState);
                            const storedHistorical = await self.loadHistoricalData();
                            const storedCompareMode = await self.safeStorageGetUI('compareMode', false);
                            const storedComparePrimaryDay = await self.safeStorageGetUI('comparePrimaryDay', null);
                            const storedCompareSecondaryDay = await self.safeStorageGetUI('compareSecondaryDay', null);
                            const storedCompareShowPercentages = await self.safeStorageGetUI('compareShowPercentages', true);
                            
                            self.StateCache.sortState = storedSort;
                            self.StateCache.groupState = storedGroup;
                            self.StateCache.timeframeState = storedTimeframe;
                            self.StateCache.historicalData = storedHistorical;
                            self.StateCache.compareMode = storedCompareMode;
                            self.StateCache.comparePrimaryDay = storedComparePrimaryDay;
                            self.StateCache.compareSecondaryDay = storedCompareSecondaryDay;
                            self.StateCache.compareShowPercentages = storedCompareShowPercentages;
                            self.StateCache.isInitialized = true;
                            
                            // Validate compare days (secondary < primary)
                            if (storedCompareMode && storedComparePrimaryDay && storedCompareSecondaryDay) {
                                if (storedCompareSecondaryDay >= storedComparePrimaryDay) {
                                    // Invalid - auto-adjust
                                    const adjustedSecondary = storedComparePrimaryDay - 1;
                                    self.StateCache.compareSecondaryDay = adjustedSecondary;
                                    await self.safeStorageSetUI('compareSecondaryDay', adjustedSecondary);
                                }
                            }
                            
                            setSortState(storedSort);
                            setGroupState(storedGroup);
                            setTimeframeState(storedTimeframe);
                            setHistoricalData(storedHistorical);
                            setCompareMode(self.StateCache.compareMode);
                            setComparePrimaryDay(self.StateCache.comparePrimaryDay);
                            setCompareSecondaryDay(self.StateCache.compareSecondaryDay);
                        } catch (error) {
                            console.error(`${self.CONFIG.LOG_PREFIX} Failed to load state:`, error);
                        }
                    }
                };
                initState();
            }, []);

            // --- Effect: Poll for historical data updates ---
            React.useEffect(() => {
                const checkHistoricalDataUpdates = setInterval(() => {
                    // Check if cache has newer data than component state
                    if (self.StateCache.historicalData && 
                        JSON.stringify(self.StateCache.historicalData) !== JSON.stringify(historicalData)) {
                        setHistoricalData({ ...self.StateCache.historicalData });
                    }
                }, 2000);
                
                return () => clearInterval(checkHistoricalDataUpdates);
            }, [historicalData]);

            // --- Effect: Setup wrapper classes on mount ---
            React.useEffect(() => {
                const ourContent = document.getElementById('advanced-analytics');
                if (!ourContent) return;
                
                const panel = ourContent.closest('.rounded-lg.backdrop-blur-md');
                if (panel && !panel.id) panel.id = 'advanced-analytics-panel';
                
                const wrapper = ourContent.parentElement;
                if (wrapper && !wrapper.id) {
                    wrapper.id = 'advanced-analytics-wrapper';
                    if (!wrapper.classList.contains('max-h-[80vh]')) wrapper.classList.add('max-h-[80vh]');
                    if (!wrapper.classList.contains('overflow-auto')) wrapper.classList.add('overflow-auto');
                }
            }, []);

            // --- Effect: Data fetching and processing (main update loop) ---
            React.useEffect(() => {
                if (self.debug) {
                    console.log(`${self.CONFIG.LOG_PREFIX} Debug mode enabled - updates paused`);
                    return;
                }

                const updateData = async () => {
                    let processedData = [];

                    // ===== COMPARISON MODE =====
                    if (compareMode && comparePrimaryDay && compareSecondaryDay) {
                        const comparisonRows = self.getComparisonData(comparePrimaryDay, compareSecondaryDay, historicalData);
                        const routeStatuses = await self.getAllRouteStatuses();
                        
                        console.group('[AA] Comparison Mode Filtering Debug');
                        console.log('Comparing Day', comparePrimaryDay, 'vs Day', compareSecondaryDay);
                        console.log('Route statuses:', routeStatuses);
                        console.log('Total comparison rows before filtering:', comparisonRows?.length || 0);
                        
                        if (comparisonRows) {
                            const mappedRows = comparisonRows.map(row => 
                                self.buildComparisonRow(row, routeStatuses, comparePrimaryDay, compareSecondaryDay)
                            );
                            
                            console.log('Mapped rows:', mappedRows);
                            
                            const filteredRows = mappedRows.filter(row => {
                                const status = routeStatuses[row.id];
                                
                                if (!status) {
                                    // No status info - keep the route
                                    console.log(`Route ${row.id} (${row.name}): No status info, keeping`);
                                    return true;
                                }
                                
                                // Check if route was 'new' in EITHER of the comparison days
                                // A route is considered "new" if it was created on that day
                                const wasNewOnPrimaryDay = status.createdDay === comparePrimaryDay;
                                const wasNewOnSecondaryDay = status.createdDay === compareSecondaryDay;
                                const shouldFilter = wasNewOnPrimaryDay || wasNewOnSecondaryDay;
                                
                                console.log(`Route ${row.id} (${row.name}):`, {
                                    status: status.status,
                                    createdDay: status.createdDay,
                                    comparePrimaryDay,
                                    compareSecondaryDay,
                                    wasNewOnPrimaryDay,
                                    wasNewOnSecondaryDay,
                                    willBeFiltered: shouldFilter
                                });
                                
                                return !shouldFilter;
                            });
                            
                            console.log('Filtered rows count:', filteredRows.length);
                            console.log('Filtered rows:', filteredRows);
                            console.groupEnd();
                            
                            processedData = filteredRows;
                        } else {
                            console.log('No comparison data available');
                            console.groupEnd();
                        }
                    }
                    
                    // ===== HISTORICAL DATA MODE (specific day selected) =====
                    else if (timeframeState !== 'last24h') {
                        const dayData = historicalData.days[timeframeState];
                        if (dayData && dayData.routes) {
                            // Use historical data
                            processedData = dayData.routes.map(route => {
                                // Check if route still exists
                                const currentRoutes = api.gameState.getRoutes();
                                const routeExists = currentRoutes.some(r => r.id === route.id);
                                return {
                                    ...route,
                                    deleted: !routeExists
                                };
                            });
                        }
                    } 
                    
                    // ===== LIVE DATA MODE (last 24h) =====
                    else {
                        const routes = api.gameState.getRoutes();
                        const trainTypes = api.trains.getTrainTypes();
                        const lineMetrics = api.gameState.getLineMetrics();
                        const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;

                        // Calculate transfers for all routes
                        const transfersMap = self.calculateTransfers(routes);

                        routes.forEach(route => {
                            const metrics = lineMetrics.find(m => m.routeId === route.id);
                            const ridership = metrics ? metrics.ridersPerHour * timeWindowHours : 0;
                            const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
                            const dailyRevenue = revenuePerHour * 24;

                            if (!self.validateRouteData(route)) {
                                processedData.push({
                                    id: route.id,
                                    name: route.name || route.bullet,
                                    ridership,
                                    dailyRevenue,
                                    deleted: false,
                                    transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
                                    ...self.getEmptyMetrics()
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
                                    ...self.getEmptyMetrics()
                                });
                                return;
                            }

                            const calculatedMetrics = self.calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
                            
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
                    }

                    if (processedData.length > 0) {
                    }
                    
                    const sortedData = [...processedData].sort((a, b) => {
                        const aVal = a[sortState.column];
                        const bVal = b[sortState.column];
                        
                        if (sortState.column === 'name') {
                            return sortState.order === 'desc' 
                                ? bVal.localeCompare(aVal)
                                : aVal.localeCompare(bVal);
                        }
                        
                        // Handle comparison mode (values are objects with .value property)
                        if (a.isComparison) {
                            // Extract numeric value from comparison object
                            const aNum = typeof aVal === 'object' && aVal !== null ? (aVal.value || 0) : 0;
                            const bNum = typeof bVal === 'object' && bVal !== null ? (bVal.value || 0) : 0;
                            return sortState.order === 'desc' ? bNum - aNum : aNum - bNum;
                        }
                        
                        // Normal mode (values are numbers)
                        return sortState.order === 'desc' ? bVal - aVal : aVal - bVal;
                    });

                    if (sortedData.length > 0) {
                    }

                    setTableData(sortedData);
                };

                updateData();
                
                // Only set interval for live data (last24h)
                if (timeframeState === 'last24h') {
                    const interval = setInterval(updateData, self.CONFIG.REFRESH_INTERVAL);
                    return () => clearInterval(interval);
                }
            }, [sortState, timeframeState, historicalData, compareMode, comparePrimaryDay, compareSecondaryDay, compareShowPercentages]); // Depend on timeframe, historical data, and compare state

            // Custom state updater for sortState (syncs to cache + storage)
            const updateSortState = React.useCallback((column) => {
                const newState = {
                    column,
                    order: sortState.column === column && sortState.order === 'desc' ? 'asc' : 'desc'
                };
                
                // Update cache immediately (for instant recovery on remount)
                self.StateCache.sortState = newState;
                
                // Update React state (triggers re-render)
                setSortState(newState);
                
                // Persist to storage (async, fire-and-forget)
                self.safeStorageSetUI('sortState', newState).catch(err => {
                    console.error(`${self.CONFIG.LOG_PREFIX} Failed to save sortState:`, err);
                });
            }, [sortState]);

            // Custom state updater for groupState (syncs to cache + storage)
            const updateGroupState = React.useCallback((groupKey) => {
                const newState = {
                    ...groupState,
                    [groupKey]: !groupState[groupKey]
                };
                
                // Update cache immediately
                self.StateCache.groupState = newState;
                
                // Update React state
                setGroupState(newState);
                
                // Persist to storage
                self.safeStorageSetUI('groupState', newState).catch(err => {
                    console.error(`${self.CONFIG.LOG_PREFIX} Failed to save groupState:`, err);
                });
            }, [groupState]);

            // Custom state updater for timeframeState (syncs to cache + storage)
            const updateTimeframeState = React.useCallback((newTimeframe) => {
                // Update cache immediately
                self.StateCache.timeframeState = newTimeframe;
                
                // Update React state
                setTimeframeState(newTimeframe);
                
                // Persist to storage
                self.safeStorageSetUI('timeframeState', newTimeframe).catch(err => {
                    console.error(`${self.CONFIG.LOG_PREFIX} Failed to save timeframeState:`, err);
                });
            }, []);

            // Toolbar
            const btnBaseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border';
            const btnClasses = 'bg-background hover:bg-accent hover:text-accent-foreground border-input';
            const btnActiveClasses = 'bg-primary text-primary-foreground border-primary hover:bg-primary/90';
            const allDays = Object.keys(historicalData.days).map(Number);
            const mostRecentDay = Math.max(...allDays);
            const availableDays = allDays
                .sort((a, b) => b - a)  // Descending order (newest first)
                .filter(day => day < mostRecentDay);  // Exclude most recent (that's "yesterday" button)
            
            const hasOtherDays = availableDays.length > 0;

            const renderToolbar = () => {
                return h('div', { 
                    className: 'flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30'
                }, [
                    // Left side - Filter buttons
                    h('div', { key: 'filters', className: 'flex items-center gap-1.5' }, [
                        h('span', { key: 'label', className: 'text-xs font-medium text-muted-foreground mr-1' }, 'Metrics:'),
                        
                        // Trains toggle
                        h('button', {
                            key: 'trains',
                            className: `${btnBaseClasses} ${groupState.trains ? btnActiveClasses : btnClasses}`,
                            onClick: () => updateGroupState('trains'),
                            title: 'Toggle Train Metrics'
                        }, [
                            h(api.utils.icons.Train, { key: 'icon', size: 14 }),
                            h('span', { key: 'text' }, 'Trains')
                        ]),
                        
                        // Finance toggle
                        h('button', {
                            key: 'finance',
                            className: `${btnBaseClasses} ${groupState.finance ? btnActiveClasses : btnClasses}`,
                            onClick: () => updateGroupState('finance'),
                            title: 'Toggle Finance Metrics'
                        }, [
                            h(api.utils.icons.DollarSign, { key: 'icon', size: 14 }),
                            h('span', { key: 'text' }, 'Finance')
                        ]),
                        
                        // Performance toggle
                        h('button', {
                            key: 'performance',
                            className: `${btnBaseClasses} ${groupState.performance ? btnActiveClasses : btnClasses}`,
                            onClick: () => updateGroupState('performance'),
                            title: 'Toggle Performance Metrics'
                        }, [
                            h(api.utils.icons.TrendingUp, { key: 'icon', size: 14 }),
                            h('span', { key: 'text' }, 'Performance')
                        ])
                    ]),
                    
                    // Middle - Timeframe selection / Compare mode
                    h('div', { key: 'timeframe', className: 'flex items-center gap-1.5' }, [
                        h('span', { key: 'label', className: 'text-xs font-medium text-muted-foreground mr-1' }, 'Timeframe:'),
                        
                        // Compare checkbox
                        h('label', {
                            key: 'compareLabel',
                            className: 'flex items-center gap-1.5 cursor-pointer'
                        }, [
                            availableDays.length > 0 && h('input', {
                                key: 'compareCheckbox',
                                type: 'checkbox',
                                checked: compareMode,
                                onChange: async (e) => {
                                    const enabled = e.target.checked;
                                    setCompareMode(enabled);
                                    self.StateCache.compareMode = enabled;
                                    await self.safeStorageSetUI('compareMode', enabled);
                                    
                                    if (enabled) {
                                        // Set default compare days: Most recent vs day before
                                        const allDays = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
                                        const mostRecentDay = allDays[0];
                                        const dayBefore = allDays[1];
                                        
                                        setComparePrimaryDay(mostRecentDay);
                                        setCompareSecondaryDay(dayBefore);
                                        self.StateCache.comparePrimaryDay = mostRecentDay;
                                        self.StateCache.compareSecondaryDay = dayBefore;
                                        await self.safeStorageSetUI('comparePrimaryDay', mostRecentDay);
                                        await self.safeStorageSetUI('compareSecondaryDay', dayBefore);
                                    }
                                },
                                className: 'cursor-pointer'
                            }),
                            h('span', { key: 'text', className: 'text-xs' }, 'Compare')
                        ]),
                        
                        // Conditional rendering: Normal buttons OR Compare dropdowns
                        !compareMode ? [
                            // Last 24h button
                            h('button', {
                                key: 'last24h',
                                className: `${btnBaseClasses} ${timeframeState === 'last24h' ? btnActiveClasses : btnClasses}`,
                                onClick: () => updateTimeframeState('last24h'),
                                title: 'Show data from last 24 hours'
                            }, [
                                h(api.utils.icons.Clock, { key: 'icon', size: 14 }),
                                h('span', { key: 'text' }, 'Last 24h')
                            ]),
                            
                            // Yesterday button
                            (() => {
                                const allDays = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
                                const mostRecentDay = allDays[0]; // Most recent day with data
                                const hasYesterdayData = mostRecentDay !== undefined;
                                
                                return h('button', {
                                    key: 'yesterday',
                                    className: `${btnBaseClasses} ${!hasYesterdayData ? ' disabled:opacity-50 cursor-not-allowed ' : ''} ${timeframeState === String(mostRecentDay) ? btnActiveClasses : btnClasses}`,
                                    onClick: hasYesterdayData ? () => updateTimeframeState(String(mostRecentDay)) : undefined,
                                    disabled: !hasYesterdayData,
                                    title: hasYesterdayData ? `Show data from Day ${mostRecentDay}` : 'No data available for yesterday'
                                }, [
                                    h(api.utils.icons.Calendar, { key: 'icon', size: 14 }),
                                    h('span', { key: 'text' }, hasYesterdayData ? `Yesterday (${mostRecentDay})` : 'Yesterday')
                                ]);
                            })(),
                            
                            // Day dropdown
                            (() => {
                                return h('select', {
                                    key: 'daySelect',
                                    className: `${btnBaseClasses} ${btnClasses} ${!hasOtherDays ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`,
                                    disabled: !hasOtherDays,
                                    value: availableDays.includes(Number(timeframeState)) ? timeframeState : '',
                                    onChange: (e) => {
                                        if (e.target.value) {
                                            updateTimeframeState(e.target.value);
                                        }
                                    },
                                    title: hasOtherDays ? 'Select a day to view' : 'No historical data available'
                                }, [
                                    h('option', { key: 'placeholder', value: '', disabled: true }, 'Select Day'),
                                    ...availableDays.map(day => {
                                        const label = `Day ${day}`;
                                        return h('option', { key: day, value: String(day) }, label);
                                    })
                                ]);
                            })()
                        ] : [
                            // Compare mode: Two dropdowns
                            // Primary dropdown (newer day)
                            (() => {
                                const allDays = self.getAvailableDays(historicalData);
                                const mostRecentDay = allDays[0];
                                
                                const availablePrimaryDays = allDays.filter(day => {
                                    const olderDays = allDays.filter(d => d < day);
                                    return olderDays.length > 0;
                                });
                                
                                return self.renderDayDropdown(h, {
                                    key: 'primaryDaySelect',
                                    value: comparePrimaryDay,
                                    availableDays: availablePrimaryDays,
                                    mostRecentDay,
                                    placeholder: 'Select Primary Day',
                                    btnBaseClasses,
                                    btnClasses,
                                    onChange: async (e) => {
                                        const newPrimary = Number(e.target.value);
                                        setComparePrimaryDay(newPrimary);
                                        self.StateCache.comparePrimaryDay = newPrimary;
                                        await self.safeStorageSetUI('comparePrimaryDay', newPrimary);
                                        
                                        // Auto-adjust secondary if now invalid
                                        if (compareSecondaryDay >= newPrimary) {
                                            const adjusted = newPrimary - 1;
                                            setCompareSecondaryDay(adjusted);
                                            self.StateCache.compareSecondaryDay = adjusted;
                                            await self.safeStorageSetUI('compareSecondaryDay', adjusted);
                                        }
                                    }
                                });
                            })(),
                            
                            // "vs" label
                            h('span', { key: 'vs', className: 'text-xs font-medium text-muted-foreground' }, 'vs'),
                            
                            // Secondary dropdown (older day)
                            (() => {
                                const allDays = self.getAvailableDays(historicalData);
                                const mostRecentDay = allDays[0];
                                const availableSecondaryDays = comparePrimaryDay 
                                    ? allDays.filter(day => day < comparePrimaryDay)
                                    : [];
                                
                                return self.renderDayDropdown(h, {
                                    key: 'secondaryDaySelect',
                                    value: compareSecondaryDay,
                                    availableDays: availableSecondaryDays,
                                    mostRecentDay,
                                    placeholder: 'Compare To',
                                    btnBaseClasses,
                                    btnClasses,
                                    disabled: availableSecondaryDays.length === 0,
                                    title: availableSecondaryDays.length === 0 ? 'No older days available' : 'Select comparison day',
                                    onChange: async (e) => {
                                        const newSecondary = Number(e.target.value);
                                        setCompareSecondaryDay(newSecondary);
                                        self.StateCache.compareSecondaryDay = newSecondary;
                                        await self.safeStorageSetUI('compareSecondaryDay', newSecondary);
                                    }
                                });
                            })(),
                            
                            // Percentage toggle button
                            h('button', {
                                key: 'percentageToggle',
                                className: `${btnBaseClasses} ${compareShowPercentages ? btnActiveClasses : btnClasses}`,
                                onClick: async () => {
                                    const newValue = !compareShowPercentages;
                                    setCompareShowPercentages(newValue);
                                    self.StateCache.compareShowPercentages = newValue;
                                    await self.safeStorageSetUI('compareShowPercentages', newValue);
                                },
                                title: 'Show percentages'
                            }, h(api.utils.icons.Percent, { size: 14 }))
                        ]
                    ]),
                    
                    // Right side - Update indicator
                    h('div', { key: 'status', className: 'flex items-center gap-2' }, [
                        !api.gameState.isPaused() && h('div', {
                            key: 'indicator',
                            className: `absolute w-2 h-2 rounded-full bg-green-500 opacity-75 ${api.gameState.isPaused() ? 'hidden' : 'animate-ping'}`
                        }),
                        api.gameState.isPaused() && h('span', {className:`text-muted-foreground text-xs`}, "Pause"),
                        h('span', {className:`relative inline-flex w-2 h-2 rounded-full ${api.gameState.isPaused() ? 'bg-amber-400' : 'bg-green-500'}`})
                    ])
                ]);
            };

            const renderTableHeader = (header) => {
                const alignClass = header.align === 'right' ? 'text-right' : 
                                 header.align === 'center' ? 'text-center' : 'text-left';
                
                const isActiveSort = sortState.column === header.key;
                
                return h('th', {
                    key: header.key,
                    className: `px-3 py-2 ${alignClass} cursor-pointer select-none transition-colors ${self.getHeaderClasses(header.key, sortState, groupState, header.group)}`,
                    onClick: () => updateSortState(header.key)
                }, 
                    h('div', { className: `flex ${header.align === 'center' ? 'justify-center' : 'justify-end'} items-center gap-0.5 whitespace-nowrap` }, [
                        h('span', { 
                            key: 'sort', 
                            className: isActiveSort ? 'inline-block' : 'inline-block opacity-0'
                        }, self.getSortIndicator(header.key, sortState)),
                        h('div', { key: 'labels', className: 'whitespace-nowrap' }, [
                            h('span', { key: 'label', className: 'font-medium text-xs' }, header.label),
                            header.small && h('span', {
                                key: 'small',
                                className: 'text-[10px] text-muted-foreground font-normal ml-1'
                            }, header.small)
                        ])
                    ])
                );
            };

            const renderRow = (row) => {
                const isDeleted = row.deleted === true;
                
                const nameCell = h('td', {
                    key: 'name',
                    className: `px-3 py-2 align-middle text-left ${isDeleted ? 'opacity-50' : 'cursor-pointer hover:text-primary'} transition-colors ${self.getCellClasses('name', sortState, groupState)}`,
                    onClick: isDeleted ? undefined : () => {
                        const route = api.gameState.getRoutes().find(r => r.id === row.id);
                        if (route && route.stations && route.stations[0]) {
                            const station = api.gameState.getStations().find(s => s.id === route.stations[0]);
                            if (station) {
                                const map = api.utils.getMap();
                                if (map) {
                                    map.flyTo({
                                        center: station.coords,
                                        zoom: 14,
                                        duration: 1000
                                    });
                                }
                            }
                        }
                    }
                }, 
                    h('div', { className: 'font-medium' }, [
                        row.name,
                        isDeleted && h('span', { key: 'deleted', className: 'ml-2 text-xs text-muted-foreground' }, '(Deleted)')
                    ])
                );

                const ridershipCell = row.isComparison 
                    ? self.createReactComparisonCell('ridership', row.ridership, row.primaryValues?.ridership, row.secondaryValues?.ridership, compareShowPercentages, sortState, groupState, 'performance')
                    : self.createReactMetricCell('ridership', row.ridership.toLocaleString(undefined, {maximumFractionDigits: 0}), sortState, groupState, 'performance');

                const capacityCell = row.isComparison 
                    ? self.createReactComparisonCell('capacity', row.capacity, row.primaryValues?.capacity, row.secondaryValues?.capacity, compareShowPercentages, sortState, groupState, 'trains')
                    : self.createReactMetricCell('capacity', row.capacity.toLocaleString(undefined, {maximumFractionDigits: 0}), sortState, groupState, 'trains');

                const utilizationCell = row.isComparison 
                    ? self.createReactComparisonCell('utilization', row.utilization, row.primaryValues?.utilization, row.secondaryValues?.utilization, true, sortState, groupState, 'performance') // Always show % for utilization
                    : h('td', {
                        key: 'utilization',
                        className: `px-3 py-2 align-middle text-right font-mono ${self.getUtilizationClasses(row.utilization)} ${self.getCellClasses('utilization', sortState, groupState, 'performance')}`
                    }, `${row.utilization}%`);

                const stationsCell = row.isComparison 
                    ? self.createReactComparisonCell('stations', row.stations, row.primaryValues?.stations, row.secondaryValues?.stations, compareShowPercentages, sortState, groupState, 'trains')
                    : self.createReactMetricCell('stations', row.stations.toString(), sortState, groupState, 'trains');

                const trainScheduleCell = row.isComparison 
                    ? self.createReactComparisonCell('trainSchedule', row.trainSchedule, row.primaryValues?.trainSchedule, row.secondaryValues?.trainSchedule, compareShowPercentages, sortState, groupState, 'trains')
                    : (() => {
                        const trainColors = self.CONFIG.COLORS.TRAINS;
                        return h('td', {
                            key: 'trainSchedule',
                            className: `px-3 py-2 align-middle text-right font-mono ${self.getCellClasses('trainSchedule', sortState, groupState, 'trains')}`
                        },
                            h('span', { className: `font-bold` }, self.calculateTotalTrains(row)),
                            ' (',
                            h('small', {hey: 'details'},
                                h('span', { className: `${trainColors.HIGH}` }, row.trainsHigh), '-',
                                h('span', { className: `${trainColors.MEDIUM}` }, row.trainsMedium), '-',
                                h('span', { className: `${trainColors.LOW}` }, row.trainsLow),
                            ),
                            ')',
                        );
                    })();

                const dailyCostCell = row.isComparison 
                    ? self.createReactComparisonCell('dailyCost', row.dailyCost, row.primaryValues?.dailyCost, row.secondaryValues?.dailyCost, compareShowPercentages, sortState, groupState, 'finance')
                    : self.createReactMetricCell('dailyCost', self.formatCurrency(row.dailyCost), sortState, groupState, 'finance');

                const dailyRevenueCell = row.isComparison 
                    ? self.createReactComparisonCell('dailyRevenue', row.dailyRevenue, row.primaryValues?.dailyRevenue, row.secondaryValues?.dailyRevenue, compareShowPercentages, sortState, groupState, 'finance')
                    : self.createReactMetricCell('dailyRevenue', self.formatCurrency(row.dailyRevenue), sortState, groupState, 'finance');

                const dailyProfitCell = row.isComparison 
                    ? self.createReactComparisonCell('dailyProfit', row.dailyProfit, row.primaryValues?.dailyProfit, row.secondaryValues?.dailyProfit, compareShowPercentages, sortState, groupState, 'finance')
                    : self.createReactProfitCell('dailyProfit', row.dailyProfit, sortState, groupState, 'finance');

                const transfersCell = row.isComparison 
                    ? self.createReactComparisonCell('transfers', row.transfers, row.primaryValues?.transfers?.count, row.secondaryValues?.transfers?.count, compareShowPercentages, sortState, groupState, 'trains')
                    : (() => {
                        const transfers = row.transfers || { count: 0, routes: [] };
                        const displayText = transfers.count === 0 
                            ? '0' 
                            : `${transfers.count} (${transfers.routes.join(', ')})`;
                        return h('td', {
                            key: 'transfers',
                            className: `px-3 py-2 align-middle text-right font-mono text-xs ${self.getCellClasses('transfers', sortState, groupState, 'trains')}`
                        }, displayText);
                    })();

                const profitPerPassengerCell = row.isComparison 
                    ? self.createReactComparisonCell('profitPerPassenger', row.profitPerPassenger, row.primaryValues?.profitPerPassenger, row.secondaryValues?.profitPerPassenger, compareShowPercentages, sortState, groupState, 'performance')
                    : self.createReactProfitCell('profitPerPassenger', row.profitPerPassenger, sortState, groupState, 'performance');

                const profitPerTrainCell = row.isComparison 
                    ? self.createReactComparisonCell('profitPerTrain', row.profitPerTrain, row.primaryValues?.profitPerTrain, row.secondaryValues?.profitPerTrain, compareShowPercentages, sortState, groupState, 'performance')
                    : self.createReactProfitCell('profitPerTrain', row.profitPerTrain, sortState, groupState, 'performance');

                return h('tr', {
                    key: row.id,
                    className: `border-b border-border hover:bg-muted/50 transition-colors ${isDeleted ? 'opacity-50' : ''}`
                }, [
                    nameCell,
                    ridershipCell,
                    capacityCell,
                    utilizationCell,
                    stationsCell,
                    trainScheduleCell,
                    transfersCell,
                    dailyCostCell,
                    dailyRevenueCell,
                    dailyProfitCell,
                    profitPerPassengerCell,
                    profitPerTrainCell
                ]);
            };

            return h('div', { 
                id: 'advanced-analytics',
                className: 'flex flex-col h-full'
            }, [
                renderToolbar(),
                h('div', { 
                    key: 'table-wrapper',
                    className: 'flex-1 overflow-auto'
                },
                    h('table', { className: 'w-full border-collapse text-sm' }, [
                        h('thead', { key: 'head' },
                            h('tr', { className: 'border-b border-border' },
                                self.CONFIG.TABLE_HEADERS.map(header => renderTableHeader(header))
                            )
                        ),
                        h('tbody', { key: 'body' },
                            tableData.map(row => renderRow(row))
                        )
                    ])
                )
            ]);
        };

        return h(AnalyticsPanel);
    },

    // ============================================================================
    // CELL RENDERING METHODS
    // ============================================================================

    /**
     * Create a standard metric cell
     * 
     * @param {string} columnKey - Column identifier
     * @param {string} content - Formatted content to display
     * @param {Object} sortState - Current sort state
     * @param {Object} groupState - Current group visibility state
     * @param {string} group - Group this column belongs to ('performance', 'trains', 'finance')
     * @param {Object} options - Optional styling options (e.g., valueColorClass)
     * @returns {ReactElement} Table cell element
     */
    createReactMetricCell(columnKey, content, sortState, groupState, group, options = {}) {
        const h = this.h;
        const {
            valueColorClass = this.CONFIG.COLORS.VALUE.DEFAULT
        } = options;

        return h('td', {
            key: columnKey,
            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
        }, 
            h('div', { className: valueColorClass }, content)
        );
    },

    /**
     * Create a profit cell with red color for negative values
     * 
     * @param {string} columnKey - Column identifier
     * @param {number} profitValue - Profit value (can be negative)
     * @param {Object} sortState - Current sort state
     * @param {Object} groupState - Current group visibility state
     * @param {string} group - Group this column belongs to
     * @returns {ReactElement} Table cell element
     */
    createReactProfitCell(columnKey, profitValue, sortState, groupState, group) {
        const isNegative = profitValue < 0;
        const valueColorClass = isNegative ? this.CONFIG.COLORS.VALUE.NEGATIVE : this.CONFIG.COLORS.VALUE.DEFAULT;

        return this.createReactMetricCell(columnKey, this.formatCurrency(profitValue), sortState, groupState, group, {
            valueColorClass
        });
    },

    // Create comparison cell (shows percentage change with color/arrow OR absolute delta values)
    createReactComparisonCell(columnKey, comparisonData, primaryValue, secondaryValue, showPercentages, sortState, groupState, group) {
        const h = this.h;
        
        // Handle special cases - same for both modes
        if (comparisonData === 'NEW') {
            return h('td', {
                key: columnKey,
                className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
            }, h('span', { className: this.CONFIG.COLORS.COMPARE.NEW }, 'NEW'));
        }
        
        if (comparisonData === 'DELETED') {
            return h('td', {
                key: columnKey,
                className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
            }, h('span', { className: this.CONFIG.COLORS.COMPARE.DELETED }, '(Deleted)'));
        }
        
        // Handle percentage change or absolute delta values
        if (comparisonData && typeof comparisonData === 'object') {
            const { type, value, isImprovement } = comparisonData;
            
            // Handle special type 'new' - show NEW in both modes
            if (type === 'new') {
                return h('td', {
                    key: columnKey,
                    className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
                }, h('span', { className: this.CONFIG.COLORS.COMPARE.NEW }, 'NEW'));
            }
            
            // Handle zero change - show just "=" in both modes
            if (type === 'zero' || value === 0) {
                return h('td', {
                    key: columnKey,
                    className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
                }, h('span', { className: this.CONFIG.COLORS.COMPARE.NEUTRAL }, '='));
            }
            
            // Show absolute delta instead of percentages
            if (!showPercentages && primaryValue !== undefined && secondaryValue !== undefined) {
                const delta = primaryValue - secondaryValue;
                const colorClass = isImprovement ? this.CONFIG.COLORS.COMPARE.POSITIVE : this.CONFIG.COLORS.COMPARE.NEGATIVE;
                // Arrow and sign should match the percentage direction (value), not delta sign
                const arrow = value > 0 ? this.CONFIG.ARROWS.UP : this.CONFIG.ARROWS.DOWN;
                const prefix = value > 0 ? '+' : '-';
                const absDelta = Math.abs(delta);
                
                // Check if this is a finance column (needs $ prefix)
                const isFinanceColumn = ['dailyCost', 'dailyRevenue', 'dailyProfit', 'profitPerPassenger', 'profitPerTrain'].includes(columnKey);
                const currencyPrefix = isFinanceColumn ? ' $' : '';
                
                // Format with proper decimal places for per-passenger and per-train metrics
                const decimals = ['profitPerPassenger', 'profitPerTrain'].includes(columnKey) ? 2 : 0;
                const formattedDelta = absDelta.toLocaleString(undefined, {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals
                });
                
                const formattedValue = `${prefix}${currencyPrefix}${formattedDelta} ${arrow}`;
                
                return h('td', {
                    key: columnKey,
                    className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
                }, h('span', { className: colorClass }, formattedValue));
            }
            
            // Show percentages (default)
            const colorClass = isImprovement ? this.CONFIG.COLORS.COMPARE.POSITIVE : this.CONFIG.COLORS.COMPARE.NEGATIVE;
            const arrow = value > 0 ? this.CONFIG.ARROWS.UP : this.CONFIG.ARROWS.DOWN;
            const formattedValue = `${value > 0 ? '+' : ''}${value.toFixed(1)}% ${arrow}`;
            
            return h('td', {
                key: columnKey,
                className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
            }, h('span', { className: colorClass }, formattedValue));
        }
        
        // Fallback
        return h('td', {
            key: columnKey,
            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
        }, '-');
    },

    // Helper: Render cell based on whether it's comparison data or regular data
    renderDataCell(columnKey, value, isComparison, sortState, groupState, group, formatFn) {
        if (isComparison) {
            return this.createReactComparisonCell(columnKey, value, sortState, groupState, group);
        } else {
            const formattedValue = formatFn ? formatFn(value) : value;
            return this.createReactMetricCell(columnKey, formattedValue, sortState, groupState, group);
        }
    },

    calculateRouteMetrics(route, trainType, ridership, dailyRevenue) {
        const carsPerTrain = route.carsPerTrain !== undefined 
            ? route.carsPerTrain 
            : trainType.stats.carsPerCarSet;
        
        const capacityPerCar = trainType.stats.capacityPerCar;
        const capacityPerTrain = carsPerTrain * capacityPerCar;

        const schedule = route.trainSchedule || {};
        const trainCounts = {
            high: schedule.highDemand || 0,
            medium: schedule.mediumDemand || 0,
            low: schedule.lowDemand || 0
        };

        let capacity = 0;
        let utilization = 0;
        let dailyCost = 0;

        if (route.stComboTimings && route.stComboTimings.length > 0) {
            const timings = route.stComboTimings;
            const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;

            if (loopTimeSeconds > 0) {
                const loopsPerHour = 3600 / loopTimeSeconds;

                const highCapacity = trainCounts.high * this.CONFIG.DEMAND_HOURS.high * loopsPerHour * capacityPerTrain;
                const mediumCapacity = trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain;
                const lowCapacity = trainCounts.low * this.CONFIG.DEMAND_HOURS.low * loopsPerHour * capacityPerTrain;

                capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);

                if (capacity > 0) {
                    utilization = Math.round((ridership / capacity) * 100);
                }

                const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                const carCostPerHour = trainType.stats.carOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);

                dailyCost = (trainCounts.low * this.CONFIG.DEMAND_HOURS.low * costPerTrainPerHour) +
                            (trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * costPerTrainPerHour) +
                            (trainCounts.high * this.CONFIG.DEMAND_HOURS.high * costPerTrainPerHour);
            }
        }

        const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;
        const dailyProfit = dailyRevenue - dailyCost;
        const profitPerPassenger = ridership > 0 ? dailyProfit / ridership : 0;
        const totalTrains = (route.trainSchedule?.highDemand || 0) + 
                           (route.trainSchedule?.mediumDemand || 0) + 
                           (route.trainSchedule?.lowDemand || 0);
        const profitPerTrain = totalTrains > 0 ? dailyProfit / totalTrains : 0;

        return {
            capacity,
            utilization,
            stations,
            trainsLow: trainCounts.low,
            trainsMedium: trainCounts.medium,
            trainsHigh: trainCounts.high,
            trainSchedule: trainCounts.high,
            dailyCost,
            dailyProfit,
            profitPerPassenger,
            profitPerTrain
        };
    },

    validateRouteData(route) {
        return route && route.trainSchedule;
    },

    getEmptyMetrics() {
        return {
            capacity: 0,
            utilization: 0,
            stations: 0,
            trainsLow: 0,
            trainsMedium: 0,
            trainsHigh: 0,
            trainSchedule: 0,
            dailyCost: 0,
            dailyRevenue: 0,
            dailyProfit: 0,
            profitPerPassenger: 0,
            profitPerTrain: 0,
            transfers: { count: 0, routes: [], stationIds: [] }
        };
    },

    getUtilizationClasses(utilization) {
        const thresholds = this.CONFIG.UTILIZATION_THRESHOLDS;
        const colors = this.CONFIG.COLORS.UTILIZATION;
        
        if (utilization < thresholds.CRITICAL_LOW || utilization > thresholds.CRITICAL_HIGH) {
            return colors.CRITICAL;
        } else if ((utilization >= thresholds.CRITICAL_LOW && utilization < thresholds.WARNING_LOW) || 
                   (utilization >= thresholds.WARNING_HIGH && utilization <= thresholds.CRITICAL_HIGH)) {
            return colors.WARNING;
        }
        return colors.GOOD;
    },

    getHeaderClasses(column, sortState, groupState, group) {
        // Hide column if its group is toggled off
        if (group && groupState && groupState[group] === false) {
            return 'hidden';
        }
        
        if (sortState.column === column) {
            return 'text-foreground bg-background/80';
        } else if (column === 'name') {
            return 'bg-background/50 backdrop-blur-sm';
        }
        return 'text-muted-foreground hover:text-foreground';
    },

    getCellClasses(column, sortState, groupState, group) {
        // Hide cell if its group is toggled off
        if (group && groupState && groupState[group] === false) {
            return 'hidden';
        }
        
        if (sortState.column === column) {
            return 'bg-background/80';
        } else if (column === 'name') {
            return 'bg-background/50 backdrop-blur-sm';
        }
        return '';
    },

    getSortIndicator(column, sortState) {
        if (sortState.column !== column) {
            return this.CONFIG.ARROWS.DOWN;
        }
        return sortState.order === 'desc' ? this.CONFIG.ARROWS.DOWN : this.CONFIG.ARROWS.UP;
    }
};

AdvancedAnalytics.init();
window.AdvancedAnalytics = AdvancedAnalytics;
