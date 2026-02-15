// Configuration constants for Advanced Analytics
// Extracted from v4.5.2

export const CONFIG = {
    VERSION: '5.0.0-alpha',
    
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
        { key: 'capacity', label: 'Capacity', align: 'right', group: 'trains' },
        { key: 'utilization', label: 'Usage', align: 'right', group: 'performance', description: 'Based on ridership aganst potential capacity' },
        { key: 'stations', label: 'Stations', align: 'right', group: 'trains', description: 'Stations Number' },
        { key: 'trainType', label: 'Type', align: 'right', group: 'trains', description: 'Train Type' },
        { key: 'trainSchedule', label: 'Trains', small: '(H, M, L)', align: 'right', group: 'trains', description: 'Number of trains (High Demand, Medium Demand, Low Demand)' },
        { key: 'transfers', label: 'Transfers', align: 'right', group: 'trains' },
        { key: 'dailyCost', label: 'Cost', align: 'right', group: 'finance' },
        { key: 'dailyRevenue', label: 'Revenue', align: 'right', group: 'finance' },
        { key: 'dailyProfit', label: 'Profit', align: 'right', group: 'finance' },
        { key: 'profitPerPassenger', label: 'Profit/Pax', align: 'right', group: 'performance' },
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
