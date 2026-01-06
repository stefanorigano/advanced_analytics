// Advanced Analytics Mod for Subway Builder v3.2.0
// State persistence with cache + storage API (survives panel drag/resize)


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
    
    // State cache (survives component remounts during drag/resize)
    StateCache: {
        sortState: null,
        groupState: null,
        isInitialized: false
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

            window.SubwayBuilderAPI.actions.setSpeedMultiplier('slow', 100);
        this.api.hooks.onGameInit(() => {
            console.log(`${this.CONFIG.LOG_PREFIX} Mod initialized`);
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

            // Load from storage ONCE per page load
            React.useEffect(() => {
                const initState = async () => {
                    if (!self.StateCache.isInitialized) {
                        try {
                            const storedSort = await api.storage.get('sortState', self.initialSortState);
                            const storedGroup = await api.storage.get('groupState', self.initialGroupState);
                            
                            self.StateCache.sortState = storedSort;
                            self.StateCache.groupState = storedGroup;
                            self.StateCache.isInitialized = true;
                            
                            setSortState(storedSort);
                            setGroupState(storedGroup);
                            
                            console.log(`${self.CONFIG.LOG_PREFIX} State loaded from storage`);
                        } catch (error) {
                            console.error(`${self.CONFIG.LOG_PREFIX} Failed to load state from storage:`, error);
                        }
                    }
                };
                initState();
            }, []);

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
                    const routes = api.gameState.getRoutes();
                    const trainTypes = api.trains.getTrainTypes();
                    const lineMetrics = api.gameState.getLineMetrics();
                    const timeWindowHours = api.gameState.getRidershipStats().timeWindowHours;

                    const processedData = [];

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
                            ...calculatedMetrics
                        });
                    });

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
                const interval = setInterval(updateData, self.CONFIG.REFRESH_INTERVAL);
                return () => clearInterval(interval);
            }, [sortState]); // FIXED: Only depend on sortState, not groupState

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
                api.storage.set('sortState', newState).catch(err => {
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
                api.storage.set('groupState', newState).catch(err => {
                    console.error(`${self.CONFIG.LOG_PREFIX} Failed to save groupState:`, err);
                });
            }, [groupState]);
            // };

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
                const nameCell = h('td', {
                    key: 'name',
                    className: `px-3 py-2 align-middle text-left cursor-pointer hover:text-primary transition-colors ${self.getCellClasses('name', sortState, groupState)}`,
                    onClick: () => {
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
                    h('div', { className: 'font-medium' }, row.name)
                );

                const ridershipCell = self.createReactMetricCell(
                    'ridership',
                    row.ridership.toLocaleString(undefined, {maximumFractionDigits: 0}),
                    null,
                    sortState,
                    groupState,
                    'performance'
                );

                const capacityCell = self.createReactMetricCell(
                    'capacity',
                    row.capacity.toLocaleString(undefined, {maximumFractionDigits: 0}),
                    null,
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
                    null,
                    sortState,
                    groupState,
                    'trains'
                );

                const trainColors = self.CONFIG.COLORS.TRAINS;
                const trainScheduleCell = h('td', {
                    key: 'trainSchedule',
                    className: `px-3 py-2 align-middle text-right font-mono ${self.getCellClasses('trainSchedule', sortState, groupState, 'trains')}`
                },
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
                    null,
                    sortState,
                    groupState,
                    'finance'
                );

                const dailyRevenueCell = self.createReactRevenueCell(
                    'dailyRevenue',
                    `$${row.dailyRevenue.toLocaleString(undefined, {maximumFractionDigits: 0})}`,
                    null,
                    sortState,
                    groupState,
                    'finance'
                );

                const dailyProfitCell = self.createReactProfitCell(
                    'dailyProfit',
                    row.dailyProfit,
                    null,
                    sortState,
                    groupState,
                    'finance'
                );

                const costPerPassengerCell = self.createReactMetricCell(
                    'costPerPassenger',
                    row.costPerPassenger > 0 
                        ? `$${row.costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                        : '$0.00',
                    null,
                    sortState,
                    groupState,
                    'performance'
                );

                return h('tr', {
                    key: row.id,
                    className: 'border-b border-border hover:bg-muted/50 transition-colors'
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

    createReactMetricCell(columnKey, content, percentageChange, sortState, groupState, group, options = {}) {
        const h = this.h;
        const {
            valueColorClass = this.CONFIG.COLORS.VALUE.DEFAULT,
            invertPercentageColors = false
        } = options;

        const percentColorClass = percentageChange > 0
            ? (invertPercentageColors ? this.CONFIG.COLORS.PERCENTAGE.POSITIVE : this.CONFIG.COLORS.PERCENTAGE.NEGATIVE)
            : (invertPercentageColors ? this.CONFIG.COLORS.PERCENTAGE.NEGATIVE : this.CONFIG.COLORS.PERCENTAGE.POSITIVE);

        return h('td', {
            key: columnKey,
            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, groupState, group)}`
        }, 
            h('div', { className: 'flex flex-col items-end gap-0.5' }, [
                h('div', { key: 'value', className: valueColorClass }, content),
                percentageChange !== null && h('div', {
                    key: 'percent',
                    className: `${this.CONFIG.STYLES.PERCENTAGE_FONT_SIZE} ${percentColorClass}`
                }, `${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(1)}%`)
            ])
        );
    },

    createReactCostCell(columnKey, content, percentageChange, sortState, groupState, group) {
        return this.createReactMetricCell(columnKey, content, percentageChange, sortState, groupState, group, {
            invertPercentageColors: false
        });
    },

    createReactRevenueCell(columnKey, content, percentageChange, sortState, groupState, group) {
        return this.createReactMetricCell(columnKey, content, percentageChange, sortState, groupState, group, {
            invertPercentageColors: true
        });
    },

    createReactProfitCell(columnKey, profitValue, percentageChange, sortState, groupState, group) {
        const isNegative = profitValue < 0;
        const absValue = Math.abs(profitValue);
        const formattedValue = isNegative 
            ? `-$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`
            : `$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;

        const valueColorClass = isNegative ? this.CONFIG.COLORS.VALUE.NEGATIVE : this.CONFIG.COLORS.VALUE.DEFAULT;

        return this.createReactMetricCell(columnKey, formattedValue, percentageChange, sortState, groupState, group, {
            valueColorClass,
            invertPercentageColors: true
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