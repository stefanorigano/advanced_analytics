// AnalyticsSettingDialog component
// Dialog for managing saved analytics data with delete, export, import

import { CONFIG } from '../config.js';
import { Dialog } from './dialog.jsx';
import { SettingsTable } from './settings-table.jsx';
import { getCurrentSaveName } from '../core/lifecycle.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function AnalyticsSettingDialog({ isOpen, onClose }) {
    const [tableData, setTableData] = React.useState([]);
    const [selectedIds, setSelectedIds] = React.useState([]);
    const [currentSaveName, setCurrentSaveName] = React.useState(null);
    const [showUnsavedWarning, setShowUnsavedWarning] = React.useState(false);
    
    // Load data when dialog opens
    React.useEffect(() => {
        if (!isOpen) return;
        
        loadStorageData();
    }, [isOpen]);
    
    // Get city name from city code
    const getCityName = (cityCode) => {
        if (!cityCode) return 'Unknown';
        
        const cities = api.utils.getCities();
        const city = cities.find(c => c.code === cityCode);
        return city ? city.name : cityCode;
    };
    
    // Load and process storage data
    const loadStorageData = () => {
        try {
            const stored = localStorage.getItem('AdvancedAnalytics');
            if (!stored) {
                setTableData([]);
                checkUnsavedStatus();
                return;
            }
            
            const storageData = JSON.parse(stored);
            const saves = storageData.saves || {};
            
            // Get current save name from lifecycle module
            const current = getCurrentSaveName();
            setCurrentSaveName(current);
            
            // Check if we should show unsaved warning
            checkUnsavedStatus(current, saves);
            
            // Process each save
            const processed = Object.entries(saves).map(([saveName, saveData]) => {
                // Get historical data (check both working and shared locations)
                const workingData = saveData.working || {};
                const historicalData = workingData.historicalData || saveData.historicalData || { days: {} };
                const dayCount = Object.keys(historicalData.days).length;
                
                // Get last day for route count
                const days = Object.keys(historicalData.days).map(Number).sort((a, b) => b - a);
                const lastDay = days[0];
                const lastDayData = lastDay && historicalData.days[lastDay];
                const routeCount = lastDayData ? lastDayData.routes.length : 0;
                
                // Get metadata - refresh from live game state if this is current session
                let cityCode = saveData.cityCode;
                let currentRouteCount = saveData.routeCount;
                let currentDay = saveData.day;
                let currentStationCount = saveData.stationCount;
                
                if (saveName === current) {
                    // This is current session - use live data for better display
                    cityCode = api.utils.getCityCode?.() || cityCode;
                    currentRouteCount = api.gameState.getRoutes().length;
                    currentDay = api.gameState.getCurrentDay();
                    currentStationCount = api.gameState.getStations().length;
                }
                
                // Estimate size
                const saveSize = new Blob([JSON.stringify(saveData)]).size;
                
                // Get timestamp (use most recent day's timestamp or current time)
                const timestamp = lastDayData?.timestamp || Date.now();
                
                return {
                    id: saveName,
                    name: saveName,
                    city: getCityName(cityCode),
                    cityCode: cityCode,
                    modified: timestamp,
                    dayCount,
                    routeCount: currentRouteCount,
                    size: saveSize
                };
            });
            
            setTableData(processed);
            
        } catch (error) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to load storage data:`, error);
            setTableData([]);
            checkUnsavedStatus();
        }
    };
    
    // Check if we should show unsaved warning
    const checkUnsavedStatus = (current = null, saves = {}) => {
        const saveName = current || getCurrentSaveName();
        
        // If no current save name, show warning
        if (!saveName) {
            setShowUnsavedWarning(true);
            return;
        }
        
        // If current save exists in storage, don't show warning
        if (saves[saveName]) {
            setShowUnsavedWarning(false);
            return;
        }
        
        // Current save name exists but not in storage yet (new game saved)
        setShowUnsavedWarning(false);
    };
    
    // Handle delete selected saves
    const handleDelete = () => {
        if (selectedIds.length === 0) return;
        
        // Check if current save is selected
        const deletingCurrent = currentSaveName && selectedIds.includes(currentSaveName);
        
        // Build confirmation message
        let message = `Delete ${selectedIds.length} save${selectedIds.length > 1 ? 's' : ''}?`;
        if (deletingCurrent) {
            message += '\n\n⚠️ WARNING: You are deleting the CURRENT save!';
            message += '\nAll data for this session will be lost.';
        }
        message += '\n\nThis action cannot be undone.';
        
        const confirmed = window.confirm(message);
        if (!confirmed) return;
        
        try {
            const stored = localStorage.getItem('AdvancedAnalytics');
            if (!stored) return;
            
            const storageData = JSON.parse(stored);
            
            // Delete selected saves
            selectedIds.forEach(id => {
                delete storageData.saves[id];
            });
            
            // Save back to localStorage
            localStorage.setItem('AdvancedAnalytics', JSON.stringify(storageData));
            
            // Reload table data
            loadStorageData();
            
            // Clear selection
            setSelectedIds([]);
            
            // Show notification
            api.ui.showNotification(
                `Deleted ${selectedIds.length} save${selectedIds.length > 1 ? 's' : ''}`,
                'success'
            );
            
        } catch (error) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to delete saves:`, error);
            api.ui.showNotification('Failed to delete saves', 'error');
        }
    };
    
    // Handle delete all except current
    const handleDeleteAllExceptCurrent = () => {
        if (!currentSaveName) {
            api.ui.showNotification('No current save to keep', 'error');
            return;
        }
        
        const othersCount = tableData.filter(row => row.id !== currentSaveName).length;
        if (othersCount === 0) {
            api.ui.showNotification('No other saves to delete', 'info');
            return;
        }
        
        const message = `Delete all ${othersCount} saves except "${currentSaveName}"?\n\nThis action cannot be undone.`;
        const confirmed = window.confirm(message);
        if (!confirmed) return;
        
        try {
            const stored = localStorage.getItem('AdvancedAnalytics');
            if (!stored) return;
            
            const storageData = JSON.parse(stored);
            
            // Keep only current save
            const newSaves = {};
            if (storageData.saves[currentSaveName]) {
                newSaves[currentSaveName] = storageData.saves[currentSaveName];
            }
            
            storageData.saves = newSaves;
            
            // Save back
            localStorage.setItem('AdvancedAnalytics', JSON.stringify(storageData));
            
            // Reload
            loadStorageData();
            setSelectedIds([]);
            
            api.ui.showNotification(`Deleted ${othersCount} saves`, 'success');
            
        } catch (error) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to clean up saves:`, error);
            api.ui.showNotification('Failed to clean up saves', 'error');
        }
    };
    
    // Handle export selected saves
    const handleExport = () => {
        if (selectedIds.length === 0) return;
        
        try {
            const stored = localStorage.getItem('AdvancedAnalytics');
            if (!stored) return;
            
            const storageData = JSON.parse(stored);
            
            // Build export data
            const exportData = {
                version: CONFIG.VERSION,
                exportDate: Date.now(),
                saves: {}
            };
            
            selectedIds.forEach(id => {
                if (storageData.saves[id]) {
                    exportData.saves[id] = storageData.saves[id];
                }
            });
            
            // Create blob and download
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
                type: 'application/json' 
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analytics-export-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            api.ui.showNotification(
                `Exported ${selectedIds.length} save${selectedIds.length > 1 ? 's' : ''}`,
                'success'
            );
            
        } catch (error) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to export saves:`, error);
            api.ui.showNotification('Failed to export saves', 'error');
        }
    };
    
    // Find potential matches for import conflict detection
    const findPotentialMatches = (importSaveName, importSaveData, existingSaves) => {
        const matches = [];
        
        const importMetadata = {
            cityCode: importSaveData.cityCode,
            routeCount: importSaveData.routeCount,
            day: importSaveData.day,
            stationCount: importSaveData.stationCount
        };
        
        for (const [existingName, existingData] of Object.entries(existingSaves)) {
            // Check if ALL criteria match
            if (existingName === importSaveName &&
                existingData.cityCode === importMetadata.cityCode &&
                existingData.routeCount === importMetadata.routeCount &&
                existingData.day === importMetadata.day &&
                existingData.stationCount === importMetadata.stationCount) {
                matches.push(existingName);
            }
        }
        
        return matches;
    };
    
    // Handle import saves
    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const importData = JSON.parse(text);
                
                // Validate structure
                if (!importData.saves || typeof importData.saves !== 'object') {
                    throw new Error('Invalid export file format');
                }
                
                // Get current storage
                const stored = localStorage.getItem('AdvancedAnalytics');
                const storageData = stored ? JSON.parse(stored) : { saves: {} };
                
                // Check for conflicts and ambiguities
                const conflictInfo = [];
                
                for (const [importName, importSave] of Object.entries(importData.saves)) {
                    const matches = findPotentialMatches(importName, importSave, storageData.saves);
                    
                    if (matches.length > 1) {
                        // Ambiguous - multiple matches
                        conflictInfo.push({
                            name: importName,
                            type: 'ambiguous',
                            matches: matches
                        });
                    } else if (matches.length === 1) {
                        // Single match - will overwrite
                        conflictInfo.push({
                            name: importName,
                            type: 'overwrite',
                            matches: matches
                        });
                    }
                    // No matches - will create new
                }
                
                // Handle conflicts
                if (conflictInfo.length > 0) {
                    let message = 'Import conflicts detected:\n\n';
                    
                    const overwrites = conflictInfo.filter(c => c.type === 'overwrite');
                    const ambiguous = conflictInfo.filter(c => c.type === 'ambiguous');
                    
                    if (overwrites.length > 0) {
                        message += 'The following saves will be OVERWRITTEN:\n';
                        overwrites.forEach(c => {
                            message += `  • ${c.name}\n`;
                        });
                        message += '\n';
                    }
                    
                    if (ambiguous.length > 0) {
                        message += '⚠️ AMBIGUOUS MATCHES (multiple saves match criteria):\n';
                        ambiguous.forEach(c => {
                            message += `  • ${c.name} matches: ${c.matches.join(', ')}\n`;
                        });
                        message += '\n';
                        message += 'Import cannot proceed with ambiguous matches.\n';
                        message += 'Please rename or delete conflicting saves first.';
                        
                        alert(message);
                        return;
                    }
                    
                    message += 'Continue with import?';
                    
                    if (!window.confirm(message)) return;
                }
                
                // Merge saves
                Object.assign(storageData.saves, importData.saves);
                
                // Save back
                localStorage.setItem('AdvancedAnalytics', JSON.stringify(storageData));
                
                // Reload
                loadStorageData();
                
                const importCount = Object.keys(importData.saves).length;
                api.ui.showNotification(
                    `Imported ${importCount} save${importCount > 1 ? 's' : ''}`,
                    'success'
                );
                
            } catch (error) {
                console.error(`${CONFIG.LOG_PREFIX} Failed to import saves:`, error);
                api.ui.showNotification('Failed to import saves. Invalid file format.', 'error');
            }
        };
        
        input.click();
    };
    
    // Table columns
    const columns = [
        {
            key: 'name',
            label: 'Save Name',
            align: 'left'
        },
        {
            key: 'city',
            label: 'City',
            align: 'right'
        },
        {
            key: 'modified',
            label: 'Modified',
            align: 'right',
            render: (timestamp) => {
                const date = new Date(timestamp);
                return date.toLocaleString();
            }
        },
        {
            key: 'dayCount',
            label: 'Days',
            align: 'right',
            render: (count) => count.toLocaleString()
        },
        {
            key: 'routeCount',
            label: 'Routes',
            align: 'right',
            render: (count) => count.toLocaleString()
        },
        {
            key: 'size',
            label: 'Size',
            align: 'right',
            render: (bytes) => {
                if (bytes < 1024) return `${bytes} B`;
                if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            }
        }
    ];
    
    return (
        <Dialog
            id="aa-settings-dialog"
            title="Storage Management"
            isOpen={isOpen}
            onClose={onClose}
        >
            {/* Action buttons */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-4">
                <div className="flex items-center justify-between gap-2">
                    {/* Left side - selection actions */}
                    <div className="flex items-center gap-2">
                        {selectedIds.length > 0 && (
                            <>
                                <button
                                    onClick={handleDelete}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90"
                                >
                                    <icons.Trash2 size={14} />
                                    <span>Delete ({selectedIds.length})</span>
                                </button>
                                
                                <button
                                    onClick={handleExport}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input"
                                >
                                    <icons.Upload size={14} />
                                    <span>Export ({selectedIds.length})</span>
                                </button>
                            </>
                        )}
                        
                        {selectedIds.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                                Select saves to delete or export
                            </span>
                        )}
                    </div>
                    
                    {/* Right side - global actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDeleteAllExceptCurrent}
                            disabled={!currentSaveName}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete all saves except current"
                        >
                            <icons.Trash2 size={14} />
                            <span>Clear All Except Current</span>
                        </button>
                        
                        <button
                            onClick={handleImport}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                        >
                            <icons.Download size={14} />
                            <span>Import</span>
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Unsaved warning */}
            {showUnsavedWarning && (
                <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-start gap-2">
                        <icons.AlertTriangle size={16} className="mt-0.5 text-amber-500 shrink-0" />
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                            <strong>Current session data not identifiable</strong>
                            <p className="mt-1">
                                You need to save the game first before the current session data can be tracked and managed here.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Table */}
            <div className="overflow-auto rounded-lg border border-border">
                <SettingsTable
                    data={tableData}
                    columns={columns}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    currentId={currentSaveName}
                />
            </div>
            
            {/* Storage info */}
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-start gap-2">
                    <icons.Info size={16} className="mt-0.5 text-muted-foreground shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p>
                            <strong>Total saves:</strong> {tableData.length}
                        </p>
                        <p>
                            <strong>Total size:</strong>{' '}
                            {(() => {
                                const totalBytes = tableData.reduce((sum, row) => sum + row.size, 0);
                                if (totalBytes < 1024) return `${totalBytes} B`;
                                if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
                                return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
                            })()}
                        </p>
                        <p className="pt-2 border-t border-border/50">
                            LocalStorage typically has a limit of 5-10 MB per domain. 
                            Use export to backup your data externally.
                        </p>
                    </div>
                </div>
            </div>
        </Dialog>
    );
}
