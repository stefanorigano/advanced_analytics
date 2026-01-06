// Advanced Analytics Mod for Subway Builder v3.0
// Using addFloatingPanel API for React-powered updates

const AdvancedAnalytics = {
    // API References (cached on init)
    api: null,
    React: null,
    h: null,
    
    // States
    sortState: {
        column: 'ridership',
        order: 'desc'
    },
    groupState: {
        trains: false,
        finance: true,
        performance: true
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
        `;
        document.head.appendChild(style);
    },

    renderAnalyticsPanel() {
        // Use cached references instead of fetching again
        const api = this.api;
        const { React } = this;
        const h = this.h;

        const AnalyticsPanel = () => {
            const [tableData, setTableData] = React.useState([]);
            const [sortState, setSortState] = React.useState(this.sortState);
            const groupState = React.useState(this.groupState);

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

            React.useEffect(() => {
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

                        const metrics_calc = this.calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
                        
                        processedData.push({
                            id: route.id,
                            name: route.name || route.bullet,
                            ridership,
                            dailyRevenue,
                            ...metrics_calc
                        });
                    });

                    // Sort data
                    const column = sortState.column;
                    const order = sortState.order;

                    processedData.sort((a, b) => {
                        let aVal = a[column];
                        let bVal = b[column];

                        if (column === 'name') {
                            return order === 'desc' 
                                ? bVal.localeCompare(aVal)
                                : aVal.localeCompare(bVal);
                        }

                        return order === 'desc' ? bVal - aVal : aVal - bVal;
                    });

                    console.log(this.groupState)

                    setTableData(processedData);
                };

                // Always fetch data initially
                updateData();
                
                // Only set up auto-refresh if NOT in debug mode
                if (!this.debug) {
                    const interval = setInterval(() => {
                        // Only update if game is not paused
                        if (!api.gameState.isPaused()) {
                            updateData();
                        }
                    }, this.CONFIG.REFRESH_INTERVAL);
                    return () => clearInterval(interval);
                }
            }, [sortState, groupState]);

            const handleSort = (column) => {
                const newSortState = {
                    column,
                    order: sortState.column === column 
                        ? (sortState.order === 'desc' ? 'asc' : 'desc')
                        : 'desc'
                };
                this.sortState = newSortState;
                setSortState(newSortState);
            };

            return h('div', { 
                id: 'advanced-analytics',
                className: 'flex flex-col h-full overflow-hidden'
            }, [
                h('div', {
                    id: 'aa_toolbar',
                    className:'relative flex gap-2 py-2 px-3'}, [
                    this.buildReactTableToolbar(),
                    h('span', {
                            id: 'aa_toolbar_status',
                            className:'relative flex ml-auto',
                            style: {
                                width: '0.575rem',
                                height: '0.575rem'
                            }
                        }, [
                            h('span', {className:'absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75'}), 
                            h('span', {className:'relative inline-flex w-full rounded-full bg-green-600'}),
                        ]
                    )]
                ),
                h('div', { key: 'table-container', className: 'flex-1 overflow-auto'}, this.buildReactTable(tableData, sortState, handleSort))
            ]);
        };

        return h(AnalyticsPanel);
    },

    buildReactTableToolbar() {
        const api = window.SubwayBuilderAPI;
        const { React, icons, components } = api.utils;
        const { Button, Card, CardContent, Progress, Switch, Label, Input, Badge } = components;
        const { Settings, Play, Pause, Train, MapPin } = icons;  // 1000+ Lucide icons
        const h = React.createElement;  // Shorthand for building UI

        const btnClasses = 'bg-background/95 border border-border/50 rounded-lg flex gap-2 px-3 py-1.5 cursor-pointer hover:bg-secondary'

        return [
            h('label', {for:'aa_toolbar_toggle_train', className: btnClasses, title: 'Toggle Trains Matrics'}, [
                h('input', { id: 'aa_toolbar_toggle_train', type: 'checkbox', className:'', onChange: async (ev) => {this.groupState.trains = ev.target.checked}}),
                h(api.utils.icons.TramFront, { size: 18 }),
            ]),

            h('label', {for:'aa_toolbar_toggle_finance', className: btnClasses, title: 'Toggle Finance Matrics'}, [
                h('input', { id: 'aa_toolbar_toggle_finance', type: 'checkbox', className:'', onChange: (ev) => {this.groupState.finance = ev.target.checked;}}),
                h(api.utils.icons.DollarSign, { size: 18 }),
            ]),
            h('label', {for:'aa_toolbar_toggle_performance', className: btnClasses, title: 'Toggle Performance Matrics'}, [
                h('input', { id: 'aa_toolbar_toggle_performance', type: 'checkbox', className:'', onChange: async (ev) => {this.groupState.performance = ev.target.checked}}),
                h(api.utils.icons.Activity, { size: 18 }),
            ])
        ];
    },


    buildReactTable(data, sortState, handleSort) {
        const api = window.SubwayBuilderAPI;
        const { React, components } = api.utils;
        const { Button, Card, CardContent, Progress, Switch, Label, Input, Badge } = components;
        const h = React.createElement;

        return h('table', { className: 'w-full text-sm border-collapse' }, [
            h('thead', { key: 'thead', className: 'z-10 relative' }, 
                h('tr', { className: 'top-0 border-b bg-primary-foreground/60 backdrop-blur-sm' },
                    this.CONFIG.TABLE_HEADERS.map(header => 
                        h('th', {
                            key: header.key,
                            className: `h-12 px-3 text-${header.align} align-middle font-medium whitespace-nowrap cursor-pointer transition-colors ${this.getHeaderClasses(header.key, sortState, header.group)}`,
                            onClick: () => handleSort(header.key)
                        }, [
                            h('span', { 
                                key: 'indicator',
                                className: sortState.column !== header.key ? 'opacity-0' : '' 
                            }, this.getSortIndicator(header.key, sortState)),
                            ' ' + header.label,
                            h('small', { className: !header.small? 'hidden': ''}, ' ' + header.small) 
                        ])
                    )
                )
            ),
            h('tbody', { key: 'tbody', className: 'z-0' },
                data.map((row, rowIndex) => {
                    let baselineRow = null;
                    if (['dailyCost', 'dailyRevenue', 'dailyProfit', 'costPerPassenger'].includes(sortState.column)) {
                        const valueKey = sortState.column;
                        // For profit, we need the first row (regardless of sign), for others we need first positive value
                        if (sortState.column === 'dailyProfit') {
                            baselineRow = data[0]; // First row in sorted order
                        } else {
                            baselineRow = data.find(r => r[valueKey] > 0);
                        }
                    }
                    const showCostPercentage = baselineRow && rowIndex > 0;

                    return h('tr', {
                        key: row.id,
                        className: 'border-b transition-colors hover:bg-background/50'
                    }, [
                        h('td', {
                            key: 'name',
                            className: `px-3 py-2 align-middle text-right w-0 font-medium bg-primary-foreground/60 backdrop-blur-sm ${this.getCellClasses('name', sortState)}`
                        }, row.name),
                        
                        h('td', {
                            key: 'ridership',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('ridership', sortState, 'performance')}`
                        }, row.ridership.toLocaleString()),
                        
                        h('td', {
                            key: 'capacity',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('capacity', sortState, 'trains')}`
                        }, row.capacity > 0 ? row.capacity.toLocaleString() : 'N/A'),
                        
                        h('td', {
                            key: 'utilization',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('utilization', sortState, 'performance')} ${row.utilization > 0 ? this.getUtilizationClasses(row.utilization) : ''}`
                        }, row.utilization > 0 ? '∿' + row.utilization + '%' : 'N/A'),
                        
                        h('td', {
                            key: 'stations',
                            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses('stations', sortState, 'trains')}`
                        }, row.stations > 0 ? row.stations : 'N/A'),

                        this.createTrainScheduleCell(row, sortState, 'trains'),

                
                        this.createReactCostCell(
                            'dailyCost',
                            row.dailyCost > 0 ? '$' + row.dailyCost.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A',
                            showCostPercentage && row.dailyCost > 0 && sortState.column === 'dailyCost' 
                                ? this.calculatePercentageChange(row.dailyCost, baselineRow.dailyCost) 
                                : null,
                            sortState,
                            'finance'
                        ),

                        this.createReactRevenueCell(
                            'dailyRevenue',
                            row.dailyRevenue > 0 ? '$' + row.dailyRevenue.toLocaleString(undefined, {maximumFractionDigits: 0}) : 'N/A',
                            showCostPercentage && row.dailyRevenue > 0 && sortState.column === 'dailyRevenue' 
                                ? this.calculatePercentageChange(row.dailyRevenue, baselineRow.dailyRevenue) 
                                : null,
                            sortState,
                            'finance'
                        ),

                        this.createReactProfitCell(
                            'dailyProfit',
                            row.dailyProfit,
                            showCostPercentage && sortState.column === 'dailyProfit' 
                                ? this.calculatePercentageChange(row.dailyProfit, baselineRow.dailyProfit) 
                                : null,
                            sortState,
                            'finance'
                        ),
                        
                        this.createReactCostCell(
                            'costPerPassenger',
                            row.costPerPassenger > 0 ? '$' + row.costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A',
                            showCostPercentage && row.costPerPassenger > 0 && sortState.column === 'costPerPassenger'
                                ? this.calculatePercentageChange(row.costPerPassenger, baselineRow.costPerPassenger)
                                : null,
                            sortState,
                            'performance'
                        )
                    ]);
                })
            )
        ]);
    },

    createTrainScheduleCell(row, sortState, group) {
        const h = this.h;
        const colors = this.CONFIG.COLORS.TRAINS;

        return h('td', {
            key: 'trainSchedule',
            className: `px-3 py-2 align-middle text-center font-mono whitespace-nowrap ${this.getCellClasses('trainSchedule', sortState, group)}`
        }, [
            h('span', { className: `font-bold` }, (row.trainsHigh + row.trainsMedium + row.trainsLow)),
            ' (',
            h('span', { className: `${colors.HIGH} font-bold` }, 'H'), `:${row.trainsHigh}`,
            ', ',
            h('span', { className: `${colors.MEDIUM} font-bold` }, 'M'), `:${row.trainsMedium}`,
            ', ',
            h('span', { className: `${colors.LOW} font-bold` }, 'L'), `:${row.trainsLow})`
        ]);
    },

    createReactMetricCell(columnKey, content, percentageChange, sortState, group, options = {}) {
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
            className: `px-3 py-2 align-middle text-right font-mono ${this.getCellClasses(columnKey, sortState, group)}`
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

    createReactCostCell(columnKey, content, percentageChange, sortState, group) {
        console.log(columnKey, group)
        return this.createReactMetricCell(columnKey, content, percentageChange, sortState, group, {
            invertPercentageColors: false
        });
    },

    createReactRevenueCell(columnKey, content, percentageChange, sortState, group) {
        return this.createReactMetricCell(columnKey, content, percentageChange, sortState, group, {
            invertPercentageColors: true
        });
    },

    createReactProfitCell(columnKey, profitValue, percentageChange, sortState, group) {
        const isNegative = profitValue < 0;
        const absValue = Math.abs(profitValue);
        const formattedValue = isNegative 
            ? `-$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`
            : `$${absValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;

        const valueColorClass = isNegative ? this.CONFIG.COLORS.VALUE.NEGATIVE : this.CONFIG.COLORS.VALUE.DEFAULT;

        return this.createReactMetricCell(columnKey, formattedValue, percentageChange, sortState, group, {
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
            // Individual values for rendering
            trainsLow: trainCounts.low,
            trainsMedium: trainCounts.medium,
            trainsHigh: trainCounts.high,
            // Mapped 'trainSchedule' to High trains for sorting purposes
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

    getHeaderClasses(column, sortState, group) {
        if (group && group in this.groupState) {
            if (this.groupState[group] === false) {
                return 'hidden';
            }
        }
        if (sortState.column === column) {
            return 'text-foreground bg-background/80';
        } else if (column === 'name') {
            return 'bg-background/50 backdrop-blur-sm';
        }
        return 'text-muted-foreground hover:text-foreground';
    },

    getCellClasses(column, sortState, group) {
        if (group && group in this.groupState) {
            if (this.groupState[group] === false) {
                return 'hidden';
            }
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