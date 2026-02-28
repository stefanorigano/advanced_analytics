// Sortable table component
// Renders table with sortable headers and rows

import { CONFIG } from '../config.js';
import { TableRow } from './table-row.jsx';
import { getSortIndicator, getHeaderClasses } from '../utils/sorting.js';

import { Tooltip } from './tooltip.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function SortableTable({ 
    data, 
    sortState, 
    onSortChange, 
    groups = ['trains', 'finance', 'performance'],
    groupState,
    compareShowPercentages
}) {
    const handleSort = (column) => {
        const newState = {
            column,
            order: sortState.column === column && sortState.order === 'desc' ? 'asc' : 'desc'
        };
        onSortChange(newState);
    };
    
    // Filter headers based on enabled groups
    const visibleHeaders = CONFIG.TABLE_HEADERS.filter(header => {
        // Always show name column
        if (header.key === 'name') return true;
        // Show if column has no group OR if its group is in the groups array
        if (!header.group) return true;
        return groups.includes(header.group);
    });
    
    return (
        <table className="aa-table w-full border-collapse text-sm">
            <thead>
                <tr className="stiky top-0 backdrop-blur-sm bg-background/80 border-b border-border z-10">
                    {visibleHeaders.map(header => {
                        const alignClass = header.align === 'right' ? 'text-right' : 
                                         header.align === 'center' ? 'text-center' : 'text-left';
                        const isActiveSort = sortState.column === header.key;
                        
                        // Header content
                        const headerContent = (
                            <div className={`flex ${header.align === 'center' ? 'justify-center' : 'justify-end'} items-center gap-0.5 whitespace-nowrap`}>
                                <span className={isActiveSort ? 'inline-block' : 'inline-block opacity-0'}>
                                    {getSortIndicator(header.key, sortState)}
                                </span>
                                <div className="whitespace-nowrap">
                                    <span className="font-medium text-xs">{header.label}</span>
                                    {header.small && (
                                        <span className="text-[10px] text-muted-foreground font-normal ml-1">
                                            {header.small}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                        
                        return (
                            <th 
                                key={header.key}
                                className={`px-3 py-2 ${alignClass} cursor-pointer select-none transition-colors ${getHeaderClasses(header.key, sortState, groupState, header.group)}`}
                                onClick={() => handleSort(header.key)}
                            >
                                {header.description ? (
                                    <Tooltip
                                        side="top"
                                        delayDuration={300}
                                        content={
                                            <div className="text-xs text-left space-y-1">
                                                {header.description.split('|').map((line, i) => (
                                                    <p key={i}>{line}</p>
                                                ))}
                                            </div>
                                        }
                                    >
                                        <div className="cursor-help">
                                            {headerContent}
                                        </div>
                                    </Tooltip>
                                ) : (
                                    headerContent
                                )}
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {data.map(row => (
                    <TableRow 
                        key={row.id} 
                        row={row} 
                        sortState={sortState}
                        groups={groups}
                        groupState={groupState}
                        compareShowPercentages={compareShowPercentages}
                    />
                ))}
            </tbody>
        </table>
    );
}