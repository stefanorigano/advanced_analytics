// Advanced Analytics Mod for Subway Builder v3.6.0
// Phase 1: Removed percentage comparisons (cleaner UI)

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
        tempSaveId: null  // Temporary ID before first save
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
            }
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
            { key: 'dailyCost', label: 'Cost', align: 'right', group: 'finance' },
            { key: 'dailyRevenue', label: 'Revenue', align: 'right', group: 'finance' },
            { key: 'dailyProfit', label: 'Profit', align: 'right', group: 'finance' },
            { key: 'costPerPassenger', label: 'Cost/Pax', align: 'right', group: 'performance' }
        ]
    },

    init() {
        if (!window.SubwayBuilderAPI) {
            console.error(`${this.CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }

        // Cache API references for reuse throughout the module
        this.api = window.SubwayBuilderAPI;
        this.React = this.api.utils.React;
        this.h = this.React.createElement;

        this.api.hooks.onGameInit(async () => {
            console.log(`${this.CONFIG.LOG_PREFIX} Mod initialized`);
            this.injectStyles();
            
            // Restore from API storage if we have a save name (shouldn't on fresh game init, but just in case)
            if (this.StateCache.currentSaveName) {
                await this.restoreFromApiStorage();
            }
            
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
        this.api.hooks.onDayChange((dayThatEnded) => {
            this.captureHistoricalData(dayThatEnded);
        });

        // Track which save is loaded and switch storage context
        this.api.hooks.onGameLoaded(async (saveName) => {
            // Update current save name for storage scoping
            this.StateCache.currentSaveName = saveName;
            
            // Restore from API storage (clears localStorage, loads saved data)
            await this.restoreFromApiStorage();
            
            // Reset initialization flag so component reloads data for this save
            this.StateCache.isInitialized = false;
        });

        // Update save name when game is saved
        this.api.hooks.onGameSaved(async (saveName) => {
            const oldSaveName = this.StateCache.currentSaveName;
            
            // If save name changed, migrate the localStorage data
            if (oldSaveName && oldSaveName !== saveName) {
                // Copy data from old key to new save key
                const oldPrefix = `aa-${oldSaveName}-`;
                const newPrefix = `aa-${saveName}-`;
                
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(oldPrefix)) {
                        const newKey = key.replace(oldPrefix, newPrefix);
                        const value = localStorage.getItem(key);
                        if (value) {
                            localStorage.setItem(newKey, value);
                        }
                        
                        // Only delete old key if it was a temp ID (contains timestamp)
                        if (oldSaveName.match(/\d{13}/)) {
                            localStorage.removeItem(key);
                        }
                    }
                }
            }
            
            this.StateCache.currentSaveName = saveName;
            
            // Persist localStorage to API storage
            await this.persistToApiStorage();
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

    // Safe storage wrapper (uses localStorage due to mod storage API context issues)
    async safeStorageGet(key, defaultValue) {
        // Use localStorage with save-specific prefix
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            const storageKey = `aa-${savePrefix}-${key}`;
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} localStorage get failed for '${key}':`, error);
            return defaultValue;
        }
    },

    async safeStorageSet(key, value) {
        // Use localStorage with save-specific prefix
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            const storageKey = `aa-${savePrefix}-${key}`;
            localStorage.setItem(storageKey, JSON.stringify(value));
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} localStorage set failed for '${key}':`, error);
        }
    },

    async persistToApiStorage() {
        // Persist all localStorage data to API storage (called on game save)
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            
            // Get all aa- prefixed keys for this save
            const prefix = `aa-${savePrefix}-`;
            const keysToSave = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keysToSave.push(key);
                }
            }
            
            // Build data object
            const dataToSave = {};
            keysToSave.forEach(fullKey => {
                const shortKey = fullKey.replace(prefix, '');
                const value = localStorage.getItem(fullKey);
                if (value) {
                    dataToSave[shortKey] = JSON.parse(value);
                }
            });
            
            // Save to API storage
            await this.api.storage.set(`save-${savePrefix}`, dataToSave);
            console.log(`${this.CONFIG.LOG_PREFIX} Persisted ${keysToSave.length} keys to save storage`);
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Failed to persist to API storage:`, error);
        }
    },

    async restoreFromApiStorage() {
        // Restore data from API storage to localStorage (called on game load)
        try {
            const savePrefix = this.StateCache.currentSaveName || 'default';
            
            // Clear all aa- prefixed localStorage keys
            const keysToDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('aa-')) {
                    keysToDelete.push(key);
                }
            }
            
            keysToDelete.forEach(key => localStorage.removeItem(key));
            
            // Load from API storage
            const savedData = await this.api.storage.get(`save-${savePrefix}`);
            if (savedData) {
                // Restore to localStorage
                const prefix = `aa-${savePrefix}-`;
                Object.entries(savedData).forEach(([shortKey, value]) => {
                    const fullKey = `${prefix}${shortKey}`;
                    localStorage.setItem(fullKey, JSON.stringify(value));
                });
                
                console.log(`${this.CONFIG.LOG_PREFIX} Restored ${Object.keys(savedData).length} items from save storage`);
            }
        } catch (error) {
            console.error(`${this.CONFIG.LOG_PREFIX} Failed to restore from API storage:`, error);
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

    renderAnalyticsPanel() {
        const api = this.api;
        const { React } = this;
        const h = this.h;
        const self = this; // Reference for closures

        const AnalyticsPanel = () => {
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

            // Load from storage ONCE per page load
            React.useEffect(() => {
                const initState = async () => {
                    if (!self.StateCache.isInitialized) {
                        try {
                            const storedSort = await self.safeStorageGet('sortState', self.initialSortState);
                            const storedGroup = await self.safeStorageGet('groupState', self.initialGroupState);
                            const storedTimeframe = await self.safeStorageGet('timeframeState', self.initialTimeframeState);
                            const storedHistorical = await self.loadHistoricalData();
                            
                            self.StateCache.sortState = storedSort;
                            self.StateCache.groupState = storedGroup;
                            self.StateCache.timeframeState = storedTimeframe;
                            self.StateCache.historicalData = storedHistorical;
                            self.StateCache.isInitialized = true;
                            
                            setSortState(storedSort);
                            setGroupState(storedGroup);
                            setTimeframeState(storedTimeframe);
                            setHistoricalData(storedHistorical);
                        } catch (error) {
                            console.error(`${self.CONFIG.LOG_PREFIX} Failed to load state:`, error);
                        }
                    }
                };
                initState();
            }, []);

            // Poll for historical data updates (when day changes and data is captured)
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

            // Setup wrapper classes on mount
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

            // Data fetching effect
            React.useEffect(() => {
                if (self.debug) {
                    console.log(`${self.CONFIG.LOG_PREFIX} Debug mode enabled - updates paused`);
                    return;
                }

                const updateData = () => {
                    let processedData = [];

                    // Handle historical data selection
                    if (timeframeState !== 'last24h') {
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
                    } else {
                        // Fetch live data for last 24h
                        const routes = api.gameState.getRoutes();
                        const trainTypes = api.trains.getTrainTypes();
                        const lineMetrics = api.gameState.getLineMetrics();
                        const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;

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
                                ...calculatedMetrics
                            });
                        });
                    }

                    const sortedData = [...processedData].sort((a, b) => {
                        const aVal = a[sortState.column];
                        const bVal = b[sortState.column];
                        
                        if (sortState.column === 'name') {
                            return sortState.order === 'desc' 
                                ? bVal.localeCompare(aVal)
                                : aVal.localeCompare(bVal);
                        }
                        
                        return sortState.order === 'desc' ? bVal - aVal : aVal - bVal;
                    });

                    setTableData(sortedData);
                };

                updateData();
                
                // Only set interval for live data (last24h)
                if (timeframeState === 'last24h') {
                    const interval = setInterval(updateData, self.CONFIG.REFRESH_INTERVAL);
                    return () => clearInterval(interval);
                }
            }, [sortState, timeframeState, historicalData]); // Depend on timeframe and historical data

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
                self.safeStorageSet('sortState', newState).catch(err => {
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
                self.safeStorageSet('groupState', newState).catch(err => {
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
                self.safeStorageSet('timeframeState', newTimeframe).catch(err => {
                    console.error(`${self.CONFIG.LOG_PREFIX} Failed to save timeframeState:`, err);
                });
            }, []);

            // Toolbar
            const btnBaseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border';
            const btnClasses = 'bg-background hover:bg-accent hover:text-accent-foreground border-input';
            const btnActiveClasses = 'bg-primary text-primary-foreground border-primary hover:bg-primary/90';

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
                    
                    // Middle - Timeframe selection
                    h('div', { key: 'timeframe', className: 'flex items-center gap-1.5' }, [
                        h('span', { key: 'label', className: 'text-xs font-medium text-muted-foreground mr-1' }, 'Timeframe:'),
                        
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
                            const currentDay = api.gameState.getCurrentDay();
                            const yesterdayDay = currentDay - 1;
                            const hasYesterdayData = historicalData.days[yesterdayDay] !== undefined;
                            
                            return h('button', {
                                key: 'yesterday',
                                className: `${btnBaseClasses} ${timeframeState === String(yesterdayDay) ? btnActiveClasses : btnClasses}`,
                                onClick: hasYesterdayData ? () => updateTimeframeState(String(yesterdayDay)) : undefined,
                                disabled: !hasYesterdayData,
                                title: hasYesterdayData ? `Show data from Day ${yesterdayDay}` : 'No data available for yesterday'
                            }, [
                                h(api.utils.icons.Calendar, { key: 'icon', size: 14 }),
                                h('span', { key: 'text' }, 'Yesterday')
                            ]);
                        })(),
                        
                        // Day dropdown
                        (() => {
                            const currentDay = api.gameState.getCurrentDay();
                            const allDays = Object.keys(historicalData.days).map(Number);
                            const availableDays = allDays
                                .sort((a, b) => b - a)  // Descending order (newest first)
                                .filter(day => day < currentDay - 1);  // Exclude today and yesterday
                            
                            const hasOtherDays = availableDays.length > 0;
                            
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
                                    const yesterdayDay = currentDay - 1;
                                    const label = day === yesterdayDay ? `${day} (yesterday)` : `Day ${day}`;
                                    return h('option', { key: day, value: String(day) }, label);
                                })
                            ]);
                        })()
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

                const ridershipCell = self.createReactMetricCell(
                    'ridership',
                    row.ridership.toLocaleString(undefined, {maximumFractionDigits: 0}),
                    sortState,
                    groupState,
                    'performance'
                );

                const capacityCell = self.createReactMetricCell(
                    'capacity',
                    row.capacity.toLocaleString(undefined, {maximumFractionDigits: 0}),
                    sortState,
                    groupState,
                    'trains'
                );

                const utilizationClasses = self.getUtilizationClasses(row.utilization);
                const utilizationCell = h('td', {
                    key: 'utilization',
                    className: `px-3 py-2 align-middle text-right font-mono ${utilizationClasses} ${self.getCellClasses('utilization', sortState, groupState, 'performance')}`
                }, `${row.utilization}%`);

                const stationsCell = self.createReactMetricCell(
                    'stations',
                    row.stations.toString(),
                    sortState,
                    groupState,
                    'trains'
                );

                const trainColors = self.CONFIG.COLORS.TRAINS;
                const trainScheduleCell = h('td', {
                    key: 'trainSchedule',
                    className: `px-3 py-2 align-middle text-right font-mono ${self.getCellClasses('trainSchedule', sortState, groupState, 'trains')}`
                },
                    // h('span', { hey: 'tot'}, row.trainsHigh + row.trainsMedium + row.trainsLow),
                    // h('small', {hey: 'details'}, ' (' + row.trainsHigh + '-' + row.trainsMedium + '-' + row.trainsLow + ')')
                    h('span', { className: `font-bold` }, (row.trainsHigh + row.trainsMedium + row.trainsLow)),
                    ' (',
                    h('small', {hey: 'details'},
                        h('span', { className: `${trainColors.HIGH}` }, row.trainsHigh), '-',
                        h('span', { className: `${trainColors.MEDIUM}` }, row.trainsMedium), '-',
                        h('span', { className: `${trainColors.LOW}` }, row.trainsLow),
                    ),
                    ')',
                );

                const dailyCostCell = self.createReactCostCell(
                    'dailyCost',
                    `$${row.dailyCost.toLocaleString(undefined, {maximumFractionDigits: 0})}`,
                    sortState,
                    groupState,
                    'finance'
                );

                const dailyRevenueCell = self.createReactRevenueCell(
                    'dailyRevenue',
                    `$${row.dailyRevenue.toLocaleString(undefined, {maximumFractionDigits: 0})}`,
                    sortState,
                    groupState,
                    'finance'
                );

                const dailyProfitCell = self.createReactProfitCell(
                    'dailyProfit',
                    row.dailyProfit,
                    sortState,
                    groupState,
                    'finance'
                );

                const costPerPassengerCell = self.createReactMetricCell(
                    'costPerPassenger',
                    row.costPerPassenger > 0 
                        ? `$${row.costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                        : '$0.00',
                    sortState,
                    groupState,
                    'performance'
                );

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
                    dailyCostCell,
                    dailyRevenueCell,
                    dailyProfitCell,
                    costPerPassengerCell
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

    createReactCostCell(columnKey, content, sortState, groupState, group) {
        return this.createReactMetricCell(columnKey, content, sortState, groupState, group);
    },

    createReactRevenueCell(columnKey, content, sortState, groupState, group) {
        return this.createReactMetricCell(columnKey, content, sortState, groupState, group);
    },

    createReactProfitCell(columnKey, profitValue, sortState, groupState, group) {
        const isNegative = profitValue < 0;
        const absValue = Math.abs(profitValue);
        const formattedValue = isNegative 
            ? `-$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`
            : `$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;

        const valueColorClass = isNegative ? this.CONFIG.COLORS.VALUE.NEGATIVE : this.CONFIG.COLORS.VALUE.DEFAULT;

        return this.createReactMetricCell(columnKey, formattedValue, sortState, groupState, group, {
            valueColorClass
        });
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
        const costPerPassenger = ridership > 0 ? dailyCost / ridership : 0;
        const dailyProfit = dailyRevenue - dailyCost;

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
            costPerPassenger
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
            costPerPassenger: 0
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

    calculatePercentageChange(currentValue, baselineValue) {
        if (baselineValue === 0) return null;
        if (baselineValue < 0) {
            return ((currentValue - baselineValue) / Math.abs(baselineValue)) * 100;
        }
        return ((currentValue - baselineValue) / baselineValue) * 100;
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
            return '↓';
        }
        return sortState.order === 'desc' ? '↓' : '↑';
    }
};

AdvancedAnalytics.init();
window.AdvancedAnalytics = AdvancedAnalytics;
