// Storage management module
// Handles localStorage for save-specific data only (historical data)
//
// ARCHITECTURE: Transactional Storage Model with Shared Immutable Data
// ======================================================================
// This implements a backup/restore pattern with optimization:
//
// - SHARED DATA: historicalData (immutable once captured, never changes)
// - WORKING COPY: routeStatuses, configCache (volatile, changes during gameplay)
// - SAVED COPY: routeStatuses, configCache (persistent, only updates on save)
//
// LIFECYCLE:
// 1. Game loads → restore() copies saved → working (rollback to saved state)
// 2. Play game → data accumulates in working copy
// 3. Game saves → backup() copies working → saved (commit transaction)
//
// STORAGE SAVINGS:
// By sharing immutable historicalData, we reduce duplication by ~95%
// Only volatile data (routeStatuses, configCache) needs the transactional model

import { CONFIG } from '../config.js';

const STORAGE_KEY = 'AdvancedAnalytics';

// Keys that are immutable and can be shared between working and saved
const SHARED_KEYS = ['historicalData'];

// Keys that need transactional protection (working/saved split)
const TRANSACTIONAL_KEYS = ['routeStatuses', 'configCache'];

/**
 * Storage class for managing mod data in localStorage
 * 
 * STORAGE STRUCTURE:
 * {
 *   saves: {
 *     "SaveName1": {
 *       cityCode: "NYC",
 *       routeCount: 3,
 *       day: 6,
 *       stationCount: 25,
 *       historicalData: { days: {...} },  // SHARED between working/saved
 *       working: { 
 *         routeStatuses: {...}, 
 *         configCache: {...} 
 *       },
 *       saved: { 
 *         routeStatuses: {...}, 
 *         configCache: {...} 
 *       }
 *     }
 *   }
 * }
 */
export class Storage {
    constructor(saveName = null) {
        this.saveName = saveName;
    }

    /**
     * Get the entire storage object from localStorage
     * @returns {Object} Storage object with saves property
     */
    getStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : { saves: {} };
        } catch (error) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to parse storage:`, error);
            return { saves: {} };
        }
    }

    /**
     * Save the entire storage object to localStorage
     * @param {Object} data - Storage data to save
     */
    setStorage(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to save storage:`, error);
        }
    }

    /**
     * Get save-specific data
     * 
     * For SHARED keys (historicalData): Returns shared data
     * For TRANSACTIONAL keys (routeStatuses, configCache): Returns from working copy
     * 
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key not found
     * @returns {Promise<*>} Stored value or default
     */
    async get(key, defaultValue) {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'NoName';
        
        if (!storage.saves[savePrefix]) {
            return defaultValue;
        }
        
        const saveData = storage.saves[savePrefix];
        
        // Check if this is a shared key
        if (SHARED_KEYS.includes(key)) {
            return saveData[key] !== undefined ? saveData[key] : defaultValue;
        }
        
        // Otherwise, get from working copy
        const workingData = saveData.working || {};
        return workingData[key] !== undefined ? workingData[key] : defaultValue;
    }

    /**
     * Set save-specific data
     * 
     * For SHARED keys (historicalData): Writes directly to root level
     * For TRANSACTIONAL keys (routeStatuses, configCache): Writes to working copy
     * 
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {Promise<void>}
     */
    async set(key, value) {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'NoName';
        
        if (!storage.saves[savePrefix]) {
            storage.saves[savePrefix] = { 
                cityCode: null,
                routeCount: 0,
                day: 0,
                stationCount: 0,
                working: {}, 
                saved: {} 
            };
        }
        
        const saveData = storage.saves[savePrefix];
        
        // Check if this is a shared key
        if (SHARED_KEYS.includes(key)) {
            // Write directly to root level (shared)
            saveData[key] = value;
        } else {
            // Write to working copy (transactional)
            if (!saveData.working) {
                saveData.working = {};
            }
            saveData.working[key] = value;
        }
        
        this.setStorage(storage);
    }

    /**
     * Delete a key from save-specific storage
     * @param {string} key - Storage key to delete
     * @returns {Promise<void>}
     */
    async delete(key) {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'NoName';
        
        if (!storage.saves[savePrefix]) return;
        
        const saveData = storage.saves[savePrefix];
        
        // Check if this is a shared key
        if (SHARED_KEYS.includes(key)) {
            delete saveData[key];
        } else if (saveData.working) {
            delete saveData.working[key];
        }
        
        this.setStorage(storage);
    }

    /**
     * COMMIT TRANSACTION: Backup working data to saved slot
     * 
     * Only backs up TRANSACTIONAL keys (routeStatuses, configCache)
     * SHARED keys (historicalData) are already at root level
     * 
     * Flow:
     * 1. Deep clone working copy of transactional keys
     * 2. Save as saved copy
     * 3. Update metadata (cityCode, routeCount, day, stationCount)
     * 4. Saved is now the "source of truth" for this save
     * 
     * @param {Object} api - SubwayBuilderAPI instance
     * @returns {Promise<void>}
     */
    async backup(api) {
        console.log(`${CONFIG.LOG_PREFIX} [Storage] backup() | save: ${this.saveName}`);
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'NoName';
        
        if (!storage.saves[savePrefix]) return;
        
        const saveData = storage.saves[savePrefix];
        
        if (saveData.working) {
            // Only backup transactional keys (not shared historicalData)
            const transactionalData = {};
            
            TRANSACTIONAL_KEYS.forEach(key => {
                if (saveData.working[key] !== undefined) {
                    transactionalData[key] = saveData.working[key];
                }
            });
            
            // Deep clone to prevent reference sharing
            saveData.saved = JSON.parse(JSON.stringify(transactionalData));
            
            // Update metadata
            const cityCode = api.utils.getCityCode?.() || null;
            const routes = api.gameState.getRoutes();
            const stations = api.gameState.getStations();
            const day = api.gameState.getCurrentDay();
            
            saveData.cityCode = cityCode;
            saveData.routeCount = routes.length;
            saveData.day = day;
            saveData.stationCount = stations.length;
            
            this.setStorage(storage);
            console.log(`${CONFIG.LOG_PREFIX} ✓ Transaction committed for save: ${savePrefix}`);
        }
        console.log(`${CONFIG.LOG_PREFIX} [Storage] backup() complete`);
    }

    /**
     * ROLLBACK TRANSACTION: Restore saved data to working slot
     * 
     * Only restores TRANSACTIONAL keys (routeStatuses, configCache)
     * SHARED keys (historicalData) remain at root level unchanged
     * 
     * Flow:
     * 1. Load saved copy (last committed state)
     * 2. Deep clone it
     * 3. Overwrite working copy
     * 4. Working copy now matches the save file on disk
     * 
     * CRITICAL: This prevents data leakage from previous sessions!
     * Without this, unsaved data from a previous session would persist.
     * 
     * @returns {Promise<void>}
     */
    async restore() {
        console.log(`${CONFIG.LOG_PREFIX} [Storage] restore() | save: ${this.saveName}`);
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'NoName';
        
        if (!storage.saves[savePrefix]) return;
        
        const saveData = storage.saves[savePrefix];
        
        if (saveData.saved) {
            // Deep clone to prevent reference sharing
            saveData.working = JSON.parse(JSON.stringify(saveData.saved));
            
            this.setStorage(storage);
            console.log(`${CONFIG.LOG_PREFIX} ✓ Rolled back to saved state for: ${savePrefix}`);
        }
        console.log(`${CONFIG.LOG_PREFIX} [Storage] restore() complete | keys restored: ${Object.keys(saveData.working || {}).join(', ')}`);
    }

    /**
     * Update the current save name
     * 
     * Used when save is loaded or renamed.
     * This switches the storage context to a different save file.
     * 
     * @param {string} newSaveName - New save name
     */
    setSaveName(newSaveName) {
        console.log(`${CONFIG.LOG_PREFIX} [Storage] setSaveName | ${this.saveName} → ${newSaveName}`);
        this.saveName = newSaveName;
    }

    /**
     * Get all keys in current save's storage
     * Includes both shared keys and working copy keys
     * @returns {Promise<string[]>} Array of keys
     */
    async keys() {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'NoName';
        
        if (!storage.saves[savePrefix]) {
            return [];
        }
        
        const saveData = storage.saves[savePrefix];
        const allKeys = new Set();
        
        // Add shared keys
        SHARED_KEYS.forEach(key => {
            if (saveData[key] !== undefined) {
                allKeys.add(key);
            }
        });
        
        // Add working copy keys
        if (saveData.working) {
            Object.keys(saveData.working).forEach(key => allKeys.add(key));
        }
        
        return Array.from(allKeys);
    }
}
