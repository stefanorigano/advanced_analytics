// Formatting utilities
// Pure functions for data formatting

import { sumTierField } from './demand-tiers.js';

/**
 * Format a number as currency with proper decimals
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted currency string (e.g., "$1,234" or "$1.23")
 */
export function formatCurrency(value, decimals = 0) {
    const absValue = Math.abs(value);
    const formatted = absValue.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    const sign = value < 0 ? '-' : '';
    return `${sign}$${formatted}`;
}

/**
 * Format a number as compact currency (millions) when >= 100,000
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places for standard format (default: 0)
 * @returns {string} Compact currency string (e.g., "14.78M" or "$1,234")
 */
export function formatCurrencyCompact(value, decimals = 0) {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    
    // Use millions format for values >= 100k
    if (absValue >= 100000) {
        const millions = absValue / 1000000;
        return `${sign}${millions.toFixed(2)}M`;
    }
    
    // Standard formatting for < 100k
    const formatted = absValue.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    return `${sign}$${formatted}`;
}

/**
 * Format a number as full currency (always with $ prefix)
 * Used for tooltips to show exact values
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Full currency string (e.g., "$14,782,500.00")
 */
export function formatCurrencyFull(value, decimals = 0) {
    const absValue = Math.abs(value);
    const formatted = absValue.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    const sign = value < 0 ? '-' : '';
    return `${sign}$${formatted}`;
}

/**
 * Format day label with "Yesterday" indicator
 * @param {number} day - Day number
 * @param {number} mostRecentDay - Most recent day in history
 * @returns {string} Formatted label
 */
export function formatDayLabel(day, mostRecentDay) {
    return day === mostRecentDay ? `Day ${day} (Yesterday)` : `Day ${day}`;
}

/**
 * Calculate total trains for a route
 * @param {Object} route - Route object with train schedule
 * @returns {number} Total number of trains
 */
export function calculateTotalTrains(route) {
    if (!route) return 0;
    return sumTierField(route, 'trains');
}

/**
 * Get all available days from historical data (sorted newest to oldest)
 * @param {Object} historicalData - Historical data object with days property
 * @returns {number[]} Sorted array of day numbers
 */
export function getAvailableDays(historicalData) {
    return Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
}

/**
 * Check if route was new on a specific day
 * @param {string} routeId - Route ID
 * @param {number} day - Day to check
 * @param {Object} routeStatuses - Map of route statuses
 * @returns {boolean} True if route was new on this day
 */
export function wasRouteNewOnDay(routeId, day, routeStatuses) {
    const status = routeStatuses[routeId];
    return status && status.status === 'ongoing' && status.createdDay === day;
}

/**
 * Format seconds as mm:ss with optional sign prefix.
 * Used for headway and schedule drift display.
 * @param {number|null} seconds - Seconds to format (null → '—')
 * @param {boolean} showSign - If true, prefix with +/- (default: false)
 * @returns {string} Formatted time string (e.g., "18:19" or "+2:05")
 */
export function formatSecondsAsTime(seconds, showSign = false) {
    if (seconds == null) return '—';
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = Math.round(abs % 60);
    const sign = showSign ? (seconds < 0 ? '-' : seconds > 0 ? '+' : '') : '';
    return `${sign}${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Check if route was deleted on a specific day
 * @param {string} routeId - Route ID
 * @param {number} day - Day to check
 * @param {Object} routeStatuses - Map of route statuses
 * @returns {boolean} True if route was deleted on this day
 */
export function wasRouteDeletedOnDay(routeId, day, routeStatuses) {
    const status = routeStatuses[routeId];
    return status && status.status === 'deleted' && status.deletedDay === day;
}
