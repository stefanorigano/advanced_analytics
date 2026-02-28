// AnalyticsSettingDialog component
// Dialog for managing saved analytics data: delete, export, import
// Now backed by IndexedDB via Storage static methods (no direct localStorage access)

import { CONFIG } from '../config.js';
import { Dialog } from './dialog.jsx';
import { SettingsTable } from './settings-table.jsx';
import { Storage } from '../core/storage.js';
import { getCurrentSaveName } from '../core/lifecycle.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function AnalyticsSettingDialog({ isOpen, onClose }) {
    const [tableData,           setTableData]           = React.useState([]);
    const [selectedIds,         setSelectedIds]         = React.useState([]);
    const [currentSaveName,     setCurrentSaveName]     = React.useState(null);
    const [showUnsavedWarning,  setShowUnsavedWarning]  = React.useState(false);
    const [storageInfo,         setStorageInfo]         = React.useState(null);
    const [isLoading,           setIsLoading]           = React.useState(false);

    // ── Load on open ────────────────────────────────────────────────────────
    React.useEffect(() => {
        if (!isOpen) return;
        loadStorageData();
    }, [isOpen]);

    // ── Helpers ─────────────────────────────────────────────────────────────
    const getCityName = (cityCode) => {
        if (!cityCode) return 'Unknown';
        const cities = api.utils.getCities();
        const city   = cities.find(c => c.code === cityCode);
        return city ? city.name : cityCode;
    };

    // ── Load all saves from IDB ─────────────────────────────────────────────
    const loadStorageData = async () => {
        setIsLoading(true);
        try {
            const saves  = await Storage.getAllSaves();
            const current = getCurrentSaveName();
            setCurrentSaveName(current);

            // Show warning if there's no active save name OR if the active
            // save name hasn't been committed to IDB yet (game not saved yet)
            setShowUnsavedWarning(!current || !saves[current]);

            // Build table rows
            const rows = await Promise.all(
                Object.entries(saves).map(async ([saveName, meta]) => {
                    // Load historical data to get day/route counts
                    const tempStorage = new Storage(saveName);
                    const historical  = await tempStorage.get('historicalData', { days: {} });
                    const dayKeys     = Object.keys(historical.days).map(Number).sort((a, b) => b - a);
                    const lastDay     = dayKeys[0];
                    const lastDayData = lastDay != null ? historical.days[lastDay] : null;
                    const dayCount    = dayKeys.length;

                    // For current save, prefer live game state values
                    let cityCode     = meta.cityCode;
                    let routeCount   = meta.routeCount;
                    let currentDay   = meta.day;

                    if (saveName === current) {
                        cityCode   = api.utils.getCityCode?.() || cityCode;
                        routeCount = api.gameState.getRoutes().length;
                        currentDay = api.gameState.getCurrentDay();
                    }

                    // Estimate size by serializing historical data
                    const sizeBytes = new Blob([JSON.stringify(historical)]).size;
                    const timestamp = lastDayData?.timestamp || Date.now();

                    return {
                        id:         saveName,
                        name:       saveName,
                        city:       getCityName(cityCode),
                        cityCode,
                        modified:   timestamp,
                        dayCount,
                        routeCount,
                        size:       sizeBytes,
                    };
                })
            );

            setTableData(rows);

            // Storage estimate
            const est = await Storage.estimateUsage();
            setStorageInfo(est);

        } catch (err) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to load storage data:`, err);
            setTableData([]);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Delete selected ─────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (selectedIds.length === 0) return;

        const deletingCurrent = currentSaveName && selectedIds.includes(currentSaveName);
        let message = `Delete ${selectedIds.length} save${selectedIds.length > 1 ? 's' : ''}?`;
        if (deletingCurrent) {
            message += '\n\n⚠️ WARNING: You are deleting the CURRENT save!\nAll data for this session will be lost.';
        }
        message += '\n\nThis action cannot be undone.';

        if (!window.confirm(message)) return;

        try {
            await Promise.all(selectedIds.map(id => Storage.deleteSave(id)));
            await loadStorageData();
            setSelectedIds([]);
            api.ui.showNotification(`Deleted ${selectedIds.length} save${selectedIds.length > 1 ? 's' : ''}`, 'success');
        } catch (err) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to delete saves:`, err);
            api.ui.showNotification('Failed to delete saves', 'error');
        }
    };

    // ── Delete all except current ────────────────────────────────────────────
    const handleDeleteAllExceptCurrent = async () => {
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
        if (!window.confirm(message)) return;

        try {
            const toDelete = tableData
                .filter(row => row.id !== currentSaveName)
                .map(row => row.id);

            await Promise.all(toDelete.map(id => Storage.deleteSave(id)));
            await loadStorageData();
            setSelectedIds([]);
            api.ui.showNotification(`Deleted ${othersCount} saves`, 'success');
        } catch (err) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to clean up saves:`, err);
            api.ui.showNotification('Failed to clean up saves', 'error');
        }
    };

    // ── Export selected ─────────────────────────────────────────────────────
    const handleExport = async () => {
        if (selectedIds.length === 0) return;

        try {
            const saves = await Storage.getAllSaves();

            const exportPayload = {
                version:    CONFIG.VERSION,
                exportDate: Date.now(),
                saves:      {},
            };

            await Promise.all(selectedIds.map(async id => {
                exportPayload.saves[id] = {
                    metadata: saves[id] || {},
                    data:     await Storage.exportSave(id),
                };
            }));

            const blob = new Blob(
                [JSON.stringify(exportPayload, null, 2)],
                { type: 'application/json' }
            );
            const url = URL.createObjectURL(blob);
            const a   = document.createElement('a');
            a.href     = url;
            a.download = `analytics-export-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            api.ui.showNotification(`Exported ${selectedIds.length} save${selectedIds.length > 1 ? 's' : ''}`, 'success');
        } catch (err) {
            console.error(`${CONFIG.LOG_PREFIX} Failed to export saves:`, err);
            api.ui.showNotification('Failed to export saves', 'error');
        }
    };

    // ── Import ──────────────────────────────────────────────────────────────
    const handleImport = () => {
        const input    = document.createElement('input');
        input.type     = 'file';
        input.accept   = 'application/json,.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text        = await file.text();
                const importData  = JSON.parse(text);

                // Validate structure
                if (!importData.saves || typeof importData.saves !== 'object') {
                    throw new Error('Invalid export file format');
                }

                const existingSaves = await Storage.getAllSaves();
                const overwrites    = [];

                for (const importName of Object.keys(importData.saves)) {
                    if (existingSaves[importName]) {
                        overwrites.push(importName);
                    }
                }

                if (overwrites.length > 0) {
                    const msg = `The following saves will be OVERWRITTEN:\n${overwrites.map(n => `  • ${n}`).join('\n')}\n\nContinue with import?`;
                    if (!window.confirm(msg)) return;
                }

                // Import each save
                await Promise.all(
                    Object.entries(importData.saves).map(([saveName, savePayload]) => {
                        const metadata = savePayload.metadata || {};
                        const data     = savePayload.data     || savePayload; // backward compat
                        return Storage.importSave(saveName, data, metadata);
                    })
                );

                await loadStorageData();
                const count = Object.keys(importData.saves).length;
                api.ui.showNotification(`Imported ${count} save${count > 1 ? 's' : ''}`, 'success');

            } catch (err) {
                console.error(`${CONFIG.LOG_PREFIX} Failed to import saves:`, err);
                api.ui.showNotification('Failed to import saves. Invalid file format.', 'error');
            }
        };

        input.click();
    };

    // ── Table columns ────────────────────────────────────────────────────────
    const columns = [
        { key: 'name',       label: 'Save Name', align: 'left' },
        { key: 'city',       label: 'City',      align: 'right' },
        {
            key: 'modified', label: 'Modified',  align: 'right',
            render: (ts) => new Date(ts).toLocaleString(),
        },
        {
            key: 'dayCount', label: 'Days',      align: 'right',
            render: (n) => n.toLocaleString(),
        },
        {
            key: 'routeCount', label: 'Routes',  align: 'right',
            render: (n) => n.toLocaleString(),
        },
        {
            key: 'size', label: 'Size', align: 'right',
            render: (bytes) => {
                if (bytes < 1024)             return `${bytes} B`;
                if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
                return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            },
        },
    ];

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <Dialog
            id="aa-settings-dialog"
            title="Storage Management"
            isOpen={isOpen}
            onClose={onClose}
            size='85vw'
        >
            {/* Action buttons */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-4">
                <div className="flex items-center justify-between gap-2">
                    {/* Left — selection actions */}
                    <div className="flex items-center gap-2">
                        {selectedIds.length > 0 ? (
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
                        ) : (
                            <span className="text-xs text-muted-foreground">
                                Select saves to delete or export
                            </span>
                        )}
                    </div>

                    {/* Right — global actions */}
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
                                Save the game first so the current session can be tracked and managed here.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                    <icons.Loader2 size={16} className="animate-spin mr-2" />
                    Loading saves…
                </div>
            )}

            {/* Table */}
            {!isLoading && (
                <div className="overflow-auto rounded-lg border border-border">
                    <SettingsTable
                        data={tableData}
                        columns={columns}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        currentId={currentSaveName}
                    />
                </div>
            )}

            {/* Storage info */}
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-start gap-2">
                    <icons.Info size={16} className="mt-0.5 text-muted-foreground shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p><strong>Total saves:</strong> {tableData.length}</p>
                        <p>
                            <strong>Total data size:</strong>{' '}
                            {(() => {
                                const total = tableData.reduce((s, r) => s + r.size, 0);
                                if (total < 1024)        return `${total} B`;
                                if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
                                return `${(total / (1024 * 1024)).toFixed(1)} MB`;
                            })()}
                        </p>
                        {storageInfo && (
                            <p>
                                <strong>IndexedDB usage:</strong>{' '}
                                {storageInfo.usedMB} MB / {storageInfo.quotaMB} MB ({storageInfo.pct})
                                <div className="mt-1.5 pt-2 relative pt-2 bg-background border rounded overflow-hidden">
                                    <span
                                        className="absolute left-0 bottom-0 h-full bg-destructive"
                                        style={{width: storageInfo.pct}}
                                    />
                                </div>
                            </p>
                        )}
                        <p className="pt-2 border-t border-border/50">
                            Data is stored in IndexedDB — no practical size limit for analytics data.
                            Use export to back up saves externally.
                        </p>
                    </div>
                </div>
            </div>
        </Dialog>
    );
}
