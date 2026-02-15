// Storage management module
// Handles localStorage for save-specific data only (historical data)
//
// ARCHITECTURE: Transactional Storage Model
// ==========================================
// This implements a backup/restore pattern to ensure data integrity across
// game save/load cycles. Think of it like a database transaction:
//
// - WORKING COPY: Current session data (volatile, changes during gameplay)
// - BACKUP COPY: Last committed state (persistent, only updates on save)
//
// LIFECYCLE:
// 1. Game loads → restore() copies backup → working (rollback to saved state)
// 2. Play game → data accumulates in working copy
// 3. Game saves → backup() copies working → backup (commit transaction)
//
// CRITICAL SCENARIO THIS PREVENTS:
// - Load save at Day 10
// - Play to Day 12 (data captured in working)
// - Close WITHOUT saving
// - Reload same save
// - Without restore(), Day 11-12 data would leak into the reloaded session!
// - With restore(), working is reset to Day 10 state ✓

import { CONFIG } from '../config.js';

const STORAGE_KEY = 'AdvancedAnalytics';

/**
 * Storage class for managing mod data in localStorage
 * 
 * STORAGE STRUCTURE:
 * {
 *   saves: {
 *     "SaveName1": {
 *       working: { historicalData: {...}, routeStatuses: {...} },  // Current session
 *       backup: { historicalData: {...}, routeStatuses: {...} }    // Last saved state
 *     },
 *     "SaveName2": { ... }
 *   }
 * }
 * 
 * Only handles save-specific data (historical snapshots, route statuses)
 * Does NOT store UI state (sort order, filters, etc.) - those reset on unmount
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
     * Get save-specific data from WORKING COPY
     * 
     * This returns data from the current session (working copy).
     * Changes made during gameplay are stored here.
     * 
     * @param {string} key - Storage key (e.g., 'historicalData', 'routeStatuses')
     * @param {*} defaultValue - Default value if key not found
     * @returns {Promise<*>} Stored value or default
     */
    async get(key, defaultValue) {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (!storage.saves[savePrefix]) {
            return defaultValue;
        }
        
        const workingData = storage.saves[savePrefix].working || {};
        return workingData[key] !== undefined ? workingData[key] : defaultValue;
    }

    /**
     * Set save-specific data in WORKING COPY
     * 
     * This updates the current session data (working copy).
     * Changes are not committed until backup() is called on save.
     * 
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {Promise<void>}
     */
    async set(key, value) {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (!storage.saves[savePrefix]) {
            storage.saves[savePrefix] = { working: {}, backup: {} };
        }
        
        if (!storage.saves[savePrefix].working) {
            storage.saves[savePrefix].working = {};
        }
        
        storage.saves[savePrefix].working[key] = value;
        this.setStorage(storage);
    }

    /**
     * Delete a key from save-specific storage
     * @param {string} key - Storage key to delete
     * @returns {Promise<void>}
     */
    async delete(key) {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (storage.saves[savePrefix] && storage.saves[savePrefix].working) {
            delete storage.saves[savePrefix].working[key];
            this.setStorage(storage);
        }
    }

    /**
     * COMMIT TRANSACTION: Backup working data to backup slot
     * 
     * Called by onGameSaved() hook when the game is saved to disk.
     * This "commits" the current session data, making it persistent.
     * 
     * Flow:
     * 1. Deep clone working copy
     * 2. Save as backup copy
     * 3. Backup is now the "source of truth" for this save
     * 
     * @returns {Promise<void>}
     */
    async backup() {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (storage.saves[savePrefix] && storage.saves[savePrefix].working) {
            // Deep clone to prevent reference sharing
            storage.saves[savePrefix].backup = JSON.parse(
                JSON.stringify(storage.saves[savePrefix].working)
            );
            this.setStorage(storage);
            console.log(`${CONFIG.LOG_PREFIX} ✓ Transaction committed for save: ${savePrefix}`);
        }
    }

    /**
     * ROLLBACK TRANSACTION: Restore backup data to working slot
     * 
     * Called by onGameLoaded() hook when a save is loaded from disk.
     * This "rolls back" working data to match the last saved state.
     * 
     * Flow:
     * 1. Load backup copy (last committed state)
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
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (storage.saves[savePrefix] && storage.saves[savePrefix].backup) {
            // Deep clone to prevent reference sharing
            storage.saves[savePrefix].working = JSON.parse(
                JSON.stringify(storage.saves[savePrefix].backup)
            );
            this.setStorage(storage);
            console.log(`${CONFIG.LOG_PREFIX} ✓ Rolled back to saved state for: ${savePrefix}`);
        }
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
        this.saveName = newSaveName;
    }

    /**
     * Get all keys in current save's working storage
     * @returns {Promise<string[]>} Array of keys
     */
    async keys() {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (!storage.saves[savePrefix] || !storage.saves[savePrefix].working) {
            return [];
        }
        
        return Object.keys(storage.saves[savePrefix].working);
    }
}
