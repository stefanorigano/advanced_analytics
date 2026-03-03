// Advanced Analytics v0.9.1 - Built with  esbuild
(() => {
  // src/config.js
  var CONFIG = {
    VERSION: "5.0.0-alpha",
    UTILIZATION_THRESHOLDS: {
      CRITICAL_LOW: 30,
      CRITICAL_HIGH: 95,
      WARNING_LOW: 45,
      WARNING_HIGH: 85
    },
    REFRESH_INTERVAL: 1e3,
    LOG_PREFIX: "[AA]",
    COST_MULTIPLIER: 365,
    DEMAND_HOURS: {
      low: 9,
      // midnight-5am (5h) + 8pm-midnight (4h)
      medium: 9,
      // 5am-6am (1h) + 9am-4pm (7h) + 7pm-8pm (1h)
      high: 6
      // 6am-9am (3h) + 4pm-7pm (3h)
    },
    // Demand phases with precise hour boundaries
    // Used for accurate cost calculation based on when trains actually ran
    DEMAND_PHASES: [
      { type: "low", startHour: 0, endHour: 5 },
      // midnight-5am (5h)
      { type: "medium", startHour: 5, endHour: 6 },
      // 5am-6am (1h)
      { type: "high", startHour: 6, endHour: 9 },
      // 6am-9am (3h)
      { type: "medium", startHour: 9, endHour: 16 },
      // 9am-4pm (7h)
      { type: "high", startHour: 16, endHour: 19 },
      // 4pm-7pm (3h)
      { type: "medium", startHour: 19, endHour: 20 },
      // 7pm-8pm (1h)
      { type: "low", startHour: 20, endHour: 24 }
      // 8pm-midnight (4h)
    ],
    TRANSFER_WALKING_TIME_THRESHOLD: 100,
    // seconds
    COLORS: {
      // Train Schedule Colors (Labels only)
      TRAINS: {
        HIGH: "text-red-600 dark:text-red-400",
        MEDIUM: "text-orange-500 dark:text-orange-400",
        LOW: "text-green-600 dark:text-green-400"
      },
      // Utilization status colors
      UTILIZATION: {
        CRITICAL: "text-red-600 dark:text-red-400",
        WARNING: "text-yellow-600 dark:text-yellow-400",
        GOOD: "text-green-600 dark:text-green-400"
      },
      // Percentage change colors
      PERCENTAGE: {
        POSITIVE: "text-green-600 dark:text-green-400",
        NEGATIVE: "text-red-600 dark:text-red-400"
      },
      // Value colors
      VALUE: {
        NEGATIVE: "text-red-600 dark:text-red-400",
        DEFAULT: ""
      },
      // Comparison mode colors
      COMPARE: {
        POSITIVE: "text-green-600 dark:text-green-400",
        // Good improvement
        NEGATIVE: "text-red-600 dark:text-red-400",
        // Decline
        NEUTRAL: "text-muted-foreground",
        // No change (0%)
        NEW: "text-purple-600 dark:text-purple-400",
        // New route
        DELETED: "text-gray-400 dark:text-gray-500"
        // Deleted route
      }
    },
    ARROWS: {
      UP: "\u2191",
      DOWN: "\u2193",
      NEUTRAL: "="
    },
    STYLES: {
      PERCENTAGE_FONT_SIZE: "text-[10px]"
    },
    TABLE_HEADERS: [
      { key: "name", label: "Route", align: "right" },
      { key: "ridership", label: "Ridership", align: "right", group: "performance" },
      { key: "capacity", label: "Throughput", align: "right", group: "trains", description: "Daily Capacity: total passengers this route can carry in 24 hours.|Based on train frequency, car capacity, loop time, and demand schedule.|Higher values mean more room to grow ridership." },
      { key: "utilization", label: "Usage", align: "right", group: "performance", description: "Based on ridership against potential throughput" },
      { key: "stations", label: "Stops", align: "right", group: "trains" },
      { key: "trainType", label: "Type", align: "right", group: "trains", description: "Train Type" },
      { key: "trainSchedule", label: "Trains", align: "right", group: "trains", description: "Number of trains:|- High Demand |- Medium Demand |- Low Demand)" },
      { key: "transfers", label: "Transfers", align: "right", group: "trains", description: "Direct transfers with other routes |Note: List direct transfers only, passengers may walk to further stations not listed here " },
      { key: "dailyCost", label: "Cost", align: "right", group: "finance" },
      { key: "dailyRevenue", label: "Revenue", align: "right", group: "finance" },
      { key: "dailyProfit", label: "Profit", align: "right", group: "finance" },
      { key: "profitPerPassenger", label: "Profit/Pax", align: "right", group: "finance" },
      { key: "profitPerTrain", label: "Profit/Train", align: "right", group: "performance" }
    ]
  };
  var INITIAL_STATE = {
    sort: {
      column: "ridership",
      order: "desc"
    },
    groups: {
      trains: true,
      finance: true,
      performance: true
    },
    timeframe: "last24h"
  };

  // src/core/storage.js
  var DB_NAME = "AdvancedAnalytics";
  var DB_VERSION = 1;
  var STORE_NAME = "analytics";
  var SHARED_KEYS = ["historicalData"];
  var TRANSACTIONAL_KEYS = ["routeStatuses", "configCache"];
  var _db = null;
  async function _getDB() {
    if (_db) return _db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (event) => {
        _db = event.target.result;
        _db.onclose = () => {
          _db = null;
        };
        resolve(_db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("[Storage] IDB upgrade blocked"));
    });
  }
  function _wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function _idbGet(key) {
    const db = await _getDB();
    const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
    const result = await _wrap(store.get(key));
    return result !== void 0 ? result : null;
  }
  async function _idbSet(key, value) {
    const db = await _getDB();
    const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
    return _wrap(store.put(value, key));
  }
  async function _idbDelete(key) {
    const db = await _getDB();
    const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);
    return _wrap(store.delete(key));
  }
  async function _idbSetMany(entries) {
    const db = await _getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const st = tx.objectStore(STORE_NAME);
    for (const [key, value] of Object.entries(entries)) {
      st.put(value, key);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function _idbKeysByPrefix(prefix) {
    const db = await _getDB();
    const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
    const allKeys = await _wrap(store.getAllKeys());
    return allKeys.filter((k) => k.startsWith(prefix));
  }
  async function _idbDeleteByPrefix(prefix) {
    const keys = await _idbKeysByPrefix(prefix);
    if (keys.length === 0) return 0;
    const db = await _getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const st = tx.objectStore(STORE_NAME);
    for (const key of keys) st.delete(key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(keys.length);
      tx.onerror = () => reject(tx.error);
    });
  }
  var Keys = {
    meta: () => "meta::saves",
    shared: (save, k) => `save::${save}::${k}`,
    working: (save, k) => `save::${save}::working::${k}`,
    saved: (save, k) => `save::${save}::saved::${k}`,
    savePrefix: (save) => `save::${save}::`
  };
  async function _getMeta() {
    return await _idbGet(Keys.meta()) || {};
  }
  async function _setMeta(meta) {
    return _idbSet(Keys.meta(), meta);
  }
  var Storage = class {
    constructor(saveName = null) {
      this.saveName = saveName;
    }
    // ── Core read/write ────────────────────────────────────────────────────
    /**
     * Get a value from the current save's storage.
     *
     * SHARED keys (historicalData)     → read from shared slot
     * TRANSACTIONAL keys (everything else) → read from working slot
     *
     * @param {string} key
     * @param {*} defaultValue
     * @returns {Promise<*>}
     */
    async get(key, defaultValue) {
      const save = this.saveName || "NoName";
      const idbKey = SHARED_KEYS.includes(key) ? Keys.shared(save, key) : Keys.working(save, key);
      const value = await _idbGet(idbKey);
      return value !== null ? value : defaultValue;
    }
    /**
     * Write a value to the current save's storage.
     *
     * SHARED keys     → write to shared slot (no transactional split)
     * TRANSACTIONAL keys → write to working slot only
     *
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
      const save = this.saveName || "NoName";
      const idbKey = SHARED_KEYS.includes(key) ? Keys.shared(save, key) : Keys.working(save, key);
      return _idbSet(idbKey, value);
    }
    /**
     * Delete a key from the current save.
     * @param {string} key
     */
    async delete(key) {
      const save = this.saveName || "NoName";
      const idbKey = SHARED_KEYS.includes(key) ? Keys.shared(save, key) : Keys.working(save, key);
      return _idbDelete(idbKey);
    }
    /**
     * Return all logical keys stored for the current save.
     * Strips the IDB key prefix so callers get plain key names.
     * @returns {Promise<string[]>}
     */
    async keys() {
      const save = this.saveName || "NoName";
      const prefix = Keys.savePrefix(save);
      const rawKeys = await _idbKeysByPrefix(prefix);
      return rawKeys.map((k) => {
        const withoutPrefix = k.slice(prefix.length);
        const slashIdx = withoutPrefix.indexOf("::");
        return slashIdx >= 0 ? withoutPrefix.slice(slashIdx + 2) : withoutPrefix;
      });
    }
    // ── Transactional commit / rollback ────────────────────────────────────
    /**
     * COMMIT: copy working transactional keys → saved slot.
     * Also updates save metadata with current game state.
     *
     * @param {Object} api - SubwayBuilderAPI instance
     */
    async backup(api28) {
      const save = this.saveName || "NoName";
      console.log(`${CONFIG.LOG_PREFIX} [Storage] backup() | save: ${save}`);
      const workingEntries = {};
      for (const key of TRANSACTIONAL_KEYS) {
        const value = await _idbGet(Keys.working(save, key));
        if (value !== null) {
          workingEntries[Keys.saved(save, key)] = value;
        }
      }
      const cityCode = api28.utils.getCityCode?.() || null;
      const routes = api28.gameState.getRoutes();
      const stations = api28.gameState.getStations();
      const day = api28.gameState.getCurrentDay();
      const meta = await _getMeta();
      meta[save] = { cityCode, routeCount: routes.length, day, stationCount: stations.length };
      workingEntries[Keys.meta()] = meta;
      await _idbSetMany(workingEntries);
      console.log(`${CONFIG.LOG_PREFIX} \u2713 Transaction committed for save: ${save}`);
      console.log(`${CONFIG.LOG_PREFIX} [Storage] backup() complete`);
    }
    /**
     * ROLLBACK: copy saved transactional keys → working slot.
     * Prevents data leakage from a previous session.
     */
    async restore() {
      const save = this.saveName || "NoName";
      console.log(`${CONFIG.LOG_PREFIX} [Storage] restore() | save: ${save}`);
      const entries = {};
      let restoredCount = 0;
      for (const key of TRANSACTIONAL_KEYS) {
        const saved = await _idbGet(Keys.saved(save, key));
        if (saved !== null) {
          entries[Keys.working(save, key)] = saved;
          restoredCount++;
        }
      }
      if (restoredCount > 0) {
        await _idbSetMany(entries);
        console.log(`${CONFIG.LOG_PREFIX} \u2713 Rolled back to saved state for: ${save} (${restoredCount} keys)`);
      } else {
        console.log(`${CONFIG.LOG_PREFIX} [Storage] restore() \u2014 no saved state found for: ${save}`);
      }
      console.log(`${CONFIG.LOG_PREFIX} [Storage] restore() complete`);
    }
    // ── Metadata ───────────────────────────────────────────────────────────
    /**
     * Update the save name (switches storage context).
     * @param {string} newSaveName
     */
    setSaveName(newSaveName) {
      console.log(`${CONFIG.LOG_PREFIX} [Storage] setSaveName | ${this.saveName} \u2192 ${newSaveName}`);
      this.saveName = newSaveName;
    }
    // ── Save management (used by settings dialog) ──────────────────────────
    /**
     * Return all save metadata entries.
     * @returns {Promise<Object>} { [saveName]: { cityCode, routeCount, day, stationCount } }
     */
    static async getAllSaves() {
      return _getMeta();
    }
    /**
     * Delete a specific save and all its associated IDB keys.
     * @param {string} saveName
     */
    static async deleteSave(saveName) {
      await _idbDeleteByPrefix(Keys.savePrefix(saveName));
      const meta = await _getMeta();
      delete meta[saveName];
      await _setMeta(meta);
    }
    /**
     * Rename a save in metadata (used when a temp session ID gets a real name).
     * Does NOT copy IDB keys — call migrateKeys() if you need that.
     * @param {string} oldName
     * @param {string} newName
     */
    static async renameSave(oldName, newName) {
      const meta = await _getMeta();
      if (meta[oldName]) {
        meta[newName] = meta[oldName];
        delete meta[oldName];
        await _setMeta(meta);
      }
    }
    /**
     * Copy all IDB keys from one save name to another.
     * Used when a temp session ID is replaced by the real save name.
     * @param {string} oldName
     * @param {string} newName
     * @param {boolean} deleteOld - Whether to delete old keys after copy
     */
    static async migrateKeys(oldName, newName, deleteOld = false) {
      const db = await _getDB();
      const oldPfx = Keys.savePrefix(oldName);
      const newPfx = Keys.savePrefix(newName);
      const allKeys = await _idbKeysByPrefix(oldPfx);
      if (allKeys.length === 0) return;
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const pairs = await Promise.all(
        allKeys.map(async (k) => [k, await _wrap(store.get(k))])
      );
      const newEntries = {};
      for (const [oldKey, value] of pairs) {
        if (value !== void 0) {
          const newKey = newPfx + oldKey.slice(oldPfx.length);
          newEntries[newKey] = value;
        }
      }
      await _idbSetMany(newEntries);
      if (deleteOld) {
        await _idbDeleteByPrefix(oldPfx);
      }
    }
    /**
     * Export a save's data as a plain JS object (for JSON download).
     * @param {string} saveName
     * @returns {Promise<Object>}
     */
    static async exportSave(saveName) {
      const prefix = Keys.savePrefix(saveName);
      const rawKeys = await _idbKeysByPrefix(prefix);
      const db = await _getDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const data = {};
      await Promise.all(rawKeys.map(async (k) => {
        const shortKey = k.slice(prefix.length);
        data[shortKey] = await _wrap(store.get(k));
      }));
      return data;
    }
    /**
     * Import a save's data from a plain JS object (produced by exportSave).
     * Overwrites any existing data for that save name.
     * @param {string} saveName
     * @param {Object} data - Object with short keys (without save:: prefix)
     * @param {Object} metadata - { cityCode, routeCount, day, stationCount }
     */
    static async importSave(saveName, data, metadata) {
      const prefix = Keys.savePrefix(saveName);
      const entries = {};
      for (const [shortKey, value] of Object.entries(data)) {
        entries[prefix + shortKey] = value;
      }
      await _idbSetMany(entries);
      const meta = await _getMeta();
      meta[saveName] = metadata;
      await _setMeta(meta);
    }
    /**
     * Estimate IndexedDB usage (Chrome/Electron only).
     * @returns {Promise<{usedMB: string, quotaMB: string, pct: string}|null>}
     */
    static async estimateUsage() {
      if (!navigator.storage?.estimate) return null;
      const { usage, quota } = await navigator.storage.estimate();
      return {
        usedMB: (usage / 1024 / 1024).toFixed(2),
        quotaMB: (quota / 1024 / 1024).toFixed(0),
        pct: (usage / quota * 100).toFixed(1) + "%"
      };
    }
  };

  // src/metrics/route-metrics.js
  function validateRouteData(route) {
    return route && route.trainSchedule;
  }
  function getEmptyMetrics() {
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
      profitPerPassenger: 0,
      profitPerTrain: 0,
      transfers: { count: 0, routes: [], routeIds: [], stationIds: [] }
    };
  }
  function calculateRouteMetrics(route, trainType, ridership, dailyRevenue) {
    const carsPerTrain = route.carsPerTrain !== void 0 ? route.carsPerTrain : trainType.stats.carsPerCarSet;
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
        const highCapacity = trainCounts.high * CONFIG.DEMAND_HOURS.high * loopsPerHour * capacityPerTrain;
        const mediumCapacity = trainCounts.medium * CONFIG.DEMAND_HOURS.medium * loopsPerHour * capacityPerTrain;
        const lowCapacity = trainCounts.low * CONFIG.DEMAND_HOURS.low * loopsPerHour * capacityPerTrain;
        capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);
        if (capacity > 0) {
          utilization = Math.round(ridership / capacity * 100);
        }
        const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
        const carCostPerHour = trainType.stats.carOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
        const costPerTrainPerHour = trainCostPerHour + carsPerTrain * carCostPerHour;
        dailyCost = trainCounts.low * CONFIG.DEMAND_HOURS.low * costPerTrainPerHour + trainCounts.medium * CONFIG.DEMAND_HOURS.medium * costPerTrainPerHour + trainCounts.high * CONFIG.DEMAND_HOURS.high * costPerTrainPerHour;
      }
    }
    const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;
    const dailyProfit = dailyRevenue - dailyCost;
    const profitPerPassenger = ridership > 0 ? dailyProfit / ridership : 0;
    const totalTrains = trainCounts.high + trainCounts.medium + trainCounts.low;
    const profitPerTrain = totalTrains > 0 ? dailyProfit / totalTrains : 0;
    return {
      capacity,
      utilization,
      stations,
      trainsLow: trainCounts.low,
      trainsMedium: trainCounts.medium,
      trainsHigh: trainCounts.high,
      trainSchedule: trainCounts.high,
      dailyCost,
      dailyProfit,
      profitPerPassenger,
      profitPerTrain
    };
  }

  // src/core/api-support.js
  function findZustandStore() {
    try {
      for (const val of Object.values(window)) {
        if (typeof val?.getState !== "function") continue;
        const state = val.getState();
        if (Array.isArray(state?.stationGroups)) {
          return val;
        }
      }
    } catch (err) {
      console.warn(`${CONFIG.LOG_PREFIX} [Zustand] Error while scanning window:`, err);
    }
    return null;
  }
  var _store = findZustandStore();
  if (_store) {
    console.log(`${CONFIG.LOG_PREFIX} [Zustand] \u2713 Store found \u2014 enhanced data accessors active`);
  } else {
    console.warn(`${CONFIG.LOG_PREFIX} [Zustand] \u2717 Store not found \u2014 falling back to API-based methods`);
  }
  function isZustandAvailable() {
    return _store !== null;
  }
  function getZustandState() {
    if (!_store) return null;
    try {
      return _store.getState();
    } catch (err) {
      console.warn(`${CONFIG.LOG_PREFIX} [Zustand] getState() failed:`, err);
      return null;
    }
  }
  function getZustandSaveName() {
    const state = getZustandState();
    return state?.currentSaveInfo?.name ?? null;
  }
  function getStationGroups() {
    const state = getZustandState();
    if (!state?.stationGroups) return [];
    return state.stationGroups;
  }
  function getGroupForStation(stationId) {
    return getStationGroups().find((g) => g.stationIds.includes(stationId)) ?? null;
  }
  function getSiblingStationIds(stationId) {
    const group = getGroupForStation(stationId);
    if (!group) return [];
    return group.stationIds.filter((id) => id !== stationId);
  }

  // src/metrics/transfers.js
  function calculateTransfers(routes, api28) {
    return isZustandAvailable() ? _calculateTransfersZustand(routes, api28) : _calculateTransfersFallback(routes, api28);
  }
  function _calculateTransfersZustand(routes, api28) {
    const allStations = api28.gameState.getStations();
    const transferMap = {};
    routes.forEach((route) => {
      const transfersByRoute = /* @__PURE__ */ new Map();
      allStations.forEach((station) => {
        if (!station.routeIds?.includes(route.id)) return;
        _addDirectRoutes(station, route.id, transfersByRoute);
        const siblingIds = getSiblingStationIds(station.id);
        siblingIds.forEach((sibId) => {
          const sibling = allStations.find((s) => s.id === sibId);
          if (!sibling?.routeIds) return;
          sibling.routeIds.forEach((otherRouteId) => {
            if (otherRouteId === route.id) return;
            if (!transfersByRoute.has(otherRouteId)) {
              transfersByRoute.set(otherRouteId, /* @__PURE__ */ new Set());
            }
            transfersByRoute.get(otherRouteId).add(station.id);
          });
        });
      });
      transferMap[route.id] = _buildResult(transfersByRoute, routes);
    });
    return transferMap;
  }
  function _calculateTransfersFallback(routes, api28) {
    const allStations = api28.gameState.getStations();
    const THRESHOLD = CONFIG.TRANSFER_WALKING_TIME_THRESHOLD;
    const transferMap = {};
    routes.forEach((route) => {
      const transfersByRoute = /* @__PURE__ */ new Map();
      allStations.forEach((station) => {
        if (!station.routeIds?.includes(route.id)) return;
        _addDirectRoutes(station, route.id, transfersByRoute);
        station.nearbyStations?.forEach((nearby) => {
          if (nearby.walkingTime >= THRESHOLD) return;
          const nearbyStation = allStations.find((s) => s.id === nearby.stationId);
          if (!nearbyStation?.routeIds) return;
          nearbyStation.routeIds.forEach((otherRouteId) => {
            if (otherRouteId === route.id) return;
            if (!transfersByRoute.has(otherRouteId)) {
              transfersByRoute.set(otherRouteId, /* @__PURE__ */ new Set());
            }
            transfersByRoute.get(otherRouteId).add(station.id);
          });
        });
      });
      transferMap[route.id] = _buildResult(transfersByRoute, routes);
    });
    return transferMap;
  }
  function _addDirectRoutes(station, currentRouteId, transfersByRoute) {
    if (!station?.routeIds || station.routeIds.length <= 1) return;
    station.routeIds.forEach((otherRouteId) => {
      if (otherRouteId === currentRouteId) return;
      if (!transfersByRoute.has(otherRouteId)) {
        transfersByRoute.set(otherRouteId, /* @__PURE__ */ new Set());
      }
      transfersByRoute.get(otherRouteId).add(station.id);
    });
  }
  function _buildResult(transfersByRoute, routes) {
    let totalCount = 0;
    const connectedRouteData = [];
    const allStationIds = [];
    transfersByRoute.forEach((stationIdsSet, otherRouteId) => {
      const otherRoute = routes.find((r) => r.id === otherRouteId);
      const stationIds = Array.from(stationIdsSet);
      totalCount += stationIds.length;
      connectedRouteData.push({
        routeId: otherRouteId,
        routeName: otherRoute ? otherRoute.name || otherRoute.bullet : otherRouteId,
        sharedCount: stationIds.length
      });
      allStationIds.push(...stationIds);
    });
    connectedRouteData.sort(
      (a, b) => b.sharedCount !== a.sharedCount ? b.sharedCount - a.sharedCount : a.routeName.localeCompare(b.routeName)
    );
    return {
      count: totalCount,
      routes: connectedRouteData.map((r) => r.routeName),
      routeIds: connectedRouteData.map((r) => r.routeId),
      stationIds: allStationIds
    };
  }

  // src/metrics/train-config-tracking.js
  async function recordConfigChange(routeId, hour, minute, config, api28, storage2) {
    const currentDay = api28.gameState.getCurrentDay();
    const timestamp = hour * 60 + minute;
    const configCache = await storage2.get("configCache", {});
    if (!configCache[currentDay]) {
      configCache[currentDay] = {};
    }
    if (!configCache[currentDay][routeId]) {
      configCache[currentDay][routeId] = [];
    }
    configCache[currentDay][routeId].push({
      timestamp,
      hour,
      minute,
      high: config.high,
      medium: config.medium,
      low: config.low
    });
    await storage2.set("configCache", configCache);
  }
  async function captureInitialDayConfig(day, api28, storage2) {
    const routes = api28.gameState.getRoutes();
    const configCache = await storage2.get("configCache", {});
    configCache[day] = {};
    routes.forEach((route) => {
      configCache[day][route.id] = [{
        timestamp: 0,
        // Midnight
        hour: 0,
        minute: 0,
        high: route.trainSchedule?.highDemand || 0,
        medium: route.trainSchedule?.mediumDemand || 0,
        low: route.trainSchedule?.lowDemand || 0
      }];
    });
    await storage2.set("configCache", configCache);
    console.log(`${CONFIG.LOG_PREFIX} Captured initial day config for Day ${day}: ${routes.length} routes`);
  }
  function calculateDailyCostFromTimeline(routeId, configTimeline, trainType, carsPerTrain) {
    if (!configTimeline || configTimeline.length === 0) {
      return null;
    }
    const sorted = [...configTimeline].sort((a, b) => a.timestamp - b.timestamp);
    const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
    const carCostPerHour = trainType.stats.carOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
    const costPerTrainPerMinute = (trainCostPerHour + carsPerTrain * carCostPerHour) / 60;
    let totalCost = 0;
    CONFIG.DEMAND_PHASES.forEach((phase) => {
      const phaseStartMin = phase.startHour * 60;
      const phaseEndMin = phase.endHour * 60;
      const demandType = phase.type;
      let currentConfig = null;
      let lastChangeTime = phaseStartMin;
      for (let i = 0; i < sorted.length; i++) {
        const change = sorted[i];
        if (change.timestamp <= phaseStartMin) {
          currentConfig = change;
          lastChangeTime = phaseStartMin;
          continue;
        }
        if (change.timestamp < phaseEndMin) {
          if (currentConfig) {
            const duration = change.timestamp - lastChangeTime;
            const trainCount = currentConfig[demandType];
            totalCost += trainCount * duration * costPerTrainPerMinute;
          }
          currentConfig = change;
          lastChangeTime = change.timestamp;
        } else {
          break;
        }
      }
      if (currentConfig) {
        const duration = phaseEndMin - lastChangeTime;
        const trainCount = currentConfig[demandType];
        totalCost += trainCount * duration * costPerTrainPerMinute;
      }
    });
    return totalCost;
  }

  // src/metrics/historical-data.js
  async function captureHistoricalData(day, api28, storage2, accumulatedRevenue = null, hourlyRevenue = null) {
    try {
      const routes = api28.gameState.getRoutes();
      const trainTypes = api28.trains.getTrainTypes();
      const lineMetrics = api28.gameState.getLineMetrics();
      const configCache = await storage2.get("configCache", {});
      const configTimeline = configCache[day] || {};
      const transfersMap = calculateTransfers(routes, api28);
      const processedData = [];
      routes.forEach((route) => {
        const metrics = lineMetrics.find((m) => m.routeId === route.id);
        const ridership = api28.gameState.getRouteRidership(route.id).total;
        const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
        const accumulated = accumulatedRevenue ? accumulatedRevenue[route.id] ?? 0 : 0;
        const dailyRevenue = accumulated > 0 ? accumulated : revenuePerHour * 24;
        const routeHourlyRevenue = hourlyRevenue ? hourlyRevenue[route.id] ?? null : null;
        if (!validateRouteData(route)) {
          processedData.push({
            id: route.id,
            name: route.name || route.bullet,
            ridership,
            dailyRevenue,
            hourlyRevenue: routeHourlyRevenue,
            transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
            ...getEmptyMetrics()
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
            hourlyRevenue: routeHourlyRevenue,
            transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
            ...getEmptyMetrics()
          });
          return;
        }
        const carsPerTrain = route.carsPerTrain !== void 0 ? route.carsPerTrain : trainType.stats.carsPerCarSet;
        const calculatedMetrics = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
        const routeTimeline = configTimeline[route.id];
        let dailyCost = calculatedMetrics.dailyCost;
        if (routeTimeline && routeTimeline.length > 0) {
          const timelineCost = calculateDailyCostFromTimeline(route.id, routeTimeline, trainType, carsPerTrain);
          if (timelineCost !== null) {
            dailyCost = timelineCost;
          }
        }
        const dailyProfit = dailyRevenue - dailyCost;
        const profitPerPassenger = ridership > 0 ? dailyProfit / ridership : 0;
        const totalTrains = (route.trainSchedule?.highDemand || 0) + (route.trainSchedule?.mediumDemand || 0) + (route.trainSchedule?.lowDemand || 0);
        const profitPerTrain = totalTrains > 0 ? dailyProfit / totalTrains : 0;
        processedData.push({
          id: route.id,
          name: route.name || route.bullet,
          ridership,
          dailyRevenue,
          hourlyRevenue: routeHourlyRevenue,
          transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
          ...calculatedMetrics,
          dailyCost,
          dailyProfit,
          profitPerPassenger,
          profitPerTrain
        });
      });
      const historicalData = await storage2.get("historicalData", { days: {} });
      historicalData.days[day] = {
        timestamp: Date.now(),
        routes: processedData
      };
      await storage2.set("historicalData", historicalData);
      delete configCache[day];
      await storage2.set("configCache", configCache);
      console.log(`${CONFIG.LOG_PREFIX} Captured data for Day ${day}: ${processedData.length} routes`);
    } catch (error) {
      console.error(`${CONFIG.LOG_PREFIX} Failed to capture historical data:`, error);
    }
  }

  // src/metrics/revenue-accumulator.js
  var POLL_INTERVAL_MS = 500;
  var TAG = "[AA:REVACC]";
  function _makeEmptyBuckets() {
    return Array.from({ length: 24 }, () => ({ mcTotal: 0, routeWeights: {} }));
  }
  var _hookRegistered = false;
  var _hourBuckets = _makeEmptyBuckets();
  var _lastSampleElapsed = null;
  var _lastRates = {};
  var _pollTimer = null;
  var _api = null;
  function _registerMoneyHook(api28) {
    if (_hookRegistered) return;
    _hookRegistered = true;
    api28.hooks.onMoneyChanged((balance, change, type) => {
      if (type !== "revenue") return;
      const elapsed = api28.gameState.getElapsedSeconds();
      const h = Math.min(Math.max(Math.floor(elapsed % 86400 / 3600), 0), 23);
      _hourBuckets[h].mcTotal += change;
    });
    console.log(`${TAG} \u2713 onMoneyChanged hook registered`);
  }
  function _tick() {
    if (!_api || _api.gameState.isPaused()) return;
    const elapsed = _api.gameState.getElapsedSeconds();
    const lineMetrics = _api.gameState.getLineMetrics();
    if (_lastSampleElapsed !== null && elapsed > _lastSampleElapsed) {
      const dtHours = (elapsed - _lastSampleElapsed) / 3600;
      const h = Math.min(Math.max(Math.floor(_lastSampleElapsed % 86400 / 3600), 0), 23);
      Object.entries(_lastRates).forEach(([routeId, lastRate]) => {
        if (lastRate > 0) {
          _hourBuckets[h].routeWeights[routeId] = (_hourBuckets[h].routeWeights[routeId] || 0) + lastRate * dtHours;
        }
      });
    }
    _lastRates = {};
    lineMetrics.forEach((lm) => {
      _lastRates[lm.routeId] = lm.revenuePerHour || 0;
    });
    _lastSampleElapsed = elapsed;
  }
  function initAccumulator(api28) {
    _api = api28;
    _registerMoneyHook(api28);
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(_tick, POLL_INTERVAL_MS);
    console.log(`${TAG} \u25B6 Accumulator started | poll: ${POLL_INTERVAL_MS}ms`);
  }
  function stopAccumulating() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    console.log(`${TAG} \u25A0 Accumulator stopped`);
  }
  function resetForNewDay() {
    _hourBuckets = _makeEmptyBuckets();
    _lastSampleElapsed = null;
    _lastRates = {};
    console.log(`${TAG} \u21BA Buckets reset for new day`);
  }
  function getDaySnapshot() {
    const totalRouteWeights = {};
    let totalAllWeights = 0;
    let totalMC = 0;
    _hourBuckets.forEach((bucket) => {
      totalMC += bucket.mcTotal;
      Object.entries(bucket.routeWeights).forEach(([routeId, weight]) => {
        totalRouteWeights[routeId] = (totalRouteWeights[routeId] || 0) + weight;
        totalAllWeights += weight;
      });
    });
    if (totalAllWeights === 0 || totalMC === 0) return {};
    const result = {};
    Object.entries(totalRouteWeights).forEach(([routeId, weight]) => {
      result[routeId] = weight / totalAllWeights * totalMC;
    });
    return result;
  }
  function getHourlySnapshot() {
    const routeIds = /* @__PURE__ */ new Set();
    _hourBuckets.forEach((b) => Object.keys(b.routeWeights).forEach((id) => routeIds.add(id)));
    const result = {};
    routeIds.forEach((id) => {
      result[id] = new Array(24).fill(0);
    });
    _hourBuckets.forEach((bucket, h) => {
      const totalWeight = Object.values(bucket.routeWeights).reduce((a, b) => a + b, 0);
      if (totalWeight === 0 || bucket.mcTotal === 0) return;
      Object.entries(bucket.routeWeights).forEach(([routeId, weight]) => {
        result[routeId][h] = weight / totalWeight * bucket.mcTotal;
      });
    });
    return result;
  }
  function getAccumulatedRevenue(routeId) {
    const snapshot = getDaySnapshot();
    return snapshot[routeId] ?? 0;
  }

  // src/core/lifecycle.js
  var storage = null;
  var currentSaveName = null;
  var lastHour = null;
  var _startConfigTracking = null;
  async function handleMapReadyFallback(api28) {
    const zustandName = getZustandSaveName();
    const resolvedName = zustandName || `session_${Date.now()}`;
    const source = zustandName ? "Zustand" : "temp ID";
    console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback | saveName: ${resolvedName} (source: ${source})`);
    storage = _initStorage(resolvedName);
    const matchingKey = await _findMatchingSave(resolvedName, api28);
    if (matchingKey) {
      console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback \u2014 found matching save: ${matchingKey}`);
      storage.setSaveName(matchingKey);
      currentSaveName = matchingKey;
    } else {
      console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback \u2014 no matching save found, using: ${resolvedName}`);
      currentSaveName = resolvedName;
    }
    await storage.restore();
    lastHour = null;
    if (_startConfigTracking) {
      _startConfigTracking();
    } else {
      console.warn(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback \u2014 _startConfigTracking not available yet`);
    }
    resetForNewDay();
    initAccumulator(api28);
    console.log(`${CONFIG.LOG_PREFIX} [LC] handleMapReadyFallback complete | active save: ${currentSaveName}`);
  }
  function _initStorage(saveName) {
    if (!storage) {
      storage = new Storage(saveName);
    } else {
      storage.setSaveName(saveName);
    }
    currentSaveName = saveName;
    return storage;
  }
  function getCurrentSaveName() {
    return currentSaveName;
  }
  async function _findMatchingSave(saveName, api28) {
    const saves = await Storage.getAllSaves();
    const cityCode = api28.utils.getCityCode?.() || null;
    const routes = api28.gameState.getRoutes();
    const stations = api28.gameState.getStations();
    const day = api28.gameState.getCurrentDay();
    for (const [key, saveData] of Object.entries(saves)) {
      if (key !== saveName) continue;
      if (saveData.cityCode === cityCode && saveData.routeCount === routes.length && saveData.day === day && saveData.stationCount === stations.length) {
        return key;
      }
    }
    return null;
  }
  function initLifecycleHooks(api28) {
    console.log(`${CONFIG.LOG_PREFIX} Setting up lifecycle hooks...`);
    let configCheckInterval = null;
    let lastTrainConfig = {};
    let lastHour2 = null;
    function startConfigTracking() {
      if (configCheckInterval) {
        clearInterval(configCheckInterval);
        configCheckInterval = null;
        console.log(`${CONFIG.LOG_PREFIX} [LC] configCheck \u2014 cleared previous interval`);
      }
      configCheckInterval = setInterval(() => {
        if (!storage) {
          console.warn(`${CONFIG.LOG_PREFIX} [LC] configCheck tick | storage null, skipping`);
          return;
        }
        if (api28.gameState.isPaused()) return;
        const routes = api28.gameState.getRoutes();
        const elapsedSeconds = api28.gameState.getElapsedSeconds();
        const currentHour = Math.floor(elapsedSeconds % 86400 / 3600);
        const currentMinute = Math.floor(elapsedSeconds % 3600 / 60);
        routes.forEach((route) => {
          const currentConfig = {
            high: route.trainSchedule?.highDemand || 0,
            medium: route.trainSchedule?.mediumDemand || 0,
            low: route.trainSchedule?.lowDemand || 0
          };
          const lastConfig = lastTrainConfig[route.id];
          if (!lastConfig || _hasConfigChanged(currentConfig, lastConfig)) {
            recordConfigChange(route.id, currentHour, currentMinute, currentConfig, api28, storage);
            lastTrainConfig[route.id] = currentConfig;
          }
        });
        lastHour2 = currentHour;
      }, 500);
      console.log(`${CONFIG.LOG_PREFIX} [LC] configCheck \u2014 interval started`);
    }
    _startConfigTracking = startConfigTracking;
    api28.hooks.onGameInit(() => {
      console.log(`${CONFIG.LOG_PREFIX} [LC] onGameInit fired | storage: ${storage ? storage.saveName : "null"}`);
      startConfigTracking();
      resetForNewDay();
      initAccumulator(api28);
    });
    api28.hooks.onGameLoaded(async (saveName) => {
      console.log(`${CONFIG.LOG_PREFIX} [LC] onGameLoaded fired | saveName: ${saveName} | prev storage: ${storage ? storage.saveName : "null"}`);
      storage = _initStorage(saveName);
      const matchingKey = await _findMatchingSave(saveName, api28);
      if (matchingKey) {
        console.log(`${CONFIG.LOG_PREFIX} [LC] Found matching save: ${matchingKey}`);
        storage.setSaveName(matchingKey);
        currentSaveName = matchingKey;
      } else {
        console.log(`${CONFIG.LOG_PREFIX} [LC] No matching save found, using: ${saveName}`);
        currentSaveName = saveName;
      }
      await storage.restore();
      lastTrainConfig = {};
      lastHour2 = null;
      startConfigTracking();
      resetForNewDay();
      initAccumulator(api28);
      console.log(`${CONFIG.LOG_PREFIX} [LC] onGameLoaded complete | active save: ${currentSaveName}`);
    });
    api28.hooks.onGameSaved(async (saveName) => {
      console.log(`${CONFIG.LOG_PREFIX} [LC] onGameSaved fired | saveName: ${saveName} | prev storage: ${storage ? storage.saveName : "null"}`);
      if (!storage) {
        storage = _initStorage(saveName);
      }
      const oldSaveName = storage.saveName;
      if (oldSaveName && oldSaveName !== saveName) {
        const isTempId = /\d{13}/.test(oldSaveName);
        await Storage.migrateKeys(oldSaveName, saveName, isTempId);
        await Storage.renameSave(oldSaveName, saveName);
        if (isTempId) {
          console.log(`${CONFIG.LOG_PREFIX} [LC] Migrated data from temp save "${oldSaveName}" to: "${saveName}"`);
        } else {
          console.log(`${CONFIG.LOG_PREFIX} [LC] Copied data from "${oldSaveName}" to: "${saveName}"`);
        }
      }
      storage.setSaveName(saveName);
      currentSaveName = saveName;
      await storage.backup(api28);
      console.log(`${CONFIG.LOG_PREFIX} [LC] onGameSaved complete | active save: ${currentSaveName}`);
    });
    api28.hooks.onGameEnd((result) => {
      console.log(`${CONFIG.LOG_PREFIX} [LC] onGameEnd fired | result: ${JSON.stringify(result)} | clearing interval and storage`);
      if (configCheckInterval) {
        clearInterval(configCheckInterval);
        configCheckInterval = null;
        console.log(`${CONFIG.LOG_PREFIX} [LC] configCheck \u2014 interval cleared on game end`);
      }
      storage = null;
      lastTrainConfig = {};
      lastHour2 = null;
      currentSaveName = null;
      _startConfigTracking = null;
      stopAccumulating();
      console.log(`${CONFIG.LOG_PREFIX} [LC] onGameEnd \u2014 state reset complete`);
    });
    api28.hooks.onDayChange(async (dayThatEnded) => {
      console.log(`${CONFIG.LOG_PREFIX} [LC] onDayChange fired | day ended: ${dayThatEnded} | storage: ${storage ? storage.saveName : "null"}`);
      if (!storage) {
        console.warn(`${CONFIG.LOG_PREFIX} Storage not initialized, skipping data capture`);
        return;
      }
      const currentDay = api28.gameState.getCurrentDay();
      await captureInitialDayConfig(currentDay, api28, storage);
      lastTrainConfig = {};
      const accumulatedRevenue = getDaySnapshot();
      const hourlyRevenue = getHourlySnapshot();
      console.log(`${CONFIG.LOG_PREFIX} [LC] Revenue snapshot: ${Object.keys(accumulatedRevenue).length} routes accumulated`);
      resetForNewDay();
      await captureHistoricalData(dayThatEnded, api28, storage, accumulatedRevenue, hourlyRevenue);
      await _transitionNewRoutesToOngoing(storage);
    });
    api28.hooks.onRouteCreated((route) => {
      console.log(`${CONFIG.LOG_PREFIX} [LC] onRouteCreated | route: ${route.id} | storage: ${storage ? storage.saveName : "null"}`);
      if (!storage) return;
      const currentDay = api28.gameState.getCurrentDay();
      const creationTime = api28.gameState.getElapsedSeconds();
      _setRouteStatus(route.id, "new", currentDay, storage, creationTime);
      lastTrainConfig[route.id] = {
        high: route.trainSchedule?.highDemand || 0,
        medium: route.trainSchedule?.mediumDemand || 0,
        low: route.trainSchedule?.lowDemand || 0
      };
    });
    api28.hooks.onRouteDeleted((routeId) => {
      console.log(`${CONFIG.LOG_PREFIX} [LC] onRouteDeleted | route: ${routeId} | storage: ${storage ? storage.saveName : "null"}`);
      if (!storage) return;
      const currentDay = api28.gameState.getCurrentDay();
      _setRouteStatus(routeId, "deleted", currentDay, storage);
      delete lastTrainConfig[routeId];
    });
    console.log(`${CONFIG.LOG_PREFIX} \u2713 Lifecycle hooks registered`);
  }
  function getStorage() {
    return storage;
  }
  async function _setRouteStatus(routeId, status, day, storage2, creationTime = null) {
    const statuses = await storage2.get("routeStatuses", {});
    if (status === "new") {
      statuses[routeId] = {
        status: "new",
        createdDay: day,
        creationTime,
        deletedDay: null
      };
    } else if (status === "ongoing") {
      if (statuses[routeId]) {
        statuses[routeId].status = "ongoing";
      }
    } else if (status === "deleted") {
      if (statuses[routeId]) {
        statuses[routeId].status = "deleted";
        statuses[routeId].deletedDay = day;
      }
    }
    await storage2.set("routeStatuses", statuses);
  }
  async function _transitionNewRoutesToOngoing(storage2) {
    const statuses = await storage2.get("routeStatuses", {});
    let updated = false;
    for (const routeId in statuses) {
      if (statuses[routeId].status === "new") {
        statuses[routeId].status = "ongoing";
        updated = true;
      }
    }
    if (updated) {
      await storage2.set("routeStatuses", statuses);
    }
  }
  function _hasConfigChanged(config1, config2) {
    return config1.high !== config2.high || config1.medium !== config2.medium || config1.low !== config2.low;
  }

  // src/assets/styles.js
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
        /* ===== General ==================================================== */
        html.dark .aa-dialog-dialog, html.dark #aa-panel,
        html.dark .aa-dropdown-menu {
            color-scheme: dark;
        }
        html {
            --aa-transfer-color: #8f4eff;
            --aa-chart-secondary-metric: #000;
        }
        html.dark {
            --aa-transfer-color: #a78bfa;
            --aa-chart-secondary-metric: #FFF;
        }
        
        /* ===== Utility Classes ============================================ */
        html.dark .dark\\:bg-background\\/50 {
            background-color: hsl(var(--background) / 0.5);
        }
        
        .list-disc {
            list-style-type: disc;
            padding-inline-start: 3em;
        }
        
        .sticky {
            position: sticky;
        }
        
        .scrollbar-thin {
             scrollbar-width: thin;
        }
        
        /* ===== Components ================================================= */        
        .aa-table th:first-child,
            position: sticky;
            left: 0;
        }

        .aa-dropdown-menu {
            min-width: 100%;
        }

        #sb-aa-panel-wrapper .aa-table {
            height: 100%;
        }
        
        .aa-dialog-dialog-header {
            border-radius: calc(var(--radius) - 2px) calc(var(--radius) - 2px) 0 0;
        }
           
        /* ===== Charts ===================================================== */
        html .aa-chart [fill="#ccc"] {
            fill: #000!important;
            opacity: 0.05;
        }

        html.dark .aa-chart [fill="#ccc"] {
            fill: #FFF!important;
            opacity: 0.05;
        }
    `;
    document.head.appendChild(style);
  }

  // src/hooks/portal.jsx
  var api = window.SubwayBuilderAPI;
  var { React } = api.utils;
  var _nextPortalId = 0;
  function Portal({ children }) {
    const idRef = React.useRef(null);
    if (idRef.current === null) {
      idRef.current = `aa-portal-${_nextPortalId++}`;
    }
    const id = idRef.current;
    React.useLayoutEffect(() => {
      window.AdvancedAnalytics._portalRegistry?.mount(id, children);
    });
    React.useEffect(() => {
      return () => {
        window.AdvancedAnalytics._portalRegistry?.unmount(id);
      };
    }, []);
    return null;
  }

  // src/components/dialog.jsx
  var api2 = window.SubwayBuilderAPI;
  var { React: React2, icons } = api2.utils;
  function Dialog({ id, title, backdropClasses, children, isOpen, onClose, size, noPadding }) {
    const [state, setState] = React2.useState("open");
    React2.useEffect(() => {
      if (isOpen) {
        setState("open");
      }
    }, [isOpen]);
    if (!isOpen) return null;
    return /* @__PURE__ */ React2.createElement(Portal, null, /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
      "div",
      {
        id: `${id}-backdrop`,
        "data-state": state,
        className: backdropClasses + " aa-dialog-backdrop fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] bg-black/50",
        style: { pointerEvents: "auto", width: "100vw", height: "100vh" },
        onClick: onClose,
        "aria-hidden": "true"
      }
    ), /* @__PURE__ */ React2.createElement(
      "div",
      {
        id: `${id}-dialog`,
        role: "dialog",
        "data-state": state,
        className: "aa-dialog-dialog fixed flex flex-col left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] border backdrop-blur-md bg-background dark:bg-background/50 sm:rounded-lg select-none max-w-[95vw] max-h-[90vh] p-0",
        tabIndex: "-1",
        style: { pointerEvents: "auto", width: size }
      },
      /* @__PURE__ */ React2.createElement("div", { className: "aa-dialog-dialog-header bg-background flex flex-col space-y-1.5 text-center sm:text-left px-6 py-4 border-b h-fit" }, /* @__PURE__ */ React2.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React2.createElement("h2", { className: "text-lg font-semibold leading-none tracking-tight" }, title), /* @__PURE__ */ React2.createElement(
        "button",
        {
          type: "button",
          onClick: onClose,
          className: "data-[state=open]:bg-accent data-[state=open]:text-muted-foreground disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring hover:opacity-100 opacity-70 ring-offset-background transition-opacity"
        },
        /* @__PURE__ */ React2.createElement(icons.X, null),
        /* @__PURE__ */ React2.createElement("span", { className: "sr-only" }, "Close")
      ))),
      /* @__PURE__ */ React2.createElement("div", { className: noPadding ? "aa-dialog-dialog-body" : "aa-dialog-dialog-body px-6 py-4 overflow-y-auto" }, children)
    )));
  }

  // src/ui/guide/guide-dialog.jsx
  var api3 = window.SubwayBuilderAPI;
  var { React: React3, icons: icons2 } = api3.utils;
  function NavSection({ id, label, scrollTo }) {
    return /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement(
      "button",
      {
        onClick: () => scrollTo(id),
        className: "pt-2 w-full text-left font-semibold text-foreground py-1 hover:text-primary"
      },
      label
    ));
  }
  function NavItem({ id, label, icon, scrollTo }) {
    return /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement(
      "button",
      {
        onClick: () => scrollTo(id),
        className: "flex gap-1 items-center w-full text-left text-foreground/80 py-1.5 pl-2 hover:text-foreground text-xs"
      },
      icon && React3.createElement(icons2[icon], { size: 14 }),
      label
    ));
  }
  function SectionTitle({ id, children }) {
    return /* @__PURE__ */ React3.createElement("h2", { id, className: "text-3xl font-semibold mt-6 pt-6 mb-5 pb-3 border-b border-border" }, children);
  }
  function MetricEntry({ id, label, icon, iconClasses, children }) {
    return /* @__PURE__ */ React3.createElement("div", { id, className: "mb-5 pt-2 pb-6" }, /* @__PURE__ */ React3.createElement("div", { className: "flex gap-2" }, icon && React3.createElement(icons2[icon], { size: 20, className: "mt-1 shrink-0 " + iconClasses }), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("h3", { className: "text-2xl font-semibold mb-1 gap-2" }, label), /* @__PURE__ */ React3.createElement("div", { className: "text-foreground/80 leading-relaxed space-y-1.5 text-sm" }, children))));
  }
  function Note({ children }) {
    return /* @__PURE__ */ React3.createElement(
      "div",
      {
        className: "border border-l-4 flex gap-3 pl-3 pr-4 py-3 rounded-l-none rounded-lg text-sm text-blue-500",
        style: { borderColor: "currentColor", backgroundColor: "color-mix(in srgb, currentColor, transparent 95%)" }
      },
      /* @__PURE__ */ React3.createElement(icons2.Info, { size: 20, className: "shrink-0" }),
      /* @__PURE__ */ React3.createElement("p", { className: "text-foreground" }, children)
    );
  }
  function Warning({ children }) {
    return /* @__PURE__ */ React3.createElement(
      "div",
      {
        className: "border border-l-4 flex gap-3 pl-3 pr-4 py-3 rounded-l-none rounded-lg text-sm text-orange-400",
        style: { borderColor: "currentColor", backgroundColor: "color-mix(in srgb, currentColor, transparent 95%)" }
      },
      /* @__PURE__ */ React3.createElement(icons2.TriangleAlert, { size: 20, className: "shrink-0" }),
      /* @__PURE__ */ React3.createElement("p", { className: "text-foreground" }, children)
    );
  }
  function UsageThresholdBar() {
    const zones = [
      { bg: "#ef4444", flex: 30, text: "Critical", textColor: "rgb(255,255,255)" },
      { bg: "#eab308", flex: 15, text: "Under-used", textColor: "rgb(0,0,0)" },
      { bg: "#16a34a", flex: 40, text: "Healthy", textColor: "rgb(255,255,255)" },
      { bg: "#eab308", flex: 10, text: "Busy", textColor: "rgb(0,0,0)" },
      { bg: "#ef4444", flex: 5, text: "!", textColor: "rgb(255,255,255)" }
    ];
    const ticks = [
      { pct: 0, label: "0%" },
      { pct: 30, label: "30%" },
      { pct: 45, label: "45%" },
      { pct: 85, label: "85%" },
      { pct: 97.4, label: "95%+" }
    ];
    return /* @__PURE__ */ React3.createElement("div", { className: "my-4 select-none" }, /* @__PURE__ */ React3.createElement("div", { className: "flex h-7 rounded overflow-hidden", style: { gap: "1px" } }, zones.map((z, i) => /* @__PURE__ */ React3.createElement(
      "div",
      {
        key: i,
        className: "flex items-center justify-center text-xs font-semibold overflow-hidden",
        style: { flex: z.flex, backgroundColor: z.bg, color: z.textColor }
      },
      z.text
    ))), /* @__PURE__ */ React3.createElement("div", { className: "relative", style: { height: "28px" } }, ticks.map((t, i) => /* @__PURE__ */ React3.createElement(
      "div",
      {
        key: i,
        className: "absolute top-0 flex flex-col items-center",
        style: {
          left: `${t.pct}%`,
          transform: i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)"
        }
      },
      /* @__PURE__ */ React3.createElement("div", { style: { width: 1, height: 6, backgroundColor: "currentColor" } }),
      /* @__PURE__ */ React3.createElement("span", { className: "text-xs text-foreground", style: { whiteSpace: "nowrap" } }, t.label)
    ))));
  }
  function Badge({ style, children }) {
    return /* @__PURE__ */ React3.createElement(
      "span",
      {
        className: `px-2 py-1 font-bold rounded-full ${style ? style : "bg-primary text-primary-foreground"}`
      },
      children
    );
  }
  function GuideDialog({ isOpen, onClose }) {
    const scrollTo = (id) => {
      if (!id) return;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return /* @__PURE__ */ React3.createElement(
      Dialog,
      {
        id: "aa-guide-dialog",
        title: "Advanced Analytics - User Guide",
        size: 980,
        noPadding: true,
        isOpen,
        onClose,
        backdropClasses: "bg-black/80"
      },
      /* @__PURE__ */ React3.createElement("section", { className: "flex min-h-0 h-[80vh]" }, /* @__PURE__ */ React3.createElement("aside", { className: "relative shrink-0 h-full" }, /* @__PURE__ */ React3.createElement("div", { className: "bg-background border-border border-r flex h-full inset-0 justify-center overflow-y-auto p-3 pl-7 pr-8" }, /* @__PURE__ */ React3.createElement("ul", { className: "space-y-0.5" }, /* @__PURE__ */ React3.createElement(NavSection, { id: "aa-guide-intro", label: "Introduction", scrollTo }), /* @__PURE__ */ React3.createElement(NavSection, { id: "aa-guide-data-modes", label: "Data Modes", scrollTo }), /* @__PURE__ */ React3.createElement(NavSection, { id: "aa-guide-metrics", label: "Metrics", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-ridership", label: "Ridership", icon: "Route", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-throughput", label: "Throughput", icon: "Container", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-usage", label: "Usage", icon: "Scale", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-trains", label: "Trains", icon: "TramFront", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-stations", label: "Stations", icon: "Building2", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-transfers", label: "Transfers", icon: "Circle", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-revenue", label: "Revenue", icon: "ArrowBigUpDash", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-cost", label: "Cost", icon: "ArrowBigDownDash", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-profit", label: "Profit", icon: "HandCoins", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-profit-pax", label: "Profit / Pax", icon: "UserRoundSearch", scrollTo }), /* @__PURE__ */ React3.createElement(NavItem, { id: "aa-guide-m-profit-train", label: "Profit / Train", icon: "TrainFrontTunnel", scrollTo }), /* @__PURE__ */ React3.createElement(NavSection, { id: "aa-guide-storage", label: "Storage", scrollTo })))), /* @__PURE__ */ React3.createElement("div", { className: "flex-1 overflow-y-auto px-6" }, /* @__PURE__ */ React3.createElement(SectionTitle, { id: "aa-guide-intro" }, "Introduction"), /* @__PURE__ */ React3.createElement("p", { className: " text-foreground/80" }, /* @__PURE__ */ React3.createElement("strong", null, "Advanced Analytics"), " adds historical per-route advanced analytics to Subway Builder."), /* @__PURE__ */ React3.createElement("p", { className: " text-foreground/80 mt-2" }, "It tracks ridership, capacity, financial metrics, and transfer connections, and records end-of-day snapshots so you can review how your network evolved over time and compare any two days side by side."), /* @__PURE__ */ React3.createElement("p", { className: " text-foreground/80 mt-2" }, "The panel sits alongside the game UI and updates automatically.", /* @__PURE__ */ React3.createElement("br", null), "All data persists across game restarts."), /* @__PURE__ */ React3.createElement(SectionTitle, { id: "aa-guide-data-modes" }, "Data Modes"), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-last24h", label: "Last 24h (live)", icon: "Clock" }, "Shows current metrics computed in real time against the game's rolling 24-hour ridership window. Routes built during the current day show figures adjusted to the time elapsed since they were created, so newly opened lines are not penalised by a full-day cost projection."), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-historical", label: "Historical", icon: "Calendar" }, "End-of-day snapshots captured automatically when each in-game day ends. Pick any recorded day from the selector to review how every route performed on that day. Historical data accumulates as you play; the mod keeps the most recent days and prunes older ones to avoid unbounded storage growth."), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-comparison", label: "Comparison", icon: "GitCompareArrows" }, "Places two historical days side by side. Each metric shows the absolute value alongside a percentage change arrow. Green means improvement, red means decline (accounting for metric direction \u2014 a cost increase is negative, a revenue increase is positive). Routes that were created or deleted between the two days are flagged as ", /* @__PURE__ */ React3.createElement("span", { className: "text-purple-500 dark:text-purple-400 font-medium border py-0.5 px-1 mx-1" }, "NEW"), " or ", /* @__PURE__ */ React3.createElement("span", { className: "text-gray-400 font-medium border py-0.5 px-1 mx-1" }, "DELETED"), "."), /* @__PURE__ */ React3.createElement(SectionTitle, { id: "aa-guide-metrics" }, "Metrics"), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-ridership", label: "Ridership", icon: "Route" }, /* @__PURE__ */ React3.createElement("p", null, "The number of passengers carried in the current rolling 24-hour window, as reported directly by the game. This is the primary measure of how well a route is serving demand.")), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-throughput", label: "Throughput", icon: "Container" }, /* @__PURE__ */ React3.createElement("p", null, "The theoretical maximum number of passengers the route could carry in 24 hours at its current train frequency \u2014 the ceiling above current ridership. Calculated by summing three game periods:"), /* @__PURE__ */ React3.createElement("ul", { className: "list-disc" }, /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "font-bold text-red-500" }, "High"), " (rush hours \u2014 6h total)"), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "font-bold text-orange-400" }, "Medium"), " (shoulder hours \u2014 9h total)"), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "font-bold text-green-500" }, "Low"), " (overnight \u2014 9h total).")), /* @__PURE__ */ React3.createElement("p", null, "For each period, the formula is:"), /* @__PURE__ */ React3.createElement("div", { className: "flex items-center gap-2 pt-3 pb-4 text-foreground font-bold" }, /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-foreground text-background" }, "trains in that tier"), "\u2A09", /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-foreground text-background" }, "loops per hour"), "\u2A09", /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-foreground text-background" }, "cars per train"), "\u2A09", /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-foreground text-background" }, "capacity per car"), "\u2A09", /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-foreground text-background" }, "hours in period")), /* @__PURE__ */ React3.createElement("p", { className: "pb-1" }, "The loop time comes from the route's station timings; a shorter loop means more round trips per hour and higher throughput."), /* @__PURE__ */ React3.createElement(Note, null, "When ridership approaches throughput, adding trains or longer consists will increase headroom before the route becomes a bottleneck.")), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-usage", label: "Usage", icon: "Scale" }, /* @__PURE__ */ React3.createElement("p", { className: "pb-1" }, "Ridership as a percentage of throughput \u2014 how full the route is relative to its capacity. Color-coded for quick reading:"), /* @__PURE__ */ React3.createElement(UsageThresholdBar, null), /* @__PURE__ */ React3.createElement("ul", { className: "list-disc pb-1" }, /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "text-green-500 font-medium" }, "Green"), " (45\u201385%): healthy usage range."), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "text-yellow-500 font-medium" }, "Yellow"), ": the route is getting busy (85\u201395%) or under-used (30\u201345%)."), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "text-red-500 font-medium" }, "Red"), ": near or over capacity (above 95%) or critically under-used (below 30%).")), /* @__PURE__ */ React3.createElement("p", { className: "pt-1" }, "Very low usage is not inherently bad since a new route takes time to attract passengers. Give new routes time to grow. Very high usage is a service quality risk and may suppress further ridership growth."), /* @__PURE__ */ React3.createElement(Warning, null, /* @__PURE__ */ React3.createElement("b", null, "Use this value as a performance indicator rather than an overload warning."), "The value is a median computed for the entire day. A route might experience overload during rush hours and be underutilized during the night, yet still be ranked as \u201Chealthy.\u201D")), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-trains", label: "Trains", icon: "TramFront" }, /* @__PURE__ */ React3.createElement("p", null, "The number of trains assigned to each demand tier.", /* @__PURE__ */ React3.createElement("br", null), "Displayed as three values: ", /* @__PURE__ */ React3.createElement("span", { className: "text-red-500" }, "High"), " /", " ", /* @__PURE__ */ React3.createElement("span", { className: "text-orange-400" }, "Medium"), " /", " ", /* @__PURE__ */ React3.createElement("span", { className: "text-green-500" }, "Low"), ". The tiers correspond to fixed time windows in the game day.")), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-stations", label: "Stations", icon: "Building2" }, /* @__PURE__ */ React3.createElement("p", null, "The number of stations on the route, counting both termini and all intermediate stops.")), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-transfers", label: "Transfers", icon: "Circle", iconClasses: "dark:text-purple-400 text-purple-600" }, /* @__PURE__ */ React3.createElement("p", null, "The number of interchange connections this route shares with other lines. A station is counted as a transfer point when any of the following is true:"), /* @__PURE__ */ React3.createElement("ul", { className: "list-disc" }, /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("strong", null, "Two or more routes stop at the exact same station"), " (for example, a shared terminus)."), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("strong", null, 'The station belongs to a "Station Group"'), "."), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("strong", null, "The station has another route's station within a short walking distance"), " (less than 100 seconds on foot).")), /* @__PURE__ */ React3.createElement("p", null, "Each qualifying station is counted ", /* @__PURE__ */ React3.createElement("b", null, "once"), " per connected route. The tooltip on the Transfers cell lists which routes are reachable."), /* @__PURE__ */ React3.createElement("p", { className: "pb-1" }, "In the Station Flow chart, transfer stations are marked with a small circle on the bottom axis, and the chart tooltip lists the connecting route badges when you hover over a transfer station."), /* @__PURE__ */ React3.createElement(Note, null, "Only direct interchanges are counted. Passengers may walk further to reach other lines not listed here.")), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-revenue", label: "Revenue", icon: "ArrowBigUpDash" }, /* @__PURE__ */ React3.createElement("p", { className: "pb-1" }, "Total fare income for the day, taken from the game's revenue-per-hour figure and extrapolated to 24 hours. This value is determined by the game's fare model and passenger mix \u2014 the mod reads it directly without modification."), /* @__PURE__ */ React3.createElement(Warning, null, 'Use this value as a performance indicator rather than as a pure financial metric. The API provides a point-in-time snapshot instead of actual completed journeys. As a result, these figures may differ from the values shown in the "Financial Dashboard".')), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-cost", label: "Cost", icon: "ArrowBigDownDash" }, /* @__PURE__ */ React3.createElement("p", null, "The daily operational cost of running the route. For each demand phase, it's calculated as:"), /* @__PURE__ */ React3.createElement("div", { className: "flex items-center gap-2 pt-3 pb-4 text-foreground font-bold" }, /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-foreground text-background" }, "trains"), "\u2A09", /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-foreground text-background" }, "duration"), "\u2A09", /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-purple-600 text-white" }, "cost per train-hour")), /* @__PURE__ */ React3.createElement("p", null, "The ", /* @__PURE__ */ React3.createElement(Badge, { style: "text-xs bg-purple-600 text-white" }, "cost per train-hour"), " combines a fixed locomotive cost and a per-car cost (both from the train type's stats), multiplied by the game's pricing factor."), /* @__PURE__ */ React3.createElement("p", null, "If you change the train schedule during the day, the mod records the exact minute of each change and computes cost against the actual configuration timeline rather than the end-of-day snapshot. This prevents inflated cost figures after reducing trains late in the day.")), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-profit", label: "Profit", icon: "HandCoins" }, /* @__PURE__ */ React3.createElement("p", null, "Revenue minus Cost. A negative value means the route is running at a loss and is shown in red. Profit integrates all operational costs, so a route with healthy ridership can still lose money if it runs too many trains or uses an expensive train type on a short loop."), /* @__PURE__ */ React3.createElement(Warning, null, 'Use this value as a performance indicator rather than as a pure financial metric. See "Revenue".')), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-profit-pax", label: "Profit / Pax", icon: "UserRoundSearch" }, /* @__PURE__ */ React3.createElement("p", { className: "pb-1" }, "Daily profit divided by ridership \u2014 the net return per passenger carried. This normalises profit for route size, making it easier to compare a small efficient line against a large busy one."), /* @__PURE__ */ React3.createElement(Note, null, "A small route with high profit per passenger may be a candidate for expansion. A large route with negative profit per passenger is costing more the more it is used."), /* @__PURE__ */ React3.createElement("div", { className: "pb-1" }), /* @__PURE__ */ React3.createElement(Warning, null, 'Use this value as a performance indicator rather than as a pure financial metric. See "Revenue".')), /* @__PURE__ */ React3.createElement(MetricEntry, { id: "aa-guide-m-profit-train", label: "Profit / Train", icon: "TrainFrontTunnel" }, /* @__PURE__ */ React3.createElement("p", { className: "pb-1" }, "Daily profit divided by the total number of trains deployed across all three demand tiers. Shows how much each individual train contributes to the bottom line. Useful for evaluating whether adding trains to a route is financially worthwhile."), /* @__PURE__ */ React3.createElement(Warning, null, 'Use this value as a performance indicator rather than as a pure financial metric. See "Revenue".')), /* @__PURE__ */ React3.createElement(SectionTitle, { id: "aa-guide-storage" }, "Storage Manager"), /* @__PURE__ */ React3.createElement("div", { className: " text-foreground/80 leading-relaxed space-y-3" }, /* @__PURE__ */ React3.createElement("p", null, "The game does not provide a way for mods to write data into the save file directly. ", /* @__PURE__ */ React3.createElement("strong", null, "Advanced Analytics"), " stores all its data in IndexedDB, the browser's built-in persistent database embedded in the game's Electron runtime."), /* @__PURE__ */ React3.createElement("p", null, "Data survives game restarts and has no practical size limit for the amount of analytics data this mod generates."), /* @__PURE__ */ React3.createElement("p", { className: "text-sm" }, "Data is organised by save name. When the game loads, the mod reads the current save name and uses it as the storage key. ", /* @__PURE__ */ React3.createElement("strong", { className: "text-foreground" }, "Save your game at least once to associate data to your save"), " \u2014 an unsaved session has no stable name, and the mod warns you with a banner in the Storage Manager if this is the case."), /* @__PURE__ */ React3.createElement("p", { className: "text-sm" }, "Over time, data from multiple saves or cities accumulates. The Storage Manager (accessible from the toolbar) lists all tracked saves with their city, last modified date, number of historical days recorded, and estimated data size. From there you can:"), /* @__PURE__ */ React3.createElement("ul", { className: "space-y-1.5 pl-3 text-sm" }, /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "font-medium text-foreground" }, "Delete"), " \u2014 permanently removes selected saves and all their historical data."), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "font-medium text-foreground" }, "Clear All Except Current"), " \u2014 removes data from all saves other than the active one. Useful for cleaning up after starting a new city or abandoning a run."), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "font-medium text-foreground" }, "Export"), " \u2014 downloads selected saves as a JSON file. Use this to back up data before reinstalling the game or the mod, or to move data between machines."), /* @__PURE__ */ React3.createElement("li", null, /* @__PURE__ */ React3.createElement("span", { className: "font-medium text-foreground" }, "Import"), " \u2014 loads a previously exported JSON file. If a save with the same name already exists, you will be asked to confirm before overwriting.")), /* @__PURE__ */ React3.createElement("div", { className: "pt-2" }), /* @__PURE__ */ React3.createElement(Note, null, "Deleting a save here only removes the mod's analytics data \u2014 it does not affect the game save file itself.")), /* @__PURE__ */ React3.createElement("div", { className: "pt-8" })))
    );
  }

  // src/ui/guide/guide-trigger.jsx
  var api4 = window.SubwayBuilderAPI;
  var { React: React4, icons: icons3 } = api4.utils;
  function GuideTrigger() {
    const [isOpen, setIsOpen] = React4.useState(false);
    return /* @__PURE__ */ React4.createElement(React4.Fragment, null, /* @__PURE__ */ React4.createElement(
      "button",
      {
        onClick: () => setIsOpen(true),
        className: "inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground mr-auto",
        title: "User Guide"
      },
      /* @__PURE__ */ React4.createElement(icons3.BookText, { size: 16 }),
      /* @__PURE__ */ React4.createElement("span", { className: "ml-2 text-xs" }, "Guide")
    ), /* @__PURE__ */ React4.createElement(
      GuideDialog,
      {
        isOpen,
        onClose: () => setIsOpen(false)
      }
    ));
  }

  // src/ui/storage/storage-table.jsx
  var api5 = window.SubwayBuilderAPI;
  var { React: React5 } = api5.utils;
  function StorageTable({
    data = [],
    columns = [],
    selectedIds = [],
    onSelectionChange = () => {
    },
    currentId = null
  }) {
    const [sortState, setSortState] = React5.useState({ column: null, order: "desc" });
    const handleSelectAll = (e) => {
      if (e.target.checked) {
        onSelectionChange(data.map((row) => row.id));
      } else {
        onSelectionChange([]);
      }
    };
    const handleSelectRow = (rowId) => {
      if (selectedIds.includes(rowId)) {
        onSelectionChange(selectedIds.filter((id) => id !== rowId));
      } else {
        onSelectionChange([...selectedIds, rowId]);
      }
    };
    const handleSort = (columnKey) => {
      setSortState((prev) => ({
        column: columnKey,
        order: prev.column === columnKey && prev.order === "desc" ? "asc" : "desc"
      }));
    };
    const sortedData = React5.useMemo(() => {
      if (!sortState.column) return data;
      return [...data].sort((a, b) => {
        const aVal = a[sortState.column];
        const bVal = b[sortState.column];
        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortState.order === "desc" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        }
        return sortState.order === "desc" ? bVal - aVal : aVal - bVal;
      });
    }, [data, sortState]);
    const getSortIndicator2 = (columnKey) => {
      if (sortState.column !== columnKey) {
        return CONFIG.ARROWS.DOWN;
      }
      return sortState.order === "desc" ? CONFIG.ARROWS.DOWN : CONFIG.ARROWS.UP;
    };
    const allSelected = data.length > 0 && selectedIds.length === data.length;
    const someSelected = selectedIds.length > 0 && selectedIds.length < data.length;
    return /* @__PURE__ */ React5.createElement("table", { className: "w-full border-collapse text-sm" }, /* @__PURE__ */ React5.createElement("thead", null, /* @__PURE__ */ React5.createElement("tr", { className: "border-b border-border" }, /* @__PURE__ */ React5.createElement("th", { className: "px-3 py-2 text-left w-10" }, /* @__PURE__ */ React5.createElement(
      "input",
      {
        type: "checkbox",
        checked: allSelected,
        ref: (input) => {
          if (input) {
            input.indeterminate = someSelected;
          }
        },
        onChange: handleSelectAll,
        className: "cursor-pointer",
        title: "Select all"
      }
    )), columns.map((column) => {
      const alignClass = column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left";
      const isActiveSort = sortState.column === column.key;
      return /* @__PURE__ */ React5.createElement(
        "th",
        {
          key: column.key,
          className: `px-3 py-2 ${alignClass} ${column.sortable !== false ? "cursor-pointer select-none" : ""} transition-colors hover:text-foreground`,
          onClick: column.sortable !== false ? () => handleSort(column.key) : void 0
        },
        /* @__PURE__ */ React5.createElement("div", { className: `flex ${column.align === "right" ? "justify-end" : "justify-start"} items-center gap-1 whitespace-nowrap` }, column.sortable !== false && /* @__PURE__ */ React5.createElement("span", { className: isActiveSort ? "inline-block" : "inline-block opacity-0" }, getSortIndicator2(column.key)), /* @__PURE__ */ React5.createElement("span", { className: "font-medium text-xs" }, column.label))
      );
    }))), /* @__PURE__ */ React5.createElement("tbody", { className: "text-xs" }, sortedData.map((row) => {
      const isSelected = selectedIds.includes(row.id);
      const isCurrent = currentId === row.id;
      return /* @__PURE__ */ React5.createElement(
        "tr",
        {
          key: row.id,
          className: `border-b border-border transition-colors ${isCurrent ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/50"}`
        },
        /* @__PURE__ */ React5.createElement("td", { className: "px-3 py-2 align-middle" }, /* @__PURE__ */ React5.createElement(
          "input",
          {
            type: "checkbox",
            checked: isSelected,
            onChange: () => handleSelectRow(row.id),
            className: "cursor-pointer"
          }
        )),
        columns.map((column) => {
          const alignClass = column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left";
          const value = row[column.key];
          const displayValue = column.render ? column.render(value, row) : value;
          return /* @__PURE__ */ React5.createElement(
            "td",
            {
              key: column.key,
              className: `px-4 py-2 align-middle ${alignClass} ${isCurrent ? "font-bold" : ""}`
            },
            displayValue,
            isCurrent && column.key === "name" && /* @__PURE__ */ React5.createElement("span", { className: "ml-2 text-blue-500" }, "(current)")
          );
        })
      );
    }), sortedData.length === 0 && /* @__PURE__ */ React5.createElement("tr", null, /* @__PURE__ */ React5.createElement(
      "td",
      {
        colSpan: columns.length + 1,
        className: "px-3 py-8 text-center text-muted-foreground"
      },
      "No data available"
    ))));
  }

  // src/ui/storage/storage-dialog.jsx
  var api6 = window.SubwayBuilderAPI;
  var { React: React6, icons: icons4 } = api6.utils;
  function StorageDialog({ isOpen, onClose }) {
    const [tableData, setTableData] = React6.useState([]);
    const [selectedIds, setSelectedIds] = React6.useState([]);
    const [currentSaveName2, setCurrentSaveName] = React6.useState(null);
    const [showUnsavedWarning, setShowUnsavedWarning] = React6.useState(false);
    const [storageInfo, setStorageInfo] = React6.useState(null);
    const [isLoading, setIsLoading] = React6.useState(false);
    React6.useEffect(() => {
      if (!isOpen) return;
      loadStorageData();
    }, [isOpen]);
    const getCityName = (cityCode) => {
      if (!cityCode) return "Unknown";
      const cities = api6.utils.getCities();
      const city = cities.find((c) => c.code === cityCode);
      return city ? city.name : cityCode;
    };
    const loadStorageData = async () => {
      setIsLoading(true);
      try {
        const saves = await Storage.getAllSaves();
        const current = getCurrentSaveName();
        setCurrentSaveName(current);
        setShowUnsavedWarning(!current || !saves[current]);
        const rows = await Promise.all(
          Object.entries(saves).map(async ([saveName, meta]) => {
            const tempStorage = new Storage(saveName);
            const historical = await tempStorage.get("historicalData", { days: {} });
            const dayKeys = Object.keys(historical.days).map(Number).sort((a, b) => b - a);
            const lastDay = dayKeys[0];
            const lastDayData = lastDay != null ? historical.days[lastDay] : null;
            const dayCount = dayKeys.length;
            let cityCode = meta.cityCode;
            let routeCount = meta.routeCount;
            let currentDay = meta.day;
            if (saveName === current) {
              cityCode = api6.utils.getCityCode?.() || cityCode;
              routeCount = api6.gameState.getRoutes().length;
              currentDay = api6.gameState.getCurrentDay();
            }
            const sizeBytes = new Blob([JSON.stringify(historical)]).size;
            const timestamp = lastDayData?.timestamp || Date.now();
            return {
              id: saveName,
              name: saveName,
              city: getCityName(cityCode),
              cityCode,
              modified: timestamp,
              dayCount,
              routeCount,
              size: sizeBytes
            };
          })
        );
        setTableData(rows);
        const est = await Storage.estimateUsage();
        setStorageInfo(est);
      } catch (err) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to load storage data:`, err);
        setTableData([]);
      } finally {
        setIsLoading(false);
      }
    };
    const handleDelete = async () => {
      if (selectedIds.length === 0) return;
      const deletingCurrent = currentSaveName2 && selectedIds.includes(currentSaveName2);
      let message = `Delete ${selectedIds.length} save${selectedIds.length > 1 ? "s" : ""}?`;
      if (deletingCurrent) {
        message += "\n\n\u26A0\uFE0F WARNING: You are deleting the CURRENT save!\nAll data for this session will be lost.";
      }
      message += "\n\nThis action cannot be undone.";
      if (!window.confirm(message)) return;
      try {
        await Promise.all(selectedIds.map((id) => Storage.deleteSave(id)));
        await loadStorageData();
        setSelectedIds([]);
        api6.ui.showNotification(`Deleted ${selectedIds.length} save${selectedIds.length > 1 ? "s" : ""}`, "success");
      } catch (err) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to delete saves:`, err);
        api6.ui.showNotification("Failed to delete saves", "error");
      }
    };
    const handleDeleteAllExceptCurrent = async () => {
      if (!currentSaveName2) {
        api6.ui.showNotification("No current save to keep", "error");
        return;
      }
      const othersCount = tableData.filter((row) => row.id !== currentSaveName2).length;
      if (othersCount === 0) {
        api6.ui.showNotification("No other saves to delete", "info");
        return;
      }
      const message = `Delete all ${othersCount} saves except "${currentSaveName2}"?

This action cannot be undone.`;
      if (!window.confirm(message)) return;
      try {
        const toDelete = tableData.filter((row) => row.id !== currentSaveName2).map((row) => row.id);
        await Promise.all(toDelete.map((id) => Storage.deleteSave(id)));
        await loadStorageData();
        setSelectedIds([]);
        api6.ui.showNotification(`Deleted ${othersCount} saves`, "success");
      } catch (err) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to clean up saves:`, err);
        api6.ui.showNotification("Failed to clean up saves", "error");
      }
    };
    const handleExport = async () => {
      if (selectedIds.length === 0) return;
      try {
        const saves = await Storage.getAllSaves();
        const exportPayload = {
          version: CONFIG.VERSION,
          exportDate: Date.now(),
          saves: {}
        };
        await Promise.all(selectedIds.map(async (id) => {
          exportPayload.saves[id] = {
            metadata: saves[id] || {},
            data: await Storage.exportSave(id)
          };
        }));
        const blob = new Blob(
          [JSON.stringify(exportPayload, null, 2)],
          { type: "application/json" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        api6.ui.showNotification(`Exported ${selectedIds.length} save${selectedIds.length > 1 ? "s" : ""}`, "success");
      } catch (err) {
        console.error(`${CONFIG.LOG_PREFIX} Failed to export saves:`, err);
        api6.ui.showNotification("Failed to export saves", "error");
      }
    };
    const handleImport = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const importData = JSON.parse(text);
          if (!importData.saves || typeof importData.saves !== "object") {
            throw new Error("Invalid export file format");
          }
          const existingSaves = await Storage.getAllSaves();
          const overwrites = [];
          for (const importName of Object.keys(importData.saves)) {
            if (existingSaves[importName]) {
              overwrites.push(importName);
            }
          }
          if (overwrites.length > 0) {
            const msg = `The following saves will be OVERWRITTEN:
${overwrites.map((n) => `  \u2022 ${n}`).join("\n")}

Continue with import?`;
            if (!window.confirm(msg)) return;
          }
          await Promise.all(
            Object.entries(importData.saves).map(([saveName, savePayload]) => {
              const metadata = savePayload.metadata || {};
              const data = savePayload.data || savePayload;
              return Storage.importSave(saveName, data, metadata);
            })
          );
          await loadStorageData();
          const count = Object.keys(importData.saves).length;
          api6.ui.showNotification(`Imported ${count} save${count > 1 ? "s" : ""}`, "success");
        } catch (err) {
          console.error(`${CONFIG.LOG_PREFIX} Failed to import saves:`, err);
          api6.ui.showNotification("Failed to import saves. Invalid file format.", "error");
        }
      };
      input.click();
    };
    const columns = [
      { key: "name", label: "Save Name", align: "left" },
      { key: "city", label: "City", align: "right" },
      {
        key: "modified",
        label: "Modified",
        align: "right",
        render: (ts) => new Date(ts).toLocaleString()
      },
      {
        key: "dayCount",
        label: "Days",
        align: "right",
        render: (n) => n.toLocaleString()
      },
      {
        key: "routeCount",
        label: "Routes",
        align: "right",
        render: (n) => n.toLocaleString()
      },
      {
        key: "size",
        label: "Size",
        align: "right",
        render: (bytes) => {
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
      }
    ];
    return /* @__PURE__ */ React6.createElement(
      Dialog,
      {
        id: "aa-settings-dialog",
        title: "Storage Management",
        isOpen,
        onClose,
        size: "85vw",
        backdropClasses: "bg-black/80"
      },
      /* @__PURE__ */ React6.createElement("p", { class: "text-muted-foreground text-sm" }, /* @__PURE__ */ React6.createElement("strong", null, "Advanced Analytics"), " stores all its data in IndexedDB, the browser's built-in persistent database embedded in the game's Electron runtime. Data survives game restarts and has no practical size limit for the amount of analytics data this mod generates."),
      /* @__PURE__ */ React6.createElement("hr", { class: "my-4" }),
      /* @__PURE__ */ React6.createElement("div", { className: "sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-4" }, /* @__PURE__ */ React6.createElement("div", { className: "flex items-center justify-between gap-2" }, /* @__PURE__ */ React6.createElement("div", { className: "flex items-center gap-2" }, selectedIds.length > 0 ? /* @__PURE__ */ React6.createElement(React6.Fragment, null, /* @__PURE__ */ React6.createElement(
        "button",
        {
          onClick: handleDelete,
          className: "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90"
        },
        /* @__PURE__ */ React6.createElement(icons4.Trash2, { size: 14 }),
        /* @__PURE__ */ React6.createElement("span", null, "Delete (", selectedIds.length, ")")
      ), /* @__PURE__ */ React6.createElement(
        "button",
        {
          onClick: handleExport,
          className: "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
        },
        /* @__PURE__ */ React6.createElement(icons4.Upload, { size: 14 }),
        /* @__PURE__ */ React6.createElement("span", null, "Export (", selectedIds.length, ")")
      )) : /* @__PURE__ */ React6.createElement("span", { className: "text-xs text-muted-foreground" }, "Select saves to delete or export")), /* @__PURE__ */ React6.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React6.createElement(
        "button",
        {
          onClick: handleDeleteAllExceptCurrent,
          disabled: !currentSaveName2,
          className: "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input disabled:opacity-50 disabled:cursor-not-allowed",
          title: "Delete all saves except current"
        },
        /* @__PURE__ */ React6.createElement(icons4.Trash2, { size: 14 }),
        /* @__PURE__ */ React6.createElement("span", null, "Clear All Except Current")
      ), /* @__PURE__ */ React6.createElement(
        "button",
        {
          onClick: handleImport,
          className: "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-primary text-primary-foreground border-primary hover:bg-primary/90"
        },
        /* @__PURE__ */ React6.createElement(icons4.Download, { size: 14 }),
        /* @__PURE__ */ React6.createElement("span", null, "Import")
      )))),
      showUnsavedWarning && /* @__PURE__ */ React6.createElement("div", { className: "mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" }, /* @__PURE__ */ React6.createElement("div", { className: "flex items-start gap-2" }, /* @__PURE__ */ React6.createElement(icons4.AlertTriangle, { size: 16, className: "mt-0.5 text-amber-500 shrink-0" }), /* @__PURE__ */ React6.createElement("div", { className: "text-xs text-amber-700 dark:text-amber-400" }, /* @__PURE__ */ React6.createElement("strong", null, "Current session data not identifiable"), /* @__PURE__ */ React6.createElement("p", { className: "mt-1" }, "Save the game first so the current session can be tracked and managed here.")))),
      isLoading && /* @__PURE__ */ React6.createElement("div", { className: "flex items-center justify-center py-8 text-muted-foreground text-sm" }, /* @__PURE__ */ React6.createElement(icons4.Loader2, { size: 16, className: "animate-spin mr-2" }), "Loading saves\u2026"),
      !isLoading && /* @__PURE__ */ React6.createElement("div", { className: "overflow-auto rounded-lg border border-border" }, /* @__PURE__ */ React6.createElement(
        StorageTable,
        {
          data: tableData,
          columns,
          selectedIds,
          onSelectionChange: setSelectedIds,
          currentId: currentSaveName2
        }
      )),
      /* @__PURE__ */ React6.createElement("div", { className: "mt-4 p-3 rounded-lg bg-muted/30 border border-border" }, /* @__PURE__ */ React6.createElement("div", { className: "flex items-start gap-2" }, /* @__PURE__ */ React6.createElement(icons4.Info, { size: 16, className: "mt-0.5 text-muted-foreground shrink-0" }), /* @__PURE__ */ React6.createElement("div", { className: "text-xs text-muted-foreground space-y-1" }, /* @__PURE__ */ React6.createElement("p", null, /* @__PURE__ */ React6.createElement("strong", null, "Total saves:"), " ", tableData.length), /* @__PURE__ */ React6.createElement("p", null, /* @__PURE__ */ React6.createElement("strong", null, "Total data size:"), " ", (() => {
        const total = tableData.reduce((s, r) => s + r.size, 0);
        if (total < 1024) return `${total} B`;
        if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
        return `${(total / (1024 * 1024)).toFixed(1)} MB`;
      })()), storageInfo && /* @__PURE__ */ React6.createElement("p", null, /* @__PURE__ */ React6.createElement("strong", null, "IndexedDB usage:"), " ", storageInfo.usedMB, " MB / ", storageInfo.quotaMB, " MB (", storageInfo.pct, ")", /* @__PURE__ */ React6.createElement("div", { className: "mt-1.5 pt-2 relative pt-2 bg-background border rounded overflow-hidden" }, /* @__PURE__ */ React6.createElement(
        "span",
        {
          className: "absolute left-0 bottom-0 h-full bg-destructive",
          style: { width: storageInfo.pct }
        }
      ))), /* @__PURE__ */ React6.createElement("p", { className: "pt-2 border-t border-border/50" }, "Data is stored in IndexedDB \u2014 no practical size limit for analytics data. Use export to back up saves externally."))))
    );
  }

  // src/ui/storage/storage-trigger.jsx
  var api7 = window.SubwayBuilderAPI;
  var { React: React7, icons: icons5 } = api7.utils;
  function StorageTrigger() {
    const [isOpen, setIsOpen] = React7.useState(false);
    return /* @__PURE__ */ React7.createElement(React7.Fragment, null, /* @__PURE__ */ React7.createElement(
      "button",
      {
        onClick: () => setIsOpen(true),
        className: "inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground",
        title: "Storage Settings"
      },
      /* @__PURE__ */ React7.createElement(icons5.DatabaseZap, { size: 16 })
    ), /* @__PURE__ */ React7.createElement(
      StorageDialog,
      {
        isOpen,
        onClose: () => setIsOpen(false)
      }
    ));
  }

  // src/utils/formatting.js
  function formatCurrencyCompact(value, decimals = 0) {
    const absValue = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (absValue >= 1e5) {
      const millions = absValue / 1e6;
      return `${sign}${millions.toFixed(2)}M`;
    }
    const formatted = absValue.toLocaleString(void 0, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    return `${sign}$${formatted}`;
  }
  function formatCurrencyFull(value, decimals = 0) {
    const absValue = Math.abs(value);
    const formatted = absValue.toLocaleString(void 0, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
    const sign = value < 0 ? "-" : "";
    return `${sign}$${formatted}`;
  }
  function formatDayLabel(day, mostRecentDay) {
    return day === mostRecentDay ? `Day ${day} (Yesterday)` : `Day ${day}`;
  }
  function calculateTotalTrains(route) {
    if (!route) return 0;
    return (route.trainsHigh || 0) + (route.trainsMedium || 0) + (route.trainsLow || 0);
  }
  function getAvailableDays(historicalData) {
    return Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
  }
  function wasRouteNewOnDay(routeId, day, routeStatuses) {
    const status = routeStatuses[routeId];
    return status && status.status === "ongoing" && status.createdDay === day;
  }
  function wasRouteDeletedOnDay(routeId, day, routeStatuses) {
    const status = routeStatuses[routeId];
    return status && status.status === "deleted" && status.deletedDay === day;
  }

  // src/components/dropdown.jsx
  var api8 = window.SubwayBuilderAPI;
  var { React: React8 } = api8.utils;
  var GAP = 4;
  function computeMenuPosition(togglerRect, intrinsicHeight) {
    const spaceBelow = window.innerHeight - togglerRect.bottom - GAP;
    const spaceAbove = togglerRect.top - GAP;
    const goUp = intrinsicHeight > spaceBelow && spaceAbove > spaceBelow;
    if (goUp) {
      return {
        direction: "up",
        top: "auto",
        bottom: window.innerHeight - togglerRect.top + GAP,
        left: togglerRect.left,
        minWidth: togglerRect.width,
        maxHeight: Math.max(spaceAbove, 0)
      };
    }
    return {
      direction: "down",
      top: togglerRect.bottom + GAP,
      bottom: "auto",
      left: togglerRect.left,
      minWidth: togglerRect.width,
      maxHeight: Math.max(spaceBelow, 0)
    };
  }
  function Dropdown({
    togglerClasses = "",
    togglerTitle = "",
    togglerIcon: TogglerIcon = null,
    togglerText = "",
    togglerContent = null,
    menuClasses = "",
    multiselect = false,
    value = null,
    onChange = () => {
    },
    children
  }) {
    const [isOpen, setIsOpen] = React8.useState(false);
    const [menuPos, setMenuPos] = React8.useState(null);
    const togglerRef = React8.useRef(null);
    const menuRef = React8.useRef(null);
    const intrinsicHeightRef = React8.useRef(null);
    const handleDismiss = () => setIsOpen(false);
    React8.useLayoutEffect(() => {
      if (!isOpen || intrinsicHeightRef.current !== null) return;
      const measure = () => {
        if (!menuRef.current || intrinsicHeightRef.current !== null) return;
        const menuRect = menuRef.current.getBoundingClientRect();
        const togglerRect = togglerRef.current.getBoundingClientRect();
        intrinsicHeightRef.current = menuRect.height;
        setMenuPos(computeMenuPosition(togglerRect, menuRect.height));
      };
      if (menuRef.current) {
        measure();
      } else {
        const frame = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(frame);
      }
    });
    React8.useEffect(() => {
      if (!isOpen) {
        setMenuPos(null);
        intrinsicHeightRef.current = null;
      }
    }, [isOpen]);
    React8.useEffect(() => {
      if (!isOpen) return;
      const onMousedown = (e) => {
        if (menuRef.current?.contains(e.target) || togglerRef.current?.contains(e.target)) return;
        handleDismiss();
      };
      document.addEventListener("mousedown", onMousedown);
      return () => document.removeEventListener("mousedown", onMousedown);
    }, [isOpen]);
    React8.useEffect(() => {
      if (!isOpen) return;
      const onScroll = () => {
        if (!togglerRef.current || intrinsicHeightRef.current === null) return;
        const rect = togglerRef.current.getBoundingClientRect();
        setMenuPos(computeMenuPosition(rect, intrinsicHeightRef.current));
      };
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      return () => window.removeEventListener("scroll", onScroll, { capture: true });
    }, [isOpen]);
    const handleItemClick = (itemValue) => {
      if (multiselect) {
        const currentValues = Array.isArray(value) ? value : [];
        const newValues = currentValues.includes(itemValue) ? currentValues.filter((v) => v !== itemValue) : [...currentValues, itemValue];
        onChange(newValues);
      } else {
        onChange(itemValue);
        handleDismiss();
      }
    };
    const enhancedChildren = React8.Children.map(children, (child) => {
      if (!React8.isValidElement(child)) return child;
      if (child.props.value === void 0) return child;
      const itemValue = child.props.value;
      const isActive = multiselect ? Array.isArray(value) && value.includes(itemValue) : value === itemValue;
      return React8.cloneElement(child, {
        active: isActive,
        multiselect,
        onClick: () => {
          if (child.props.onClick) child.props.onClick();
          handleItemClick(itemValue);
        }
      });
    });
    const togglerInner = togglerContent ? [
      React8.createElement("span", { key: "custom" }, togglerContent),
      React8.createElement("span", { key: "caret", className: "opacity-70" }, "\u23F7")
    ] : [
      TogglerIcon && React8.createElement(TogglerIcon, { key: "icon", className: "w-4 h-4" }),
      togglerText && React8.createElement("span", { key: "text" }, togglerText),
      React8.createElement("span", { key: "caret", className: "opacity-70" }, "\u23F7")
    ].filter(Boolean);
    const isMeasuring = isOpen && menuPos === null;
    const isPositioned = isOpen && menuPos !== null;
    const dataState = isOpen ? "open" : "closed";
    const menuStyle = isMeasuring ? {
      // Off-screen + invisible so the user never sees the unmeasured render
      visibility: "hidden",
      pointerEvents: "none",
      top: -9999,
      left: -9999
    } : isPositioned ? {
      top: menuPos.top,
      bottom: menuPos.bottom,
      left: menuPos.left,
      minWidth: menuPos.minWidth,
      maxHeight: menuPos.maxHeight,
      // Allow internal scrolling when clamped by maxHeight;
      // hide horizontal overflow to keep the menu tidy.
      overflowX: "hidden",
      overflowY: "auto"
    } : {};
    return /* @__PURE__ */ React8.createElement("div", { className: "aa-dropdown-wrapper", "data-state": dataState }, /* @__PURE__ */ React8.createElement(
      "button",
      {
        ref: togglerRef,
        className: `aa-dropdown-toggler whitespace-nowrap ${togglerClasses}`,
        title: togglerTitle,
        "data-state": dataState,
        onClick: () => setIsOpen((prev) => !prev),
        type: "button"
      },
      togglerInner
    ), (isMeasuring || isPositioned) && /* @__PURE__ */ React8.createElement(Portal, null, /* @__PURE__ */ React8.createElement(
      "div",
      {
        ref: menuRef,
        className: `aa-dropdown-menu fixed z-[10000] rounded-md bg-primary-foreground text-popover-foreground shadow-md border border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${menuClasses}`,
        "data-state": isPositioned ? "open" : "closed",
        style: menuStyle,
        tabIndex: "-1",
        role: "menu"
      },
      /* @__PURE__ */ React8.createElement("div", { className: "p-1" }, enhancedChildren),
      multiselect && /* @__PURE__ */ React8.createElement("div", { className: "backdrop-blur bg-background/50 border-border border-t bottom-0 mt-1 p-1 pt-2 sticky text-right" }, /* @__PURE__ */ React8.createElement(
        "button",
        {
          onClick: handleDismiss,
          className: "px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90"
        },
        "Confirm"
      ))
    )));
  }

  // src/components/route-badge.jsx
  var api9 = window.SubwayBuilderAPI;
  var { React: React9 } = api9.utils;
  function RouteBadge({ routeId, size = "2rem", interactive = true }) {
    const routes = api9.gameState.getRoutes();
    const route = routes.find((r) => r.id === routeId);
    if (!route) {
      return null;
    }
    const { bullet, color, textColor, shape } = route;
    const sizeValue = parseFloat(size);
    const sizeUnit = size.replace(/[0-9.]/g, "");
    const fontSize = `${sizeValue * 0.6}${sizeUnit}`;
    const triangleOffset = `${sizeValue * 0.1}${sizeUnit}`;
    const baseStyles = {
      backgroundColor: color,
      userSelect: "none",
      minWidth: size,
      height: size,
      fontSize,
      color: textColor,
      paddingLeft: 0,
      paddingRight: 0
    };
    const interactiveClasses = interactive ? "cursor-pointer hover:opacity-80" : "";
    const shapeConfigs = {
      circle: {
        className: `flex items-center justify-center font-bold select-none overflow-hidden font-mta rounded-full ${interactiveClasses}`,
        wrapperClassName: "relative inline-block",
        spanTransform: "translateY(-0.04rem)",
        paddingX: "0.3em"
      },
      square: {
        className: `flex items-center justify-center font-bold select-none overflow-hidden font-mta ${interactiveClasses}`,
        wrapperClassName: "relative inline-block",
        spanTransform: "translateY(-0.04rem)"
      },
      diamond: {
        className: `flex items-center justify-center font-bold select-none overflow-hidden font-mta ${interactiveClasses}`,
        wrapperClassName: "relative inline-block overflow-visible",
        containerTransform: "rotate(45deg) scale(0.707107)",
        spanTransform: "rotate(-45deg) translateY(-0.04rem)",
        paddingX: "0.5rem"
      },
      triangle: {
        className: `flex items-center justify-center font-bold select-none overflow-hidden font-mta [clip-path:polygon(50%_0%,0%_100%,100%_100%)] ${interactiveClasses}`,
        wrapperClassName: "relative inline-block",
        spanTransform: `translateY(${triangleOffset})`
      }
    };
    const config = shapeConfigs[shape] || shapeConfigs.circle;
    const containerStyles = {
      ...baseStyles,
      ...config.paddingX && {
        paddingLeft: config.paddingX,
        paddingRight: config.paddingX
      },
      ...config.containerTransform && {
        transform: config.containerTransform
      }
    };
    const handleClick = interactive ? () => window.AdvancedAnalytics?.openRouteDialog?.(routeId) : void 0;
    return /* @__PURE__ */ React9.createElement(
      "div",
      {
        className: config.wrapperClassName,
        title: bullet,
        style: { height: size, maxHeight: size },
        onClick: handleClick
      },
      /* @__PURE__ */ React9.createElement(
        "div",
        {
          className: config.className,
          style: containerStyles
        },
        /* @__PURE__ */ React9.createElement(
          "span",
          {
            className: "flex items-center justify-center leading-none whitespace-nowrap",
            style: {
              lineHeight: 0,
              transform: config.spanTransform
            }
          },
          bullet
        )
      )
    );
  }

  // src/components/dropdown-item.jsx
  var api10 = window.SubwayBuilderAPI;
  var { React: React10, icons: icons6 } = api10.utils;
  function DropdownItem({
    value,
    route,
    text,
    active = false,
    multiselect = false,
    disabled = false,
    onClick = () => {
    }
  }) {
    const handleClick = () => {
      if (!disabled) {
        onClick();
      }
    };
    return React10.createElement("div", {
      role: "menuitem",
      className: `relative whitespace-nowrap cursor-pointer select-none rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 flex items-center justify-between ${active ? "bg-accent/50" : ""}`,
      "data-disabled": disabled ? "true" : void 0,
      tabIndex: "-1",
      onClick: handleClick
    }, [
      // Route Badge
      route && React10.createElement(RouteBadge, { key: "badge", routeId: route.id, size: "1.4rem", interactive: false }),
      // Text
      text && React10.createElement("span", { key: "text" }, text),
      // Checkbox (only show in multiselect or when active in single-select)
      React10.createElement(icons6.Check, {
        key: "check",
        className: `w-4 h-4 ml-2 ${active ? "opacity-100" : "opacity-0"}`
      })
    ]);
  }

  // src/components/buttons-group.jsx
  var api11 = window.SubwayBuilderAPI;
  var { React: React11 } = api11.utils;
  function ButtonsGroup({
    groupClasses = "bg-muted border inline-block items-center justify-center mx-auto p-1 rounded-md text-muted-foreground",
    value = null,
    onChange = () => {
    },
    children
  }) {
    const handleButtonClick = (buttonValue) => {
      if (value !== buttonValue) {
        onChange(buttonValue);
      }
    };
    const enhancedChildren = React11.Children.map(children, (child) => {
      if (!React11.isValidElement(child)) return child;
      const isActive = value === child.props.value;
      return React11.cloneElement(child, {
        active: isActive,
        onClick: () => {
          if (child.props.onClick) {
            child.props.onClick();
          }
          handleButtonClick(child.props.value);
        }
      });
    });
    return React11.createElement("div", {
      className: `aa-btn-group ${groupClasses}`,
      tabIndex: "0",
      style: { outline: "none" }
    }, enhancedChildren);
  }
  function ButtonsGroupItem({
    value,
    text,
    active = false,
    disabled = false,
    onClick = () => {
    }
  }) {
    const dataState = active ? "active" : "inactive";
    const handleClick = () => {
      if (!disabled) {
        onClick();
      }
    };
    return React11.createElement("button", {
      type: "button",
      "aria-selected": active ? "true" : "false",
      "data-state": dataState,
      disabled: disabled ? "true" : void 0,
      className: "aa-btn-group-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      tabIndex: "-1",
      onClick: handleClick
    }, text);
  }

  // src/components/tooltip.jsx
  var api12 = window.SubwayBuilderAPI;
  var { React: React12 } = api12.utils;
  function Tooltip({ children, content, side = "bottom", delayDuration = 300 }) {
    const [visible, setVisible] = React12.useState(false);
    const [pos, setPos] = React12.useState(null);
    const triggerRef = React12.useRef(null);
    const timerRef = React12.useRef(null);
    const computePos = () => {
      if (!triggerRef.current) return null;
      const rect = triggerRef.current.getBoundingClientRect();
      const gap = 6;
      switch (side) {
        case "top":
          return { top: rect.top - gap, left: rect.left + rect.width / 2, transform: "translate(-50%, -100%)" };
        case "bottom":
          return { top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: "translateX(-50%)" };
        case "left":
          return { top: rect.top + rect.height / 2, left: rect.left - gap, transform: "translate(-100%, -50%)" };
        case "right":
          return { top: rect.top + rect.height / 2, left: rect.right + gap, transform: "translateY(-50%)" };
        default:
          return { top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: "translateX(-50%)" };
      }
    };
    const handleMouseEnter = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPos(computePos());
        setVisible(true);
      }, delayDuration);
    };
    const handleMouseLeave = () => {
      clearTimeout(timerRef.current);
      setVisible(false);
    };
    React12.useEffect(() => {
      return () => clearTimeout(timerRef.current);
    }, []);
    const child = React12.Children.only(children);
    const trigger = React12.cloneElement(child, {
      ref: triggerRef,
      onMouseEnter: (e) => {
        handleMouseEnter();
        child.props.onMouseEnter?.(e);
      },
      onMouseLeave: (e) => {
        handleMouseLeave();
        child.props.onMouseLeave?.(e);
      }
    });
    return /* @__PURE__ */ React12.createElement(React12.Fragment, null, trigger, visible && pos && /* @__PURE__ */ React12.createElement(Portal, null, /* @__PURE__ */ React12.createElement(
      "div",
      {
        className: "aa-tooltip fixed z-[10000] px-3 py-1.5 text-sm rounded-md bg-popover text-popover-foreground border border-border shadow-md pointer-events-none whitespace-nowrap",
        style: { top: pos.top, left: pos.left, transform: pos.transform }
      },
      content
    )));
  }

  // src/ui/dashboard/dashboard-table-toolbar.jsx
  var api13 = window.SubwayBuilderAPI;
  var { React: React13, icons: icons7 } = api13.utils;
  function DashboardTableToolbar({
    groupState,
    onGroupChange,
    timeframeState,
    onTimeframeChange,
    compareMode,
    onCompareModeChange,
    comparePrimaryDay,
    onComparePrimaryDayChange,
    compareSecondaryDay,
    onCompareSecondaryDayChange,
    compareShowPercentages,
    onCompareShowPercentagesChange,
    historicalData
  }) {
    const btnBaseClasses = "whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border";
    const btnClasses = "bg-background hover:bg-accent hover:text-accent-foreground border-input";
    const btnActiveClasses = "bg-primary text-primary-foreground border-primary hover:bg-primary/90";
    const btnTogglerClasses = "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input";
    const allDays = getAvailableDays(historicalData);
    const mostRecentDay = allDays[0];
    const availableDays = allDays.filter((day) => day < mostRecentDay);
    const hasOtherDays = availableDays.length > 0;
    const viewMode = compareMode ? "compare" : "show";
    const handleViewModeChange = (newMode) => {
      const shouldEnableCompare = newMode === "compare";
      onCompareModeChange(shouldEnableCompare);
    };
    return /* @__PURE__ */ React13.createElement("div", { className: "grid grid-cols-3 w-full" }, /* @__PURE__ */ React13.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React13.createElement("span", { className: "text-xs font-medium mr-1" }, "Metrics:"), /* @__PURE__ */ React13.createElement(Tooltip, { content: "Show/hide train-related metrics", side: "bottom", delayDuration: 300 }, /* @__PURE__ */ React13.createElement(
      "button",
      {
        className: `${btnBaseClasses} ${groupState.trains ? btnActiveClasses : btnClasses}`,
        onClick: () => onGroupChange("trains")
      },
      /* @__PURE__ */ React13.createElement(icons7.Train, { size: 14 }),
      /* @__PURE__ */ React13.createElement("span", null, "Trains")
    )), /* @__PURE__ */ React13.createElement(Tooltip, { content: "Show/hide financial metrics", side: "bottom", delayDuration: 300 }, /* @__PURE__ */ React13.createElement(
      "button",
      {
        className: `${btnBaseClasses} ${groupState.finance ? btnActiveClasses : btnClasses}`,
        onClick: () => onGroupChange("finance")
      },
      /* @__PURE__ */ React13.createElement(icons7.DollarSign, { size: 14 }),
      /* @__PURE__ */ React13.createElement("span", null, "Finance")
    ))), /* @__PURE__ */ React13.createElement("div", { className: "flex items-center" }, /* @__PURE__ */ React13.createElement(
      Tooltip,
      {
        content: availableDays.length > 0 ? "Switch between showing data and comparing two days" : "Compare mode requires at least 2 days of historical data",
        side: "bottom",
        delayDuration: 300
      },
      /* @__PURE__ */ React13.createElement("div", { className: "mx-auto" }, /* @__PURE__ */ React13.createElement(ButtonsGroup, { value: viewMode, onChange: handleViewModeChange }, /* @__PURE__ */ React13.createElement(ButtonsGroupItem, { value: "show", text: "Show" }), /* @__PURE__ */ React13.createElement(ButtonsGroupItem, { value: "compare", text: "Compare", disabled: availableDays.length == 0 })))
    )), /* @__PURE__ */ React13.createElement("div", { className: "flex items-center gap-2 justify-end" }, !compareMode ? /* @__PURE__ */ React13.createElement(React13.Fragment, null, /* @__PURE__ */ React13.createElement(Tooltip, { content: "Show live data from the last 24 hours", side: "bottom", delayDuration: 300 }, /* @__PURE__ */ React13.createElement(
      "button",
      {
        className: `${btnBaseClasses} ${timeframeState === "last24h" ? btnActiveClasses : btnClasses}`,
        onClick: () => onTimeframeChange("last24h")
      },
      /* @__PURE__ */ React13.createElement(icons7.Clock, { size: 14 }),
      /* @__PURE__ */ React13.createElement("span", null, "Last 24h")
    )), /* @__PURE__ */ React13.createElement(
      Tooltip,
      {
        content: mostRecentDay ? `Show historical data from Day ${mostRecentDay}` : "No historical data available yet",
        side: "bottom",
        delayDuration: 300
      },
      /* @__PURE__ */ React13.createElement(
        "button",
        {
          className: `${btnBaseClasses} ${!mostRecentDay ? "opacity-50 cursor-not-allowed" : ""} ${timeframeState === String(mostRecentDay) ? btnActiveClasses : btnClasses}`,
          onClick: mostRecentDay ? () => onTimeframeChange(String(mostRecentDay)) : void 0,
          disabled: !mostRecentDay
        },
        /* @__PURE__ */ React13.createElement(icons7.Calendar, { size: 14 }),
        /* @__PURE__ */ React13.createElement("span", null, mostRecentDay ? `Yesterday (Day ${mostRecentDay})` : "Yesterday")
      )
    ), hasOtherDays && /* @__PURE__ */ React13.createElement(Tooltip, { content: "Select a specific day to view historical data", side: "left", delayDuration: 300 }, /* @__PURE__ */ React13.createElement("div", null, /* @__PURE__ */ React13.createElement(
      Dropdown,
      {
        togglerIcon: icons7.Calendar,
        togglerText: availableDays.includes(Number(timeframeState)) ? `Day ${timeframeState}` : "Select Day",
        togglerClasses: `${btnTogglerClasses} ${!hasOtherDays ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${availableDays.includes(Number(timeframeState)) ? btnActiveClasses : ""}`,
        multiselect: false,
        value: availableDays.includes(Number(timeframeState)) ? timeframeState : "",
        onChange: (value) => value && onTimeframeChange(value)
      },
      availableDays.map((day) => /* @__PURE__ */ React13.createElement(
        DropdownItem,
        {
          key: day,
          value: String(day),
          text: `Day ${day}`
        }
      ))
    ))), !hasOtherDays && /* @__PURE__ */ React13.createElement(Tooltip, { content: "No additional historical data available", side: "left", delayDuration: 300 }, /* @__PURE__ */ React13.createElement(
      "button",
      {
        className: `${btnBaseClasses} ${btnClasses} opacity-50 cursor-not-allowed`,
        disabled: true
      },
      /* @__PURE__ */ React13.createElement(icons7.Calendar, { size: 14 }),
      /* @__PURE__ */ React13.createElement("span", null, "Select Day")
    ))) : /* @__PURE__ */ React13.createElement(React13.Fragment, null, /* @__PURE__ */ React13.createElement(Tooltip, { content: "Select the newer day to compare (primary)", side: "bottom", delayDuration: 300 }, /* @__PURE__ */ React13.createElement("div", null, /* @__PURE__ */ React13.createElement(
      Dropdown,
      {
        togglerIcon: icons7.Calendar,
        togglerText: comparePrimaryDay ? formatDayLabel(comparePrimaryDay, mostRecentDay) : "Select Primary Day",
        togglerClasses: `${btnTogglerClasses} ${btnActiveClasses}`,
        multiselect: false,
        value: comparePrimaryDay ? String(comparePrimaryDay) : "",
        onChange: (value) => value && onComparePrimaryDayChange(value)
      },
      allDays.filter((day) => {
        const olderDays = allDays.filter((d) => d < day);
        return olderDays.length > 0;
      }).map((day) => /* @__PURE__ */ React13.createElement(
        DropdownItem,
        {
          key: day,
          value: String(day),
          text: formatDayLabel(day, mostRecentDay)
        }
      ))
    ))), /* @__PURE__ */ React13.createElement("span", { className: "text-xs font-medium" }, "vs"), /* @__PURE__ */ React13.createElement(Tooltip, { content: "Select the older day to compare against (secondary)", side: "bottom", delayDuration: 300 }, /* @__PURE__ */ React13.createElement("div", null, /* @__PURE__ */ React13.createElement(
      Dropdown,
      {
        togglerIcon: icons7.Calendar,
        togglerText: compareSecondaryDay ? formatDayLabel(compareSecondaryDay, mostRecentDay) : "Compare To",
        togglerClasses: `${btnTogglerClasses} ${btnActiveClasses}`,
        multiselect: false,
        value: compareSecondaryDay ? String(compareSecondaryDay) : "",
        onChange: (value) => value && onCompareSecondaryDayChange(value)
      },
      comparePrimaryDay && allDays.filter((day) => day < comparePrimaryDay).map((day) => /* @__PURE__ */ React13.createElement(
        DropdownItem,
        {
          key: day,
          value: String(day),
          text: formatDayLabel(day, mostRecentDay)
        }
      )),
      !comparePrimaryDay && /* @__PURE__ */ React13.createElement(
        DropdownItem,
        {
          value: "",
          text: "Select primary day first",
          disabled: true
        }
      )
    ))), /* @__PURE__ */ React13.createElement(
      Tooltip,
      {
        content: compareShowPercentages ? "Showing percentage changes - click to show absolute deltas" : "Showing absolute deltas - click to show percentage changes",
        side: "bottom",
        delayDuration: 300
      },
      /* @__PURE__ */ React13.createElement(
        "button",
        {
          className: `${btnBaseClasses} ${compareShowPercentages ? btnActiveClasses : btnClasses}`,
          onClick: onCompareShowPercentagesChange
        },
        /* @__PURE__ */ React13.createElement(icons7.Percent, { size: 14 })
      )
    ))));
  }

  // src/utils/sorting.js
  function getSortIndicator(column, sortState) {
    if (sortState.column !== column) {
      return CONFIG.ARROWS.DOWN;
    }
    return sortState.order === "desc" ? CONFIG.ARROWS.DOWN : CONFIG.ARROWS.UP;
  }
  function getHeaderClasses(column, sortState, groupState, group) {
    if (group && groupState && groupState[group] === false) {
      return "hidden";
    }
    if (sortState.column === column) {
      return "text-foreground bg-background/80";
    } else if (column === "name") {
      return "bg-background/50 backdrop-blur-sm";
    }
    return "hover:text-foreground";
  }
  function getCellClasses(column, sortState, groupState, group) {
    if (group && groupState && groupState[group] === false) {
      return "hidden";
    }
    if (sortState.column === column) {
      return "bg-background/80";
    } else if (column === "name") {
      return "bg-background/50 backdrop-blur-sm";
    }
    return "";
  }
  function sortTableData(data, sortState) {
    return [...data].sort((a, b) => {
      const aVal = a[sortState.column];
      const bVal = b[sortState.column];
      if (sortState.column === "name") {
        return sortState.order === "desc" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      if (sortState.column === "trainType") {
        const api28 = window.SubwayBuilderAPI;
        const routes = api28.gameState.getRoutes();
        const routeA = routes.find((r) => r.id === a.id);
        const routeB = routes.find((r) => r.id === b.id);
        const getTrainTypeName = (route) => {
          if (!route?.trainType) return "";
          const trainType = api28.trains.getTrainType(route.trainType);
          return trainType?.name || "";
        };
        const nameA = getTrainTypeName(routeA);
        const nameB = getTrainTypeName(routeB);
        return sortState.order === "desc" ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      }
      if (a.isComparison) {
        const aNum = typeof aVal === "object" && aVal !== null ? aVal.value || 0 : 0;
        const bNum = typeof bVal === "object" && bVal !== null ? bVal.value || 0 : 0;
        return sortState.order === "desc" ? bNum - aNum : aNum - bNum;
      }
      return sortState.order === "desc" ? bVal - aVal : aVal - bVal;
    });
  }

  // src/utils/colors.js
  function getUtilizationClasses(utilization) {
    const thresholds = CONFIG.UTILIZATION_THRESHOLDS;
    const colors = CONFIG.COLORS.UTILIZATION;
    if (utilization < thresholds.CRITICAL_LOW || utilization > thresholds.CRITICAL_HIGH) {
      return colors.CRITICAL;
    } else if (utilization >= thresholds.CRITICAL_LOW && utilization < thresholds.WARNING_LOW || utilization >= thresholds.WARNING_HIGH && utilization <= thresholds.CRITICAL_HIGH) {
      return colors.WARNING;
    }
    return colors.GOOD;
  }
  function getComparisonColorClass(type, isImprovement) {
    if (type === "new") return CONFIG.COLORS.COMPARE.NEW;
    if (type === "deleted") return CONFIG.COLORS.COMPARE.DELETED;
    if (type === "zero") return CONFIG.COLORS.COMPARE.NEUTRAL;
    return isImprovement ? CONFIG.COLORS.COMPARE.POSITIVE : CONFIG.COLORS.COMPARE.NEGATIVE;
  }
  function getComparisonArrow(value) {
    if (value > 0) return CONFIG.ARROWS.UP;
    if (value < 0) return CONFIG.ARROWS.DOWN;
    return CONFIG.ARROWS.NEUTRAL;
  }

  // src/ui/table-row.jsx
  var api14 = window.SubwayBuilderAPI;
  var { React: React14 } = api14.utils;
  function TableRow({ row, sortState, groups = ["trains", "finance", "performance"], groupState, compareShowPercentages = true }) {
    const isDeleted = row.deleted === true;
    const isColumnVisible = (group) => {
      if (!group) return true;
      return groups.includes(group);
    };
    const handleNameClick = () => {
      if (isDeleted) return;
      const route = api14.gameState.getRoutes().find((r) => r.id === row.id);
      if (route && route.stations && route.stations[0]) {
        const station = api14.gameState.getStations().find((s) => s.id === route.stations[0]);
        if (station) {
          const map = api14.utils.getMap();
          if (map) {
            map.flyTo({
              center: station.coords,
              zoom: 14,
              duration: 1e3
            });
          }
        }
      }
    };
    return /* @__PURE__ */ React14.createElement("tr", { className: `text-xs border-b border-border hover:bg-muted/50 transition-colors ${isDeleted ? "opacity-70" : ""}` }, /* @__PURE__ */ React14.createElement(
      "td",
      {
        className: `sticky left-0 px-3 py-2 align-middle text-left ${isDeleted ? "" : "cursor-pointer hover:text-primary"} transition-colors ${getCellClasses("name", sortState, groupState)}`,
        onClick: handleNameClick
      },
      /* @__PURE__ */ React14.createElement("div", { className: "font-medium text-right" }, /* @__PURE__ */ React14.createElement(RouteBadge, { routeId: row.id, size: "1.2rem" }), isDeleted && /* @__PURE__ */ React14.createElement("span", { className: "ml-2 text-xs text-muted-foreground" }, "(Deleted)"))
    ), isColumnVisible("performance") && /* @__PURE__ */ React14.createElement(
      MetricCell,
      {
        columnKey: "ridership",
        value: row.ridership,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.ridership,
        secondaryValue: row.secondaryValues?.ridership,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "performance",
        formatter: (v) => v.toLocaleString(void 0, { maximumFractionDigits: 0 })
      }
    ), isColumnVisible("trains") && /* @__PURE__ */ React14.createElement(
      MetricCell,
      {
        columnKey: "capacity",
        value: row.capacity,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.capacity,
        secondaryValue: row.secondaryValues?.capacity,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "trains",
        formatter: (v) => v.toLocaleString(void 0, { maximumFractionDigits: 0 })
      }
    ), isColumnVisible("performance") && (row.isComparison ? /* @__PURE__ */ React14.createElement(
      ComparisonCell,
      {
        columnKey: "utilization",
        value: row.utilization,
        primaryValue: row.primaryValues?.utilization,
        secondaryValue: row.secondaryValues?.utilization,
        showPercentages: true,
        sortState,
        groupState,
        group: "performance"
      }
    ) : /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getUtilizationClasses(row.utilization)} ${getCellClasses("utilization", sortState, groupState, "performance")}` }, row.utilization, "%")), isColumnVisible("trains") && /* @__PURE__ */ React14.createElement(
      MetricCell,
      {
        columnKey: "stations",
        value: row.stations,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.stations,
        secondaryValue: row.secondaryValues?.stations,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "trains",
        formatter: (v) => String(v)
      }
    ), isColumnVisible("trains") && /* @__PURE__ */ React14.createElement("td", { className: `px-3 py-2 align-middle text-right ${getCellClasses("trainType", sortState, groupState, "trains")}` }, (() => {
      const route = api14.gameState.getRoutes().find((r) => r.id === row.id);
      const trainTypeInfo = route ? getTrainTypeInfo(route) : null;
      if (!trainTypeInfo) {
        return /* @__PURE__ */ React14.createElement("span", { className: "text-muted-foreground" }, "n/a");
      }
      return /* @__PURE__ */ React14.createElement("span", { className: "whitespace-nowrap flex items-center justify-end gap-1.5", title: trainTypeInfo.description }, /* @__PURE__ */ React14.createElement("span", { class: "text-xs" }, trainTypeInfo.name), /* @__PURE__ */ React14.createElement(
        "span",
        {
          className: "aspect-square inline-block rounded-full w-2",
          style: { background: trainTypeInfo.color }
        }
      ));
    })()), isColumnVisible("trains") && (row.isComparison ? /* @__PURE__ */ React14.createElement(
      ComparisonCell,
      {
        columnKey: "trainSchedule",
        value: row.trainSchedule,
        primaryValue: row.primaryValues?.trainSchedule,
        secondaryValue: row.secondaryValues?.trainSchedule,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "trains"
      }
    ) : /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses("trainSchedule", sortState, groupState, "trains")}` }, /* @__PURE__ */ React14.createElement(
      Tooltip,
      {
        side: "left",
        delayDuration: 200,
        content: /* @__PURE__ */ React14.createElement("div", { className: "gap-2 grid grid-cols-2" }, /* @__PURE__ */ React14.createElement("span", { className: CONFIG.COLORS.TRAINS.HIGH }, "High Demand: "), " ", /* @__PURE__ */ React14.createElement("span", null, row.trainsHigh), /* @__PURE__ */ React14.createElement("span", { className: CONFIG.COLORS.TRAINS.MEDIUM }, "Medium Demand: "), " ", /* @__PURE__ */ React14.createElement("span", null, row.trainsMedium), /* @__PURE__ */ React14.createElement("span", { className: CONFIG.COLORS.TRAINS.LOW }, "Low Demand: "), " ", /* @__PURE__ */ React14.createElement("span", null, row.trainsLow))
      },
      /* @__PURE__ */ React14.createElement("span", { className: "font-bold cursor-help" }, calculateTotalTrains(row))
    ))), isColumnVisible("trains") && (row.isComparison ? /* @__PURE__ */ React14.createElement(
      ComparisonCell,
      {
        columnKey: "transfers",
        value: row.transfers,
        primaryValue: row.primaryValues?.transfers?.count,
        secondaryValue: row.secondaryValues?.transfers?.count,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "trains"
      }
    ) : /* @__PURE__ */ React14.createElement("td", { className: `px-3 py-2 align-middle text-right ${getCellClasses("transfers", sortState, groupState, "trains")}` }, row.transfers?.count === 0 ? /* @__PURE__ */ React14.createElement("span", { className: "tabular-nums text-xs" }, "0") : /* @__PURE__ */ React14.createElement(
      Tooltip,
      {
        side: "left",
        delayDuration: 200,
        content: /* @__PURE__ */ React14.createElement("div", { className: "flex items-center flex-wrap gap-y-2 gap-1" }, row.transfers.routeIds?.map((routeId) => /* @__PURE__ */ React14.createElement(RouteBadge, { key: routeId, routeId, size: "1.4rem" })))
      },
      /* @__PURE__ */ React14.createElement("span", { className: "font-bold tabular-nums cursor-help" }, row.transfers.count)
    ))), isColumnVisible("finance") && /* @__PURE__ */ React14.createElement(
      MetricCell,
      {
        columnKey: "dailyCost",
        value: row.dailyCost,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.dailyCost,
        secondaryValue: row.secondaryValues?.dailyCost,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "finance",
        formatter: formatCurrencyCompact,
        useCompactTooltip: true
      }
    ), isColumnVisible("finance") && /* @__PURE__ */ React14.createElement(
      MetricCell,
      {
        columnKey: "dailyRevenue",
        value: row.dailyRevenue,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.dailyRevenue,
        secondaryValue: row.secondaryValues?.dailyRevenue,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "finance",
        formatter: formatCurrencyCompact,
        useCompactTooltip: true
      }
    ), isColumnVisible("finance") && /* @__PURE__ */ React14.createElement(
      ProfitCell,
      {
        columnKey: "dailyProfit",
        value: row.dailyProfit,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.dailyProfit,
        secondaryValue: row.secondaryValues?.dailyProfit,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "finance",
        useCompactTooltip: true
      }
    ), isColumnVisible("finance") && /* @__PURE__ */ React14.createElement(
      ProfitCell,
      {
        columnKey: "profitPerPassenger",
        value: row.profitPerPassenger,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.profitPerPassenger,
        secondaryValue: row.secondaryValues?.profitPerPassenger,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "performance",
        decimals: 2,
        useCompactTooltip: false
      }
    ), isColumnVisible("performance") && /* @__PURE__ */ React14.createElement(
      ProfitCell,
      {
        columnKey: "profitPerTrain",
        value: row.profitPerTrain,
        isComparison: row.isComparison,
        primaryValue: row.primaryValues?.profitPerTrain,
        secondaryValue: row.secondaryValues?.profitPerTrain,
        showPercentages: compareShowPercentages,
        sortState,
        groupState,
        group: "performance",
        decimals: 2,
        useCompactTooltip: true
      }
    ));
  }
  function MetricCell({ columnKey, value, isComparison, primaryValue, secondaryValue, showPercentages, sortState, groupState, group, formatter, useCompactTooltip = false }) {
    if (isComparison) {
      return /* @__PURE__ */ React14.createElement(
        ComparisonCell,
        {
          columnKey,
          value,
          primaryValue,
          secondaryValue,
          showPercentages,
          sortState,
          groupState,
          group,
          formatter,
          useCompactTooltip
        }
      );
    }
    const displayValue = formatter ? formatter(value) : value;
    if (useCompactTooltip && Math.abs(value) >= 1e5) {
      return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement(Tooltip, { side: "left", delayDuration: 200, content: /* @__PURE__ */ React14.createElement("p", { className: "text-xs tabular-nums" }, formatCurrencyFull(value, 0)) }, /* @__PURE__ */ React14.createElement("span", { className: "cursor-help" }, displayValue)));
    }
    return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, displayValue);
  }
  function ProfitCell({ columnKey, value, isComparison, primaryValue, secondaryValue, showPercentages, sortState, groupState, group, decimals = 0, useCompactTooltip = false }) {
    if (isComparison) {
      return /* @__PURE__ */ React14.createElement(
        ComparisonCell,
        {
          columnKey,
          value,
          primaryValue,
          secondaryValue,
          showPercentages,
          sortState,
          groupState,
          group,
          formatter: (v) => formatCurrencyCompact(v, decimals),
          useCompactTooltip
        }
      );
    }
    const isNegative = value < 0;
    const colorClass = isNegative ? CONFIG.COLORS.VALUE.NEGATIVE : CONFIG.COLORS.VALUE.DEFAULT;
    const displayValue = formatCurrencyCompact(value, decimals);
    if (useCompactTooltip && Math.abs(value) >= 1e5) {
      return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement(Tooltip, { side: "left", delayDuration: 200, content: /* @__PURE__ */ React14.createElement("p", { className: "text-xs tabular-nums" }, formatCurrencyFull(value, decimals)) }, /* @__PURE__ */ React14.createElement("span", { className: `${colorClass} cursor-help` }, displayValue)));
    }
    return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("div", { className: colorClass }, displayValue));
  }
  function ComparisonCell({ columnKey, value, primaryValue, secondaryValue, showPercentages, sortState, groupState, group, formatter, useCompactTooltip = false }) {
    if (value === "NEW") {
      return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("span", { className: CONFIG.COLORS.COMPARE.NEW }, "NEW"));
    }
    if (value === "DELETED") {
      return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("span", { className: CONFIG.COLORS.COMPARE.DELETED }, "(Deleted)"));
    }
    if (value && typeof value === "object") {
      const { type, value: percentValue, isImprovement } = value;
      if (type === "new") {
        return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("span", { className: CONFIG.COLORS.COMPARE.NEW }, "NEW"));
      }
      if (type === "zero" || percentValue === 0) {
        return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("span", { className: CONFIG.COLORS.COMPARE.NEUTRAL }, "="));
      }
      const colorClass = getComparisonColorClass(type, isImprovement);
      const arrow = getComparisonArrow(percentValue);
      if (!showPercentages && primaryValue !== void 0 && secondaryValue !== void 0) {
        const delta = primaryValue - secondaryValue;
        const prefix = percentValue > 0 ? "+" : "-";
        const absDelta = Math.abs(delta);
        const isFinanceColumn = ["dailyCost", "dailyRevenue", "dailyProfit", "profitPerPassenger", "profitPerTrain"].includes(columnKey);
        if (isFinanceColumn) {
          let displayValue3;
          if (absDelta >= 1e5) {
            const millions = absDelta / 1e6;
            displayValue3 = `${prefix}${millions.toFixed(2)}M ${arrow}`;
          } else {
            const decimals2 = ["profitPerPassenger", "profitPerTrain"].includes(columnKey) ? 2 : 0;
            const formattedDelta2 = absDelta.toLocaleString(void 0, {
              minimumFractionDigits: decimals2,
              maximumFractionDigits: decimals2
            });
            displayValue3 = `${prefix}$${formattedDelta2} ${arrow}`;
          }
          if (useCompactTooltip && absDelta >= 1e5) {
            const decimals2 = ["profitPerPassenger", "profitPerTrain"].includes(columnKey) ? 2 : 0;
            const fullDelta = formatCurrencyFull(delta, decimals2);
            return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement(Tooltip, { side: "left", delayDuration: 200, content: /* @__PURE__ */ React14.createElement("p", { className: "text-xs tabular-nums" }, fullDelta) }, /* @__PURE__ */ React14.createElement("span", { className: `${colorClass} cursor-help` }, displayValue3)));
          }
          return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("span", { className: colorClass }, displayValue3));
        }
        const decimals = ["profitPerPassenger", "profitPerTrain"].includes(columnKey) ? 2 : 0;
        const formattedDelta = absDelta.toLocaleString(void 0, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        });
        const displayValue2 = `${prefix}${formattedDelta} ${arrow}`;
        return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("span", { className: colorClass }, displayValue2));
      }
      const displayValue = `${percentValue > 0 ? "+" : ""}${percentValue.toFixed(1)}% ${arrow}`;
      return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, /* @__PURE__ */ React14.createElement("span", { className: colorClass }, displayValue));
    }
    return /* @__PURE__ */ React14.createElement("td", { className: `whitespace-nowrap px-3 py-2 align-middle text-right tabular-nums ${getCellClasses(columnKey, sortState, groupState, group)}` }, "-");
  }
  function getTrainTypeInfo(route) {
    const api28 = window.SubwayBuilderAPI;
    if (!route.trainType) {
      return null;
    }
    const trainType = api28.trains.getTrainType(route.trainType);
    if (!trainType) {
      return null;
    }
    return {
      name: trainType.name,
      description: trainType.description,
      color: trainType.appearance?.color || "#666666"
    };
  }

  // src/ui/table.jsx
  var api15 = window.SubwayBuilderAPI;
  var { React: React15 } = api15.utils;
  function SortableTable({
    data,
    sortState,
    onSortChange,
    groups = ["trains", "finance", "performance"],
    groupState,
    compareShowPercentages
  }) {
    const handleSort = (column) => {
      const newState = {
        column,
        order: sortState.column === column && sortState.order === "desc" ? "asc" : "desc"
      };
      onSortChange(newState);
    };
    const visibleHeaders = CONFIG.TABLE_HEADERS.filter((header) => {
      if (header.key === "name") return true;
      if (!header.group) return true;
      return groups.includes(header.group);
    });
    return /* @__PURE__ */ React15.createElement("table", { className: "aa-table w-full border-collapse text-sm" }, /* @__PURE__ */ React15.createElement("thead", null, /* @__PURE__ */ React15.createElement("tr", { className: "sticky top-0 backdrop-blur-sm bg-background/80 border-b border-border z-10" }, visibleHeaders.map((header) => {
      const alignClass = header.align === "right" ? "text-right" : header.align === "center" ? "text-center" : "text-left";
      const isActiveSort = sortState.column === header.key;
      const headerContent = /* @__PURE__ */ React15.createElement("div", { className: `flex ${header.align === "center" ? "justify-center" : "justify-end"} items-center gap-0.5 whitespace-nowrap` }, /* @__PURE__ */ React15.createElement("span", { className: isActiveSort ? "inline-block" : "inline-block opacity-0" }, getSortIndicator(header.key, sortState)), /* @__PURE__ */ React15.createElement("div", { className: "whitespace-nowrap" }, /* @__PURE__ */ React15.createElement("span", { className: "font-medium text-xs" }, header.label), header.small && /* @__PURE__ */ React15.createElement("span", { className: "text-[10px] text-muted-foreground font-normal ml-1" }, header.small)));
      return /* @__PURE__ */ React15.createElement(
        "th",
        {
          key: header.key,
          className: `px-3 py-2 ${alignClass} cursor-pointer select-none transition-colors ${getHeaderClasses(header.key, sortState, groupState, header.group)}`,
          onClick: () => handleSort(header.key)
        },
        header.description ? /* @__PURE__ */ React15.createElement(
          Tooltip,
          {
            side: "top",
            delayDuration: 200,
            content: /* @__PURE__ */ React15.createElement("div", { className: "text-sm text-left space-y-1" }, header.description.split("|").map((line, i) => /* @__PURE__ */ React15.createElement("p", { key: i }, line)))
          },
          /* @__PURE__ */ React15.createElement("div", { className: "cursor-help" }, headerContent)
        ) : headerContent
      );
    }))), /* @__PURE__ */ React15.createElement("tbody", null, data.map((row) => /* @__PURE__ */ React15.createElement(
      TableRow,
      {
        key: row.id,
        row,
        sortState,
        groups,
        groupState,
        compareShowPercentages
      }
    ))));
  }

  // src/metrics/realtime-metrics.js
  function calculateRealTimeMetrics(route, trainType, ridership, projectedDailyRevenue, creationTime, currentTime, actualRevenue = null) {
    const carsPerTrain = route.carsPerTrain !== void 0 ? route.carsPerTrain : trainType.stats.carsPerCarSet;
    const capacityPerCar = trainType.stats.capacityPerCar;
    const capacityPerTrain = carsPerTrain * capacityPerCar;
    const schedule = route.trainSchedule || {};
    const trainCounts = {
      high: schedule.highDemand || 0,
      medium: schedule.mediumDemand || 0,
      low: schedule.lowDemand || 0
    };
    const elapsedSeconds = currentTime - creationTime;
    const elapsedHours = elapsedSeconds / 3600;
    let capacity = 0;
    let utilization = 0;
    let dailyCost = 0;
    if (route.stComboTimings && route.stComboTimings.length > 0) {
      const timings = route.stComboTimings;
      const loopTimeSeconds = timings[timings.length - 1].arrivalTime - timings[0].departureTime;
      if (loopTimeSeconds > 0) {
        const loopsPerHour = 3600 / loopTimeSeconds;
        const creationMinute = Math.floor(creationTime % 86400 / 60);
        const currentMinute = Math.floor(currentTime % 86400 / 60);
        let elapsedHighHours = 0;
        let elapsedMediumHours = 0;
        let elapsedLowHours = 0;
        CONFIG.DEMAND_PHASES.forEach((phase) => {
          const phaseStartMin = phase.startHour * 60;
          const phaseEndMin = phase.endHour * 60;
          const overlapStart = Math.max(creationMinute, phaseStartMin);
          const overlapEnd = Math.min(currentMinute, phaseEndMin);
          if (overlapStart < overlapEnd) {
            const durationHours = (overlapEnd - overlapStart) / 60;
            if (phase.type === "high") elapsedHighHours += durationHours;
            else if (phase.type === "medium") elapsedMediumHours += durationHours;
            else if (phase.type === "low") elapsedLowHours += durationHours;
          }
        });
        const highCapacity = trainCounts.high * elapsedHighHours * loopsPerHour * capacityPerTrain;
        const mediumCapacity = trainCounts.medium * elapsedMediumHours * loopsPerHour * capacityPerTrain;
        const lowCapacity = trainCounts.low * elapsedLowHours * loopsPerHour * capacityPerTrain;
        capacity = Math.round(highCapacity + mediumCapacity + lowCapacity);
        if (capacity > 0) {
          utilization = Math.round(ridership / capacity * 100);
        }
        const trainCostPerHour = trainType.stats.trainOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
        const carCostPerHour = trainType.stats.carOperationalCostPerHour * CONFIG.COST_MULTIPLIER;
        const costPerTrainPerHour = trainCostPerHour + carsPerTrain * carCostPerHour;
        dailyCost = trainCounts.low * elapsedLowHours * costPerTrainPerHour + trainCounts.medium * elapsedMediumHours * costPerTrainPerHour + trainCounts.high * elapsedHighHours * costPerTrainPerHour;
      }
    }
    const stations = route.stNodes?.length > 0 ? route.stNodes.length - 1 : 0;
    const scaledRevenue = actualRevenue !== null ? actualRevenue : projectedDailyRevenue * (elapsedHours / 24);
    const dailyProfit = scaledRevenue - dailyCost;
    const profitPerPassenger = ridership > 0 ? dailyProfit / ridership : 0;
    const totalTrains = trainCounts.high + trainCounts.medium + trainCounts.low;
    const profitPerTrain = totalTrains > 0 ? dailyProfit / totalTrains : 0;
    return {
      capacity,
      utilization,
      stations,
      trainsLow: trainCounts.low,
      trainsMedium: trainCounts.medium,
      trainsHigh: trainCounts.high,
      trainSchedule: trainCounts.high,
      dailyCost,
      dailyProfit,
      profitPerPassenger,
      profitPerTrain
    };
  }

  // src/metrics/comparison.js
  function isMetricGoodWhenHigh(metricKey) {
    const goodWhenLow = ["dailyCost"];
    return !goodWhenLow.includes(metricKey);
  }
  function calculatePercentageChange(primaryValue, secondaryValue, metricKey) {
    if (primaryValue === null || primaryValue === void 0 || secondaryValue === null || secondaryValue === void 0) {
      return { type: "missing", value: 0 };
    }
    if (secondaryValue === 0 && primaryValue > 0) {
      return { type: "new", value: 0 };
    }
    if (primaryValue === 0 && secondaryValue > 0) {
      return { type: "deleted", value: 0 };
    }
    if (primaryValue === 0 && secondaryValue === 0) {
      return { type: "zero", value: 0 };
    }
    const percentage = (primaryValue - secondaryValue) / secondaryValue * 100;
    const isGoodWhenHigh = isMetricGoodWhenHigh(metricKey);
    return {
      type: "normal",
      value: percentage,
      isImprovement: isGoodWhenHigh ? percentage > 0 : percentage < 0
    };
  }
  function buildComparisonRow(row, routeStatuses, comparePrimaryDay, compareSecondaryDay) {
    const { primaryRoute, secondaryRoute } = row;
    const wasNewOnSecondaryDay = wasRouteNewOnDay(row.id, compareSecondaryDay, routeStatuses);
    const isDeletedOnPrimaryDay = wasRouteDeletedOnDay(row.id, comparePrimaryDay, routeStatuses);
    if (wasNewOnSecondaryDay || primaryRoute && !secondaryRoute) {
      return {
        id: row.id,
        name: row.name,
        ridership: "NEW",
        capacity: "NEW",
        utilization: "NEW",
        stations: "NEW",
        trainSchedule: "NEW",
        transfers: "NEW",
        dailyCost: "NEW",
        dailyRevenue: "NEW",
        dailyProfit: "NEW",
        profitPerPassenger: "NEW",
        profitPerTrain: "NEW",
        primaryValues: {
          ridership: primaryRoute.ridership,
          capacity: primaryRoute.capacity,
          utilization: primaryRoute.utilization,
          stations: primaryRoute.stations,
          trainSchedule: calculateTotalTrains(primaryRoute),
          transfers: primaryRoute.transfers,
          dailyCost: primaryRoute.dailyCost,
          dailyRevenue: primaryRoute.dailyRevenue,
          dailyProfit: primaryRoute.dailyProfit,
          profitPerPassenger: primaryRoute.profitPerPassenger,
          profitPerTrain: primaryRoute.profitPerTrain
        },
        secondaryValues: {
          ridership: secondaryRoute?.ridership || 0,
          capacity: secondaryRoute?.capacity || 0,
          utilization: secondaryRoute?.utilization || 0,
          stations: secondaryRoute?.stations || 0,
          trainSchedule: calculateTotalTrains(secondaryRoute),
          transfers: secondaryRoute?.transfers || { count: 0, routes: [], stationIds: [] },
          dailyCost: secondaryRoute?.dailyCost || 0,
          dailyRevenue: secondaryRoute?.dailyRevenue || 0,
          dailyProfit: secondaryRoute?.dailyProfit || 0,
          profitPerPassenger: secondaryRoute?.profitPerPassenger || 0,
          profitPerTrain: secondaryRoute?.profitPerTrain || 0
        },
        deleted: false,
        isNew: true,
        isComparison: true
      };
    }
    if (isDeletedOnPrimaryDay || !primaryRoute && secondaryRoute) {
      return {
        id: row.id,
        name: row.name,
        ridership: "DELETED",
        capacity: "DELETED",
        utilization: "DELETED",
        stations: "DELETED",
        trainSchedule: "DELETED",
        transfers: "DELETED",
        dailyCost: "DELETED",
        dailyRevenue: "DELETED",
        dailyProfit: "DELETED",
        profitPerPassenger: "DELETED",
        profitPerTrain: "DELETED",
        primaryValues: {
          ridership: 0,
          capacity: 0,
          utilization: 0,
          stations: 0,
          trainSchedule: 0,
          transfers: { count: 0, routes: [], stationIds: [] },
          dailyCost: 0,
          dailyRevenue: 0,
          dailyProfit: 0,
          profitPerPassenger: 0,
          profitPerTrain: 0
        },
        secondaryValues: {
          ridership: secondaryRoute.ridership,
          capacity: secondaryRoute.capacity,
          utilization: secondaryRoute.utilization,
          stations: secondaryRoute.stations,
          trainSchedule: calculateTotalTrains(secondaryRoute),
          transfers: secondaryRoute.transfers,
          dailyCost: secondaryRoute.dailyCost,
          dailyRevenue: secondaryRoute.dailyRevenue,
          dailyProfit: secondaryRoute.dailyProfit,
          profitPerPassenger: secondaryRoute.profitPerPassenger,
          profitPerTrain: secondaryRoute.profitPerTrain
        },
        deleted: true,
        isDeleted: true,
        isComparison: true
      };
    }
    const metrics = {
      ridership: calculatePercentageChange(primaryRoute.ridership, secondaryRoute.ridership, "ridership"),
      capacity: calculatePercentageChange(primaryRoute.capacity, secondaryRoute.capacity, "capacity"),
      utilization: calculatePercentageChange(primaryRoute.utilization, secondaryRoute.utilization, "utilization"),
      stations: calculatePercentageChange(primaryRoute.stations, secondaryRoute.stations, "stations"),
      trainSchedule: calculatePercentageChange(
        calculateTotalTrains(primaryRoute),
        calculateTotalTrains(secondaryRoute),
        "trainSchedule"
      ),
      transfers: calculatePercentageChange(
        primaryRoute.transfers?.count || 0,
        secondaryRoute.transfers?.count || 0,
        "transfers"
      ),
      dailyCost: calculatePercentageChange(primaryRoute.dailyCost, secondaryRoute.dailyCost, "dailyCost"),
      dailyRevenue: calculatePercentageChange(primaryRoute.dailyRevenue, secondaryRoute.dailyRevenue, "dailyRevenue"),
      dailyProfit: calculatePercentageChange(primaryRoute.dailyProfit, secondaryRoute.dailyProfit, "dailyProfit"),
      profitPerPassenger: calculatePercentageChange(
        primaryRoute.profitPerPassenger,
        secondaryRoute.profitPerPassenger,
        "profitPerPassenger"
      ),
      profitPerTrain: calculatePercentageChange(
        primaryRoute.profitPerTrain,
        secondaryRoute.profitPerTrain,
        "profitPerTrain"
      )
    };
    return {
      id: row.id,
      name: row.name,
      ...metrics,
      primaryValues: {
        ridership: primaryRoute.ridership,
        capacity: primaryRoute.capacity,
        utilization: primaryRoute.utilization,
        stations: primaryRoute.stations,
        trainSchedule: calculateTotalTrains(primaryRoute),
        transfers: primaryRoute.transfers,
        dailyCost: primaryRoute.dailyCost,
        dailyRevenue: primaryRoute.dailyRevenue,
        dailyProfit: primaryRoute.dailyProfit,
        profitPerPassenger: primaryRoute.profitPerPassenger,
        profitPerTrain: primaryRoute.profitPerTrain
      },
      secondaryValues: {
        ridership: secondaryRoute.ridership,
        capacity: secondaryRoute.capacity,
        utilization: secondaryRoute.utilization,
        stations: secondaryRoute.stations,
        trainSchedule: calculateTotalTrains(secondaryRoute),
        transfers: secondaryRoute.transfers,
        dailyCost: secondaryRoute.dailyCost,
        dailyRevenue: secondaryRoute.dailyRevenue,
        dailyProfit: secondaryRoute.dailyProfit,
        profitPerPassenger: secondaryRoute.profitPerPassenger,
        profitPerTrain: secondaryRoute.profitPerTrain
      },
      deleted: false,
      isComparison: true
    };
  }
  function getComparisonData(primaryDay, secondaryDay, historicalData) {
    const primaryData = historicalData.days[primaryDay];
    const secondaryData = historicalData.days[secondaryDay];
    if (!primaryData || !secondaryData) {
      return null;
    }
    const secondaryRoutes = /* @__PURE__ */ new Map();
    secondaryData.routes.forEach((route) => {
      secondaryRoutes.set(route.id, route);
    });
    const primaryRoutes = /* @__PURE__ */ new Map();
    primaryData.routes.forEach((route) => {
      primaryRoutes.set(route.id, route);
    });
    const allRouteIds = /* @__PURE__ */ new Set([...primaryRoutes.keys(), ...secondaryRoutes.keys()]);
    const comparisonRows = [];
    allRouteIds.forEach((routeId) => {
      const primaryRoute = primaryRoutes.get(routeId);
      const secondaryRoute = secondaryRoutes.get(routeId);
      if (!primaryRoute && !secondaryRoute) {
        return;
      }
      comparisonRows.push({
        id: routeId,
        name: (primaryRoute || secondaryRoute).name,
        primaryRoute,
        secondaryRoute
      });
    });
    return comparisonRows;
  }

  // src/hooks/useRouteMetrics.js
  var api16 = window.SubwayBuilderAPI;
  var { React: React16 } = api16.utils;
  function useRouteMetrics({
    sortState,
    timeframeState = "last24h",
    compareMode = false,
    comparePrimaryDay = null,
    compareSecondaryDay = null,
    historicalData = { days: {} }
  }) {
    const [tableData, setTableData] = React16.useState([]);
    const [isLoading, setIsLoading] = React16.useState(true);
    const storage2 = getStorage();
    React16.useEffect(() => {
      if (CONFIG.debug) {
        console.log(`${CONFIG.LOG_PREFIX} Debug mode - updates paused`);
        return;
      }
      const updateData = async () => {
        setIsLoading(true);
        let processedData = [];
        try {
          if (compareMode && comparePrimaryDay && compareSecondaryDay) {
            const comparisonRows = getComparisonData(
              comparePrimaryDay,
              compareSecondaryDay,
              historicalData
            );
            if (comparisonRows && storage2) {
              const routeStatuses = await storage2.get("routeStatuses", {});
              const mappedRows = comparisonRows.map(
                (row) => buildComparisonRow(
                  row,
                  routeStatuses,
                  comparePrimaryDay,
                  compareSecondaryDay
                )
              );
              const filteredRows = mappedRows.filter((row) => {
                const status = routeStatuses[row.id];
                if (!status) return true;
                const wasNewOnPrimaryDay = status.createdDay === comparePrimaryDay;
                const wasNewOnSecondaryDay = status.createdDay === compareSecondaryDay;
                return !(wasNewOnPrimaryDay || wasNewOnSecondaryDay);
              });
              processedData = filteredRows;
            }
          } else if (timeframeState !== "last24h") {
            const dayData = historicalData.days[timeframeState];
            if (dayData && dayData.routes) {
              const currentRoutes = api16.gameState.getRoutes();
              processedData = dayData.routes.map((route) => ({
                ...route,
                deleted: !currentRoutes.some((r) => r.id === route.id)
              }));
            }
          } else {
            processedData = await fetchLiveRouteData(storage2);
          }
          const sortedData = sortTableData(processedData, sortState);
          setTableData(sortedData);
        } catch (error) {
          console.error(`${CONFIG.LOG_PREFIX} Error updating route metrics:`, error);
          setTableData([]);
        } finally {
          setIsLoading(false);
        }
      };
      updateData();
      let interval = null;
      if (timeframeState === "last24h" && !compareMode) {
        interval = setInterval(updateData, CONFIG.REFRESH_INTERVAL);
      }
      return () => {
        if (interval) clearInterval(interval);
      };
    }, [
      sortState,
      timeframeState,
      historicalData,
      compareMode,
      comparePrimaryDay,
      compareSecondaryDay,
      storage2
      // Add storage to dependencies
    ]);
    return { tableData, isLoading };
  }
  async function fetchLiveRouteData(storage2) {
    const routes = api16.gameState.getRoutes();
    const trainTypes = api16.trains.getTrainTypes();
    const lineMetrics = api16.gameState.getLineMetrics();
    const currentTime = api16.gameState.getElapsedSeconds();
    const currentDay = api16.gameState.getCurrentDay();
    const routeStatuses = storage2 ? await storage2.get("routeStatuses", {}) : {};
    const transfersMap = calculateTransfers(routes, api16);
    const processedData = [];
    routes.forEach((route) => {
      const metrics = lineMetrics.find((m) => m.routeId === route.id);
      const ridership = api16.gameState.getRouteRidership(route.id).total;
      const revenuePerHour = metrics ? metrics.revenuePerHour : 0;
      const accumulated = getAccumulatedRevenue(route.id);
      const status = routeStatuses[route.id];
      const isNewToday = status && status.status === "new" && status.createdDay === currentDay;
      const dailyRevenue = accumulated > 0 ? accumulated : revenuePerHour * 24;
      const projectedRevenue = revenuePerHour * 24;
      if (!validateRouteData(route)) {
        processedData.push({
          ...getEmptyMetrics(),
          id: route.id,
          name: route.name || route.bullet,
          ridership,
          dailyRevenue,
          // override getEmptyMetrics()'s dailyRevenue: 0
          deleted: false,
          isNewToday: false,
          transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] }
        });
        return;
      }
      const trainType = trainTypes[route.trainType];
      if (!trainType) {
        processedData.push({
          ...getEmptyMetrics(),
          id: route.id,
          name: route.name || route.bullet,
          ridership,
          dailyRevenue,
          // override getEmptyMetrics()'s dailyRevenue: 0
          deleted: false,
          isNewToday: false,
          transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] }
        });
        return;
      }
      let calculatedMetrics;
      if (isNewToday && status.creationTime !== null && status.creationTime !== void 0) {
        calculatedMetrics = calculateRealTimeMetrics(
          route,
          trainType,
          ridership,
          projectedRevenue,
          status.creationTime,
          currentTime,
          accumulated > 0 ? accumulated : null
        );
      } else {
        calculatedMetrics = calculateRouteMetrics(
          route,
          trainType,
          ridership,
          dailyRevenue
        );
      }
      processedData.push({
        id: route.id,
        name: route.name || route.bullet,
        ridership,
        dailyRevenue,
        deleted: false,
        isNewToday,
        // Flag for UI indicators (optional)
        transfers: transfersMap[route.id] || { count: 0, routes: [], stationIds: [] },
        ...calculatedMetrics
      });
    });
    return processedData;
  }

  // src/ui/dashboard/dashboard-table.jsx
  var api17 = window.SubwayBuilderAPI;
  var { React: React17 } = api17.utils;
  function DashboardTable({
    groups = ["trains", "finance", "performance"],
    liveRouteData = null
    // optional — provided by Dashboard
  }) {
    const [sortState, setSortState] = React17.useState(INITIAL_STATE.sort);
    const [groupState, setGroupState] = React17.useState(INITIAL_STATE.groups);
    const [timeframeState, setTimeframeState] = React17.useState(INITIAL_STATE.timeframe);
    const [historicalData, setHistoricalData] = React17.useState({ days: {} });
    const [compareMode, setCompareMode] = React17.useState(false);
    const [comparePrimaryDay, setComparePrimaryDay] = React17.useState(null);
    const [compareSecondaryDay, setCompareSecondaryDay] = React17.useState(null);
    const [compareShowPercentages, setCompareShowPercentages] = React17.useState(true);
    const storage2 = getStorage();
    React17.useEffect(() => {
      const loadHistorical = async () => {
        if (!storage2) return;
        const data = await storage2.get("historicalData", { days: {} });
        setHistoricalData(data);
      };
      loadHistorical();
    }, [storage2]);
    React17.useEffect(() => {
      if (!storage2) return;
      const checkUpdates = setInterval(async () => {
        const latest = await storage2.get("historicalData", { days: {} });
        if (JSON.stringify(latest) !== JSON.stringify(historicalData)) {
          setHistoricalData(latest);
        }
      }, 2e3);
      return () => clearInterval(checkUpdates);
    }, [storage2, historicalData]);
    const { tableData: ownLiveData } = useRouteMetrics({
      sortState,
      timeframeState,
      compareMode,
      comparePrimaryDay,
      compareSecondaryDay,
      historicalData
    });
    const tableData = React17.useMemo(() => {
      const isLive = timeframeState === "last24h" && !compareMode;
      if (isLive && liveRouteData !== null) {
        return sortTableData(liveRouteData, sortState);
      }
      return ownLiveData;
    }, [timeframeState, compareMode, liveRouteData, ownLiveData, sortState]);
    const updateSortState = React17.useCallback((newState) => {
      setSortState(newState);
    }, []);
    const updateGroupState = React17.useCallback((groupKey) => {
      setGroupState((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
    }, []);
    const updateTimeframeState = React17.useCallback((newTimeframe) => {
      setTimeframeState(newTimeframe);
    }, []);
    const updateCompareMode = React17.useCallback((enabled) => {
      setCompareMode(enabled);
      if (enabled && historicalData.days) {
        const allDays = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
        const mostRecentDay = allDays[0];
        const dayBefore = allDays[1];
        if (mostRecentDay && dayBefore) {
          setComparePrimaryDay(mostRecentDay);
          setCompareSecondaryDay(dayBefore);
        }
      }
    }, [historicalData]);
    const updateComparePrimaryDay = React17.useCallback((value) => {
      const newPrimary = Number(value);
      setComparePrimaryDay(newPrimary);
      if (compareSecondaryDay >= newPrimary) {
        setCompareSecondaryDay(newPrimary - 1);
      }
    }, [compareSecondaryDay]);
    const updateCompareSecondaryDay = React17.useCallback((value) => {
      setCompareSecondaryDay(Number(value));
    }, []);
    const updateCompareShowPercentages = React17.useCallback(() => {
      setCompareShowPercentages((prev) => !prev);
    }, []);
    return /* @__PURE__ */ React17.createElement(React17.Fragment, null, /* @__PURE__ */ React17.createElement("section", null, /* @__PURE__ */ React17.createElement("div", { className: "py-5 flex items-center justify-between gap-8" }, /* @__PURE__ */ React17.createElement("h3", { className: "whitespace-nowrap text-2xl font-semibold leading-none tracking-tight" }, "Routes Stats")), /* @__PURE__ */ React17.createElement("div", { className: "pb-3 flex items-center justify-between gap-8" }, /* @__PURE__ */ React17.createElement(
      DashboardTableToolbar,
      {
        groupState,
        onGroupChange: updateGroupState,
        timeframeState,
        onTimeframeChange: updateTimeframeState,
        compareMode,
        onCompareModeChange: updateCompareMode,
        comparePrimaryDay,
        onComparePrimaryDayChange: updateComparePrimaryDay,
        compareSecondaryDay,
        onCompareSecondaryDayChange: updateCompareSecondaryDay,
        compareShowPercentages,
        onCompareShowPercentagesChange: updateCompareShowPercentages,
        historicalData
      }
    )), /* @__PURE__ */ React17.createElement("div", { className: "scrollbar-thin max-w-full rounded-lg border border-foreground/20 backdrop-blur-sm text-card-foreground mb-6 flex-1 overflow-auto max-h-[40vh]" }, /* @__PURE__ */ React17.createElement(
      SortableTable,
      {
        data: tableData,
        sortState,
        onSortChange: updateSortState,
        groups,
        groupState,
        compareShowPercentages
      }
    ))));
  }

  // src/ui/dashboard/dashboard-trends.jsx
  var api18 = window.SubwayBuilderAPI;
  var { React: React18, icons: icons8, charts } = api18.utils;
  var CHART_METRICS = [
    { key: "ridership", label: "Ridership", color: "#3b82f6" },
    { key: "capacity", label: "Throughput", color: "#8b5cf6" },
    { key: "utilization", label: "Usage %", color: "#22c55e" },
    { key: "dailyCost", label: "Daily Cost", color: "#ef4444" },
    { key: "dailyRevenue", label: "Daily Revenue", color: "#10b981" },
    { key: "dailyProfit", label: "Daily Profit", color: "#06b6d4" }
  ];
  var TIMEFRAMES = [
    { key: "7", label: "7 Days" },
    { key: "14", label: "14 Days" },
    { key: "all", label: "All Time" }
  ];
  var TODAY_LABEL = "Today";
  function buildTodayPoint(liveRouteData, metricKey) {
    const point = { day: TODAY_LABEL, isLive: true };
    liveRouteData.forEach((route) => {
      point[route.id] = route[metricKey] ?? 0;
    });
    return point;
  }
  function DashboardTrends({ historicalData, liveRouteData = [] }) {
    const [chartType, setChartType] = React18.useState("line");
    const [selectedRoutes, setSelectedRoutes] = React18.useState([]);
    const [selectedMetric, setSelectedMetric] = React18.useState("utilization");
    const [timeframe, setTimeframe] = React18.useState("7");
    const [hoveredRoute, setHoveredRoute] = React18.useState(null);
    const routes = api18.gameState.getRoutes();
    const metricConfig = CHART_METRICS.find((m) => m.key === selectedMetric);
    const allDays = React18.useMemo(() => getAvailableDays(historicalData), [historicalData]);
    const daysToShow = React18.useMemo(() => {
      if (timeframe === "all") return allDays;
      const limit = parseInt(timeframe) - 1;
      return allDays.slice(0, limit);
    }, [allDays, timeframe]);
    const chartData = React18.useMemo(() => {
      if (selectedRoutes.length === 0) return [];
      const historical = [...daysToShow].reverse().map((day) => {
        const dayData = historicalData.days[day];
        if (!dayData) return null;
        const point = { day, isLive: false };
        selectedRoutes.forEach((routeId) => {
          const routeData = dayData.routes.find((r) => r.id === routeId);
          point[routeId] = routeData?.[selectedMetric] ?? null;
        });
        return point;
      }).filter(Boolean);
      const todayPoint = liveRouteData.length > 0 ? buildTodayPoint(liveRouteData, selectedMetric) : null;
      return todayPoint ? [...historical, todayPoint] : historical;
    }, [selectedRoutes, selectedMetric, daysToShow, historicalData, liveRouteData]);
    React18.useEffect(() => {
      if (selectedRoutes.length > 0) return;
      if (routes.length === 0) return;
      if (liveRouteData.length > 0) {
        const top = [...liveRouteData].sort((a, b) => b.ridership - a.ridership).slice(0, 3).map((r) => r.id);
        setSelectedRoutes(top);
        return;
      }
      if (allDays.length > 0) {
        const recentDay = allDays[0];
        const recentData = historicalData.days[recentDay];
        if (recentData?.routes) {
          const top = [...recentData.routes].sort((a, b) => b.ridership - a.ridership).slice(0, 3).map((r) => r.id);
          setSelectedRoutes(top);
        }
      }
    }, [routes, allDays, historicalData, liveRouteData, selectedRoutes.length]);
    return /* @__PURE__ */ React18.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React18.createElement("div", { className: "flex items-center justify-between gap-4" }, /* @__PURE__ */ React18.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React18.createElement("span", { className: "text-xs font-medium" }, "Chart:"), /* @__PURE__ */ React18.createElement(ButtonsGroup, { value: chartType, onChange: setChartType }, /* @__PURE__ */ React18.createElement(ButtonsGroupItem, { value: "line", text: "Line" }), /* @__PURE__ */ React18.createElement(ButtonsGroupItem, { value: "bar", text: "Bar" }))), /* @__PURE__ */ React18.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React18.createElement("span", { className: "text-xs font-medium" }, "Routes:"), /* @__PURE__ */ React18.createElement(
      Dropdown,
      {
        togglerContent: selectedRoutes.length === 1 ? /* @__PURE__ */ React18.createElement(RouteBadge, { routeId: selectedRoutes[0], size: "1.2rem", interactive: false }) : null,
        togglerIcon: selectedRoutes.length === 0 ? icons8.Route : null,
        togglerText: selectedRoutes.length === 0 ? "Select routes" : selectedRoutes.length > 1 ? `${selectedRoutes.length} selected` : null,
        togglerClasses: "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input",
        menuClasses: "min-w-[200px] max-h-[300px] overflow-y-auto",
        multiselect: true,
        value: selectedRoutes,
        onChange: setSelectedRoutes
      },
      routes.map((route) => /* @__PURE__ */ React18.createElement(
        DropdownItem,
        {
          key: route.id,
          route,
          active: selectedRoutes.includes(route.id),
          onClick: () => {
            const next = selectedRoutes.includes(route.id) ? selectedRoutes.filter((id) => id !== route.id) : [...selectedRoutes, route.id];
            setSelectedRoutes(next);
          },
          hoveredRoute,
          onHover: setHoveredRoute,
          onLeave: () => setHoveredRoute(null)
        }
      ))
    ), /* @__PURE__ */ React18.createElement("span", { className: "text-xs font-medium" }, "Metric:"), /* @__PURE__ */ React18.createElement(
      Dropdown,
      {
        togglerIcon: icons8.LineChart,
        togglerText: metricConfig?.label || "Select metric",
        togglerClasses: "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input",
        menuClasses: "min-w-[180px]",
        multiselect: false,
        value: selectedMetric,
        onChange: setSelectedMetric
      },
      CHART_METRICS.map((metric) => /* @__PURE__ */ React18.createElement(
        DropdownItem,
        {
          key: metric.key,
          value: metric.key,
          text: metric.label
        }
      ))
    )), /* @__PURE__ */ React18.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React18.createElement("span", { className: "text-xs font-medium" }, "Period:"), /* @__PURE__ */ React18.createElement(ButtonsGroup, { value: timeframe, onChange: setTimeframe }, TIMEFRAMES.map((tf) => /* @__PURE__ */ React18.createElement(ButtonsGroupItem, { key: tf.key, value: tf.key, text: tf.label }))))), /* @__PURE__ */ React18.createElement("div", { className: "rounded-lg border border-border bg-background/50 p-4" }, chartData.length === 0 ? /* @__PURE__ */ React18.createElement("div", { className: "flex flex-col items-center justify-center py-16 text-center" }, /* @__PURE__ */ React18.createElement(icons8.LineChart, { size: 48, className: "text-muted-foreground mb-4" }), /* @__PURE__ */ React18.createElement("div", { className: "text-sm text-muted-foreground" }, selectedRoutes.length === 0 ? /* @__PURE__ */ React18.createElement("p", null, "Select routes to display chart") : daysToShow.length === 0 && liveRouteData.length === 0 ? /* @__PURE__ */ React18.createElement("p", null, "No data available yet") : /* @__PURE__ */ React18.createElement("p", null, "No data available for selected timeframe"))) : /* @__PURE__ */ React18.createElement(
      ChartDisplay,
      {
        data: chartData,
        routes,
        selectedRoutes,
        metricKey: selectedMetric,
        metricLabel: metricConfig?.label,
        chartType,
        hoveredRoute,
        onHover: setHoveredRoute,
        onLeave: () => setHoveredRoute(null)
      }
    )));
  }
  function ChartDisplay({
    data,
    routes,
    selectedRoutes,
    metricKey,
    metricLabel,
    chartType,
    hoveredRoute,
    onHover,
    onLeave
  }) {
    const h = React18.createElement;
    const getRouteColor = (routeId) => {
      const route = routes.find((r) => r.id === routeId);
      return route?.color || "#888888";
    };
    const formatYAxis = (value) => {
      if (["dailyCost", "dailyRevenue", "dailyProfit"].includes(metricKey)) {
        if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
        if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
        return `$${value}`;
      }
      if (metricKey === "utilization") return `${value}%`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
      return value.toLocaleString();
    };
    const formatValue = (value) => {
      if (value == null) return "\u2014";
      if (["dailyCost", "dailyRevenue", "dailyProfit"].includes(metricKey)) {
        return `$${value.toLocaleString(void 0, { maximumFractionDigits: 0 })}`;
      }
      if (metricKey === "utilization") return `${value}%`;
      return value.toLocaleString(void 0, { maximumFractionDigits: 0 });
    };
    const CustomTooltip = ({ active, payload, label }) => {
      if (!active || !payload?.length) return null;
      const isLivePoint = label === TODAY_LABEL;
      return h("div", {
        className: "bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg"
      }, [
        h("div", {
          key: "label",
          className: "text-xs font-medium mb-2 text-muted-foreground flex items-center gap-1.5"
        }, [
          isLivePoint && h("span", {
            key: "live-badge",
            className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30"
          }, [
            h("span", { key: "dot", className: "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" }),
            "LIVE"
          ]),
          h("span", { key: "day-label" }, isLivePoint ? "Today (partial day)" : `Day ${label}`)
        ]),
        // Per-route rows
        ...selectedRoutes.map((routeId, i) => {
          const route = routes.find((r) => r.id === routeId);
          const routeName = route?.name || route?.bullet || routeId;
          const rawEntry = payload.find((p) => p.dataKey === routeId);
          const rawVal = rawEntry?.value;
          return h("div", { key: routeId, className: "mt-1" }, [
            // Route name + color pip
            h("div", { key: "name", className: "flex items-center gap-1.5 mb-0.5" }, [
              h("div", {
                key: "pip",
                className: "w-3 h-3 rounded-full flex-shrink-0",
                style: { backgroundColor: getRouteColor(routeId) }
              }),
              h("span", { key: "label", className: "text-xs font-medium" }, routeName)
            ]),
            h("div", {
              key: "val",
              className: "flex items-center justify-between gap-6 text-xs pl-4"
            }, [
              h("span", { key: "k", className: "text-muted-foreground" }, metricLabel),
              h(
                "span",
                { key: "v", className: "font-mono font-medium" },
                formatValue(rawVal)
              )
            ])
          ]);
        })
      ]);
    };
    const makeLiveDot = (color) => (props) => {
      const { cx, cy, value, payload } = props;
      if (value == null) return null;
      if (!payload?.isLive) {
        return h("circle", { cx, cy, r: 3, fill: color, stroke: "none" });
      }
      return h("circle", {
        cx,
        cy,
        r: 4,
        fill: "none",
        stroke: color,
        strokeWidth: 1.5,
        opacity: 0.65,
        strokeDasharray: "2 1"
      });
    };
    const commonProps = {
      data,
      margin: { top: 20, right: 0, left: 0, bottom: 20 }
    };
    const xAxisProps = {
      key: "xaxis",
      dataKey: "day",
      stroke: "#9ca3af",
      fontSize: 12,
      tickFormatter: (day) => day === TODAY_LABEL ? "\u25B8 Today" : `Day ${day}`,
      // Add breathing room after the Today tick so it doesn't hug the border
      padding: { right: 32, left: 32 },
      axisLine: false,
      tickLine: false
    };
    const yAxisProps = {
      key: "yaxis",
      stroke: "#9ca3af",
      fontSize: 12,
      tickFormatter: formatYAxis,
      axisLine: false,
      tickLine: false
    };
    const gridProps = {
      key: "grid",
      strokeDasharray: "3 3",
      stroke: "#374151",
      opacity: 0.3
    };
    const todayRefLine = h(charts.ReferenceLine, {
      key: "today-ref",
      x: TODAY_LABEL,
      stroke: "#6b7280",
      strokeDasharray: "4 3",
      strokeOpacity: 0.5,
      label: { value: "", position: "insideTopRight" }
    });
    const BadgeLegend = ({ payload }) => {
      if (!payload?.length) return null;
      const visible = payload;
      return h(
        "div",
        {
          className: "flex items-center justify-center gap-3 flex-wrap pt-1"
        },
        visible.map(
          (entry) => h("div", {
            key: entry.dataKey,
            className: "flex items-center gap-1.5 cursor-pointer transition-opacity",
            style: { opacity: hoveredRoute && hoveredRoute !== entry.dataKey ? 0.5 : 1 },
            onMouseEnter: () => onHover?.(entry.dataKey),
            onMouseLeave: () => onLeave?.()
          }, [
            h(RouteBadge, { key: "badge", routeId: entry.dataKey, size: "1.3rem" })
          ])
        )
      );
    };
    if (chartType === "line") {
      return h(
        "div",
        {
          className: "aa-chart w-full",
          style: { height: "400px" }
        },
        h(
          charts.ResponsiveContainer,
          { width: "100%", height: "100%" },
          h(charts.LineChart, commonProps, [
            h(charts.CartesianGrid, gridProps),
            h(charts.XAxis, xAxisProps),
            h(charts.YAxis, yAxisProps),
            h(charts.Tooltip, { key: "tooltip", content: CustomTooltip }),
            h(charts.Legend, {
              key: "legend",
              content: BadgeLegend
            }),
            todayRefLine,
            // Main series per route — dim non-hovered routes
            ...selectedRoutes.map(
              (routeId) => h(charts.Line, {
                key: routeId,
                type: "monotone",
                dataKey: routeId,
                stroke: getRouteColor(routeId),
                strokeWidth: hoveredRoute === routeId ? 3 : 2,
                strokeOpacity: hoveredRoute && hoveredRoute !== routeId ? 0.2 : 1,
                dot: makeLiveDot(getRouteColor(routeId)),
                activeDot: { r: 5 },
                connectNulls: false,
                style: { transition: "stroke-opacity 0.15s, stroke-width 0.15s" },
                animationDuration: 500
              })
            )
          ])
        )
      );
    }
    const makeLiveBar = (color, routeId) => {
      return function LiveBarShape(props) {
        const { x, y, width, height, payload } = props;
        if (!width || !height) return null;
        const rectY = height < 0 ? y + height : y;
        const rectHeight = Math.abs(height);
        const liveFillOpacity = payload?.isLive ? 0.2 : 0.3;
        const fillOpacity = hoveredRoute && hoveredRoute !== routeId ? 0.1 : liveFillOpacity;
        const strokeDasharray = payload?.isLive ? "3 3" : void 0;
        const opacity = hoveredRoute && hoveredRoute !== routeId ? 0.2 : 1;
        return h("rect", {
          x,
          y: rectY,
          width,
          height: rectHeight,
          rx: 2,
          ry: 2,
          fill: color,
          stroke: color,
          strokeWidth: 1,
          opacity,
          fillOpacity,
          strokeDasharray
        });
      };
    };
    return h(
      "div",
      {
        className: "aa-chart w-full",
        style: { height: "400px" }
      },
      h(
        charts.ResponsiveContainer,
        { width: "100%", height: "100%" },
        h(charts.BarChart, commonProps, [
          h(charts.CartesianGrid, gridProps),
          h(charts.XAxis, xAxisProps),
          h(charts.YAxis, yAxisProps),
          h(charts.Tooltip, { key: "tooltip", content: CustomTooltip }),
          h(charts.Legend, {
            key: "legend",
            content: BadgeLegend
          }),
          todayRefLine,
          ...selectedRoutes.map(
            (routeId) => h(charts.Bar, {
              key: routeId,
              dataKey: routeId,
              shape: makeLiveBar(getRouteColor(routeId), routeId)
            })
          )
        ])
      )
    );
  }

  // src/utils/route-utils.js
  function getRouteStationsInOrder(routeId, api28) {
    try {
      const routes = api28.gameState.getRoutes();
      const route = routes.find((r) => r.id === routeId);
      if (!route || !route.stComboTimings || route.stComboTimings.length === 0) {
        return [];
      }
      const allStations = api28.gameState.getStations();
      const stNodeToStation = /* @__PURE__ */ new Map();
      allStations.forEach((station) => {
        if (station.stNodeIds && station.stNodeIds.length > 0) {
          station.stNodeIds.forEach((stNodeId) => {
            stNodeToStation.set(stNodeId, station);
          });
        }
      });
      const seen = /* @__PURE__ */ new Set();
      const orderedStations = [];
      for (const timing of route.stComboTimings) {
        const station = stNodeToStation.get(timing.stNodeId);
        if (!station) continue;
        if (seen.has(station.id)) continue;
        seen.add(station.id);
        orderedStations.push({
          id: station.id,
          name: station.name || "Unnamed Station",
          stNodeId: timing.stNodeId,
          stNodeIndex: timing.stNodeIndex,
          arrivalTime: timing.arrivalTime,
          departureTime: timing.departureTime
        });
      }
      return orderedStations;
    } catch (error) {
      console.error("[RouteUtils] Error getting stations in order:", error);
      return [];
    }
  }

  // src/utils/transfer-utils.js
  function getStationTransferRoutes(stationId, currentRouteId, api28) {
    return isZustandAvailable() ? _getTransferRoutesZustand(stationId, currentRouteId, api28) : _getTransferRoutesFallback(stationId, currentRouteId, api28);
  }
  function _getTransferRoutesZustand(stationId, currentRouteId, api28) {
    try {
      const allStations = api28.gameState.getStations();
      const allRoutes = api28.gameState.getRoutes();
      const siblingIds = getSiblingStationIds(stationId);
      if (siblingIds.length === 0) return [];
      const transferRouteIds = /* @__PURE__ */ new Set();
      for (const sibId of siblingIds) {
        const sib = allStations.find((s) => s.id === sibId);
        if (!sib?.routeIds) continue;
        for (const routeId of sib.routeIds) {
          if (routeId !== currentRouteId) {
            transferRouteIds.add(routeId);
          }
        }
      }
      const thisStation = allStations.find((s) => s.id === stationId);
      if (thisStation?.routeIds) {
        for (const routeId of thisStation.routeIds) {
          if (routeId !== currentRouteId) {
            transferRouteIds.add(routeId);
          }
        }
      }
      return _resolveRouteIds(transferRouteIds, allRoutes);
    } catch (error) {
      console.error(`${CONFIG.LOG_PREFIX} [TransferUtils/Zustand] Error:`, error);
      return [];
    }
  }
  function _getTransferRoutesFallback(stationId, currentRouteId, api28) {
    try {
      const allStations = api28.gameState.getStations();
      const allRoutes = api28.gameState.getRoutes();
      const THRESHOLD = CONFIG.TRANSFER_WALKING_TIME_THRESHOLD;
      const station = allStations.find((s) => s.id === stationId);
      if (!station?.nearbyStations?.length) return [];
      const transferRouteIds = /* @__PURE__ */ new Set();
      station.nearbyStations.forEach((nearby) => {
        if (nearby.walkingTime >= THRESHOLD) return;
        const nearbyStation = allStations.find((s) => s.id === nearby.stationId);
        if (!nearbyStation?.routeIds) return;
        nearbyStation.routeIds.forEach((routeId) => {
          if (routeId !== currentRouteId) transferRouteIds.add(routeId);
        });
      });
      if (station.routeIds) {
        station.routeIds.forEach((routeId) => {
          if (routeId !== currentRouteId) transferRouteIds.add(routeId);
        });
      }
      return _resolveRouteIds(transferRouteIds, allRoutes);
    } catch (error) {
      console.error(`${CONFIG.LOG_PREFIX} [TransferUtils/Fallback] Error:`, error);
      return [];
    }
  }
  function _resolveRouteIds(routeIdSet, allRoutes) {
    return Array.from(routeIdSet).map((routeId) => {
      const route = allRoutes.find((r) => r.id === routeId);
      if (!route) return null;
      return {
        routeId,
        routeName: route.name || route.bullet || routeId,
        bullet: route.bullet || "?"
      };
    }).filter(Boolean);
  }

  // src/ui/dashboard/dashboard-map.jsx
  var api19 = window.SubwayBuilderAPI;
  var { React: React19, icons: icons9 } = api19.utils;
  var W = 900;
  var H = 360;
  var PAD = 56;
  function buildTransferMap(routes, stationsByRoute, api28) {
    const allStations = api28.gameState.getStations();
    const stationToGroup = {};
    if (isZustandAvailable()) {
      getStationGroups().forEach((group) => {
        group.stationIds.forEach((sid) => {
          stationToGroup[sid] = group.id;
        });
      });
    }
    allStations.forEach((s) => {
      if (!stationToGroup[s.id]) stationToGroup[s.id] = s.id;
    });
    const groupToRoutes = {};
    const groupCanonical = {};
    routes.forEach((route) => {
      (stationsByRoute[route.id] || []).forEach((stId) => {
        const connectedRoutes = getStationTransferRoutes(stId, route.id, api28);
        if (!connectedRoutes.length) return;
        const groupId = stationToGroup[stId] || stId;
        if (!groupToRoutes[groupId]) {
          groupToRoutes[groupId] = /* @__PURE__ */ new Set();
          groupCanonical[groupId] = stId;
        }
        groupToRoutes[groupId].add(route.id);
        connectedRoutes.forEach((tr) => groupToRoutes[groupId].add(tr.routeId));
      });
    });
    const transferMap = {};
    Object.entries(groupToRoutes).forEach(([groupId, routeIdSet]) => {
      if (routeIdSet.size < 2) return;
      const canonicalId = groupCanonical[groupId];
      const station = allStations.find((s) => s.id === canonicalId);
      transferMap[groupId] = {
        canonicalStationId: canonicalId,
        routeIds: Array.from(routeIdSet),
        name: station?.name || "Transfer"
      };
    });
    return transferMap;
  }
  function assignBaseY(routes) {
    const n = routes.length;
    const baseYMap = {};
    routes.forEach((route, i) => {
      baseYMap[route.id] = n === 1 ? 50 : 5 + i / (n - 1) * 90;
    });
    return baseYMap;
  }
  function buildStationToCanonical(transferMap) {
    const stationToCanonical = {};
    if (isZustandAvailable()) {
      const groups = getStationGroups();
      Object.entries(transferMap).forEach(([groupId, data]) => {
        const group = groups.find((g) => g.id === groupId);
        if (group) {
          group.stationIds.forEach((sid) => {
            stationToCanonical[sid] = data.canonicalStationId;
          });
        } else {
          stationToCanonical[groupId] = data.canonicalStationId;
        }
      });
    } else {
      Object.values(transferMap).forEach((data) => {
        stationToCanonical[data.canonicalStationId] = data.canonicalStationId;
      });
    }
    return stationToCanonical;
  }
  function computeLayout(routes, transferMap, stationsByRoute, baseYMap) {
    const stationToCanonical = buildStationToCanonical(transferMap);
    const canonicalY = {};
    Object.values(transferMap).forEach(({ canonicalStationId, routeIds }) => {
      const ys = routeIds.map((rid) => baseYMap[rid] ?? 50);
      canonicalY[canonicalStationId] = ys.reduce((a, b) => a + b, 0) / ys.length;
    });
    const routePoints = {};
    routes.forEach((route) => {
      const stations = stationsByRoute[route.id] || [];
      const n = stations.length;
      routePoints[route.id] = stations.map((stId, i) => {
        const canonical = stationToCanonical[stId];
        return {
          stationId: stId,
          canonicalId: canonical || stId,
          isTransfer: !!canonical,
          naturalX: n <= 1 ? 0.5 : i / (n - 1),
          x: n <= 1 ? 0.5 : i / (n - 1),
          y: canonical ? canonicalY[canonical] ?? baseYMap[route.id] : baseYMap[route.id]
        };
      });
    });
    const transferGroups = Object.values(transferMap);
    const canonicalX = {};
    if (transferGroups.length > 0) {
      const allGroupIds = transferGroups.map((g2) => g2.canonicalStationId);
      const edgeVotes = {};
      allGroupIds.forEach((id) => {
        edgeVotes[id] = {};
      });
      routes.forEach((route) => {
        const pts = routePoints[route.id] || [];
        const visited = [];
        pts.forEach((pt) => {
          if (pt.isTransfer) {
            const last = visited[visited.length - 1];
            if (last !== pt.canonicalId) visited.push(pt.canonicalId);
          }
        });
        for (let i = 0; i < visited.length - 1; i++) {
          const from = visited[i];
          const to = visited[i + 1];
          if (!edgeVotes[from]) edgeVotes[from] = {};
          if (!edgeVotes[to]) edgeVotes[to] = {};
          edgeVotes[from][to] = (edgeVotes[from][to] || 0) + 1;
        }
      });
      const adjList = {};
      const inDegree = {};
      allGroupIds.forEach((id) => {
        adjList[id] = [];
        inDegree[id] = 0;
      });
      allGroupIds.forEach((from) => {
        Object.entries(edgeVotes[from] || {}).forEach(([to, fwdVotes]) => {
          const bwdVotes = edgeVotes[to] && edgeVotes[to][from] || 0;
          if (fwdVotes > bwdVotes) {
            adjList[from].push(to);
            inDegree[to] = (inDegree[to] || 0) + 1;
          }
        });
      });
      const naturalMedian = {};
      allGroupIds.forEach((id) => {
        const xs = [];
        const group = transferGroups.find((g2) => g2.canonicalStationId === id);
        (group?.routeIds || []).forEach((rid) => {
          const pt = (routePoints[rid] || []).find((p) => p.canonicalId === id);
          if (pt) xs.push(pt.naturalX);
        });
        xs.sort((a, b) => a - b);
        const mid = Math.floor(xs.length / 2);
        naturalMedian[id] = xs.length === 0 ? 0.5 : xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
      });
      const topoOrder = [];
      let queue = allGroupIds.filter((id) => (inDegree[id] || 0) === 0);
      queue.sort((a, b) => naturalMedian[a] - naturalMedian[b]);
      while (queue.length > 0) {
        const node = queue.shift();
        topoOrder.push(node);
        (adjList[node] || []).forEach((neighbour) => {
          inDegree[neighbour]--;
          if (inDegree[neighbour] === 0) {
            queue.push(neighbour);
            queue.sort((a, b) => naturalMedian[a] - naturalMedian[b]);
          }
        });
      }
      allGroupIds.filter((id) => !topoOrder.includes(id)).sort((a, b) => naturalMedian[a] - naturalMedian[b]).forEach((id) => topoOrder.push(id));
      const g = topoOrder.length;
      topoOrder.forEach((id, idx) => {
        canonicalX[id] = g === 1 ? 0.5 : 0.15 + idx / (g - 1) * 0.7;
      });
    }
    routes.forEach((route) => {
      (routePoints[route.id] || []).forEach((pt) => {
        if (pt.isTransfer) {
          pt.x = canonicalX[pt.canonicalId] ?? pt.naturalX;
        }
      });
    });
    for (let pass = 0; pass < 2; pass++) {
      routes.forEach((route) => {
        const pts = routePoints[route.id] || [];
        for (let i = 1; i < pts.length; i++) {
          if (!pts[i].isTransfer) {
            pts[i].x = Math.max(pts[i].x, pts[i - 1].x);
          }
        }
        for (let i = pts.length - 2; i >= 0; i--) {
          if (!pts[i].isTransfer) {
            pts[i].x = Math.min(pts[i].x, pts[i + 1].x);
          }
        }
      });
    }
    routes.forEach((route) => {
      const pts = routePoints[route.id] || [];
      if (pts.length < 3) return;
      const anchors = pts.map((p, i) => p.isTransfer || i === 0 || i === pts.length - 1 ? i : -1).filter((i) => i >= 0);
      for (let a = 0; a < anchors.length - 1; a++) {
        const lo = anchors[a];
        const hi = anchors[a + 1];
        const gap = hi - lo;
        if (gap < 2) continue;
        const xLo = pts[lo].x;
        const xHi = pts[hi].x;
        for (let k = 1; k < gap; k++) {
          pts[lo + k].x = xLo + (xHi - xLo) * (k / gap);
        }
      }
    });
    return routePoints;
  }
  function toSVG(x, y) {
    return {
      px: PAD + x * (W - 2 * PAD),
      py: PAD + y / 100 * (H - 2 * PAD)
    };
  }
  function buildPath(svgPts) {
    if (svgPts.length < 2) return "";
    let d = `M ${svgPts[0].px},${svgPts[0].py}`;
    for (let i = 0; i < svgPts.length - 1; i++) {
      const a = svgPts[i];
      const b = svgPts[i + 1];
      const cx = (a.px + b.px) / 2;
      d += ` C ${cx},${a.py} ${cx},${b.py} ${b.px},${b.py}`;
    }
    return d;
  }
  function useSystemMapData(selectedRouteIds) {
    const [mapData, setMapData] = React19.useState(null);
    const filterKey = selectedRouteIds ? selectedRouteIds.slice().sort().join(",") : null;
    React19.useEffect(() => {
      function update() {
        try {
          const allRoutes = api19.gameState.getRoutes();
          const stations = api19.gameState.getStations();
          if (!allRoutes.length) {
            setMapData(null);
            return;
          }
          const routes = selectedRouteIds && selectedRouteIds.length > 0 ? allRoutes.filter((r) => selectedRouteIds.includes(r.id)) : allRoutes;
          if (!routes.length) {
            setMapData((prev) => prev ? { ...prev, renderedRoutes: [], transferDots: [] } : null);
            return;
          }
          const stationsByRoute = {};
          routes.forEach((route) => {
            const ordered = getRouteStationsInOrder(route.id, api19);
            stationsByRoute[route.id] = ordered.map((s) => s.id);
          });
          const stationNames = {};
          stations.forEach((s) => {
            stationNames[s.id] = s.name || "Station";
          });
          const transferMap = buildTransferMap(routes, stationsByRoute, api19);
          const baseYMap = assignBaseY(routes);
          const routePoints = computeLayout(routes, transferMap, stationsByRoute, baseYMap);
          const allStationsByRoute = {};
          allRoutes.forEach((route) => {
            if (stationsByRoute[route.id]) {
              allStationsByRoute[route.id] = stationsByRoute[route.id];
            } else {
              const ordered = getRouteStationsInOrder(route.id, api19);
              allStationsByRoute[route.id] = ordered.map((s) => s.id);
            }
          });
          const allTransferMap = buildTransferMap(allRoutes, allStationsByRoute, api19);
          const renderedRoutes = routes.map((route) => {
            const pts = routePoints[route.id] || [];
            const svgPts = pts.map(({ x, y }) => toSVG(x, y));
            return {
              id: route.id,
              bullet: route.bullet || route.name || route.id,
              name: route.name || route.bullet || route.id,
              color: route.color || "#888888",
              svgPts,
              pts,
              path: buildPath(svgPts)
            };
          });
          const transferDots = Object.entries(transferMap).map(([groupId, data]) => {
            const { canonicalStationId, name } = data;
            const fullRouteIds = allTransferMap[groupId]?.routeIds ?? data.routeIds;
            let px = null, py = null;
            for (const route of routes) {
              const pt = (routePoints[route.id] || []).find(
                (p) => p.canonicalId === canonicalStationId
              );
              if (pt) {
                const svg = toSVG(pt.x, pt.y);
                px = svg.px;
                py = svg.py;
                break;
              }
            }
            if (px === null) return null;
            return { groupId, canonicalStationId, name, px, py, routeIds: fullRouteIds };
          }).filter(Boolean);
          setMapData({ renderedRoutes, transferDots, transferMap, stationNames, routes, allRoutes });
        } catch (err) {
          console.error("[DashboardMap] Error computing layout:", err);
          setMapData(null);
        }
      }
      update();
      const interval = setInterval(update, 5e3);
      return () => clearInterval(interval);
    }, [filterKey]);
    return mapData;
  }
  function MapTooltip({ data, mapData }) {
    if (!data || !mapData) return null;
    const { groupId, x, y } = data;
    const { transferMap, allRoutes } = mapData;
    const entry = transferMap[groupId];
    if (!entry) return null;
    return /* @__PURE__ */ React19.createElement(
      "div",
      {
        className: "bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg",
        style: {
          position: "fixed",
          left: x,
          top: y,
          transform: "translateY(-125%)"
        }
      },
      /* @__PURE__ */ React19.createElement("div", { className: "font-semibold text-xs mb-1" }, entry.name),
      /* @__PURE__ */ React19.createElement("div", { className: "flex flex-col gap-1 mt-1 pt-1 border-t border-border" }, entry.routeIds.map((rid) => {
        const route = (allRoutes ?? []).find((r) => r.id === rid);
        return /* @__PURE__ */ React19.createElement("div", { key: rid, className: "flex items-center gap-1.5" }, /* @__PURE__ */ React19.createElement(RouteBadge, { routeId: rid, size: "1.2rem" }), /* @__PURE__ */ React19.createElement("span", { className: "text-[10px] text-muted-foreground" }, route?.name || route?.bullet || rid));
      }))
    );
  }
  function DashboardMap() {
    const [selectedRoutes, setSelectedRoutes] = React19.useState([]);
    const filterArg = selectedRoutes.length > 0 ? selectedRoutes : null;
    const mapData = useSystemMapData(filterArg);
    const allRoutes = mapData?.allRoutes ?? [];
    const allRouteIds = React19.useMemo(
      () => allRoutes.map((r) => r.id),
      [allRoutes.map((r) => r.id).join(",")]
    );
    React19.useEffect(() => {
      if (allRouteIds.length === 0) return;
      setSelectedRoutes(
        (prev) => prev.length === 0 ? allRouteIds : prev.filter((id) => allRouteIds.includes(id))
      );
    }, [allRouteIds.join(",")]);
    const [hoveredRoute, setHoveredRoute] = React19.useState(null);
    const [hoveredTransfer, setHoveredTransfer] = React19.useState(null);
    const [tooltip, setTooltip] = React19.useState(null);
    if (!mapData) {
      return /* @__PURE__ */ React19.createElement("div", { className: "flex flex-col items-center justify-center py-16 text-center" }, /* @__PURE__ */ React19.createElement("div", { className: "text-muted-foreground mb-2 text-sm" }, "Generating system map\u2026"), /* @__PURE__ */ React19.createElement("div", { className: "text-xs text-muted-foreground" }, "Build routes and stations to see the network map"));
    }
    if (selectedRoutes.length === 0) {
      return /* @__PURE__ */ React19.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ React19.createElement("div", { className: "flex gap-3" }, /* @__PURE__ */ React19.createElement(
        Dropdown,
        {
          togglerText: `0/${allRouteIds.length}`,
          togglerIcon: icons9.Route,
          togglerClasses: "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input",
          menuClasses: "min-w-[180px]",
          multiselect: true,
          value: selectedRoutes,
          onChange: setSelectedRoutes
        },
        allRoutes.map((route) => /* @__PURE__ */ React19.createElement(DropdownItem, { key: route.id, route, value: route.id }))
      )), /* @__PURE__ */ React19.createElement("div", { className: "flex flex-col items-center justify-center py-16 text-center rounded-lg border border-border bg-background/50" }, /* @__PURE__ */ React19.createElement("div", { className: "text-muted-foreground mb-1 text-sm" }, "No routes selected"), /* @__PURE__ */ React19.createElement("div", { className: "text-xs text-muted-foreground" }, "Select at least one route to see the map")));
    }
    if (!mapData.renderedRoutes.length) {
      return /* @__PURE__ */ React19.createElement("div", { className: "flex flex-col items-center justify-center py-16 text-center" }, /* @__PURE__ */ React19.createElement("div", { className: "text-muted-foreground text-sm" }, "No route data available"));
    }
    const { renderedRoutes, transferDots, routes } = mapData;
    const activeRouteIds = hoveredTransfer ? new Set(transferDots.find((d) => d.groupId === hoveredTransfer)?.routeIds ?? []) : hoveredRoute ? /* @__PURE__ */ new Set([hoveredRoute]) : null;
    const routeOpacity = (rid) => !activeRouteIds ? 1 : activeRouteIds.has(rid) ? 1 : 0.08;
    const routeStroke = (rid) => !activeRouteIds ? 2.5 : activeRouteIds.has(rid) ? 4 : 1.5;
    const routeFilter = (rid) => {
      if (!activeRouteIds || !activeRouteIds.has(rid)) return "none";
      const c = routes.find((r) => r.id === rid)?.color ?? "#888";
      return `drop-shadow(0 0 5px ${c}80)`;
    };
    const transferDotOpacity = ({ groupId, routeIds }) => {
      if (hoveredTransfer) return groupId === hoveredTransfer ? 1 : 0.08;
      if (!activeRouteIds) return 1;
      return routeIds.some((rid) => activeRouteIds.has(rid)) ? 1 : 0.08;
    };
    const removeRoute = (e, rid) => {
      e.stopPropagation();
      setSelectedRoutes((prev) => prev.filter((id) => id !== rid));
    };
    return /* @__PURE__ */ React19.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ React19.createElement("div", { className: "flex gap-3" }, /* @__PURE__ */ React19.createElement(
      Dropdown,
      {
        togglerText: `${selectedRoutes.length}/${allRouteIds.length}`,
        togglerIcon: icons9.Route,
        togglerClasses: "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input",
        menuClasses: "min-w-[180px]",
        multiselect: true,
        value: selectedRoutes,
        onChange: setSelectedRoutes
      },
      allRoutes.map((route) => /* @__PURE__ */ React19.createElement(
        DropdownItem,
        {
          key: route.id,
          route,
          value: route.id
        }
      ))
    ), /* @__PURE__ */ React19.createElement("div", { className: "flex gap-1 flex-wrap" }, selectedRoutes.map((rid) => {
      const isHovered = hoveredRoute === rid;
      return /* @__PURE__ */ React19.createElement(
        "div",
        {
          key: rid,
          className: "inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/30 cursor-pointer",
          style: {
            opacity: activeRouteIds && !activeRouteIds.has(rid) ? 0.35 : 1,
            transition: "opacity 0.15s"
          },
          onMouseEnter: () => {
            setHoveredRoute(rid);
            setHoveredTransfer(null);
          },
          onMouseLeave: () => setHoveredRoute(null)
        },
        /* @__PURE__ */ React19.createElement(RouteBadge, { routeId: rid, size: selectedRoutes.length > 10 ? "1rem" : "1.2rem" }),
        /* @__PURE__ */ React19.createElement(
          "button",
          {
            onClick: (e) => removeRoute(e, rid),
            style: {
              opacity: isHovered ? 1 : 0.7
            },
            title: "Remove"
          },
          /* @__PURE__ */ React19.createElement(icons9.X, { size: 12 })
        )
      );
    }))), /* @__PURE__ */ React19.createElement("div", { className: "rounded-lg border border-border bg-background/50 overflow-hidden" }, /* @__PURE__ */ React19.createElement(
      "svg",
      {
        viewBox: `0 0 ${W} ${H}`,
        style: { width: "100%", overflow: "visible", display: "block" }
      },
      Array.from({ length: 11 }).map((_, i) => {
        const x = PAD + i / 10 * (W - 2 * PAD);
        return /* @__PURE__ */ React19.createElement(
          "line",
          {
            key: i,
            x1: x,
            y1: PAD / 2,
            x2: x,
            y2: H - PAD / 2,
            stroke: "currentColor",
            strokeOpacity: 0.04,
            strokeWidth: 1
          }
        );
      }),
      renderedRoutes.map((route) => /* @__PURE__ */ React19.createElement(
        "path",
        {
          key: route.id,
          d: route.path,
          fill: "none",
          stroke: route.color,
          strokeWidth: routeStroke(route.id),
          strokeOpacity: routeOpacity(route.id),
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: {
            filter: routeFilter(route.id),
            transition: "stroke-width 0.15s, stroke-opacity 0.15s",
            cursor: "pointer"
          },
          onMouseEnter: () => {
            setHoveredRoute(route.id);
            setHoveredTransfer(null);
          },
          onMouseLeave: () => setHoveredRoute(null)
        }
      )),
      transferDots.map(({ groupId, name, px, py, routeIds }) => /* @__PURE__ */ React19.createElement(
        "g",
        {
          key: groupId,
          style: {
            cursor: "pointer",
            opacity: transferDotOpacity({ groupId, routeIds }),
            transition: "opacity 0.15s"
          },
          onMouseEnter: (e) => {
            setHoveredTransfer(groupId);
            setHoveredRoute(null);
            setTooltip({ groupId, x: e.clientX, y: e.clientY });
          },
          onMouseMove: (e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : t),
          onMouseLeave: () => {
            setHoveredTransfer(null);
            setTooltip(null);
          }
        },
        /* @__PURE__ */ React19.createElement("circle", { cx: px, cy: py, r: 16, fill: "transparent" }),
        /* @__PURE__ */ React19.createElement(
          "circle",
          {
            cx: px,
            cy: py,
            r: 8,
            fill: "hsla(var(--background))",
            stroke: "var(--aa-transfer-color)",
            strokeWidth: hoveredTransfer === groupId ? 2.5 : 1.5
          }
        ),
        routeIds.map((rid, i) => {
          const route = routes.find((r) => r.id === rid);
          const total = routeIds.length;
          const angle = i / total * Math.PI * 2 - Math.PI / 2;
          const radius = total > 2 ? 4 : 2.5;
          const pipR = total > 2 ? 1.8 : 2.2;
          return /* @__PURE__ */ React19.createElement(
            "circle",
            {
              key: rid,
              cx: px + Math.cos(angle) * radius,
              cy: py + Math.sin(angle) * radius,
              r: pipR,
              fill: route?.color || "#888"
            }
          );
        }),
        /* @__PURE__ */ React19.createElement(
          "text",
          {
            x: px,
            y: py - 13,
            textAnchor: "middle",
            fontSize: 8,
            fill: "hsl(var(--muted-foreground))",
            style: { letterSpacing: "0.06em" }
          },
          name.length > 12 ? name.slice(0, 11) + "\u2026" : name.toUpperCase()
        )
      ))
    )), /* @__PURE__ */ React19.createElement("div", { className: "flex flex-wrap gap-1.5" }, transferDots.map(({ groupId, name, routeIds }) => {
      const isHovered = hoveredTransfer === groupId;
      return /* @__PURE__ */ React19.createElement(
        "div",
        {
          key: groupId,
          className: "inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-muted/30 text-[10px] cursor-pointer",
          style: {
            borderColor: isHovered ? "var(--aa-transfer-color)" : "hsl(var(--border))",
            opacity: hoveredTransfer ? isHovered ? 1 : 0.2 : activeRouteIds && !routeIds.some((rid) => activeRouteIds.has(rid)) ? 0.2 : 1,
            transition: "opacity 0.15s, border-color 0.15s"
          },
          onMouseEnter: () => {
            setHoveredTransfer(groupId);
            setHoveredRoute(null);
          },
          onMouseLeave: () => setHoveredTransfer(null)
        },
        /* @__PURE__ */ React19.createElement("span", { className: "whitespace-nowrap" }, name),
        /* @__PURE__ */ React19.createElement("span", { style: { color: "hsl(var(--border))" } }, "\xB7"),
        (() => {
          const allRoutes2 = api19.gameState.getRoutes();
          return /* @__PURE__ */ React19.createElement(
            Dropdown,
            {
              togglerContent: /* @__PURE__ */ React19.createElement("span", { className: "text-xs font-semibold tabular-nums" }, routeIds.length),
              togglerClasses: "flex items-center gap-1 rounded hover:bg-accent px-1 -ml-1 transition-colors",
              onChange: (rid) => window.AdvancedAnalytics?.openRouteDialog?.(rid)
            },
            routeIds.map((rid) => {
              const route = allRoutes2.find((r) => r.id === rid);
              return route ? /* @__PURE__ */ React19.createElement(DropdownItem, { key: rid, value: rid, route }) : null;
            })
          );
        })()
      );
    })), /* @__PURE__ */ React19.createElement(MapTooltip, { data: tooltip, mapData }));
  }

  // src/ui/dashboard.jsx
  var api20 = window.SubwayBuilderAPI;
  var { React: React20, icons: icons10 } = api20.utils;
  function Dashboard() {
    const [isOpen, setIsOpen] = React20.useState(false);
    const [historicalData, setHistoricalData] = React20.useState({ days: {} });
    const storage2 = getStorage();
    const emptyHistoricalData = React20.useMemo(() => ({ days: {} }), []);
    const { tableData: liveRouteData } = useRouteMetrics({
      sortState: INITIAL_STATE.sort,
      timeframeState: "last24h",
      compareMode: false,
      historicalData: emptyHistoricalData
    });
    React20.useEffect(() => {
      if (!isOpen || !storage2) return;
      const loadData = async () => {
        const data = await storage2.get("historicalData", { days: {} });
        setHistoricalData(data);
      };
      loadData();
      const interval = setInterval(loadData, 2e3);
      return () => clearInterval(interval);
    }, [isOpen, storage2]);
    React20.useEffect(() => {
      window.AdvancedAnalytics = window.AdvancedAnalytics || {};
      window.AdvancedAnalytics.openDialog = () => setIsOpen(true);
      window.AdvancedAnalytics.closeDialog = () => setIsOpen(false);
      window.AdvancedAnalytics.toggleDialog = () => setIsOpen((prev) => !prev);
      return () => {
        delete window.AdvancedAnalytics.openDialog;
        delete window.AdvancedAnalytics.closeDialog;
        delete window.AdvancedAnalytics.toggleDialog;
      };
    }, []);
    return /* @__PURE__ */ React20.createElement(
      Dialog,
      {
        id: "aa-dialog-analytics",
        title: "Advanced Analytics - Dashboard",
        isOpen,
        size: 1280,
        onClose: () => setIsOpen(false)
      },
      /* @__PURE__ */ React20.createElement("section", { class: "flex gap-2 justify-end border-b pb-4" }, /* @__PURE__ */ React20.createElement(GuideTrigger, null), /* @__PURE__ */ React20.createElement("div", { className: "flex items-center gap-2 whitespace-nowrap" }, !api20.gameState.isPaused() && /* @__PURE__ */ React20.createElement(React20.Fragment, null, /* @__PURE__ */ React20.createElement("span", { className: "text-xs" }, "Tracking Data"), /* @__PURE__ */ React20.createElement("span", { className: "inline-flex ml-1 relative" }, /* @__PURE__ */ React20.createElement("div", { className: "absolute w-2 h-2 rounded-full bg-green-500 dark:bg-green-600 opacity-75 animate-ping" }), /* @__PURE__ */ React20.createElement("span", { className: "relative inline-flex w-2 h-2 rounded-full dark:bg-green-500 bg-green-600" }))), api20.gameState.isPaused() && /* @__PURE__ */ React20.createElement(React20.Fragment, null, /* @__PURE__ */ React20.createElement("span", { className: "text-xs text-muted-foreground" }, "Game Paused"), /* @__PURE__ */ React20.createElement(icons10.Pause, { className: "dark:text-amber-400 text-amber-600", size: 14 })), /* @__PURE__ */ React20.createElement("span", { className: "border-foreground/20 border-r ml-2 mr-2 py-3" }), /* @__PURE__ */ React20.createElement(StorageTrigger, null))),
      /* @__PURE__ */ React20.createElement(
        DashboardTable,
        {
          groups: ["trains", "finance", "performance"],
          liveRouteData
        }
      ),
      /* @__PURE__ */ React20.createElement("section", { className: "mt-8 mb-6" }, /* @__PURE__ */ React20.createElement("div", { className: "py-5" }, /* @__PURE__ */ React20.createElement("h3", { className: "text-2xl font-semibold leading-none tracking-tight" }, "Historical Trends")), /* @__PURE__ */ React20.createElement(
        DashboardTrends,
        {
          historicalData,
          liveRouteData
        }
      )),
      /* @__PURE__ */ React20.createElement("section", { className: "mt-8 mb-6" }, /* @__PURE__ */ React20.createElement("div", { className: "py-5" }, /* @__PURE__ */ React20.createElement("h3", { className: "text-2xl font-semibold leading-none tracking-tight" }, "System Map"), /* @__PURE__ */ React20.createElement("p", { className: "text-sm text-muted-foreground mt-1" }, "Network schematic map")), /* @__PURE__ */ React20.createElement(DashboardMap, null))
    );
  }

  // src/ui/route/station-flow.jsx
  var api21 = window.SubwayBuilderAPI;
  var { React: React21, icons: icons11, charts: charts2 } = api21.utils;
  function formatOffset(seconds) {
    const totalSeconds = Math.round(seconds);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }
  function StationFlow({ routeId, onStationClick }) {
    const [flowData, setFlowData] = React21.useState([]);
    const routes = api21.gameState.getRoutes();
    React21.useEffect(() => {
      if (!routeId) {
        setFlowData([]);
        return;
      }
      const updateData = () => {
        try {
          const ridershipData = api21.gameState.getRouteRidership(routeId);
          if (!ridershipData?.byStation) {
            setFlowData([]);
            return;
          }
          const orderedStations = getRouteStationsInOrder(routeId, api21);
          if (orderedStations.length === 0) {
            setFlowData([]);
            return;
          }
          const ridershipMap = /* @__PURE__ */ new Map();
          ridershipData.byStation.forEach((d) => {
            ridershipMap.set(d.stationId, { popCount: d.popCount, percent: d.percent });
          });
          const midTimes = orderedStations.map((station) => {
            const arr = station.arrivalTime;
            const dep = station.departureTime;
            if (arr != null && dep != null) return (arr + dep) / 2;
            return arr ?? dep ?? 0;
          });
          const t0 = midTimes[0];
          const processed = orderedStations.map((station, index) => {
            const data = ridershipMap.get(station.id);
            const ridership = data?.popCount ?? 0;
            const percent = data?.percent != null ? parseFloat(data.percent.toFixed(2)) : null;
            const transferRoutes = getStationTransferRoutes(station.id, routeId, api21);
            return {
              index,
              name: station.name,
              stationId: station.id,
              ridership,
              percent,
              transferRoutes,
              hasTransfers: transferRoutes.length > 0,
              timeOffset: midTimes[index] - t0
            };
          });
          setFlowData(processed);
        } catch (error) {
          console.error(`${CONFIG.LOG_PREFIX} Error fetching station flow:`, error);
          setFlowData([]);
        }
      };
      updateData();
      const interval = setInterval(updateData, CONFIG.REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }, [routeId, routes]);
    const routeColor = React21.useMemo(() => {
      if (!routeId) return "#22c55e";
      const route = routes.find((r) => r.id === routeId);
      return route?.color || "#22c55e";
    }, [routeId, routes]);
    const routeTextColor = React21.useMemo(() => {
      if (!routeId) return "#ffffff";
      const route = routes.find((r) => r.id === routeId);
      return route?.textColor || "#ffffff";
    }, [routeId, routes]);
    return /* @__PURE__ */ React21.createElement("div", { className: "aa-chart space-y-4" }, /* @__PURE__ */ React21.createElement("div", { className: "flex items-center gap-4 text-xs text-muted-foreground" }, /* @__PURE__ */ React21.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React21.createElement("div", { className: "w-3 h-3 rounded-sm", style: { background: routeColor } }), /* @__PURE__ */ React21.createElement("span", null, "Ridership")), /* @__PURE__ */ React21.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React21.createElement("div", { className: "w-6 h-0.5", style: { background: "var(--aa-chart-secondary-metric)" } }), /* @__PURE__ */ React21.createElement("span", null, "% choosing metro")), /* @__PURE__ */ React21.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React21.createElement(TransferDotPreview, null), /* @__PURE__ */ React21.createElement("span", null, "Transfer"))), /* @__PURE__ */ React21.createElement("div", { className: "rounded-lg border border-border bg-background/50 p-4" }, flowData.length === 0 ? /* @__PURE__ */ React21.createElement("div", { className: "flex flex-col items-center justify-center py-16 text-center" }, /* @__PURE__ */ React21.createElement(icons11.TrendingUp, { size: 48, className: "text-muted-foreground mb-4" }), /* @__PURE__ */ React21.createElement("div", { className: "text-sm text-muted-foreground" }, /* @__PURE__ */ React21.createElement("p", null, "No ridership data available for this route"))) : /* @__PURE__ */ React21.createElement(
      FlowChart,
      {
        data: flowData,
        routeColor,
        routeTextColor,
        onStationClick
      }
    )));
  }
  function TransferDotPreview() {
    const h = React21.createElement;
    const size = 12;
    const r = size / 2;
    return h(
      "svg",
      { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
      h("circle", {
        cx: r,
        cy: r,
        r: r - 1,
        fill: "hsla(var(--background))",
        stroke: "var(--aa-transfer-color)",
        strokeWidth: 1.5
      })
    );
  }
  function makeTopAxisTick(flowData, tickSpacing) {
    return function TopAxisTick(props) {
      const { x, y, payload } = props;
      const h = React21.createElement;
      const dataPoint = flowData.find((d) => d.name === payload.value);
      if (!dataPoint) return null;
      const offsetLabel = dataPoint.index === 0 ? "0s" : `${formatOffset(dataPoint.timeOffset)}`;
      return h("g", { transform: `translate(${x},${y})` }, [
        // Time offset text — rotated like station names
        h("text", {
          key: "label",
          x: 0,
          y: 0,
          dy: -4,
          textAnchor: "start",
          fill: "hsl(var(--muted-foreground))",
          fontSize: 12,
          fontFamily: "Monospace",
          transform: "rotate(-45)"
        }, offsetLabel)
      ].filter(Boolean));
    };
  }
  function makeBottomAxisTick(flowData) {
    return function BottomAxisTick(props) {
      const { x, y, payload } = props;
      const h = React21.createElement;
      const MAX_LEN = 14;
      const label = payload.value && payload.value.length > MAX_LEN ? payload.value.slice(0, MAX_LEN - 1) + "\u2026" : payload.value || "";
      const dataPoint = flowData.find((d) => d.name === payload.value);
      const hasTransfers = dataPoint?.hasTransfers ?? false;
      const CR = 6;
      const DY = 10;
      const GAP2 = 3;
      return h("g", { transform: `translate(${x - 6},${y})` }, [
        h("g", { key: "rotated", transform: "rotate(-45)" }, [
          // Station name — shifted left to leave room for the circle when needed
          h("text", {
            key: "label",
            x: hasTransfers ? -(CR + GAP2) : 0,
            y: DY,
            textAnchor: "end",
            fill: "hsl(var(--muted-foreground))",
            fontSize: 12
          }, label),
          // Transfer circle — sits right at the text anchor point (cx=0),
          // appearing as the last "letter" of the label in reading order
          hasTransfers && h("circle", {
            key: "transfer-circle",
            cx: 0,
            cy: DY,
            r: CR,
            fill: "hsl(var(--background))",
            stroke: "var(--aa-transfer-color)",
            strokeWidth: 1.5
          })
        ].filter(Boolean))
      ].filter(Boolean));
    };
  }
  function makeChartTooltip(data, routeColor) {
    return function ChartTooltip({ active, payload, label }) {
      if (!active || !payload?.length) return null;
      const h = React21.createElement;
      const ridershipEntry = payload.find((p) => p.dataKey === "ridership");
      const percentEntry = payload.find((p) => p.dataKey === "percent");
      const dataPoint = data.find((d) => d.name === label);
      const transferRoutes = dataPoint?.transferRoutes ?? [];
      return h("div", {
        className: "bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[160px]"
      }, [
        // Header: station name + time offset
        h("div", {
          key: "header",
          className: "flex items-center justify-between gap-6 mb-3"
        }, [
          h("div", { key: "title", className: "font-medium" }, dataPoint?.name || label),
          dataPoint?.timeOffset != null && h("div", {
            key: "offset",
            className: "text-xs font-mono"
          }, dataPoint.index === 0 ? "0s" : `+${formatOffset(dataPoint.timeOffset)}`)
        ]),
        // Ridership row
        ridershipEntry && h("div", {
          key: "ridership",
          className: "flex items-center justify-between gap-6 text-xs mb-2"
        }, [
          h("div", { key: "left", className: "flex items-center gap-1.5" }, [
            h("div", { key: "dot", className: "w-3 h-3 mr-1 rounded-sm", style: { background: routeColor } }),
            h("span", { key: "lbl", className: "text-muted-foreground" }, "Ridership")
          ]),
          h(
            "span",
            { key: "val", className: "font-mono font-medium" },
            (ridershipEntry.value ?? 0).toLocaleString()
          )
        ]),
        // % choosing metro row
        percentEntry?.value != null && h("div", {
          key: "percent",
          className: "flex items-center justify-between gap-6 text-xs"
        }, [
          h("div", { key: "left", className: "flex items-center gap-1.5" }, [
            h("div", { key: "dot", className: "w-3 h-0.5", style: { background: "var(--aa-chart-secondary-metric)" } }),
            h("span", { key: "lbl", className: "text-muted-foreground" }, "% choosing metro")
          ]),
          h(
            "span",
            { key: "val", className: "font-mono font-medium" },
            `${percentEntry.value.toFixed(2)}%`
          )
        ]),
        // Transfers section
        transferRoutes.length > 0 && h("div", {
          key: "transfers",
          className: "mt-3 pt-2 border-t border-border"
        }, [
          h("div", {
            key: "transfers-title",
            className: "text-xs text-muted-foreground mb-1.5"
          }, "Transfers"),
          h(
            "div",
            {
              key: "transfers-badges",
              className: "flex flex-wrap gap-1"
            },
            transferRoutes.map(
              (tr) => h(RouteBadge, { key: tr.routeId, routeId: tr.routeId, size: "1.2rem" })
            )
          )
        ])
      ].filter(Boolean));
    };
  }
  function formatYAxisLeft(value) {
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
    return value.toLocaleString();
  }
  function formatYAxisRight(value) {
    return `${value}%`;
  }
  function FlowChart({ data, routeColor, routeTextColor, onStationClick }) {
    const h = React21.createElement;
    const containerRef = React21.useRef(null);
    const [tickSpacing, setTickSpacing] = React21.useState(null);
    React21.useLayoutEffect(() => {
      if (!containerRef.current || data.length < 2) return;
      const measure = () => {
        const svg = containerRef.current.querySelector("svg.recharts-surface");
        if (!svg) return;
        const topAxisGroups = svg.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick");
        if (topAxisGroups.length < 2) return;
        const xs = Array.from(topAxisGroups).map((g) => {
          const t = g.getAttribute("transform") || "";
          const m = t.match(/translate\(([^,)]+)/);
          return m ? parseFloat(m[1]) : null;
        }).filter((v) => v !== null).sort((a, b) => a - b);
        if (xs.length < 2) return;
        const spacing = xs[1] - xs[0];
        setTickSpacing(spacing);
      };
      const id = setTimeout(measure, 50);
      const ro = new ResizeObserver(measure);
      ro.observe(containerRef.current);
      return () => {
        clearTimeout(id);
        ro.disconnect();
      };
    }, [data]);
    const TopTick = React21.useMemo(
      () => makeTopAxisTick(data, tickSpacing),
      [data, tickSpacing]
    );
    const BottomTick = React21.useMemo(
      () => makeBottomAxisTick(data),
      [data]
    );
    const ChartTooltip = React21.useMemo(
      () => makeChartTooltip(data, routeColor),
      [data, routeColor]
    );
    const bottomAxisHeight = 90;
    return h(
      "div",
      {
        ref: containerRef,
        className: "w-full",
        style: { height: "420px", position: "relative" }
      },
      // Dashed time-axis reference line — y=43 confirmed in browser.
      // x1/x2 clamped to first/last tick centres so it doesn't overflow.
      // No zIndex so it stays behind the chart content.
      h(
        "svg",
        {
          key: "time-axis-line",
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible"
          }
        }
      ),
      h(
        charts2.ResponsiveContainer,
        { width: "100%", height: "100%" },
        h(charts2.ComposedChart, {
          data,
          margin: { top: 42, right: 0, left: 0, bottom: 10 }
        }, [
          h(charts2.CartesianGrid, {
            key: "grid",
            strokeDasharray: "3 3",
            stroke: "#374151",
            opacity: 0.3
          }),
          // ── Top X axis — time offsets ────────────────────────────────
          h(charts2.XAxis, {
            key: "xaxis-top",
            xAxisId: "top",
            dataKey: "name",
            orientation: "top",
            interval: 0,
            height: 42,
            tick: TopTick,
            tickLine: false,
            axisLine: false
          }),
          // ── Bottom X axis — station names + transfer circles ─────────
          h(charts2.XAxis, {
            key: "xaxis-bottom",
            xAxisId: "bottom",
            dataKey: "name",
            orientation: "bottom",
            stroke: "#9ca3af",
            interval: 0,
            height: bottomAxisHeight,
            tick: BottomTick,
            tickLine: false,
            axisLine: false
          }),
          h(charts2.YAxis, {
            key: "yaxis-left",
            yAxisId: "left",
            stroke: "#9ca3af",
            fontSize: 12,
            tickFormatter: formatYAxisLeft,
            tickLine: false,
            axisLine: false
          }),
          h(charts2.YAxis, {
            key: "yaxis-right",
            yAxisId: "right",
            orientation: "right",
            stroke: "#9ca3af",
            fontSize: 12,
            tickFormatter: formatYAxisRight,
            domain: [0, 100],
            tickLine: false,
            axisLine: false
          }),
          h(charts2.Tooltip, { key: "tooltip", content: ChartTooltip }),
          h(charts2.Bar, {
            key: "ridership",
            xAxisId: "bottom",
            yAxisId: "left",
            dataKey: "ridership",
            stroke: routeColor,
            strokeWidth: 2,
            fill: routeColor,
            fillOpacity: 0.3,
            radius: [2, 2, 0, 0],
            activeBar: { fillOpacity: 1 },
            cursor: onStationClick ? "pointer" : void 0,
            onClick: onStationClick ? (barData) => onStationClick(barData?.stationId) : void 0
          }),
          h(charts2.Line, {
            key: "percent",
            xAxisId: "bottom",
            yAxisId: "right",
            type: "monotoneX",
            dataKey: "percent",
            stroke: "var(--aa-chart-secondary-metric)",
            strokeWidth: 2,
            dot: false,
            activeDot: { r: 3, fill: routeTextColor },
            connectNulls: false,
            strokeOpacity: 0.5,
            animationDuration: 500
          })
        ])
      )
    );
  }

  // src/ui/route/commute-flow.jsx
  var api22 = window.SubwayBuilderAPI;
  var { React: React22, icons: icons12, charts: charts3 } = api22.utils;
  var COLOR_HOME_WORK = "#3b82f6";
  var COLOR_WORK_HOME = "#ef4444";
  function useCommuteData(routeId, stationId) {
    const [data, setData] = React22.useState(null);
    React22.useEffect(() => {
      if (!routeId || !stationId) {
        setData(null);
        return;
      }
      const compute = () => {
        try {
          const commutes = api22.gameState.getCompletedCommutes?.() ?? [];
          const orderedIds = getRouteStationsInOrder(routeId, api22).map((s) => s.id);
          const selectedIdx = orderedIds.indexOf(stationId);
          let boardingHW = 0;
          let boardingWH = 0;
          let alightingHW = 0;
          let alightingWH = 0;
          let passthroughTotal = 0;
          for (const c of commutes) {
            const seg = c.stationRoutes?.find((s) => s.routeId === routeId);
            if (!seg || !seg.stationIds?.length) continue;
            const size = c.size || 1;
            const isHW = c.origin === "home";
            const entry = seg.stationIds[0];
            const exit = seg.stationIds[seg.stationIds.length - 1];
            if (entry === stationId) {
              if (isHW) boardingHW += size;
              else boardingWH += size;
            } else if (exit === stationId) {
              if (isHW) alightingHW += size;
              else alightingWH += size;
            } else if (selectedIdx !== -1) {
              const entryIdx = orderedIds.indexOf(entry);
              const exitIdx = orderedIds.indexOf(exit);
              if (entryIdx !== -1 && exitIdx !== -1) {
                const lo = Math.min(entryIdx, exitIdx);
                const hi = Math.max(entryIdx, exitIdx);
                if (selectedIdx > lo && selectedIdx < hi) {
                  passthroughTotal += size;
                }
              }
            }
          }
          setData({ boardingHW, boardingWH, alightingHW, alightingWH, passthroughTotal });
        } catch (err) {
          console.error(`${CONFIG.LOG_PREFIX} CommuteFlow error:`, err);
          setData({ boardingHW: 0, boardingWH: 0, alightingHW: 0, alightingWH: 0, passthroughTotal: 0 });
        }
      };
      compute();
      const id = setInterval(compute, CONFIG.REFRESH_INTERVAL);
      return () => clearInterval(id);
    }, [routeId, stationId]);
    return data;
  }
  function StationStrip({ stations, selectedId, routeColor, onSelect }) {
    const scrollRef = React22.useRef(null);
    React22.useEffect(() => {
      const container = scrollRef.current;
      if (!container) return;
      const btn = container.querySelector(`[data-sid="${selectedId}"]`);
      if (!btn) return;
      const target = btn.offsetLeft - container.offsetWidth / 2 + btn.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }, [selectedId]);
    return /* @__PURE__ */ React22.createElement(
      "div",
      {
        ref: scrollRef,
        className: "overflow-x-auto",
        style: { scrollbarWidth: "thin", paddingBottom: 4 }
      },
      /* @__PURE__ */ React22.createElement("div", { className: "flex justify-between pb-4", style: { minWidth: "100%" } }, stations.map((st, idx) => {
        const selected = st.id === selectedId;
        return /* @__PURE__ */ React22.createElement(React22.Fragment, { key: st.id }, idx > 0 && /* @__PURE__ */ React22.createElement("div", { style: {
          minWidth: 36,
          height: 1,
          marginTop: 5,
          // vertically centred with the 14px dot
          background: routeColor,
          opacity: 0.55,
          flexShrink: 0,
          flexGrow: 1
        } }), /* @__PURE__ */ React22.createElement(
          "button",
          {
            "data-sid": st.id,
            onClick: () => onSelect(st.id),
            className: "flex relative flex-col items-center gap-1.5 focus:outline-none text-muted-foreground hover:text-foreground",
            style: { flexShrink: 0 },
            title: st.name
          },
          /* @__PURE__ */ React22.createElement("div", { style: {
            position: "absolute",
            left: 0,
            right: 0,
            height: 1,
            top: 5,
            // vertically centred with the 14px dot
            background: routeColor,
            opacity: 0.55
          } }),
          /* @__PURE__ */ React22.createElement("div", { style: {
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: `2px solid ${selected ? routeColor : "currentColor"}`,
            background: selected ? routeColor : "hsl(var(--background))",
            boxShadow: selected ? `0 0 0 3px ${routeColor}33` : "none",
            transition: "all 0.15s ease",
            cursor: "pointer",
            zIndex: 1
          } }),
          /* @__PURE__ */ React22.createElement("span", { style: {
            fontSize: 10,
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            color: selected ? "var(--aa-chart-secondary-metric)" : "hsl(var(--muted-foreground))"
          } }, st.name)
        ));
      }))
    );
  }
  function buildSankeyData({ boardingHW, boardingWH, alightingHW, alightingWH, passthroughTotal }, stationName, prevStationName, nextStationName) {
    const nodes = [{ name: stationName }];
    const meta = [{ side: "center", journey: null, label: null }];
    const links = [];
    const pt = passthroughTotal ?? 0;
    const totalBoard = boardingHW + boardingWH;
    const totalAlight = alightingHW + alightingWH;
    const viaMetroIn = pt + totalAlight;
    const viaMetroOut = pt + totalBoard;
    const labelIn = prevStationName ? `${prevStationName} \u2192` : "Prev. Stop \u2192";
    const labelOut = nextStationName ? `\u2192 ${nextStationName}` : "\u2192 Next Stop";
    let boardingIdx = null;
    if (totalBoard > 0) {
      boardingIdx = nodes.length;
      nodes.push({ name: "Boarding" });
      meta.push({ side: "center-left", journey: "boarding", label: "Boarding" });
      links.push({ source: boardingIdx, target: 0, value: totalBoard, journey: "boarding" });
    }
    let alightingIdx = null;
    if (totalAlight > 0) {
      alightingIdx = nodes.length;
      nodes.push({ name: "Alighting" });
      meta.push({ side: "center-right", journey: "alighting", label: "Alighting" });
      links.push({ source: 0, target: alightingIdx, value: totalAlight, journey: "alighting" });
    }
    if (boardingIdx !== null) {
      if (boardingHW > 0) {
        const i = nodes.length;
        nodes.push({ name: "Home \u2192 Work" });
        meta.push({ side: "left", journey: "hw", label: "Work \u2192" });
        links.push({ source: i, target: boardingIdx, value: boardingHW, journey: "hw" });
      }
      if (boardingWH > 0) {
        const i = nodes.length;
        nodes.push({ name: "Work \u2192 Home" });
        meta.push({ side: "left", journey: "wh", label: "Home \u2192" });
        links.push({ source: i, target: boardingIdx, value: boardingWH, journey: "wh" });
      }
    }
    if (viaMetroIn > 0) {
      const i = nodes.length;
      nodes.push({ name: labelIn });
      meta.push({ side: "left", journey: "metro", label: "" });
      links.push({ source: i, target: 0, value: viaMetroIn, journey: "metro" });
    }
    if (alightingIdx !== null) {
      if (alightingHW > 0) {
        const i = nodes.length;
        nodes.push({ name: "Home \u2192 Work" });
        meta.push({ side: "right", journey: "hw", label: "\u2192 Work" });
        links.push({ source: alightingIdx, target: i, value: alightingHW, journey: "hw" });
      }
      if (alightingWH > 0) {
        const i = nodes.length;
        nodes.push({ name: "Work \u2192 Home" });
        meta.push({ side: "right", journey: "wh", label: "\u2192 Home " });
        links.push({ source: alightingIdx, target: i, value: alightingWH, journey: "wh" });
      }
    }
    if (viaMetroOut > 0) {
      const i = nodes.length;
      nodes.push({ name: labelOut });
      meta.push({ side: "right", journey: "metro", label: "" });
      links.push({ source: 0, target: i, value: viaMetroOut, journey: "metro" });
    }
    return { nodes, links, meta, viaMetroIn, viaMetroOut };
  }
  var COLOR_AGGREGATOR = "#64748b";
  function makeNodeRenderer(meta, routeColor) {
    return function SankeyNode({ x, y, width, height, index }) {
      const m = meta[index] ?? { side: "center", journey: null };
      const w = Math.max(width, 2);
      const h = Math.max(height, 2);
      const mid = y + h / 2;
      const isCenter = m.side === "center";
      const isAggregator = m.side === "center-left" || m.side === "center-right";
      const color = isCenter ? "currentColor" : m.journey === "hw" ? COLOR_HOME_WORK : m.journey === "wh" ? COLOR_WORK_HOME : m.journey === "metro" ? routeColor : isAggregator ? COLOR_AGGREGATOR : "currentColor";
      const opacity = isCenter ? 0.95 : 0.8;
      let textX, textAnchor, textY, baseline;
      if (isCenter || isAggregator) {
        textX = x + w / 2;
        textAnchor = "middle";
        textY = y - 8;
        baseline = "auto";
      } else if (m.side === "left") {
        textX = x - 8;
        textAnchor = "end";
        textY = mid;
        baseline = "middle";
      } else {
        textX = x + w + 8;
        textAnchor = "start";
        textY = mid;
        baseline = "middle";
      }
      const name = isCenter ? null : m.label ?? "";
      return React22.createElement("g", {}, [
        React22.createElement("rect", {
          key: "r",
          x,
          y,
          width: w,
          height: h,
          fill: color,
          fillOpacity: opacity,
          rx: 0
        }),
        name && React22.createElement("text", {
          key: "label",
          x: textX,
          y: textY,
          textAnchor,
          dominantBaseline: baseline,
          fontSize: 11,
          fill: "var(--aa-chart-secondary-metric)"
        }, name)
      ].filter(Boolean));
    };
  }
  function makeLinkRenderer(links, routeColor) {
    return function SankeyLink({
      sourceX,
      targetX,
      sourceY,
      targetY,
      sourceControlX,
      targetControlX,
      linkWidth,
      index
    }) {
      const link = links[index];
      if (!link) return null;
      const color = link.journey === "hw" ? COLOR_HOME_WORK : link.journey === "wh" ? COLOR_WORK_HOME : link.journey === "metro" ? routeColor : COLOR_AGGREGATOR;
      const opacity = link.journey === "metro" ? 1 : link.journey === "boarding" || link.journey === "alighting" ? 0.5 : 0.35;
      const d = [
        `M ${sourceX},${sourceY}`,
        `C ${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`
      ].join(" ");
      return React22.createElement("path", {
        d,
        strokeWidth: Math.max(linkWidth, 1),
        stroke: color,
        fill: "none",
        strokeOpacity: opacity
      });
    };
  }
  function CommuteSankey({ data, stationName, routeColor, prevStationName, nextStationName }) {
    const total = data.boardingHW + data.boardingWH + data.alightingHW + data.alightingWH + data.passthroughTotal;
    if (total === 0) {
      return /* @__PURE__ */ React22.createElement("div", { className: "flex flex-col items-center justify-center py-16 text-center" }, React22.createElement(icons12.Users, { size: 40, className: "text-muted-foreground mb-3" }), /* @__PURE__ */ React22.createElement("p", { className: "text-sm text-muted-foreground" }, "No completed commute data for this station yet"));
    }
    const { nodes, links, meta, viaMetroIn, viaMetroOut } = buildSankeyData(
      data,
      stationName,
      prevStationName,
      nextStationName
    );
    const NodeRenderer = React22.useMemo(
      () => makeNodeRenderer(meta, routeColor),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [JSON.stringify(meta), routeColor]
    );
    const LinkRenderer = React22.useMemo(
      () => makeLinkRenderer(links, routeColor),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [JSON.stringify(links), routeColor]
    );
    const totalBoarding = data.boardingHW + data.boardingWH;
    const totalAlighting = data.alightingHW + data.alightingWH;
    if (!charts3.Sankey) {
      return /* @__PURE__ */ React22.createElement("div", { className: "flex items-center justify-center h-48 text-muted-foreground text-sm" }, "Sankey chart not available in this version");
    }
    return /* @__PURE__ */ React22.createElement("div", { style: { width: "100%", height: 260, position: "relative" } }, /* @__PURE__ */ React22.createElement(
      "div",
      {
        className: "absolute left-0 right-0 top-2 text-center font-bold text-foreground text-sm pointer-events-none whitespace-nowrap",
        style: { zIndex: 1 }
      },
      stationName
    ), /* @__PURE__ */ React22.createElement(charts3.ResponsiveContainer, { width: "100%", height: "100%" }, /* @__PURE__ */ React22.createElement(
      charts3.Sankey,
      {
        data: { nodes, links },
        nodeWidth: 14,
        nodePadding: 24,
        iterations: 0,
        margin: { top: 80, right: 160, bottom: 40, left: 160 },
        node: NodeRenderer,
        link: LinkRenderer
      },
      /* @__PURE__ */ React22.createElement(
        charts3.Tooltip,
        {
          content: ({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0];
            const val = p.value ?? p.payload?.value ?? 0;
            return /* @__PURE__ */ React22.createElement("div", { className: "bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg text-xs" }, /* @__PURE__ */ React22.createElement("div", { className: "font-medium mb-1" }, p.payload?.name || p.name || ""), /* @__PURE__ */ React22.createElement("div", { className: "text-muted-foreground" }, val.toLocaleString(), " pops"));
          }
        }
      )
    )), /* @__PURE__ */ React22.createElement(
      "div",
      {
        className: "absolute left-0 right-0 bottom-0 grid text-center text-sm text-foreground pointer-events-none whitespace-nowrap",
        style: { zIndex: 1, gridTemplateColumns: "1fr 0.15fr 1fr 0.15fr 1fr" }
      },
      /* @__PURE__ */ React22.createElement("span", null, prevStationName ? prevStationName : "Previous Stop"),
      /* @__PURE__ */ React22.createElement("span", null),
      /* @__PURE__ */ React22.createElement("span", null),
      /* @__PURE__ */ React22.createElement("span", null),
      /* @__PURE__ */ React22.createElement("span", null, nextStationName ? nextStationName : "Next Stop")
    ));
  }
  function CommuteLegend({ routeColor }) {
    return /* @__PURE__ */ React22.createElement("div", { className: "flex items-center gap-6 text-xs text-muted-foreground" }, /* @__PURE__ */ React22.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React22.createElement("div", { className: "w-3 h-3 rounded-sm", style: { background: COLOR_HOME_WORK } }), /* @__PURE__ */ React22.createElement("span", null, "Home \u2192 Work")), /* @__PURE__ */ React22.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React22.createElement("div", { className: "w-3 h-3 rounded-sm", style: { background: COLOR_WORK_HOME } }), /* @__PURE__ */ React22.createElement("span", null, "Work \u2192 Home")), /* @__PURE__ */ React22.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React22.createElement("div", { className: "w-3 h-3 rounded-sm", style: { background: COLOR_AGGREGATOR } }), /* @__PURE__ */ React22.createElement("span", null, "Boarding / Alighting")), /* @__PURE__ */ React22.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React22.createElement("div", { className: "w-3 h-3 rounded-sm", style: { background: routeColor } }), /* @__PURE__ */ React22.createElement("span", null, "Passthrough")));
  }
  function CommuteFlow({ routeId, externalStationId }) {
    const routes = api22.gameState.getRoutes();
    const { routeColor } = React22.useMemo(() => {
      const r = routes.find((r2) => r2.id === routeId);
      return {
        routeColor: r?.color ?? "#6b7280",
        routeTextColor: r?.textColor ?? "#ffffff"
      };
    }, [routeId, routes]);
    const stations = React22.useMemo(
      () => routeId ? getRouteStationsInOrder(routeId, api22) : [],
      [routeId]
    );
    const [selectedId, setSelectedId] = React22.useState(null);
    React22.useEffect(() => {
      setSelectedId(stations[0]?.id ?? null);
    }, [routeId]);
    React22.useEffect(() => {
      if (!externalStationId) return;
      if (stations.some((s) => s.id === externalStationId)) {
        setSelectedId(externalStationId);
      }
    }, [externalStationId]);
    const commuteData = useCommuteData(routeId, selectedId);
    const selectedStation = stations.find((s) => s.id === selectedId);
    const selectedIdx = stations.findIndex((s) => s.id === selectedId);
    const prevStationName = selectedIdx > 0 ? stations[selectedIdx - 1].name : null;
    const nextStationName = selectedIdx < stations.length - 1 ? stations[selectedIdx + 1].name : null;
    if (stations.length === 0) {
      return /* @__PURE__ */ React22.createElement("div", { className: "flex items-center justify-center h-32 text-muted-foreground text-sm" }, "No stations found for this route");
    }
    return /* @__PURE__ */ React22.createElement("div", { className: "space-y-5" }, /* @__PURE__ */ React22.createElement(CommuteLegend, { routeColor }), /* @__PURE__ */ React22.createElement("div", { className: "rounded-lg border border-border bg-background/50 p-4" }, !commuteData ? /* @__PURE__ */ React22.createElement("div", { className: "flex items-center justify-center h-48 text-muted-foreground text-sm" }, "Loading\u2026") : /* @__PURE__ */ React22.createElement(
      CommuteSankey,
      {
        data: commuteData,
        stationName: selectedStation?.name ?? "",
        routeColor,
        prevStationName,
        nextStationName
      }
    )), /* @__PURE__ */ React22.createElement(
      StationStrip,
      {
        stations,
        selectedId,
        routeColor,
        onSelect: setSelectedId
      }
    ));
  }

  // src/ui/route/route-metrics.jsx
  var api23 = window.SubwayBuilderAPI;
  var { React: React23, icons: icons13, charts: charts4 } = api23.utils;
  var METRICS = [
    { key: "ridership", label: "Ridership", color: "#3b82f6", unit: "people" },
    { key: "capacity", label: "Throughput", color: "#8b5cf6", unit: "people" },
    { key: "dailyProfit", label: "Daily Profit", color: "#06b6d4", unit: "currency" },
    { key: "dailyRevenue", label: "Daily Revenue", color: "#10b981", unit: "currency" },
    { key: "dailyCost", label: "Daily Cost", color: "#ef4444", unit: "currency" },
    { key: "utilization", label: "Usage %", color: "#22c55e", unit: "percent" },
    { key: "transfers", label: "Transfers", color: "#f59e0b", unit: "transfers" },
    { key: "totalTrains", label: "Trains", color: "#a78bfa", unit: "trains" }
  ];
  var DEFAULT_METRICS = ["ridership", "utilization", "dailyProfit"];
  var UNIT_PRIORITY = ["people", "currency", "percent", "transfers", "trains"];
  var TIMEFRAMES2 = [
    { key: "7", label: "7 Days" },
    { key: "14", label: "14 Days" },
    { key: "all", label: "All Time" }
  ];
  var TODAY_LABEL2 = "Today";
  function getAxisUnitTypes(selectedMetrics) {
    return [
      ...new Set(
        selectedMetrics.map((k) => METRICS.find((m) => m.key === k)?.unit).filter(Boolean)
      )
    ].sort((a, b) => UNIT_PRIORITY.indexOf(a) - UNIT_PRIORITY.indexOf(b));
  }
  var AXIS_FORMATTERS = {
    people: (v) => {
      if (v == null) return "";
      if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
      if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
      return v.toLocaleString();
    },
    currency: (v) => {
      if (v == null) return "";
      if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
      if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
      return `$${v.toLocaleString()}`;
    },
    percent: (v) => v == null ? "" : `${v}%`,
    transfers: (v) => v == null ? "" : String(Math.round(v)),
    trains: (v) => v == null ? "" : String(Math.round(v))
  };
  var VALUE_FORMATTERS = {
    people: (v) => v.toLocaleString(void 0, { maximumFractionDigits: 0 }),
    currency: (v) => `$${v.toLocaleString(void 0, { maximumFractionDigits: 0 })}`,
    percent: (v) => `${v.toFixed(1)}%`,
    transfers: (v) => String(Math.round(v)),
    trains: (v) => String(Math.round(v))
  };
  function formatMetricValue(metricKey, value) {
    if (value == null) return "\u2014";
    const m = METRICS.find((m2) => m2.key === metricKey);
    const fmt = VALUE_FORMATTERS[m?.unit];
    return fmt ? fmt(value) : value.toLocaleString();
  }
  function useRouteMetricsData(routeId) {
    const [historicalData, setHistoricalData] = React23.useState({ days: {} });
    const [liveData, setLiveData] = React23.useState(null);
    React23.useEffect(() => {
      const storage2 = getStorage();
      if (!storage2) return;
      const fetchHistorical = async () => {
        const data = await storage2.get("historicalData", { days: {} });
        setHistoricalData(data || { days: {} });
      };
      fetchHistorical();
      const interval = setInterval(fetchHistorical, 5e3);
      return () => clearInterval(interval);
    }, []);
    React23.useEffect(() => {
      if (!routeId) {
        setLiveData(null);
        return;
      }
      const update = () => {
        const routes = api23.gameState.getRoutes();
        const route = routes.find((r) => r.id === routeId);
        if (!route) {
          setLiveData(null);
          return;
        }
        const trainTypes = api23.trains.getTrainTypes();
        const lineMetrics = api23.gameState.getLineMetrics();
        const lm = lineMetrics.find((lm2) => lm2.routeId === routeId);
        const ridership = api23.gameState.getRouteRidership(routeId).total;
        const revenuePerHour = lm ? lm.revenuePerHour : 0;
        const accumulated = getAccumulatedRevenue(routeId);
        const dailyRevenue = accumulated > 0 ? accumulated : revenuePerHour * 24;
        const trainType = trainTypes[route.trainType];
        const transfersMap = calculateTransfers(routes, api23);
        const transferCount = transfersMap[routeId]?.count ?? 0;
        if (!trainType || !validateRouteData(route)) {
          setLiveData({
            ridership,
            dailyRevenue,
            transfers: transferCount,
            totalTrains: 0,
            ...getEmptyMetrics()
          });
          return;
        }
        const calculated = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
        const totalTrains = (calculated.trainsHigh || 0) + (calculated.trainsMedium || 0) + (calculated.trainsLow || 0);
        setLiveData({
          ridership,
          dailyRevenue,
          ...calculated,
          transfers: transferCount,
          totalTrains
        });
      };
      update();
      const interval = setInterval(update, CONFIG.REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }, [routeId]);
    return { historicalData, liveData };
  }
  function RouteMetrics({ routeId }) {
    const [chartType, setChartType] = React23.useState("line");
    const [selectedMetrics, setSelectedMetrics] = React23.useState(DEFAULT_METRICS);
    const [timeframe, setTimeframe] = React23.useState("7");
    const { historicalData, liveData } = useRouteMetricsData(routeId);
    const allDays = React23.useMemo(() => getAvailableDays(historicalData), [historicalData]);
    const daysToShow = React23.useMemo(() => {
      if (timeframe === "all") return allDays;
      const limit = parseInt(timeframe) - 1;
      return allDays.slice(0, limit);
    }, [allDays, timeframe]);
    const chartData = React23.useMemo(() => {
      const historical = [...daysToShow].reverse().map((day) => {
        const dayData = historicalData.days[day];
        if (!dayData) return null;
        const routeEntry = dayData.routes?.find((r) => r.id === routeId);
        if (!routeEntry) return null;
        const point = { day, isLive: false };
        METRICS.forEach((m) => {
          point[m.key] = routeEntry[m.key] ?? null;
        });
        point.transfers = routeEntry.transfers?.count ?? null;
        point.totalTrains = routeEntry.trainsLow != null ? (routeEntry.trainsLow || 0) + (routeEntry.trainsMedium || 0) + (routeEntry.trainsHigh || 0) : null;
        return point;
      }).filter(Boolean);
      if (liveData) {
        const todayPoint = { day: TODAY_LABEL2, isLive: true };
        METRICS.forEach((m) => {
          todayPoint[m.key] = liveData[m.key] ?? null;
        });
        historical.push(todayPoint);
      }
      return historical;
    }, [routeId, daysToShow, historicalData, liveData]);
    const axisUnitTypes = React23.useMemo(
      () => getAxisUnitTypes(selectedMetrics),
      [selectedMetrics]
    );
    const toggleMetric = (key) => {
      setSelectedMetrics(
        (prev) => prev.includes(key) ? prev.length > 1 ? prev.filter((k) => k !== key) : prev : [...prev, key]
      );
    };
    return /* @__PURE__ */ React23.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React23.createElement("div", { className: "flex items-center justify-between gap-4 flex-wrap" }, /* @__PURE__ */ React23.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React23.createElement("span", { className: "text-xs font-medium" }, "Chart:"), /* @__PURE__ */ React23.createElement(ButtonsGroup, { value: chartType, onChange: setChartType }, /* @__PURE__ */ React23.createElement(ButtonsGroupItem, { value: "line", text: "Line" }), /* @__PURE__ */ React23.createElement(ButtonsGroupItem, { value: "bar", text: "Bar" }))), /* @__PURE__ */ React23.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React23.createElement("span", { className: "text-xs font-medium" }, "Metrics:"), /* @__PURE__ */ React23.createElement("div", { className: "flex gap-1.5 flex-wrap" }, METRICS.map((metric) => {
      const active = selectedMetrics.includes(metric.key);
      return /* @__PURE__ */ React23.createElement(
        "button",
        {
          key: metric.key,
          onClick: () => toggleMetric(metric.key),
          className: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${active ? "border-transparent text-white" : "border-border bg-background text-muted-foreground hover:text-foreground"}`,
          style: active ? { backgroundColor: metric.color, borderColor: metric.color } : {}
        },
        active && /* @__PURE__ */ React23.createElement("span", { className: "w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" }),
        metric.label
      );
    }))), /* @__PURE__ */ React23.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React23.createElement("span", { className: "text-xs font-medium" }, "Period:"), /* @__PURE__ */ React23.createElement(ButtonsGroup, { value: timeframe, onChange: setTimeframe }, TIMEFRAMES2.map((tf) => /* @__PURE__ */ React23.createElement(ButtonsGroupItem, { key: tf.key, value: tf.key, text: tf.label }))))), /* @__PURE__ */ React23.createElement("div", { className: "rounded-lg border border-border bg-background/50 p-4" }, chartData.length === 0 ? /* @__PURE__ */ React23.createElement("div", { className: "flex flex-col items-center justify-center py-16 text-center" }, /* @__PURE__ */ React23.createElement(icons13.LineChart, { size: 48, className: "text-muted-foreground mb-4" }), /* @__PURE__ */ React23.createElement("p", { className: "text-sm text-muted-foreground" }, "No data available yet")) : /* @__PURE__ */ React23.createElement(
      RouteMetricsChart,
      {
        data: chartData,
        selectedMetrics,
        chartType,
        axisUnitTypes
      }
    )));
  }
  function RouteMetricsChart({ data, selectedMetrics, chartType, axisUnitTypes }) {
    const h = React23.createElement;
    const leftUnit = axisUnitTypes[0] ?? null;
    const rightUnit = axisUnitTypes[1] ?? null;
    const CustomTooltip = ({ active, payload, label }) => {
      if (!active || !payload?.length) return null;
      const isLivePoint = label === TODAY_LABEL2;
      return h("div", {
        className: "bg-background/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg min-w-[170px]"
      }, [
        h("div", {
          key: "header",
          className: "text-xs font-medium mb-2 text-muted-foreground flex items-center gap-1.5"
        }, [
          isLivePoint && h("span", {
            key: "live",
            className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30"
          }, [
            h("span", { key: "pulse", className: "w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" }),
            "LIVE"
          ]),
          h("span", { key: "day" }, isLivePoint ? "Today (partial day)" : `Day ${label}`)
        ]),
        ...selectedMetrics.map((metricKey) => {
          const metricDef = METRICS.find((m) => m.key === metricKey);
          if (!metricDef) return null;
          const entry = payload.find((p) => p.dataKey === metricKey);
          const value = entry?.value;
          return h("div", {
            key: metricKey,
            className: "flex items-center justify-between gap-6 text-xs mt-1.5"
          }, [
            h("div", { key: "label", className: "flex items-center gap-1.5" }, [
              h("div", {
                key: "dot",
                className: "w-2 h-2 rounded-full flex-shrink-0",
                style: { backgroundColor: metricDef.color }
              }),
              h("span", { key: "name", className: "text-muted-foreground" }, metricDef.label)
            ]),
            h(
              "span",
              { key: "val", className: "font-mono font-medium" },
              formatMetricValue(metricKey, value)
            )
          ]);
        }).filter(Boolean)
      ]);
    };
    const makeDot = (color) => (props) => {
      const { cx, cy, value, payload } = props;
      if (value == null) return null;
      if (!payload?.isLive) {
        return h("circle", { cx, cy, r: 3, fill: color, stroke: "none" });
      }
      return h("circle", {
        cx,
        cy,
        r: 4,
        fill: "none",
        stroke: color,
        strokeWidth: 1.5,
        opacity: 0.65,
        strokeDasharray: "2 1"
      });
    };
    const makeLiveBar = (color) => function LiveBar(props) {
      const { x, y, width, height, payload } = props;
      if (!width || !height) return null;
      const rectY = height < 0 ? y + height : y;
      const rectHeight = Math.abs(height);
      return h("rect", {
        x,
        y: rectY,
        width,
        height: rectHeight,
        rx: 2,
        ry: 2,
        fill: color,
        stroke: color,
        strokeWidth: 1,
        fillOpacity: payload?.isLive ? 0.2 : 0.3,
        strokeDasharray: payload?.isLive ? "3 3" : void 0
      });
    };
    const MetricLegend = () => h(
      "div",
      { className: "flex items-center justify-center gap-4 flex-wrap pt-1" },
      selectedMetrics.map((key) => {
        const m = METRICS.find((m2) => m2.key === key);
        if (!m) return null;
        const unitIndex = axisUnitTypes.indexOf(m.unit);
        const axisHint = unitIndex === 0 ? "\u2190" : unitIndex === 1 ? "\u2192" : "\xB7";
        return h("div", {
          key,
          className: "flex items-center gap-1.5 text-xs text-muted-foreground"
        }, [
          h("div", { key: "dot", className: "w-2.5 h-2.5 rounded-full", style: { backgroundColor: m.color } }),
          h("span", { key: "lbl" }, m.label),
          axisUnitTypes.length > 1 && h("span", {
            key: "axis",
            className: "text-[10px] text-muted-foreground/50"
          }, axisHint)
        ]);
      }).filter(Boolean)
    );
    const yAxes = axisUnitTypes.map((unit, i) => {
      const isRight = i === 1;
      const isHidden = i >= 2;
      return h(charts4.YAxis, {
        key: `yaxis-${unit}`,
        yAxisId: unit,
        orientation: isRight ? "right" : "left",
        stroke: "#9ca3af",
        fontSize: 12,
        tickFormatter: isHidden ? () => "" : AXIS_FORMATTERS[unit],
        axisLine: !isHidden,
        tickLine: !isHidden,
        tick: !isHidden,
        width: isHidden ? 0 : void 0
      });
    });
    const commonProps = {
      data,
      margin: { top: 20, right: rightUnit ? 55 : 10, left: 0, bottom: 20 }
    };
    const xAxisProps = {
      key: "xaxis",
      dataKey: "day",
      stroke: "#9ca3af",
      fontSize: 12,
      tickFormatter: (day) => day === TODAY_LABEL2 ? "\u25B8 Today" : `Day ${day}`,
      padding: { right: 32, left: 32 },
      axisLine: false,
      tickLine: false
    };
    const gridProps = {
      key: "grid",
      strokeDasharray: "3 3",
      stroke: "#374151",
      opacity: 0.3
    };
    const todayRefLine = h(charts4.ReferenceLine, {
      key: "today-ref",
      yAxisId: leftUnit,
      x: TODAY_LABEL2,
      stroke: "#6b7280",
      strokeDasharray: "4 3",
      strokeOpacity: 0.5,
      label: { value: "", position: "insideTopRight" }
    });
    const series = selectedMetrics.map((metricKey) => {
      const m = METRICS.find((m2) => m2.key === metricKey);
      if (!m) return null;
      if (chartType === "bar") {
        return h(charts4.Bar, {
          key: metricKey,
          dataKey: metricKey,
          yAxisId: m.unit,
          // ← unit type, not 'left'/'right'
          shape: makeLiveBar(m.color)
        });
      }
      return h(charts4.Line, {
        key: metricKey,
        type: "monotone",
        dataKey: metricKey,
        yAxisId: m.unit,
        // ← unit type, not 'left'/'right'
        stroke: m.color,
        strokeWidth: 2,
        dot: makeDot(m.color),
        activeDot: { r: 5 },
        connectNulls: false,
        animationDuration: 500
      });
    }).filter(Boolean);
    const ChartComponent = chartType === "line" ? charts4.LineChart : charts4.BarChart;
    return h(
      "div",
      { className: "aa-chart w-full", style: { height: "340px" } },
      h(
        charts4.ResponsiveContainer,
        { width: "100%", height: "100%" },
        h(ChartComponent, commonProps, [
          h(charts4.CartesianGrid, gridProps),
          h(charts4.XAxis, xAxisProps),
          ...yAxes,
          h(charts4.Tooltip, { key: "tooltip", content: CustomTooltip }),
          h(charts4.Legend, { key: "legend", content: MetricLegend }),
          todayRefLine,
          ...series
        ])
      )
    );
  }

  // src/ui/route/route-dialog.jsx
  var api24 = window.SubwayBuilderAPI;
  var { React: React24, icons: icons14 } = api24.utils;
  function useRouteData(routeId) {
    const [data, setData] = React24.useState(null);
    React24.useEffect(() => {
      if (!routeId) {
        setData(null);
        return;
      }
      const update = async () => {
        const routes = api24.gameState.getRoutes();
        const route = routes.find((r) => r.id === routeId);
        if (!route) return;
        const trainTypes = api24.trains.getTrainTypes();
        const lineMetrics = api24.gameState.getLineMetrics();
        const m = lineMetrics.find((lm) => lm.routeId === routeId);
        const ridership = api24.gameState.getRouteRidership(routeId).total;
        const revenuePerHour = m ? m.revenuePerHour : 0;
        const accumulated = getAccumulatedRevenue(routeId);
        const dailyRevenue = accumulated > 0 ? accumulated : revenuePerHour * 24;
        const transfersMap = calculateTransfers(routes, api24);
        const transfers = transfersMap[routeId] || { count: 0, routes: [], routeIds: [], stationIds: [] };
        const trainType = trainTypes[route.trainType];
        const currentDay = api24.gameState.getCurrentDay();
        const storage2 = getStorage();
        let createdDay = null;
        if (storage2) {
          const routeStatuses = await storage2.get("routeStatuses", {});
          createdDay = routeStatuses[routeId]?.createdDay ?? null;
        }
        const trainTypeInfo = trainType ? {
          name: trainType.name,
          description: trainType.description,
          color: trainType.appearance?.color || "#666666"
        } : null;
        const routeInfo = {
          bullet: route.bullet || null,
          createdDay,
          daysInService: createdDay != null ? currentDay - createdDay : null,
          stationCount: getRouteStationsInOrder(routeId, api24).length,
          trainTypeName: trainTypeInfo?.name || null,
          trainTypeDescription: trainTypeInfo?.description || null,
          trainTypeColor: trainTypeInfo?.color || null
        };
        if (!trainType || !validateRouteData(route)) {
          setData({ route, ridership, dailyRevenue, transfers, routeInfo, ...getEmptyMetrics() });
          return;
        }
        const calculated = calculateRouteMetrics(route, trainType, ridership, dailyRevenue);
        setData({ route, ridership, dailyRevenue, transfers, routeInfo, ...calculated });
      };
      update();
      const interval = setInterval(update, CONFIG.REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }, [routeId]);
    return data;
  }
  function getUtilColors(u) {
    const { CRITICAL_LOW, WARNING_LOW, WARNING_HIGH, CRITICAL_HIGH } = CONFIG.UTILIZATION_THRESHOLDS;
    if (u < CRITICAL_LOW || u > CRITICAL_HIGH) return { bar: "bg-red-500", text: "text-red-500" };
    if (u < WARNING_LOW || u > WARNING_HIGH) return { bar: "bg-amber-500", text: "text-amber-500" };
    return { bar: "bg-green-500", text: "text-green-600 dark:text-green-400" };
  }
  function getUtilLabel(u) {
    const { CRITICAL_LOW, WARNING_LOW, WARNING_HIGH, CRITICAL_HIGH } = CONFIG.UTILIZATION_THRESHOLDS;
    if (u < CRITICAL_LOW) return "Critically Underused";
    if (u < WARNING_LOW) return "Underused";
    if (u > CRITICAL_HIGH) return "Overcrowded";
    if (u > WARNING_HIGH) return "Near Capacity";
    return "Healthy";
  }
  function UsageGauge({ utilization, ridership, capacity }) {
    const pct = Math.max(utilization || 0, 0);
    const barWidth = Math.min(pct, 100);
    const overflow = pct > 100;
    const colors = getUtilColors(pct);
    const label = getUtilLabel(pct);
    const { WARNING_LOW, WARNING_HIGH } = CONFIG.UTILIZATION_THRESHOLDS;
    return /* @__PURE__ */ React24.createElement("div", { className: "rounded flex flex-col border bg-muted/30 px-6 py-5" }, /* @__PURE__ */ React24.createElement("div", { className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1" }, "Usage"), /* @__PURE__ */ React24.createElement("div", { className: "my-auto" }, /* @__PURE__ */ React24.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React24.createElement("div", { className: `font-bold ${colors.text}` }, label), /* @__PURE__ */ React24.createElement("div", { className: `text-5xl font-bold tabular-nums leading-none ${colors.text}` }, pct.toFixed(1), /* @__PURE__ */ React24.createElement("span", { className: "text-2xl font-medium ml-0.5" }, "%"))), /* @__PURE__ */ React24.createElement(
      "div",
      {
        className: "relative h-3 rounded overflow-hidden mb-2",
        style: { backgroundColor: "rgba(128,128,128,0.15)" }
      },
      /* @__PURE__ */ React24.createElement(
        "div",
        {
          className: `absolute inset-y-0 left-0 transition-all duration-500 ${colors.bar} ${overflow ? "" : "rounded"}`,
          style: { width: `${barWidth}%` }
        }
      ),
      overflow && /* @__PURE__ */ React24.createElement(
        "div",
        {
          className: "absolute inset-y-0 right-0 w-6",
          style: {
            background: "repeating-linear-gradient(135deg, hsl(var(--background) / 0.5) 0px, hsl(var(--background) / 0.5) 3px, transparent 3px, transparent 6px)"
          }
        }
      ),
      /* @__PURE__ */ React24.createElement("div", { className: "absolute inset-y-0 w-px bg-foreground/25", style: { left: `${WARNING_LOW}%` } }),
      /* @__PURE__ */ React24.createElement("div", { className: "absolute inset-y-0 w-px bg-foreground/25", style: { left: `${WARNING_HIGH}%` } })
    ), /* @__PURE__ */ React24.createElement("div", { className: "flex justify-between text-xs text-muted-foreground mt-3" }, /* @__PURE__ */ React24.createElement("span", null, "Healthy range: ", WARNING_LOW, "\u2013", WARNING_HIGH, "%"), /* @__PURE__ */ React24.createElement("span", null, Math.round(ridership || 0).toLocaleString(), " riders ", " / ", " ", (capacity || 0).toLocaleString(), " capacity"))));
  }
  function StatCard({ label, icon, value, sub, children, valueClass = "" }) {
    return /* @__PURE__ */ React24.createElement("div", { className: "flex gap-2 rounded border bg-muted/20 p-4 h-full" }, icon && React24.createElement(icons14[icon], { size: 14, className: "mt-0.5 shrink-0" }), /* @__PURE__ */ React24.createElement("div", null, /* @__PURE__ */ React24.createElement("div", { className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1" }, label), value && /* @__PURE__ */ React24.createElement("div", { className: `text-xl font-semibold tabular-nums ${valueClass}` }, value), children, sub && /* @__PURE__ */ React24.createElement("div", { className: "text-xs text-muted-foreground mt-0.5" }, sub)));
  }
  function RouteContent({ routeId }) {
    const data = useRouteData(routeId);
    const [clickedStationId, setClickedStationId] = React24.useState(null);
    React24.useEffect(() => {
      setClickedStationId(null);
    }, [routeId]);
    const commuteFlowRef = React24.useRef(null);
    const handleStationClick = React24.useCallback((stationId) => {
      setClickedStationId(stationId);
      commuteFlowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);
    if (!data) {
      return /* @__PURE__ */ React24.createElement("div", { className: "flex items-center justify-center h-32 text-muted-foreground text-sm" }, "Loading\u2026");
    }
    const totalTrains = calculateTotalTrains(data);
    const profitClass = data.dailyProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500";
    return /* @__PURE__ */ React24.createElement("div", { className: "pb-6" }, /* @__PURE__ */ React24.createElement("section", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React24.createElement(
      UsageGauge,
      {
        utilization: data.utilization,
        ridership: Math.round(data.ridership),
        capacity: data.capacity
      }
    ), /* @__PURE__ */ React24.createElement("div", { className: "grid grid-cols-3 gap-3" }, /* @__PURE__ */ React24.createElement("div", { className: "flex flex-col gap-3" }, /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Ridership",
        icon: "Route",
        value: Math.round(data.ridership).toLocaleString(),
        sub: "riders / last 24h"
      }
    ), /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Throughput",
        icon: "Container",
        value: (data.capacity || 0).toLocaleString(),
        sub: "daily capacity"
      }
    )), /* @__PURE__ */ React24.createElement("div", { className: "col-span-2 pl-4" }, /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Route Info",
        icon: "Info"
      },
      /* @__PURE__ */ React24.createElement("div", { className: "flex flex-col gap-2 pt-1" }, /* @__PURE__ */ React24.createElement("div", { className: "flex items-center gap-1.5" }, data.routeInfo?.bullet ? /* @__PURE__ */ React24.createElement("span", { className: "text-base font-semibold leading-tight" }, data.routeInfo.bullet) : /* @__PURE__ */ React24.createElement(RouteBadge, { routeId, size: "1.2rem", interactive: false })), data.routeInfo?.createdDay != null && /* @__PURE__ */ React24.createElement("div", { className: "flex gap-4 text-xs pt-1 mb-3" }, /* @__PURE__ */ React24.createElement("span", { className: "text-muted-foreground" }, "Created\xA0", /* @__PURE__ */ React24.createElement("span", { className: "text-foreground font-medium" }, "Day ", data.routeInfo.createdDay)), data.routeInfo.daysInService != null && /* @__PURE__ */ React24.createElement("span", { className: "text-muted-foreground" }, "In service\xA0", /* @__PURE__ */ React24.createElement("span", { className: "text-foreground font-medium" }, data.routeInfo.daysInService > 0 ? `${data.routeInfo.daysInService} day${data.routeInfo.daysInService !== 1 ? "s" : ""}` : "since today"))), data.routeInfo?.trainTypeName && /* @__PURE__ */ React24.createElement("div", { className: "flex items-center gap-1.5 text-xs" }, /* @__PURE__ */ React24.createElement(
        "span",
        {
          className: "w-2 h-2 rounded-full shrink-0",
          style: { background: data.routeInfo.trainTypeColor }
        }
      ), /* @__PURE__ */ React24.createElement("span", { className: "font-medium" }, data.routeInfo.trainTypeName)), data.routeInfo?.trainTypeDescription && /* @__PURE__ */ React24.createElement("p", { className: "text-xs text-muted-foreground leading-relaxed" }, data.routeInfo.trainTypeDescription))
    ))), /* @__PURE__ */ React24.createElement("div", { className: "grid grid-cols-3 gap-3 pt-2" }, /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Daily Revenue",
        icon: "ArrowBigUpDash",
        value: formatCurrencyCompact(data.dailyRevenue),
        sub: "/ day"
      }
    ), /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Daily Cost",
        icon: "ArrowBigDownDash",
        value: formatCurrencyCompact(data.dailyCost),
        sub: "/ day"
      }
    ), /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Daily Profit",
        icon: "HandCoins",
        value: formatCurrencyCompact(data.dailyProfit),
        sub: "/ day",
        valueClass: profitClass
      }
    )), /* @__PURE__ */ React24.createElement("div", { className: "grid grid-cols-3 gap-3 pt-2" }, /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Trains",
        icon: "TramFront",
        value: totalTrains,
        sub: `${data.trainsHigh}H \xB7 ${data.trainsMedium}M \xB7 ${data.trainsLow}L`
      }
    ), /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Stops",
        icon: "FlagTriangleRight",
        value: data.stations || "\u2013",
        sub: `${data.routeInfo?.stationCount ?? "\u2013"} station${data.routeInfo?.stationCount !== 1 ? "s" : ""}`
      }
    ), /* @__PURE__ */ React24.createElement(
      StatCard,
      {
        label: "Transfers",
        icon: "Circle"
      },
      (() => {
        const routeIds = data.transfers?.routeIds ?? [];
        if (routeIds.length === 0) {
          return /* @__PURE__ */ React24.createElement("div", { className: "text-xl font-semibold tabular-nums" }, "0");
        }
        const allRoutes = api24.gameState.getRoutes();
        return /* @__PURE__ */ React24.createElement(
          Dropdown,
          {
            togglerContent: /* @__PURE__ */ React24.createElement("span", { className: "text-xl font-semibold tabular-nums" }, routeIds.length),
            togglerClasses: "flex items-center gap-1 rounded hover:bg-accent px-1 -ml-1 transition-colors",
            onChange: (rid) => window.AdvancedAnalytics?.openRouteDialog?.(rid)
          },
          routeIds.map((rid) => {
            const route = allRoutes.find((r) => r.id === rid);
            return route ? /* @__PURE__ */ React24.createElement(DropdownItem, { key: rid, value: rid, route }) : null;
          })
        );
      })()
    ))), /* @__PURE__ */ React24.createElement("div", { className: "pt-8" }, /* @__PURE__ */ React24.createElement("div", { className: "py-5" }, /* @__PURE__ */ React24.createElement("h3", { className: "text-2xl font-semibold leading-none tracking-tight" }, "Route Metrics"), /* @__PURE__ */ React24.createElement("p", { className: "text-sm text-muted-foreground mt-1" }, "Historical trends for key performance indicators")), /* @__PURE__ */ React24.createElement(RouteMetrics, { routeId })), /* @__PURE__ */ React24.createElement("div", { className: "pt-8" }, /* @__PURE__ */ React24.createElement("div", { className: "py-5" }, /* @__PURE__ */ React24.createElement("h3", { className: "text-2xl font-semibold leading-none tracking-tight" }, "Stations Flow"), /* @__PURE__ */ React24.createElement("p", { className: "text-sm text-muted-foreground mt-1" }, "Network schematic map")), /* @__PURE__ */ React24.createElement(StationFlow, { routeId, onStationClick: handleStationClick })), /* @__PURE__ */ React24.createElement("div", { ref: commuteFlowRef, className: "pt-8" }, /* @__PURE__ */ React24.createElement("div", { className: "py-5" }, /* @__PURE__ */ React24.createElement("h3", { className: "text-2xl font-semibold leading-none tracking-tight" }, "Commute Flows"), /* @__PURE__ */ React24.createElement("p", { className: "text-sm text-muted-foreground mt-1" }, "Completed commuter journeys boarding and alighting at each station")), /* @__PURE__ */ React24.createElement(CommuteFlow, { routeId, externalStationId: clickedStationId })));
  }
  function RouteDialogTitle({ routeId, onRouteChange }) {
    const routes = api24.gameState.getRoutes();
    const current = routes.find((r) => r.id === routeId);
    return /* @__PURE__ */ React24.createElement("div", { className: "flex items-center gap-2 min-w-0" }, /* @__PURE__ */ React24.createElement(
      Dropdown,
      {
        togglerClasses: "flex items-center border gap-1 rounded-md hover:bg-accent px-2 py-1.5 transition-colors text-xs",
        togglerContent: routeId ? /* @__PURE__ */ React24.createElement(RouteBadge, { routeId, size: "1.2rem", interactive: false }) : /* @__PURE__ */ React24.createElement("span", { className: "text-muted-foreground text-sm" }, "Select"),
        value: routeId,
        onChange: onRouteChange
      },
      routes.map(
        (r) => /* @__PURE__ */ React24.createElement(DropdownItem, { key: r.id, value: r.id, route: r })
      )
    ), current && /* @__PURE__ */ React24.createElement("span", { className: "font-semibold text-lg truncate" }, "Route Analytics"));
  }
  function RouteDialog() {
    const [isOpen, setIsOpen] = React24.useState(false);
    const [routeId, setRouteId] = React24.useState(null);
    React24.useEffect(() => {
      window.AdvancedAnalytics = window.AdvancedAnalytics || {};
      window.AdvancedAnalytics.openRouteDialog = (id) => {
        setRouteId(id);
        setIsOpen(true);
      };
      window.AdvancedAnalytics.closeRouteDialog = () => setIsOpen(false);
      return () => {
        delete window.AdvancedAnalytics.openRouteDialog;
        delete window.AdvancedAnalytics.closeRouteDialog;
      };
    }, []);
    return /* @__PURE__ */ React24.createElement(
      Dialog,
      {
        id: "aa-dialog-route",
        title: /* @__PURE__ */ React24.createElement(
          RouteDialogTitle,
          {
            routeId,
            onRouteChange: (id) => setRouteId(id)
          }
        ),
        isOpen,
        onClose: () => setIsOpen(false),
        size: 1280
      },
      isOpen && routeId && /* @__PURE__ */ React24.createElement(RouteContent, { routeId })
    );
  }

  // src/ui/panel.jsx
  var api25 = window.SubwayBuilderAPI;
  var { React: React25, icons: icons15 } = api25.utils;
  function Panel() {
    const [sortState, setSortState] = React25.useState(INITIAL_STATE.sort);
    const emptyHistoricalData = React25.useMemo(() => ({ days: {} }), []);
    const isMountedRef = React25.useRef(true);
    const { tableData } = useRouteMetrics({
      sortState,
      timeframeState: "last24h",
      // Always live data
      compareMode: false,
      // No comparison mode
      historicalData: emptyHistoricalData
      // Memoized empty object
    });
    React25.useEffect(() => {
      if (!isMountedRef.current) return;
      const rafId = requestAnimationFrame(() => {
        const ourContent = document.getElementById("aa-panel");
        if (!ourContent) return;
        const wrapper = ourContent.parentElement;
        if (wrapper && !wrapper.id) {
          wrapper.id = "sb-aa-panel-wrapper";
          wrapper.classList.remove("p-2");
          wrapper.classList.add("max-h-[80vh]");
          wrapper.classList.add("overflow-auto");
        }
        const mainPanel = ourContent.closest(".fixed.z-50");
        if (mainPanel && !mainPanel.id) {
          mainPanel.id = "sb-aa-panel-wrapper-main";
          const maxWidth = mainPanel.style.width;
          if (maxWidth) {
            mainPanel.style.width = "";
            mainPanel.style.maxWidth = maxWidth;
          }
        }
      });
      return () => {
        cancelAnimationFrame(rafId);
        isMountedRef.current = false;
      };
    }, []);
    const handleSortChange = React25.useCallback((newState) => {
      if (isMountedRef.current) {
        setSortState(newState);
      }
    }, []);
    return /* @__PURE__ */ React25.createElement("div", { id: "aa-panel", className: "flex flex-col h-full" }, /* @__PURE__ */ React25.createElement("div", { className: "flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30" }, /* @__PURE__ */ React25.createElement(GuideTrigger, null), /* @__PURE__ */ React25.createElement(Tooltip, { content: "Open the full analytics dialog with all metrics", side: "left", delayDuration: 300 }, /* @__PURE__ */ React25.createElement(
      "button",
      {
        onClick: () => window.AdvancedAnalytics?.openDialog?.(),
        className: "inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground text-xs"
      },
      /* @__PURE__ */ React25.createElement(icons15.SquareArrowOutUpRight, { size: 16, className: "mr-2" }),
      "Dashboard"
    ))), /* @__PURE__ */ React25.createElement("div", { className: "scrollbar-thin flex-1 overflow-auto" }, /* @__PURE__ */ React25.createElement(
      SortableTable,
      {
        data: tableData,
        sortState,
        onSortChange: handleSortChange,
        groups: ["performance"],
        compareShowPercentages: true
      }
    )));
  }

  // src/hooks/portal-host.jsx
  var api26 = window.SubwayBuilderAPI;
  var { React: React26 } = api26.utils;
  function PortalHost() {
    const [portals, setPortals] = React26.useState(/* @__PURE__ */ new Map());
    React26.useEffect(() => {
      window.AdvancedAnalytics._portalRegistry = {
        mount: (id, el) => setPortals((p) => new Map(p).set(id, el)),
        unmount: (id) => setPortals((p) => {
          const n = new Map(p);
          n.delete(id);
          return n;
        })
      };
      return () => {
        window.AdvancedAnalytics._portalRegistry = null;
      };
    }, []);
    const entries = [...portals.values()];
    if (entries.length === 0) return null;
    return React26.createElement(React26.Fragment, null, ...entries);
  }

  // src/debug/revenue-debug.js
  var POLL_INTERVAL_MS2 = 100;
  var SUMMARY_INTERVAL_MS = 1e4;
  var TAG2 = "[AA:REVDBG]";
  var TAG_MC = "[AA:MC]";
  function gameTime(api28) {
    const elapsed = api28.gameState.getElapsedSeconds();
    const h = Math.floor(elapsed % 86400 / 3600);
    const m = Math.floor(elapsed % 3600 / 60);
    const s = Math.floor(elapsed % 60);
    return {
      elapsed,
      label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      day: api28.gameState.getCurrentDay()
    };
  }
  function routeLabel(route) {
    return route.name || route.bullet || route.id;
  }
  function makeRouteState() {
    return {
      lastValue: null,
      // last known revenuePerHour
      // Pulse tracking
      pulseActive: false,
      pulseStartMs: null,
      pulseStartGT: null,
      pulseValues: [],
      // Integration accumulator (revenuePerHour × Δt_ingame_hours)
      integratedRevenue: 0,
      lastSampleElapsed: null,
      // last in-game elapsed seconds
      // Attribution accumulator (proportional share of each onMoneyChanged event)
      attributedRevenue: 0,
      // Pulse history
      pulseHistory: []
    };
  }
  var _hookRegistered2 = false;
  var _routeStates = {};
  var _totalMoneyChangedRev = 0;
  var _moneyChangedEventCount = 0;
  var _lastLineMetrics = [];
  var _pollTimer2 = null;
  var _summaryTimer = null;
  function _registerMoneyHook2(api28) {
    if (_hookRegistered2) return;
    _hookRegistered2 = true;
    api28.hooks.onMoneyChanged((balance, change, type, category) => {
      const gt = gameTime(api28);
      const cat = category || "Uncategorized";
      if (type !== "revenue") {
        console.log(
          `${TAG_MC} [Day ${gt.day} ${gt.label}] ${type} | ${cat} | ${change >= 0 ? "+" : ""}${change}`
        );
        return;
      }
      _totalMoneyChangedRev += change;
      _moneyChangedEventCount++;
      const routes = api28.gameState.getRoutes();
      const metrics = _lastLineMetrics.length ? _lastLineMetrics : api28.gameState.getLineMetrics();
      const totalRate = metrics.reduce((sum, m) => sum + (m.revenuePerHour || 0), 0);
      const attribution = routes.map((route) => {
        const lm = metrics.find((m) => m.routeId === route.id);
        const rate = lm ? lm.revenuePerHour : 0;
        const prop = totalRate > 0 ? rate / totalRate : 0;
        const share = change * prop;
        if (!_routeStates[route.id]) _routeStates[route.id] = makeRouteState();
        _routeStates[route.id].attributedRevenue += share;
        return { label: routeLabel(route), rate, prop: (prop * 100).toFixed(1), share: share.toFixed(0) };
      });
      const rateStr = attribution.filter((a) => a.rate > 0).map((a) => `${a.label}:${a.rate}(${a.prop}%\u2192${a.share})`).join("  ") || "(all routes at 0)";
      console.log(
        `${TAG_MC} [Day ${gt.day} ${gt.label}] +${change} | totalRate: ${totalRate} | ${rateStr} | cumulativeRevenue: ${_totalMoneyChangedRev.toFixed(0)}`
      );
    });
    console.log(`${TAG2} \u2713 onMoneyChanged hook registered (once)`);
  }
  function startRevenueDebug(api28) {
    console.log(`${TAG2} \u25B6 Revenue debug started | poll: ${POLL_INTERVAL_MS2}ms`);
    _registerMoneyHook2(api28);
    if (_pollTimer2) clearInterval(_pollTimer2);
    if (_summaryTimer) clearInterval(_summaryTimer);
    function tick() {
      if (api28.gameState.isPaused()) return;
      const gt = gameTime(api28);
      const routes = api28.gameState.getRoutes();
      const lineMetrics = api28.gameState.getLineMetrics();
      _lastLineMetrics = lineMetrics;
      routes.forEach((route) => {
        const lm = lineMetrics.find((m) => m.routeId === route.id);
        const revenue = lm ? lm.revenuePerHour : 0;
        if (!_routeStates[route.id]) _routeStates[route.id] = makeRouteState();
        const state = _routeStates[route.id];
        if (state.lastSampleElapsed !== null) {
          const dtHours = (gt.elapsed - state.lastSampleElapsed) / 3600;
          state.integratedRevenue += (state.lastValue ?? 0) * dtHours;
        }
        state.lastSampleElapsed = gt.elapsed;
        if (revenue !== state.lastValue) {
          const prev = state.lastValue;
          state.lastValue = revenue;
          console.log(
            `${TAG2} [Day ${gt.day} ${gt.label}] ${routeLabel(route)} revenuePerHour: ${prev ?? "(init)"} \u2192 ${revenue}`
          );
        }
        if (revenue > 0) {
          if (!state.pulseActive) {
            state.pulseActive = true;
            state.pulseStartMs = Date.now();
            state.pulseStartGT = gt.elapsed;
            state.pulseValues = [];
            console.log(`${TAG2} [Day ${gt.day} ${gt.label}] ${routeLabel(route)} \u25B2 PULSE START`);
          }
          state.pulseValues.push(revenue);
        } else if (revenue === 0 && state.pulseActive) {
          state.pulseActive = false;
          const nowMs = Date.now();
          const durationMs = nowMs - state.pulseStartMs;
          const durationS = (durationMs / 1e3).toFixed(1);
          const peak = Math.max(...state.pulseValues);
          const avg = (state.pulseValues.reduce((a, b) => a + b, 0) / state.pulseValues.length).toFixed(2);
          const gtDelta = gt.elapsed - state.pulseStartGT;
          const summary = {
            durationMs,
            durationRealS: durationS,
            durationGameS: gtDelta,
            peak,
            avg: parseFloat(avg),
            sampleCount: state.pulseValues.length
          };
          state.pulseHistory.push(summary);
          if (state.pulseHistory.length > 20) state.pulseHistory.shift();
          console.log(
            `${TAG2} [Day ${gt.day} ${gt.label}] ${routeLabel(route)} \u25BC PULSE END | real: ${durationS}s | in-game: ${gtDelta}s | peak: ${peak} | avg: ${avg} | samples: ${summary.sampleCount}`
          );
        }
      });
    }
    function printSummary() {
      if (api28.gameState.isPaused()) return;
      const gt = gameTime(api28);
      const routes = api28.gameState.getRoutes();
      console.groupCollapsed(`${TAG2} \u2550\u2550 SUMMARY [Day ${gt.day} ${gt.label}] \u2550\u2550`);
      console.log(`  onMoneyChanged events : ${_moneyChangedEventCount}`);
      console.log(`  total MC revenue      : ${_totalMoneyChangedRev.toFixed(0)}`);
      let totalIntegrated = 0;
      let totalAttributed = 0;
      routes.forEach((route) => {
        const state = _routeStates[route.id];
        if (!state) return;
        totalIntegrated += state.integratedRevenue;
        totalAttributed += state.attributedRevenue;
        const history = state.pulseHistory;
        const lm = (_lastLineMetrics.length ? _lastLineMetrics : api28.gameState.getLineMetrics()).find((m) => m.routeId === route.id);
        const currentRate = lm ? lm.revenuePerHour : 0;
        console.groupCollapsed(`  ${routeLabel(route)}`);
        console.log(`  currentRevenuePerHour : ${currentRate}`);
        console.log(`  integrated (poll)     : ${state.integratedRevenue.toFixed(4)}`);
        console.log(`  attributed (MC share) : ${state.attributedRevenue.toFixed(4)}`);
        console.log(`  pulses so far         : ${history.length}`);
        if (history.length > 0) {
          const avgDurS = (history.reduce((a, p) => a + p.durationMs, 0) / history.length / 1e3).toFixed(1);
          const avgPeak = (history.reduce((a, p) => a + p.peak, 0) / history.length).toFixed(0);
          console.log(`  avg pulse duration    : ${avgDurS}s real`);
          console.log(`  avg pulse peak        : ${avgPeak}`);
        }
        console.groupEnd();
      });
      const integrationDrift = _totalMoneyChangedRev > 0 ? ((totalIntegrated - _totalMoneyChangedRev) / _totalMoneyChangedRev * 100).toFixed(1) : "n/a";
      const attributionDrift = _totalMoneyChangedRev > 0 ? ((totalAttributed - _totalMoneyChangedRev) / _totalMoneyChangedRev * 100).toFixed(1) : "n/a";
      console.log(`  \u2500\u2500 Totals cross-check \u2500\u2500`);
      console.log(`  MC total (ground truth)  : ${_totalMoneyChangedRev.toFixed(0)}`);
      console.log(`  integrated total (poll)  : ${totalIntegrated.toFixed(0)}  drift: ${integrationDrift}%`);
      console.log(`  attributed total (MC)    : ${totalAttributed.toFixed(0)}  drift: ${attributionDrift}%`);
      console.groupEnd();
    }
    _pollTimer2 = setInterval(tick, POLL_INTERVAL_MS2);
    _summaryTimer = setInterval(printSummary, SUMMARY_INTERVAL_MS);
    return {
      stop() {
        clearInterval(_pollTimer2);
        clearInterval(_summaryTimer);
        _pollTimer2 = null;
        _summaryTimer = null;
        console.log(`${TAG2} \u25A0 Revenue debug stopped.`);
      },
      summary() {
        printSummary();
      },
      /** Wipe all accumulated state — useful when loading a new city/save. */
      reset() {
        _routeStates = {};
        _totalMoneyChangedRev = 0;
        _moneyChangedEventCount = 0;
        _lastLineMetrics = [];
        console.log(`${TAG2} \u21BA State reset.`);
      },
      get states() {
        return _routeStates;
      },
      get mcTotal() {
        return _totalMoneyChangedRev;
      }
    };
  }

  // src/index.js
  var DEBUG_REVENUE = false;
  var api27 = window.SubwayBuilderAPI;
  var { React: React27 } = api27.utils;
  console.log(`${CONFIG.LOG_PREFIX} Advanced Analytics v${CONFIG.VERSION} initializing...`);
  var AdvancedAnalytics = {
    version: CONFIG.VERSION,
    api: api27,
    config: CONFIG,
    initialized: false,
    init() {
      console.log(`${CONFIG.LOG_PREFIX} [LC] init() called | initialized: ${this.initialized}`);
      if (!api27) {
        console.error(`${CONFIG.LOG_PREFIX} SubwayBuilderAPI not available`);
        return;
      }
      if (this.initialized) {
        console.log(`${CONFIG.LOG_PREFIX} [LC] init() skipped \u2014 already initialized`);
        return;
      }
      console.log(`${CONFIG.LOG_PREFIX} Architecture: Modular (17 files)`);
      console.log(`${CONFIG.LOG_PREFIX} UI: Dialog-based with JSX + Lite toolbar panel`);
      initLifecycleHooks(api27);
      function registerUI() {
        console.log(`${CONFIG.LOG_PREFIX} [LC] registerUI() called`);
        injectStyles();
        api27.ui.registerComponent("top-bar", {
          id: "aa-dialog-mount",
          component: Dashboard
        });
        api27.ui.registerComponent("top-bar", {
          id: "aa-route-dialog-mount",
          component: RouteDialog
        });
        api27.ui.registerComponent("top-bar", {
          id: "aa-portal-host",
          component: PortalHost
        });
        api27.ui.addButton("bottom-bar", {
          id: "advanced-analytics-btn",
          label: "AA Dashboard",
          icon: "ChartPie",
          onClick: () => {
            if (window.AdvancedAnalytics.toggleDialog) {
              window.AdvancedAnalytics.toggleDialog();
            }
          }
        });
        api27.ui.addFloatingPanel({
          id: "advanced-analytics-lite",
          title: "Advanced Analytics",
          icon: "ChartPie",
          width: 640,
          render: Panel
        });
        console.log(`${CONFIG.LOG_PREFIX} [LC] \u2713 Dialog component registered`);
        console.log(`${CONFIG.LOG_PREFIX} [LC] \u2713 Bottom bar button registered`);
        console.log(`${CONFIG.LOG_PREFIX} [LC] \u2713 Lite toolbar panel registered`);
      }
      api27.hooks.onMapReady(() => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onMapReady fired | storage: ${getStorage() ? getStorage().saveName : "null"}`);
        if (!getStorage()) {
          console.warn(`${CONFIG.LOG_PREFIX} [LC] onMapReady \u2014 storage null, subsequent load detected (API bug)`);
          handleMapReadyFallback(api27);
        }
        registerUI();
        if (DEBUG_REVENUE) {
          if (window.AdvancedAnalytics.revenueDebug) {
            window.AdvancedAnalytics.revenueDebug.stop();
          }
          window.AdvancedAnalytics.revenueDebug = startRevenueDebug(api27);
        }
      });
      api27.hooks.onGameLoaded(async (saveName) => {
        console.log(`${CONFIG.LOG_PREFIX} [LC] onGameLoaded (from index) fired | saveName: ${saveName}`);
      });
      this.initialized = true;
      console.log(`${CONFIG.LOG_PREFIX} [LC] init() complete`);
    }
  };
  window.AdvancedAnalytics = AdvancedAnalytics;
  if (api27) {
    AdvancedAnalytics.init();
  }
  var index_default = AdvancedAnalytics;
})();

if (window.SubwayBuilderAPI) { AdvancedAnalytics.init(); }
