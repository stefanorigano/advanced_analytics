// Advanced Analytics Mod for Subway Builder
// Enhances Route Ridership panel with additional metrics

const AdvancedAnalytics = {
    observer: null,
    updateInterval: null,
    sortState: {
        column: 'ridership',
        order: 'desc'
    },
    debug: true, // Set to false to enable auto-refresh

    // Configuration constants
    CONFIG: {
        UTILIZATION_THRESHOLDS: {
            CRITICAL_LOW: 30,
            CRITICAL_HIGH: 95,
            WARNING_LOW: 45,
            WARNING_HIGH: 85
        },
        REFRESH_INTERVAL: 1000,
        LOG_PREFIX: '[Advanced Analytics]',
        COST_MULTIPLIER: 365,
        DEMAND_HOURS: {
            low: 9,      // midnight-5am (5h) + 8pm-midnight (4h)
            medium: 9,   // 5am-6am (1h) + 9am-4pm (7h) + 7pm-8pm (1h)
            high: 6      // 6am-9am (3h) + 4pm-7pm (3h)
        },
        SELECTORS: {
            PANEL_WRAPPER: '.flex.bg-primary-foreground\\/60',
            TITLE: '.text-base.font-medium',
            CONTENT: '.flex.flex-col.gap-2.w-full.h-full',
            ROUTE_LIST: '.flex.flex-col.gap-1'
        },
        TABLE_HEADERS: [
            { key: 'badge', label: 'Route', align: 'left' },
            { key: 'ridership', label: 'Ridership', align: 'right' },
            { key: 'capacity', label: 'Capacity', align: 'right' },
            { key: 'utilization', label: 'Use', align: 'right' },
            { key: 'stations', label: 'Stations', align: 'right' },
            { key: 'dailyCost', label: 'Cost', align: 'right' },
            { key: 'costPerPassenger', label: 'Cost/Pax', align: 'right' }
        ]
    },

    init() {        
        if (!window.SubwayBuilderAPI) {
            console.error(`${this.CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
            return;
        }

        window.SubwayBuilderAPI.hooks.onGameInit(() => {
            console.log(`${this.CONFIG.LOG_PREFIX} Mod initialized, starting panel watch...`);
            this.injectStyles();
            this.watchForPanel();
        });
    },

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            html.dark .aa-wrapper {
                color-scheme: dark;
            }
            .aa-badge-container > div {

     
            }
        `;
        document.head.appendChild(style);
    },

    watchForPanel() {
        this.observer = new MutationObserver(() => {
            const titleEls = document.querySelectorAll(this.CONFIG.SELECTORS.TITLE);
            
            const titleEl = Array.from(titleEls)
                .find(el => el.textContent.includes('Route Ridership') || 
                           el.textContent.includes('Route ridership'));
            
            if (titleEl && !titleEl.hasAttribute('data-aa-processed')) {
                console.log(`${this.CONFIG.LOG_PREFIX} Route Ridership panel detected`);
                titleEl.setAttribute('data-aa-processed', 'true');
                this.enhancePanel(titleEl);
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    },

    enhancePanel(titleEl) {
        console.log(`${this.CONFIG.LOG_PREFIX} Enhancing panel...`);

        const wrapperEl = titleEl.closest(this.CONFIG.SELECTORS.PANEL_WRAPPER);
        if (!wrapperEl) {
            console.error(`${this.CONFIG.LOG_PREFIX} Could not find panel wrapper`);
            return;
        }

        const existingContentEl = wrapperEl.querySelector(this.CONFIG.SELECTORS.CONTENT);
        if (!existingContentEl) {
            console.error(`${this.CONFIG.LOG_PREFIX} Could not find existing content`);
            return;
        }

        wrapperEl.classList.remove('p-2');
        wrapperEl.classList.add('aa-wrapper');

        // Add identifying class for navigation detection
        existingContentEl.classList.add('aa-sb-content');

        // Click "Show more" button if it exists to reveal all routes
        const showMoreButtonEl = existingContentEl.querySelector('button');
        if (showMoreButtonEl && showMoreButtonEl.textContent.includes('Show')) {
            console.log(`${this.CONFIG.LOG_PREFIX} Clicking "Show more" button`);
            showMoreButtonEl.click();
        }

        // Hide the existing content but keep it in DOM for data extraction and click forwarding
        existingContentEl.classList.add('absolute', 'pointer-events-none', 'opacity-0', 'z-0', 'overflow-hidden');

        // Create table container with higher z-index
        const tableContainerEl = document.createElement('section');
        tableContainerEl.className = 'aa-table-container w-full max-w-5xl z-20 relative';
        wrapperEl.appendChild(tableContainerEl);

        // Initial render
        this.renderTable(tableContainerEl, existingContentEl);

        // Update table every second (only if not in debug mode)
        if (!this.debug) {
            this.updateInterval = setInterval(() => {
                this.renderTable(tableContainerEl, existingContentEl);
            }, this.CONFIG.REFRESH_INTERVAL);
            console.log(`${this.CONFIG.LOG_PREFIX} Auto-refresh enabled (every ${this.CONFIG.REFRESH_INTERVAL}ms)`);
        } else {
            console.log(`${this.CONFIG.LOG_PREFIX} Debug mode: auto-refresh disabled`);
        }

        // Watch for navigation
        this.watchForNavigation(wrapperEl, existingContentEl, tableContainerEl);
    },

    watchForNavigation(wrapperEl, existingContentEl, tableContainerEl) {
        const navigationObserver = new MutationObserver(() => {
            const sbContentEl = wrapperEl.querySelector('.aa-sb-content');
            
            if (!sbContentEl) {
                console.log(`${this.CONFIG.LOG_PREFIX} Navigation detected, cleaning up...`);
                
                if (this.updateInterval) {
                    clearInterval(this.updateInterval);
                    this.updateInterval = null;
                }
                
                if (tableContainerEl && tableContainerEl.parentElement) {
                    tableContainerEl.remove();
                }
                
                navigationObserver.disconnect();
                
                const processedTitleEl = document.querySelector('[data-aa-processed="true"]');
                if (processedTitleEl) {
                    processedTitleEl.removeAttribute('data-aa-processed');
                }
                wrapperEl.classList.add('p-2');
                wrapperEl.classList.remove('aa-wrapper');
                
                console.log(`${this.CONFIG.LOG_PREFIX} Cleanup complete, ready to re-enhance on return`);
            }
        });

        navigationObserver.observe(wrapperEl, {
            childList: true,
            subtree: false
        });
    },

    getUtilizationClasses(utilization) {
        const thresholds = this.CONFIG.UTILIZATION_THRESHOLDS;
        
        if (utilization < thresholds.CRITICAL_LOW || utilization > thresholds.CRITICAL_HIGH) {
            return 'text-red-600 dark:text-red-400';
        } else if ((utilization >= thresholds.CRITICAL_LOW && utilization < thresholds.WARNING_LOW) || 
                   (utilization >= thresholds.WARNING_HIGH && utilization <= thresholds.CRITICAL_HIGH)) {
            return 'text-yellow-600 dark:text-yellow-400';
        } else {
            return 'text-green-600 dark:text-green-400';
        }
    },

    validateRouteData(route) {
        if (!route || !route.trainSchedule) {
            console.warn(`${this.CONFIG.LOG_PREFIX} Invalid route data:`, route);
            return false;
        }
        return true;
    },

    getEmptyMetrics() {
        return {
            capacity: 0,
            utilization: 0,
            stations: 0,
            dailyCost: 0,
            costPerPassenger: 0
        };
    },

    renderTable(containerEl, sourceEl) {
        const routeListEl = sourceEl.querySelector(this.CONFIG.SELECTORS.ROUTE_LIST);
        if (!routeListEl) {
            console.warn(`${this.CONFIG.LOG_PREFIX} Route list not found during render`);
            return;
        }

        // Get all route entries (excluding the "Show more" button)
        const routeEntryEls = Array.from(routeListEl.children).filter(
            child => child.classList.contains('flex') && 
                     child.classList.contains('items-center') &&
                     child.classList.contains('bg-transparent')
        );

        console.log(`${this.CONFIG.LOG_PREFIX} Found ${routeEntryEls.length} route entries to process`);

        // Get route data and train types from API
        const routes = window.SubwayBuilderAPI.gameState.getRoutes();
        const trainTypes = window.SubwayBuilderAPI.trains.getTrainTypes();

        // Debug: Log the first route and train type to see structure
        if (routes.length > 0) {
            console.log(`${this.CONFIG.LOG_PREFIX} Sample route:`, routes[0]);
            console.log(`${this.CONFIG.LOG_PREFIX} Route keys:`, Object.keys(routes[0]));
        }
        if (Object.keys(trainTypes).length > 0) {
            const firstTrainType = Object.values(trainTypes)[0];
            console.log(`${this.CONFIG.LOG_PREFIX} Sample train type:`, firstTrainType);
            console.log(`${this.CONFIG.LOG_PREFIX} Train type keys:`, Object.keys(firstTrainType));
        }

        // Process each route entry
        const tableData = [];
        
        routeEntryEls.forEach(entryEl => {
            // Extract bullet identifier from badge
            // The badge structure is: div (container) > div (clickable badge with styles)
            const badgeContainerEl = entryEl.querySelector('div[style*="height: 1rem"]');
            if (!badgeContainerEl) {
                console.warn(`${this.CONFIG.LOG_PREFIX} Could not find badge container in entry`);
                return;
            }
            
            const badgeEl = badgeContainerEl.querySelector('.cursor-pointer, [class*="clip-path"]');
            if (!badgeEl) {
                console.warn(`${this.CONFIG.LOG_PREFIX} Could not find badge element in container`);
                return;
            }
            
            const bulletTextEl = badgeEl.querySelector('span');
            if (!bulletTextEl) {
                console.warn(`${this.CONFIG.LOG_PREFIX} Could not find bullet text in badge`);
                return;
            }
            
            const bullet = bulletTextEl.textContent.trim();
            
            // Clone badge for our table (visual only)
            const clonedBadgeEl = badgeEl.cloneNode(true);
            
            // Extract ridership from the DOM
            const ridershipEl = entryEl.querySelector('p.text-xs.ml-auto.font-mono');
            const ridership = ridershipEl ? parseInt(ridershipEl.textContent.replace(/,/g, '')) : 0;
            
            // Find matching route data from API
            const route = routes.find(r => r.bullet === bullet);
            
            if (!route) {
                console.warn(`${this.CONFIG.LOG_PREFIX} Could not find route data for bullet: ${bullet}`);
                return;
            }

            // Log the actual route structure for first route only
            if (tableData.length === 0) {
                console.log(`${this.CONFIG.LOG_PREFIX} Sample route structure for ${bullet}:`, route);
                console.log(`${this.CONFIG.LOG_PREFIX} Available train types:`, Object.keys(trainTypes));
            }

            // Validate route data
            if (!this.validateRouteData(route)) {
                tableData.push({
                    bullet,
                    badgeEl: clonedBadgeEl,
                    originalEntryEl: entryEl,
                    ridership,
                    ...this.getEmptyMetrics()
                });
                return;
            }
            
            // Get train type
            const trainType = trainTypes[route.trainType];
            if (!trainType) {
                console.warn(`${this.CONFIG.LOG_PREFIX} Could not find train type for route: ${bullet}, trainType ID: ${route.trainType}`);
                tableData.push({
                    bullet,
                    badgeEl: clonedBadgeEl,
                    originalEntryEl: entryEl,
                    ridership,
                    ...this.getEmptyMetrics()
                });
                return;
            }

            // Log trainType structure for first route only
            if (tableData.length === 0) {
                console.log(`${this.CONFIG.LOG_PREFIX} Sample trainType structure for ${route.trainType}:`, trainType);
            }
            
            // Get cars per train from route, or fallback to train type default
            const carsPerTrain = route.carsPerTrain !== undefined 
                ? route.carsPerTrain 
                : trainType.stats.carsPerCarSet;
            
            const capacityPerCar = trainType.stats.capacityPerCar;
            const capacityPerTrain = carsPerTrain * capacityPerCar;
            
            // Get train counts from schedule
            const schedule = route.trainSchedule;
            const trainCounts = {
                high: schedule?.highDemand || 0,
                medium: schedule?.mediumDemand || 0,
                low: schedule?.lowDemand || 0
            };
            
            let capacity = 0;
            let utilization = 0;
            let dailyCost = 0;
            
            // Calculate loop time and capacity from stComboTimings
            if (route.stComboTimings && route.stComboTimings.length > 0) {
                const timings = route.stComboTimings;
                const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
                
                if (loopTimeSeconds > 0) {
                    const loopsPerHour = 3600 / loopTimeSeconds;
                    
                    // Calculate capacity for each demand period
                    const highCapacity = trainCounts.high * this.CONFIG.DEMAND_HOURS.high * loopsPerHour * capacityPerTrain;
                    const mediumCapacity = trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain;
                    const lowCapacity = trainCounts.low * this.CONFIG.DEMAND_HOURS.low * loopsPerHour * capacityPerTrain;
                    
                    capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);
                    
                    // Calculate utilization
                    if (capacity > 0) {
                        utilization = Math.round((ridership / capacity) * 100);
                    }
                    
                    // Calculate daily operating cost
                    const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                    const carCostPerHour = trainType.stats.carOperationalCostPerHour * this.CONFIG.COST_MULTIPLIER;
                    const costPerTrainPerHour = trainCostPerHour + (carsPerTrain * carCostPerHour);
                    
                    dailyCost = (trainCounts.low * this.CONFIG.DEMAND_HOURS.low * costPerTrainPerHour) +
                                (trainCounts.medium * this.CONFIG.DEMAND_HOURS.medium * costPerTrainPerHour) +
                                (trainCounts.high * this.CONFIG.DEMAND_HOURS.high * costPerTrainPerHour);
                    
                    // Log calculation for first route
                    if (tableData.length === 0) {
                        console.log(`${this.CONFIG.LOG_PREFIX} Calculations for ${bullet}:`, {
                            carsPerTrain,
                            capacityPerCar,
                            capacityPerTrain,
                            loopTimeSeconds,
                            loopsPerHour,
                            trainCounts,
                            capacity,
                            utilization,
                            dailyCost
                        });
                    }
                }
            }
            
            // Get station count
            const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;
            
            // Calculate cost per passenger
            const costPerPassenger = ridership > 0 ? dailyCost / ridership : 0;
            
            tableData.push({
                bullet,
                badgeEl: clonedBadgeEl,
                originalEntryEl: entryEl,  // Store original entry for click forwarding
                ridership,
                capacity,
                utilization,
                stations,
                dailyCost,
                costPerPassenger
            });
        });
        
        // Sort data
        this.sortTableData(tableData);
        
        // Build table
        const tableEl = document.createElement('table');
        tableEl.className = 'w-full caption-bottom text-sm border-collapse';
        
        // Build thead
        const theadEl = document.createElement('thead');
        theadEl.className = '[&_tr]:border-b';
        
        const headerRowEl = document.createElement('tr');
        headerRowEl.className = 'border-b';
        
        this.CONFIG.TABLE_HEADERS.forEach(header => {
            const thEl = document.createElement('th');
            thEl.className = `border-1 border-s border h-12 px-3 text-${header.align} align-middle font-medium whitespace-nowrap cursor-pointer ${this.getHeaderClasses(header.key)}`;
            thEl.setAttribute('data-sort', header.key);
            thEl.innerHTML = `<span class="${!this.isColumnSorting(header.key) ? 'opacity-0': ''}">${this.getSortIndicator(header.key)}</span> ${header.label}`;
            
            thEl.onclick = () => {
                // Toggle order if clicking same column, otherwise default to desc
                if (this.sortState.column === header.key) {
                    this.sortState.order = this.sortState.order === 'desc' ? 'asc' : 'desc';
                } else {
                    this.sortState.column = header.key;
                    this.sortState.order = 'desc';
                }
                
                this.renderTable(containerEl, sourceEl);
            };
            
            headerRowEl.appendChild(thEl);
        });
        
        theadEl.appendChild(headerRowEl);
        tableEl.appendChild(theadEl);
        
        // Build tbody
        const tbodyEl = document.createElement('tbody');
        tbodyEl.className = '[&_tr:last-child]:border-0';
        
        tableData.forEach((row, rowIndex) => {
            const trEl = document.createElement('tr');
            trEl.className = 'border-b transition-colors hover:bg-muted/50';
            
            // Badge column
            const badgeTdEl = document.createElement('td');
            badgeTdEl.className = `py-2 px-3 align-middle font-medium ${this.getCellClasses('badge')}`;
            const badgeContainerEl = document.createElement('div');
            badgeContainerEl.style.height = '1rem';
            badgeContainerEl.style.maxHeight = '1rem';
            badgeContainerEl.className = 'aa-badge-container flex justify-end cursor-pointer';
            
            if (row.badgeEl) {
                badgeContainerEl.appendChild(row.badgeEl);
                
                // Forward clicks to the actual clickable element inside the original badge
                badgeContainerEl.onclick = (e) => {
                    e.stopPropagation();
                    
                    // The badge element itself is the clickable element
                    // Find it in the original entry element
                    const originalBadgeContainerEl = row.originalEntryEl?.querySelector('div[style*="height: 1rem"]');
                    const originalClickableEl = originalBadgeContainerEl?.querySelector('.cursor-pointer, [class*="clip-path"]');
                    
                    if (originalClickableEl) {
                        console.log(`${this.CONFIG.LOG_PREFIX} Forwarding click to clickable element for: ${row.bullet}`);
                        originalClickableEl.click();
                    } else {
                        console.warn(`${this.CONFIG.LOG_PREFIX} Could not find clickable element for: ${row.bullet}`);
                    }
                };
            }
            badgeTdEl.appendChild(badgeContainerEl);
            trEl.appendChild(badgeTdEl);
            
            // Ridership column
            trEl.appendChild(this.createNumericCell('ridership', row.ridership.toLocaleString()));
            
            // Capacity column
            trEl.appendChild(this.createNumericCell('capacity', 
                row.capacity > 0 ? row.capacity.toLocaleString() : 'N/A'));
            
            // Utilization column (with conditional colors)
            const utilizationClasses = row.utilization > 0 ? this.getUtilizationClasses(row.utilization) : '';
            const utilizationContent = row.utilization > 0 ? '∿' + row.utilization + '%' : 'N/A';
            trEl.appendChild(this.createNumericCell('utilization', utilizationContent, utilizationClasses));
            
            // Stations column
            trEl.appendChild(this.createNumericCell('stations', 
                row.stations > 0 ? row.stations : 'N/A'));
            
            // Daily cost column
            const costContent = row.dailyCost > 0 
                ? '$' + row.dailyCost.toLocaleString(undefined, {maximumFractionDigits: 0}) 
                : 'N/A';
            trEl.appendChild(this.createNumericCell('dailyCost', costContent));
            
            // Cost per passenger column
            const costPerPaxContent = row.costPerPassenger > 0 
                ? '$' + row.costPerPassenger.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) 
                : 'N/A';
            trEl.appendChild(this.createNumericCell('costPerPassenger', costPerPaxContent));
            
            tbodyEl.appendChild(trEl);
        });
        
        tableEl.appendChild(tbodyEl);
        
        // Clear container and append table
        containerEl.innerHTML = '';
        containerEl.appendChild(tableEl);
    },

    createNumericCell(columnKey, content, additionalClasses = '') {
        const tdEl = document.createElement('td');
        tdEl.className = `border-1 border-s border px-3 align-middle text-right font-mono ${this.getCellClasses(columnKey)} ${additionalClasses}`;
        tdEl.textContent = content;
        return tdEl;
    },

    getHeaderClasses(column) {
        if (this.sortState.column === column) {
            return 'text-foreground bg-muted/50';
        }
        return 'text-muted-foreground hover:text-foreground';
    },

    getCellClasses(column) {
        if (this.sortState.column === column) {
            return 'bg-muted/50';
        }
        return '';
    },

    sortTableData(data) {
        const column = this.sortState.column;
        const order = this.sortState.order;
        
        data.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];
            
            // Handle string sorting for badge/bullet
            if (column === 'badge' || column === 'bullet') {
                aVal = a.bullet;
                bVal = b.bullet;
                return order === 'desc' 
                    ? bVal.localeCompare(aVal)
                    : aVal.localeCompare(bVal);
            }
            
            // Numeric sorting
            if (order === 'desc') {
                return bVal - aVal;
            } else {
                return aVal - bVal;
            }
        });
    },

    isColumnSorting(column) {
        return this.sortState.column === column;
    },

    getSortIndicator(column) {
        if (!this.isColumnSorting(column)) {
            return '↓';
        }
        return this.sortState.order === 'desc' ? '↓' : '↑';
    },

    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
};

// Initialize mod
AdvancedAnalytics.init();

// Expose to window for debugging
window.AdvancedAnalytics = AdvancedAnalytics;