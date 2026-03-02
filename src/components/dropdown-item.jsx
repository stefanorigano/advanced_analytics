// DropdownItem component
// Individual item in a dropdown menu

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;
import { RouteBadge } from './route-badge.jsx';

/**
 * DropdownItem Component
 * 
 * @param {Object} props
 * @param {string} props.value - Value for this item (used for selection)
 * @param {string} props.text - Display text
 * @param {boolean} props.active - Whether this item is selected (injected by Dropdown)
 * @param {boolean} props.multiselect - Multiselect mode (injected by Dropdown)
 * @param {boolean} props.disabled - Disable this item
 * @param {function} props.onClick - Click handler (enhanced by Dropdown)
 */
export function DropdownItem({
    value,
    route,
    text,
    active = false,
    multiselect = false,
    disabled = false,
    onClick = () => {}
}) {
    const handleClick = () => {
        if (!disabled) {
            onClick();
        }
    };
    
    return React.createElement('div', {
        role: 'menuitem',
        className: `relative whitespace-nowrap cursor-pointer select-none rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 flex items-center justify-between ${active ? 'bg-accent/50' : ''}`,
        'data-disabled': disabled ? 'true' : undefined,
        tabIndex: '-1',
        onClick: handleClick
    }, [
        // Route Badge
        route && React.createElement(RouteBadge, { key: 'badge', routeId: route.id, size: '1.4rem', interactive: false }),
        
        // Text
        text && React.createElement('span', { key: 'text' }, text),
        
        // Checkbox (only show in multiselect or when active in single-select)
        React.createElement(icons.Check, {
            key: 'check',
            className: `w-4 h-4 ml-2 ${active ? 'opacity-100' : 'opacity-0'}`
        })
    ]);
}
