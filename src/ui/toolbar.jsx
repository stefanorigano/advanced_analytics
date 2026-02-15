// Toolbar component
// Top toolbar with filters, timeframe selection, and compare mode

import { CONFIG } from '../config.js';
import { formatDayLabel, getAvailableDays } from '../utils/formatting.js';
import { Dropdown } from './dropdown.jsx';
import { DropdownItem } from './dropdown-item.jsx';
import { ButtonsGroup, ButtonsGroupItem } from './buttons-group.jsx';

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
    const btnBaseClasses = 'whitespace-nowrap inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border';
    const btnClasses = 'bg-background hover:bg-accent hover:text-accent-foreground border-input';
    const btnActiveClasses = 'bg-primary text-primary-foreground border-primary hover:bg-primary/90';
    const btnTogglerClasses = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border bg-background hover:bg-accent border-input';
    
    const allDays = getAvailableDays(historicalData);
    const mostRecentDay = allDays[0];
    const availableDays = allDays.filter(day => day < mostRecentDay);
    const hasOtherDays = availableDays.length > 0;
    
    // State for ButtonsGroup - 'show' or 'compare'
    const viewMode = compareMode ? 'compare' : 'show';
    
    const handleViewModeChange = (newMode) => {
        const shouldEnableCompare = newMode === 'compare';
        onCompareModeChange(shouldEnableCompare);
    };
    
    return (
        <div className="grid grid-cols-3 w-full">
            {/* Left side - Filter buttons */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium mr-1">Metrics:</span>
                
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
            </div>
            
            {/* Middle - ButtonsGroup for Show/Compare mode, then timeframe selection */}
            <div className="flex items-center">
                {/* Show/Compare toggle using ButtonsGroup */}

                    <ButtonsGroup
                        value={viewMode}
                        onChange={handleViewModeChange}
                    >
                        <ButtonsGroupItem value="show" text="Show" />
                        <ButtonsGroupItem value="compare" text="Compare" disabled={availableDays.length == 0}/>
                    </ButtonsGroup>

            </div>

            {/* Right side - Status indicator */}
            <div className="flex items-center gap-2 justify-end">
                
                {/* Timeframe controls - conditional based on compareMode */}
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
                        
                        {/* Day dropdown - REPLACED with Dropdown component */}
                        {hasOtherDays && (
                            <Dropdown
                                togglerIcon={icons.Calendar}
                                togglerText={
                                    availableDays.includes(Number(timeframeState))
                                        ? `Day ${timeframeState}` 
                                        : 'Select Day'
                                }
                                togglerClasses={`${btnTogglerClasses} ${!hasOtherDays ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${availableDays.includes(Number(timeframeState)) ? btnActiveClasses : '' }` }
                                togglerTitle={hasOtherDays ? 'Select a day to view' : 'No historical data available'}
                                multiselect={false}
                                value={availableDays.includes(Number(timeframeState)) ? timeframeState : ''}
                                onChange={(value) => value && onTimeframeChange(value)}
                            >
                                {availableDays.map(day => (
                                    <DropdownItem 
                                        key={day} 
                                        value={String(day)} 
                                        text={`Day ${day}`} 
                                    />
                                ))}
                            </Dropdown>
                        )}
                        
                        {/* Placeholder when no other days */}
                        {!hasOtherDays && (
                            <button
                                className={`${btnBaseClasses} ${btnClasses} opacity-50 cursor-not-allowed`}
                                disabled={true}
                                title="No historical data available"
                            >
                                <icons.Calendar size={14} />
                                <span>Select Day</span>
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        {/* Compare mode dropdowns - REPLACED with Dropdown components */}
                        <Dropdown
                            togglerIcon={icons.Calendar}
                            togglerText={comparePrimaryDay ? formatDayLabel(comparePrimaryDay, mostRecentDay) : 'Select Primary Day'}
                            togglerTitle="Select primary comparison day"
                            togglerClasses={`${btnTogglerClasses} ${btnActiveClasses}`}
                            multiselect={false}
                            value={comparePrimaryDay ? String(comparePrimaryDay) : ''}
                            onChange={(value) => value && onComparePrimaryDayChange(value)}
                        >
                            {allDays
                                .filter(day => {
                                    const olderDays = allDays.filter(d => d < day);
                                    return olderDays.length > 0;
                                })
                                .map(day => (
                                    <DropdownItem
                                        key={day}
                                        value={String(day)}
                                        text={formatDayLabel(day, mostRecentDay)}
                                    />
                                ))
                            }
                        </Dropdown>
                        
                        <span className="text-xs font-medium">vs</span>
                        
                        <Dropdown
                            togglerIcon={icons.Calendar}
                            togglerText={compareSecondaryDay ? formatDayLabel(compareSecondaryDay, mostRecentDay) : 'Compare To'}
                            togglerTitle="Select secondary comparison day"
                            togglerClasses={`${btnTogglerClasses} ${btnActiveClasses}`}
                            multiselect={false}
                            value={compareSecondaryDay ? String(compareSecondaryDay) : ''}
                            onChange={(value) => value && onCompareSecondaryDayChange(value)}
                        >
                            {comparePrimaryDay && allDays
                                .filter(day => day < comparePrimaryDay)
                                .map(day => (
                                    <DropdownItem
                                        key={day}
                                        value={String(day)}
                                        text={formatDayLabel(day, mostRecentDay)}
                                    />
                                ))
                            }
                            {!comparePrimaryDay && (
                                <DropdownItem
                                    value=""
                                    text="Select primary day first"
                                    disabled={true}
                                />
                            )}
                        </Dropdown>
                        
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
            </div>
        </div>
    );
}
