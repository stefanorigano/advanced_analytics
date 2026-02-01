// Sorting utilities
// Helper functions for table sorting

import { CONFIG } from '../config.js';

/**
 * Get sort indicator (arrow) for column header
 * @param {string} column - Column key
 * @param {Object} sortState - Current sort state
 * @returns {string} Arrow character
 */
export function getSortIndicator(column, sortState) {
    if (sortState.column !== column) {
        return CONFIG.ARROWS.DOWN;
    }
    return sortState.order === 'desc' ? CONFIG.ARROWS.DOWN : CONFIG.ARROWS.UP;
}

/**
 * Get CSS classes for table header
 * @param {string} column - Column key
 * @param {Object} sortState - Current sort state
 * @param {Object} groupState - Group visibility state
 * @param {string} group - Group this column belongs to
 * @returns {string} CSS classes
 */
export function getHeaderClasses(column, sortState, groupState, group) {
    // Hide column if its group is toggled off
    if (group && groupState && groupState[group] === false) {
        return 'hidden';
    }
    
    if (sortState.column === column) {
        return 'text-foreground bg-background/80';
    } else if (column === 'name') {
        return 'bg-background/50 backdrop-blur-sm';
    }
    return 'hover:text-foreground';
}

/**
 * Get CSS classes for table cell
 * @param {string} column - Column key
 * @param {Object} sortState - Current sort state
 * @param {Object} groupState - Group visibility state
 * @param {string} group - Group this column belongs to
 * @returns {string} CSS classes
 */
export function getCellClasses(column, sortState, groupState, group) {
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
}

/**
 * Sort table data
 * @param {Array} data - Table data array
 * @param {Object} sortState - Sort state with column and order
 * @returns {Array} Sorted data
 */
export function sortTableData(data, sortState) {
    return [...data].sort((a, b) => {
        const aVal = a[sortState.column];
        const bVal = b[sortState.column];
        
        // String sorting for name
        if (sortState.column === 'name') {
            return sortState.order === 'desc' 
                ? bVal.localeCompare(aVal)
                : aVal.localeCompare(bVal);
        }
        
        // Train type sorting
        if (sortState.column === 'trainType') {
            const api = window.SubwayBuilderAPI;
            const routes = api.gameState.getRoutes();
            
            const routeA = routes.find(r => r.id === a.id);
            const routeB = routes.find(r => r.id === b.id);
            
            const getTrainTypeName = (route) => {
                if (!route?.trainType) return '';
                const trainType = api.trains.getTrainType(route.trainType);
                return trainType?.name || '';
            };
            
            const nameA = getTrainTypeName(routeA);
            const nameB = getTrainTypeName(routeB);
            
            return sortState.order === 'desc'
                ? nameB.localeCompare(nameA)
                : nameA.localeCompare(nameB);
        }
        
        // Handle comparison mode (values are objects with .value property)
        if (a.isComparison) {
            const aNum = typeof aVal === 'object' && aVal !== null ? (aVal.value || 0) : 0;
            const bNum = typeof bVal === 'object' && bVal !== null ? (bVal.value || 0) : 0;
            return sortState.order === 'desc' ? bNum - aNum : aNum - bNum;
        }
        
        // Normal numeric sorting
        return sortState.order === 'desc' ? bVal - aVal : aVal - bVal;
    });
}
