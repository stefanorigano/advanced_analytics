// Storage management module
// Handles localStorage for save-specific data only (historical data)

import { CONFIG } from '../config.js';

const STORAGE_KEY = 'AdvancedAnalytics';

/**
 * Storage class for managing mod data in localStorage
 * Only handles save-specific data (historical snapshots)
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
     * Get save-specific data (working copy)
     * @param {string} key - Storage key
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
     * Set save-specific data (working copy)
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
     * Backup working data to backup slot
     * Called on game save
     * @returns {Promise<void>}
     */
    async backup() {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (storage.saves[savePrefix] && storage.saves[savePrefix].working) {
            storage.saves[savePrefix].backup = JSON.parse(
                JSON.stringify(storage.saves[savePrefix].working)
            );
            this.setStorage(storage);
            console.log(`${CONFIG.LOG_PREFIX} Data backed up for save: ${savePrefix}`);
        }
    }

    /**
     * Restore backup data to working slot
     * Called on game load
     * @returns {Promise<void>}
     */
    async restore() {
        const storage = this.getStorage();
        const savePrefix = this.saveName || 'default';
        
        if (storage.saves[savePrefix] && storage.saves[savePrefix].backup) {
            storage.saves[savePrefix].working = JSON.parse(
                JSON.stringify(storage.saves[savePrefix].backup)
            );
            this.setStorage(storage);
            console.log(`${CONFIG.LOG_PREFIX} Data restored from backup for save: ${savePrefix}`);
        }
    }

    /**
     * Update the current save name
     * Used when save is loaded or renamed
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
