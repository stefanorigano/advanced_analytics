// DashboardTableToolbar component
// Top toolbar with filters, timeframe selection, and compare mode

import { CONFIG } from '../../config.js';
import { formatDayLabel, getAvailableDays } from '../../utils/formatting.js';
import { Dropdown } from '../../components/dropdown.jsx';
import { DropdownItem } from '../../components/dropdown-item.jsx';
import { ButtonsGroup, ButtonsGroupItem } from '../../components/buttons-group.jsx';
import { Tooltip } from '../../components/tooltip.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function DashboardTableToolbar({
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
        <div className="flex justify-between gap-2 w-full">
            {/* Left side - Filter buttons */}
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium mr-1">Metrics:</span>

                <Tooltip content="Show/hide train-related metrics" side="top" delayDuration={300}>
                    <button
                        className={`${btnBaseClasses} ${groupState.trains ? btnActiveClasses : btnClasses}`}
                        onClick={() => onGroupChange('trains')}
                    >
                        <icons.Train size={14} />
                        <span>Trains</span>
                    </button>
                </Tooltip>

                <Tooltip content="Show/hide financial metrics" side="top" delayDuration={300}>
                    <button
                        className={`${btnBaseClasses} ${groupState.finance ? btnActiveClasses : btnClasses}`}
                        onClick={() => onGroupChange('finance')}
                    >
                        <icons.DollarSign size={14} />
                        <span>Finance</span>
                    </button>
                </Tooltip>
            </div>

            {/* Middle - ButtonsGroup for Show/Compare mode */}
            <div className={`items-center ${availableDays.length > 0 ? 'flex' : 'hidden' }`}>
                <Tooltip
                    content={availableDays.length > 0
                        ? 'Switch between showing data and comparing two days'
                        : 'Compare mode requires at least 2 days of historical data'}
                    side="top"
                    delayDuration={300}
                >
                    <div className="mx-auto">
                        <ButtonsGroup value={viewMode} onChange={handleViewModeChange}>
                            <ButtonsGroupItem value="show" text="Show" />
                            <ButtonsGroupItem value="compare" text="Compare" disabled={availableDays.length == 0} />
                        </ButtonsGroup>
                    </div>
                </Tooltip>
            </div>

            {/* Right side - Timeframe controls */}
            <div className="flex items-center gap-2 justify-end">

                {/* Timeframe controls - conditional based on compareMode */}
                {!compareMode ? (
                    <>
                        {/* Last 24h button */}
                        <Tooltip content="Show live data from the last 24 hours" side="top" delayDuration={300}>
                            <button
                                className={`${btnBaseClasses} ${timeframeState === 'last24h' ? btnActiveClasses : btnClasses}`}
                                onClick={() => onTimeframeChange('last24h')}
                            >
                                <icons.Clock size={14} />
                                <span>Last 24h</span>
                            </button>
                        </Tooltip>

                        {/* Yesterday button */}
                        <Tooltip
                            content={mostRecentDay
                                ? `Show historical data from Day ${mostRecentDay}`
                                : 'No historical data available yet'}
                            side="top"
                            delayDuration={300}
                        >
                            <div>
                                <button
                                    className={`${btnBaseClasses} ${!mostRecentDay ? 'opacity-50 pointer-events-none' : ''} ${timeframeState === String(mostRecentDay) ? btnActiveClasses : btnClasses}`}
                                    onClick={mostRecentDay ? () => onTimeframeChange(String(mostRecentDay)) : undefined}
                                    disabled={!mostRecentDay}
                                >
                                    <icons.Calendar size={14}/>
                                    <span>{mostRecentDay ? `Yesterday (Day ${mostRecentDay})` : 'Yesterday'}</span>
                                </button>
                            </div>
                        </Tooltip>

                        {/* Day dropdown */}
                        {hasOtherDays && (
                            <Tooltip content="Select a specific day to view historical data" side="top" delayDuration={300}>
                                <div>
                                    <Dropdown
                                        togglerIcon={icons.Calendar}
                                        togglerText={
                                            availableDays.includes(Number(timeframeState))
                                                ? `Day ${timeframeState}`
                                                : 'Select Day'
                                        }
                                        togglerClasses={`${btnTogglerClasses} ${!hasOtherDays ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${availableDays.includes(Number(timeframeState)) ? btnActiveClasses : ''}`}
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
                                </div>
                            </Tooltip>
                        )}
                    </>
                ) : (
                    <>
                        {/* Compare mode dropdowns */}
                        <Tooltip content="Select the newer day to compare (primary)" side="bottom" delayDuration={300}>
                            <div>
                                <Dropdown
                                    togglerIcon={icons.Calendar}
                                    togglerText={comparePrimaryDay ? formatDayLabel(comparePrimaryDay, mostRecentDay) : 'Select Primary Day'}
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
                            </div>
                        </Tooltip>

                        <span className="text-xs font-medium">vs</span>

                        <Tooltip content="Select the older day to compare against (secondary)" side="bottom" delayDuration={300}>
                            <div>
                                <Dropdown
                                    togglerIcon={icons.Calendar}
                                    togglerText={compareSecondaryDay ? formatDayLabel(compareSecondaryDay, mostRecentDay) : 'Compare To'}
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
                            </div>
                        </Tooltip>

                        {/* Percentage toggle */}
                        <Tooltip
                            content={compareShowPercentages
                                ? 'Showing percentage changes - click to show absolute deltas'
                                : 'Showing absolute deltas - click to show percentage changes'}
                            side="bottom"
                            delayDuration={300}
                        >
                            <button
                                className={`${btnBaseClasses} ${compareShowPercentages ? btnActiveClasses : btnClasses}`}
                                onClick={onCompareShowPercentagesChange}
                            >
                                <icons.Percent size={14} />
                            </button>
                        </Tooltip>
                    </>
                )}
            </div>
        </div>
    );
}
