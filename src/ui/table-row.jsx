// Table row component
// Renders a single table row with all cells

import { CONFIG } from '../config.js';
import { RouteBadge } from './route-badge.jsx';
import { formatCurrency, formatCurrencyCompact, formatCurrencyFull, calculateTotalTrains } from '../utils/formatting.js';
import { getCellClasses } from '../utils/sorting.js';
import { getUtilizationClasses, getComparisonColorClass, getComparisonArrow } from '../utils/colors.js';

import { Tooltip } from './tooltip.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function TableRow({ row, sortState, groups = ['trains', 'finance', 'performance'], groupState, compareShowPercentages = true }) {
    const isDeleted = row.deleted === true;
    
    // Helper to check if a column should be visible
    const isColumnVisible = (group) => {
        if (!group) return true; // No group = always visible
        return groups.includes(group);
    };
    
    // Handle route name click - fly to first station
    const handleNameClick = () => {
        if (isDeleted) return;
        
        const route = api.gameState.getRoutes().find(r => r.id === row.id);
        if (route && route.stations && route.stations[0]) {
            const station = api.gameState.getStations().find(s => s.id === route.stations[0]);
            if (station) {
                const map = api.utils.getMap();
                if (map) {
                    map.flyTo({
                        center: station.coords,
                        zoom: 14,
                        duration: 1000
                    });
                }
            }
        }
    };
    
    return (
        <tr className={`text-xs border-b border-border hover:bg-muted/50 transition-colors ${isDeleted ? 'opacity-70' : ''}`}>
            {/* Name cell - always visible */}
            <td
                className={`px-3 py-2 align-middle text-left ${isDeleted ? '' : 'cursor-pointer hover:text-primary'} transition-colors ${getCellClasses('name', sortState, groupState)}`}
                onClick={handleNameClick}
            >
                <div className="font-medium text-right">
                    <RouteBadge routeId={row.id} size="1.4rem" />
                    {isDeleted && <span className="ml-2 text-xs text-muted-foreground">(Deleted)</span>}
                </div>
            </td>
            
            {/* Ridership - performance */}
            {isColumnVisible('performance') && (
                <MetricCell
                    columnKey="ridership"
                    value={row.ridership}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.ridership}
                    secondaryValue={row.secondaryValues?.ridership}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="performance"
                    formatter={(v) => v.toLocaleString(undefined, {maximumFractionDigits: 0})}
                />
            )}
            
            {/* Capacity - trains */}
            {isColumnVisible('trains') && (
                <MetricCell
                    columnKey="capacity"
                    value={row.capacity}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.capacity}
                    secondaryValue={row.secondaryValues?.capacity}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="trains"
                    formatter={(v) => v.toLocaleString(undefined, {maximumFractionDigits: 0})}
                />
            )}
            
            {/* Utilization - performance */}
            {isColumnVisible('performance') && (
                row.isComparison ? (
                    <ComparisonCell
                        columnKey="utilization"
                        value={row.utilization}
                        primaryValue={row.primaryValues?.utilization}
                        secondaryValue={row.secondaryValues?.utilization}
                        showPercentages={true}
                        sortState={sortState}
                        groupState={groupState}
                        group="performance"
                    />
                ) : (
                    <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getUtilizationClasses(row.utilization)} ${getCellClasses('utilization', sortState, groupState, 'performance')}`}>
                        {row.utilization}%
                    </td>
                )
            )}
            
            {/* Stations - trains */}
            {isColumnVisible('trains') && (
                <MetricCell
                    columnKey="stations"
                    value={row.stations}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.stations}
                    secondaryValue={row.secondaryValues?.stations}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="trains"
                    formatter={(v) => String(v)}
                />
            )}

            {/* Train Type - trains */}
            {isColumnVisible('trains') && (
                <td className={`px-3 py-2 align-middle text-right ${getCellClasses('trainType', sortState, groupState, 'trains')}`}>
                    {(() => {
                        const route = api.gameState.getRoutes().find(r => r.id === row.id);
                        const trainTypeInfo = route ? getTrainTypeInfo(route) : null;
                        
                        if (!trainTypeInfo) {
                            return <span className="text-muted-foreground">n/a</span>;
                        }
                        
                        return (
                            <span className="whitespace-nowrap flex items-center justify-end gap-1.5" title={trainTypeInfo.description}>
                                <span class="text-xs">{trainTypeInfo.name}</span>
                                <span 
                                    className="aspect-square inline-block rounded-full w-2" 
                                    style={{ background: trainTypeInfo.color }}
                                />
                            </span>
                        );
                    })()}
                </td>
            )}
            
            {/* Train Schedule - trains */}
            {isColumnVisible('trains') && (
                row.isComparison ? (
                    <ComparisonCell
                        columnKey="trainSchedule"
                        value={row.trainSchedule}
                        primaryValue={row.primaryValues?.trainSchedule}
                        secondaryValue={row.secondaryValues?.trainSchedule}
                        showPercentages={compareShowPercentages}
                        sortState={sortState}
                        groupState={groupState}
                        group="trains"
                    />
                ) : (
                    <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses('trainSchedule', sortState, groupState, 'trains')}`}>
                        <Tooltip
                            side="left"
                            delayDuration={200}
                            content={
                                <div className="space-y-1">
                                    <div><span className={CONFIG.COLORS.TRAINS.HIGH}>High Demand</span>: {row.trainsHigh}</div>
                                    <div><span className={CONFIG.COLORS.TRAINS.MEDIUM}>Medium Demand</span>: {row.trainsMedium}</div>
                                    <div><span className={CONFIG.COLORS.TRAINS.LOW}>Low Demand</span>: {row.trainsLow}</div>
                                </div>
                            }
                        >
                            <span className="font-bold cursor-help">
                                {calculateTotalTrains(row)}
                            </span>
                        </Tooltip>
                    </td>
                )
            )}
            
            {/* Transfers - trains */}
            {isColumnVisible('trains') && (
                row.isComparison ? (
                    <ComparisonCell
                        columnKey="transfers"
                        value={row.transfers}
                        primaryValue={row.primaryValues?.transfers?.count}
                        secondaryValue={row.secondaryValues?.transfers?.count}
                        showPercentages={compareShowPercentages}
                        sortState={sortState}
                        groupState={groupState}
                        group="trains"
                    />
                ) : (
                    <td className={`px-3 py-2 align-middle text-right ${getCellClasses('transfers', sortState, groupState, 'trains')}`}>
                        {row.transfers?.count === 0 ? (
                            <span className="font-mono text-xs">0</span>
                        ) : (
                            <Tooltip
                                side="left"
                                delayDuration={200}
                                content={
                                    <div className="flex items-center gap-1">
                                        {row.transfers.routeIds?.map((routeId) => (
                                            <RouteBadge key={routeId} routeId={routeId} size="1.4rem" />
                                        ))}
                                    </div>
                                }
                            >
                                <span className="font-bold font-mono cursor-help">
                                    {row.transfers.count}
                                </span>
                            </Tooltip>
                        )}
                    </td>
                )
            )}
            
            {/* Daily Cost - finance */}
            {isColumnVisible('finance') && (
                <MetricCell
                    columnKey="dailyCost"
                    value={row.dailyCost}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.dailyCost}
                    secondaryValue={row.secondaryValues?.dailyCost}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="finance"
                    formatter={formatCurrencyCompact}
                    useCompactTooltip={true}
                />
            )}
            
            {/* Daily Revenue - finance */}
            {isColumnVisible('finance') && (
                <MetricCell
                    columnKey="dailyRevenue"
                    value={row.dailyRevenue}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.dailyRevenue}
                    secondaryValue={row.secondaryValues?.dailyRevenue}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="finance"
                    formatter={formatCurrencyCompact}
                    useCompactTooltip={true}
                />
            )}
            
            {/* Daily Profit - finance */}
            {isColumnVisible('finance') && (
                <ProfitCell
                    columnKey="dailyProfit"
                    value={row.dailyProfit}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.dailyProfit}
                    secondaryValue={row.secondaryValues?.dailyProfit}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="finance"
                    useCompactTooltip={true}
                />
            )}
            
            {/* Profit per Passenger - performance */}
            {isColumnVisible('performance') && (
                <ProfitCell
                    columnKey="profitPerPassenger"
                    value={row.profitPerPassenger}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.profitPerPassenger}
                    secondaryValue={row.secondaryValues?.profitPerPassenger}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="performance"
                    decimals={2}
                    useCompactTooltip={false}
                />
            )}
            
            {/* Profit per Train - performance */}
            {isColumnVisible('performance') && (
                <ProfitCell
                    columnKey="profitPerTrain"
                    value={row.profitPerTrain}
                    isComparison={row.isComparison}
                    primaryValue={row.primaryValues?.profitPerTrain}
                    secondaryValue={row.secondaryValues?.profitPerTrain}
                    showPercentages={compareShowPercentages}
                    sortState={sortState}
                    groupState={groupState}
                    group="performance"
                    decimals={2}
                    useCompactTooltip={true}
                />
            )}
        </tr>
    );
}

// Generic metric cell component
function MetricCell({ columnKey, value, isComparison, primaryValue, secondaryValue, showPercentages, sortState, groupState, group, formatter, useCompactTooltip = false }) {
    if (isComparison) {
        return (
            <ComparisonCell
                columnKey={columnKey}
                value={value}
                primaryValue={primaryValue}
                secondaryValue={secondaryValue}
                showPercentages={showPercentages}
                sortState={sortState}
                groupState={groupState}
                group={group}
                formatter={formatter}
                useCompactTooltip={useCompactTooltip}
            />
        );
    }
    
    const displayValue = formatter ? formatter(value) : value;
    
    // Show tooltip for large currency values
    if (useCompactTooltip && Math.abs(value) >= 100000) {
        return (
            <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                <Tooltip side="left" delayDuration={200} content={<p className="text-xs font-mono">{formatCurrencyFull(value, 0)}</p>}>
                    <span className="cursor-help">{displayValue}</span>
                </Tooltip>
            </td>
        );
    }

    return (
        <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
            {displayValue}
        </td>
    );
}

// Profit cell (shows negative in red)
function ProfitCell({ columnKey, value, isComparison, primaryValue, secondaryValue, showPercentages, sortState, groupState, group, decimals = 0, useCompactTooltip = false }) {
    if (isComparison) {
        return (
            <ComparisonCell
                columnKey={columnKey}
                value={value}
                primaryValue={primaryValue}
                secondaryValue={secondaryValue}
                showPercentages={showPercentages}
                sortState={sortState}
                groupState={groupState}
                group={group}
                formatter={(v) => formatCurrencyCompact(v, decimals)}
                useCompactTooltip={useCompactTooltip}
            />
        );
    }
    
    const isNegative = value < 0;
    const colorClass = isNegative ? CONFIG.COLORS.VALUE.NEGATIVE : CONFIG.COLORS.VALUE.DEFAULT;
    const displayValue = formatCurrencyCompact(value, decimals);
    
    // Show tooltip for large currency values
    if (useCompactTooltip && Math.abs(value) >= 100000) {
        return (
            <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                <Tooltip side="left" delayDuration={200} content={<p className="text-xs font-mono">{formatCurrencyFull(value, decimals)}</p>}>
                    <span className={`${colorClass} cursor-help`}>{displayValue}</span>
                </Tooltip>
            </td>
        );
    }

    return (
        <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
            <div className={colorClass}>{displayValue}</div>
        </td>
    );
}

// Comparison cell component
function ComparisonCell({ columnKey, value, primaryValue, secondaryValue, showPercentages, sortState, groupState, group, formatter, useCompactTooltip = false }) {
    // Handle special cases
    if (value === 'NEW') {
        return (
            <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                <span className={CONFIG.COLORS.COMPARE.NEW}>NEW</span>
            </td>
        );
    }
    
    if (value === 'DELETED') {
        return (
            <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                <span className={CONFIG.COLORS.COMPARE.DELETED}>(Deleted)</span>
            </td>
        );
    }
    
    // Handle comparison object
    if (value && typeof value === 'object') {
        const { type, value: percentValue, isImprovement } = value;
        
        if (type === 'new') {
            return (
                <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                    <span className={CONFIG.COLORS.COMPARE.NEW}>NEW</span>
                </td>
            );
        }
        
        if (type === 'zero' || percentValue === 0) {
            return (
                <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                    <span className={CONFIG.COLORS.COMPARE.NEUTRAL}>=</span>
                </td>
            );
        }
        
        const colorClass = getComparisonColorClass(type, isImprovement);
        const arrow = getComparisonArrow(percentValue);
        
        // Show absolute delta instead of percentages
        if (!showPercentages && primaryValue !== undefined && secondaryValue !== undefined) {
            const delta = primaryValue - secondaryValue;
            const prefix = percentValue > 0 ? '+' : '-';
            const absDelta = Math.abs(delta);
            
            // Check if this is a finance column (needs $ prefix)
            const isFinanceColumn = ['dailyCost', 'dailyRevenue', 'dailyProfit', 'profitPerPassenger', 'profitPerTrain'].includes(columnKey);
            
            if (isFinanceColumn) {
                // Use compact format for deltas >= 100k
                let displayValue;
                if (absDelta >= 100000) {
                    const millions = absDelta / 1000000;
                    displayValue = `${prefix}${millions.toFixed(2)}M ${arrow}`;
                } else {
                    const decimals = ['profitPerPassenger', 'profitPerTrain'].includes(columnKey) ? 2 : 0;
                    const formattedDelta = absDelta.toLocaleString(undefined, {
                        minimumFractionDigits: decimals,
                        maximumFractionDigits: decimals
                    });
                    displayValue = `${prefix}$${formattedDelta} ${arrow}`;
                }
                
                // Show tooltip for large deltas
                if (useCompactTooltip && absDelta >= 100000) {
                    const decimals = ['profitPerPassenger', 'profitPerTrain'].includes(columnKey) ? 2 : 0;
                    const fullDelta = formatCurrencyFull(delta, decimals);
                    
                    return (
                        <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                            <Tooltip side="left" delayDuration={200} content={<p className="text-xs font-mono">{fullDelta}</p>}>
                                <span className={`${colorClass} cursor-help`}>{displayValue}</span>
                            </Tooltip>
                        </td>
                    );
                }
                
                return (
                    <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                        <span className={colorClass}>{displayValue}</span>
                    </td>
                );
            }
            
            // Non-finance columns (no compact format needed)
            const decimals = ['profitPerPassenger', 'profitPerTrain'].includes(columnKey) ? 2 : 0;
            const formattedDelta = absDelta.toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
            const displayValue = `${prefix}${formattedDelta} ${arrow}`;
            
            return (
                <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                    <span className={colorClass}>{displayValue}</span>
                </td>
            );
        }
        
        // Show percentages (default)
        const displayValue = `${percentValue > 0 ? '+' : ''}${percentValue.toFixed(1)}% ${arrow}`;
        
        return (
            <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
                <span className={colorClass}>{displayValue}</span>
            </td>
        );
    }
    
    // Fallback
    return (
        <td className={`whitespace-nowrap px-3 py-2 align-middle text-right font-mono ${getCellClasses(columnKey, sortState, groupState, group)}`}>
            -
        </td>
    );
}

/**
 * Get train type information for a route
 * @param {Object} route - The route object
 * @returns {Object|null} Train type info with name, description, and color
 */
function getTrainTypeInfo(route) {
    const api = window.SubwayBuilderAPI;
    
    if (!route.trainType) {
        return null;
    }
    
    const trainType = api.trains.getTrainType(route.trainType);
    
    if (!trainType) {
        return null;
    }
    
    return {
        name: trainType.name,
        description: trainType.description,
        color: trainType.appearance?.color || '#666666'
    };
}
