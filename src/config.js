// Configuration constants for Advanced Analytics

export const CONFIG = {
    VERSION: '0.9.2',
    
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
    
    // Demand phases with precise hour boundaries
    // Used for accurate cost calculation based on when trains actually ran
    DEMAND_PHASES: [
        { type: 'low', startHour: 0, endHour: 5 },      // midnight-5am (5h)
        { type: 'medium', startHour: 5, endHour: 6 },   // 5am-6am (1h)
        { type: 'high', startHour: 6, endHour: 9 },     // 6am-9am (3h)
        { type: 'medium', startHour: 9, endHour: 16 },  // 9am-4pm (7h)
        { type: 'high', startHour: 16, endHour: 19 },   // 4pm-7pm (3h)
        { type: 'medium', startHour: 19, endHour: 20 }, // 7pm-8pm (1h)
        { type: 'low', startHour: 20, endHour: 24 }     // 8pm-midnight (4h)
    ],
    
    TRANSFER_WALKING_TIME_THRESHOLD: 100,  // seconds
    
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
        { key: 'capacity', label: 'Throughput', align: 'right', group: 'trains', description: 'Daily Capacity: total passengers this route can carry in 24 hours.|Based on train frequency, car capacity, loop time, and demand schedule.|Higher values mean more room to grow ridership.' },
        { key: 'utilization', label: 'Usage', align: 'right', group: 'performance', description: 'Based on ridership against potential throughput' },
        { key: 'stations', label: 'Stops', align: 'right', group: 'trains' },
        { key: 'trainType', label: 'Type', align: 'right', group: 'trains', description: 'Train Type' },
        { key: 'trainSchedule', label: 'Trains', align: 'right', group: 'trains', description: 'Number of trains:|- High Demand |- Medium Demand |- Low Demand)' },
        { key: 'transfers', label: 'Transfers', align: 'right', group: 'trains', description: 'Direct transfers with other routes |Note: List direct transfers only, passengers may walk to further stations not listed here ' },
        { key: 'dailyCost', label: 'Cost', align: 'right', group: 'finance' },
        { key: 'dailyRevenue', label: 'Revenue', align: 'right', group: 'finance' },
        { key: 'dailyProfit', label: 'Profit', align: 'right', group: 'finance' },
        { key: 'profitPerPassenger', label: 'Profit/Pax', align: 'right', group: 'finance' },
        { key: 'profitPerTrain', label: 'Profit/Train', align: 'right', group: 'performance' }
    ]
};

// Initial state values
export const INITIAL_STATE = {
    sort: {
        column: 'ridership',
        order: 'desc'
    },
    
    groups: {
        trains: true,
        finance: true,
        performance: true
    },
    
    timeframe: 'last24h'
};
