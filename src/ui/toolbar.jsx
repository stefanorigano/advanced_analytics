// Toolbar component
// Top toolbar with filters, timeframe selection, and compare mode

import { CONFIG } from '../config.js';
import { formatDayLabel, getAvailableDays } from '../utils/formatting.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function Toolbar({
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
    const btnBaseClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border';
    const btnClasses = 'bg-background hover:bg-accent hover:text-accent-foreground border-input';
    const btnActiveClasses = 'bg-primary text-primary-foreground border-primary hover:bg-primary/90';
    
    const allDays = getAvailableDays(historicalData);
    const mostRecentDay = allDays[0];
    const availableDays = allDays.filter(day => day < mostRecentDay);
    const hasOtherDays = availableDays.length > 0;
    
    return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
            {/* Left side - Filter buttons */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground mr-1">Metrics:</span>
                
                <button
                    className={`${btnBaseClasses} ${groupState.trains ? btnActiveClasses : btnClasses}`}
                    onClick={() => onGroupChange('trains')}
                    title="Toggle Train Metrics"
                >
                    <icons.Train size={14} />
                    <span>Trains</span>
                </button>
                
                <button
                    className={`${btnBaseClasses} ${groupState.finance ? btnActiveClasses : btnClasses}`}
                    onClick={() => onGroupChange('finance')}
                    title="Toggle Finance Metrics"
                >
                    <icons.DollarSign size={14} />
                    <span>Finance</span>
                </button>
                
                <button
                    className={`${btnBaseClasses} ${groupState.performance ? btnActiveClasses : btnClasses}`}
                    onClick={() => onGroupChange('performance')}
                    title="Toggle Performance Metrics"
                >
                    <icons.TrendingUp size={14} />
                    <span>Performance</span>
                </button>
            </div>
            
            {/* Middle - Timeframe selection */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground mr-1">Show:</span>
                
                {!compareMode ? (
                    <>
                        {/* Last 24h button */}
                        <button
                            className={`${btnBaseClasses} ${timeframeState === 'last24h' ? btnActiveClasses : btnClasses}`}
                            onClick={() => onTimeframeChange('last24h')}
                            title="Show data from last 24 hours"
                        >
                            <icons.Clock size={14} />
                            <span>Last 24h</span>
                        </button>
                        
                        {/* Yesterday button */}
                        <button
                            className={`${btnBaseClasses} ${!mostRecentDay ? 'opacity-50 cursor-not-allowed' : ''} ${timeframeState === String(mostRecentDay) ? btnActiveClasses : btnClasses}`}
                            onClick={mostRecentDay ? () => onTimeframeChange(String(mostRecentDay)) : undefined}
                            disabled={!mostRecentDay}
                            title={mostRecentDay ? `Show data from Day ${mostRecentDay}` : 'No data available'}
                        >
                            <icons.Calendar size={14} />
                            <span>{mostRecentDay ? `Yesterday (Day ${mostRecentDay})` : 'Yesterday'}</span>
                        </button>
                        
                        {/* Day dropdown */}
                        <select
                            className={`${btnBaseClasses} ${btnClasses} ${!hasOtherDays ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${availableDays.includes(Number(timeframeState)) ? btnActiveClasses : '' }` }
                            disabled={!hasOtherDays}
                            value={availableDays.includes(Number(timeframeState)) ? timeframeState : ''}
                            onChange={(e) => e.target.value && onTimeframeChange(e.target.value)}
                            title={hasOtherDays ? 'Select a day to view' : 'No historical data available'}
                        >
                            <option value="" disabled>Select Day</option>
                            {availableDays.map(day => (
                                <option key={day} value={String(day)}>Day {day}</option>
                            ))}
                        </select>
                    </>
                ) : (
                    <>
                        {/* Compare mode dropdowns */}
                        <DayDropdown
                            value={comparePrimaryDay}
                            onChange={onComparePrimaryDayChange}
                            availableDays={allDays.filter(day => {
                                const olderDays = allDays.filter(d => d < day);
                                return olderDays.length > 0;
                            })}
                            mostRecentDay={mostRecentDay}
                            placeholder="Select Primary Day"
                            btnBaseClasses={btnBaseClasses}
                            btnClasses={btnClasses}
                        />
                        
                        <span className="text-xs font-medium text-muted-foreground">vs</span>
                        
                        <DayDropdown
                            value={compareSecondaryDay}
                            onChange={onCompareSecondaryDayChange}
                            availableDays={comparePrimaryDay ? allDays.filter(day => day < comparePrimaryDay) : []}
                            mostRecentDay={mostRecentDay}
                            placeholder="Compare To"
                            btnBaseClasses={btnBaseClasses}
                            btnClasses={btnClasses}
                            disabled={!comparePrimaryDay || allDays.filter(day => day < comparePrimaryDay).length === 0}
                        />
                        
                        {/* Percentage toggle */}
                        <button
                            className={`${btnBaseClasses} ${compareShowPercentages ? btnActiveClasses : btnClasses}`}
                            onClick={onCompareShowPercentagesChange}
                            title="Toggle percentage display"
                        >
                            <icons.Percent size={14} />
                        </button>
                    </>
                )}
                
                <span className="border-primary border-r ml-2 mr-1 mr-2 opacity-40 py-2" />
                
                {/* Compare checkbox */}
                <label className="flex items-center gap-1.5 cursor-pointer">
                    {availableDays.length > 0 && (
                        <input
                            type="checkbox"
                            checked={compareMode}
                            onChange={(e) => onCompareModeChange(e.target.checked)}
                            className="cursor-pointer"
                        />
                    )}
                    <span className="text-xs">Compare</span>
                </label>
            </div>
            
            {/* Right side - Status indicator */}
            <div className="flex items-center gap-2">
                {!api.gameState.isPaused() && (
                    <div className="absolute w-2 h-2 rounded-full bg-green-500 opacity-75 animate-ping" />
                )}
                {api.gameState.isPaused() && (
                    <span className="text-muted-foreground text-xs">Pause</span>
                )}
                <span className={`relative inline-flex w-2 h-2 rounded-full ${api.gameState.isPaused() ? 'bg-amber-400' : 'bg-green-500'}`} />
            </div>
        </div>
    );
}

// Helper component for day dropdown
function DayDropdown({ value, onChange, availableDays, mostRecentDay, placeholder, btnBaseClasses, btnClasses, disabled = false }) {
    const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
    
    return (
        <select
            className={`${btnBaseClasses} ${btnClasses} ${disabledClass}`}
            disabled={disabled}
            value={value || ''}
            onChange={(e) => onChange && onChange(e.target.value)}
        >
            <option value="" disabled>{placeholder}</option>
            {availableDays.map(day => (
                <option key={day} value={day}>
                    {formatDayLabel(day, mostRecentDay)}
                </option>
            ))}
        </select>
    );
}
