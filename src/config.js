// Configuration constants for Advanced Analytics
// __MOD_VERSION__ is injected at build time by esbuild from package.json.
// To bump the version, edit "version" in package.json only.

export const CONFIG = {
    VERSION: __MOD_VERSION__,
    
    EFFICIENCY_THRESHOLDS: {
        CRITICAL_LOW: 0.15,
        WARNING_LOW: 0.30,
    },

    LOAD_FACTOR_THRESHOLDS: {
        CRITICAL_LOW:  20,
        WARNING_LOW:   40,
        WARNING_HIGH:  80,
        CRITICAL_HIGH: 95,
    },
    
    REFRESH_INTERVAL: 1000,
    LOG_PREFIX: '[AA]',
    COST_MULTIPLIER: 365,
    
    // Demand tiers — single source of truth for the 4-tier model.
    // Ordered highest → lowest demand (also the UI display order).
    // `scheduleField` is the property name on the game's route.trainSchedule.
    TIERS: [
        { key: 'high',    scheduleField: 'highDemand',    label: 'High',     color: 'text-red-600 dark:text-red-400',      icon: 'Briefcase' },
        { key: 'medium',  scheduleField: 'mediumDemand',  label: 'Medium',   color: 'text-orange-500 dark:text-orange-400', icon: 'Sun' },
        { key: 'low',     scheduleField: 'lowDemand',     label: 'Low',      color: 'text-green-600 dark:text-green-400',   icon: 'Moon' },
        { key: 'veryLow', scheduleField: 'veryLowDemand', label: 'Very Low', color: 'text-blue-600 dark:text-blue-400',     icon: 'MoonStar' },
    ],

    DEMAND_HOURS: {
        high:    6,   // 7am-10am (3h) + 4pm-7pm (3h)
        medium:  8,   // 6am-7am (1h) + 10am-4pm (6h) + 7pm-8pm (1h)
        low:     6,   // 3am-6am (3h) + 8pm-11pm (3h)
        veryLow: 4,   // midnight-3am (3h) + 11pm-midnight (1h)
    },

    // Demand phases with precise hour boundaries.
    // Authoritative hard-coded mapping of hour-of-day → demand tier; used for
    // accurate cost calculation based on when trains actually ran, and for the
    // current-phase label. Keep in sync with DEMAND_HOURS above.
    DEMAND_PHASES: [
        { type: 'veryLow', startHour: 0,  endHour: 3,  name: 'Late Night' },
        { type: 'low',     startHour: 3,  endHour: 6,  name: 'Early Morning' },
        { type: 'medium',  startHour: 6,  endHour: 7,  name: 'Early Rush' },
        { type: 'high',    startHour: 7,  endHour: 10, name: 'Morning Rush' },
        { type: 'medium',  startHour: 10, endHour: 16, name: 'Midday' },
        { type: 'high',    startHour: 16, endHour: 19, name: 'Evening Rush' },
        { type: 'medium',  startHour: 19, endHour: 20, name: 'Late Evening' },
        { type: 'low',     startHour: 20, endHour: 23, name: 'Night' },
        { type: 'veryLow', startHour: 23, endHour: 24, name: 'Late Night' },
    ],

    HEADWAY_THRESHOLDS: {
        REGULAR:   0.1,   // CV < 0.1  → evenly spaced
        IRREGULAR: 0.25,  // CV < 0.25 → some bunching
    },

    SCHEDULE_DRIFT_THRESHOLDS: {
        GOOD:    30,   // < 30 s  → on schedule
        WARNING: 120,  // < 120 s → moderate drift
    },

    ADHERENCE_THRESHOLDS: {
        EARLY_SEC:    5,   // early  if delaySec < -EARLY_SEC
        ON_TIME_SEC: 30,   // on-time upper bound  (-EARLY_SEC … ON_TIME_SEC]
        WARNING_SEC: 60,   // slightly-late upper bound; late above
    },

    TRANSFER_WALKING_TIME_THRESHOLD: 100,  // seconds
    
    COLORS: {
        TEXT: {
            SUCCESS: 'text-green-600 dark:text-green-400',
            WARNING: 'text-orange-500 dark:text-orange-400',
            DANGER: 'text-red-600 dark:text-red-400',
        },
        // Train Schedule Colors (Labels only)
        TRAINS: {
            HIGH: 'text-red-600 dark:text-red-400',
            MEDIUM: 'text-orange-500 dark:text-orange-400',
            LOW: 'text-green-600 dark:text-green-400',
            VERY_LOW: 'text-blue-600 dark:text-blue-400'
        },
        
        // Efficiency status colors
        EFFICIENCY: {
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
        
        // Headway regularity colors
        HEADWAY: {
            REGULAR:   'text-green-600 dark:text-green-400',
            IRREGULAR: 'text-yellow-600 dark:text-yellow-400',
            BUNCHING:  'text-red-600 dark:text-red-400',
        },

        // Schedule drift colors
        DRIFT: {
            GOOD:     'text-green-600 dark:text-green-400',
            WARNING:  'text-yellow-600 dark:text-yellow-400',
            CRITICAL: 'text-red-600 dark:text-red-400',
        },

        // Adherence / delay status colors (text classes; used in heatmap + charts)
        ADHERENCE: {
            EARLY:         'text-blue-400',
            ON_TIME:       'text-green-500',
            SLIGHTLY_LATE: 'text-orange-400',
            LATE:          'text-red-500',
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
        { key: 'capacity', label: 'Throughput', align: 'right', group: 'trains', description: 'Daily Capacity: one-directional passenger capacity over 24 hours' },
        { key: 'loadFactor', label: 'Load Factor', align: 'right', group: 'performance', description: 'Peak segment load ÷ train capacity|How full trains are at their busiest point on average|Time-averaged: short rush-hour spikes may not be reflected|Values above 100% indicate sustained overcrowding|For real-time overloads check the game Capacity Warnings' },
        { key: 'efficiency', label: 'Performance', align: 'right', group: 'performance', description: 'Ridership ÷ bidirectional throughput capacity|1.0× = all seats filled end-to-end once|Above 1.0× = high turnover (good — not overcrowding)|Below 1.0× = unused capacity' },
        { key: 'stations', label: 'Stops', align: 'right', group: 'trains' },
        { key: 'trainType', label: 'Type', align: 'right', group: 'trains', description: 'Train Type' },
        { key: 'trainSchedule', label: 'Trains', align: 'right', group: 'trains', description: 'Number of trains:|- High Demand |- Medium Demand |- Low Demand |- Very Low Demand' },
        { key: 'transfers', label: 'Transfers', align: 'right', group: 'trains', description: 'Direct transfers with other routes |Note: List direct transfers only, passengers may walk to further stations not listed here ' },
        { key: 'dailyCost', label: 'Cost', align: 'right', group: 'finance' },
        { key: 'dailyRevenue', label: 'Revenue', align: 'right', group: 'finance' },
        { key: 'dailyProfit', label: 'Profit', align: 'right', group: 'finance' },
        { key: 'profitPerTrain', label: 'Profit/Train', align: 'right', group: 'finance' }
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
