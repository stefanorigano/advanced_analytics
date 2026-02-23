// Dropdown component
// Generic dropdown menu with single/multi-select support

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

/**
 * Dropdown Component
 * 
 * @param {Object} props
 * @param {string} props.togglerClasses - CSS classes for the toggler button
 * @param {string} props.togglerTitle - Tooltip for the toggler
 * @param {React.Component} props.togglerIcon - Icon component (optional)
 * @param {string} props.togglerText - Text for the toggler (optional)
 * @param {string} props.menuClasses - CSS classes for the menu (optional)
 * @param {boolean} props.multiselect - Enable multiselect mode
 * @param {string|string[]} props.value - Current value(s) - string for single, array for multi
 * @param {function} props.onChange - Callback when value changes
 * @param {React.Node} props.children - DropdownItem components
 */
export function Dropdown({
    togglerClasses = '',
    togglerTitle = '',
    togglerIcon: TogglerIcon = null,
    togglerText = '',
    menuClasses = '',
    multiselect = false,
    value = null,
    onChange = () => {},
    children
}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const wrapperRef = React.useRef(null);
    
    const dataState = isOpen ? 'open' : 'closed';
    
    const handleToggle = () => {
        setIsOpen(prev => !prev);
    };
    
    const handleDismiss = () => {
        setIsOpen(false);
    };
    
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            // Only dismiss on backdrop click for single-select
            if (!multiselect) {
                handleDismiss();
            }
        }
    };
    
    const handleItemClick = (itemValue) => {
        if (multiselect) {
            // Multiselect: toggle item in array
            const currentValues = Array.isArray(value) ? value : [];
            const newValues = currentValues.includes(itemValue)
                ? currentValues.filter(v => v !== itemValue)
                : [...currentValues, itemValue];
            onChange(newValues);
        } else {
            // Single select: set value and close
            onChange(itemValue);
            handleDismiss();
        }
    };
    
    // Clone children and inject props
    const enhancedChildren = React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        
        // Check if this item is active
        const itemValue = child.props.value;
        const isActive = multiselect
            ? Array.isArray(value) && value.includes(itemValue)
            : value === itemValue;
        
        return React.cloneElement(child, {
            active: isActive,
            multiselect,
            onClick: () => {
                if (child.props.onClick) {
                    child.props.onClick();
                }
                handleItemClick(itemValue);
            }
        });
    });
    
    return React.createElement('div', {
        ref: wrapperRef,
        className: 'aa-dropdown-wrapper relative',
        'data-state': dataState
    }, [
        // Backdrop (always shown when open, prevents clicks to underlying UI)
        isOpen && React.createElement('div', {
            key: 'backdrop',
            className: 'aa-dropdown-backdrop fixed inset-0 z-40 bg-black/30',
            onClick: handleBackdropClick,
            'aria-hidden': 'true'
        }),
        
        // Toggler button
        React.createElement('button', {
            key: 'toggler',
            className: `aa-dropdown-toggler whitespace-nowrap ${togglerClasses}`,
            title: togglerTitle,
            'data-state': dataState,
            onClick: handleToggle,
            type: 'button'
        }, [
            TogglerIcon && React.createElement(TogglerIcon, {
                key: 'icon',
                className: 'w-4 h-4'
            }),
            togglerText && React.createElement('span', {
                key: 'text'
            }, togglerText),
            React.createElement('span', {
                key: 'caret',
                className: 'opacity-70'
            }, "⏷"),
        ].filter(Boolean)),
        
        // Menu
        isOpen && React.createElement('div', {
            key: 'menu',
            className: `aa-dropdown-menu absolute z-50 mt-1 overflow-hidden rounded-md bg-primary-foreground p-1 text-popover-foreground shadow-md border border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${menuClasses}`,
            'data-state': dataState,
            tabIndex: '-1',
            role: 'menu'
        }, [
            // Dropdown items
            React.createElement('div', { key: 'items' }, enhancedChildren),
            
            // OK button (only for multiselect)
            multiselect && React.createElement('div', {
                key: 'ok-button',
                className: 'text-right p-1 border-t border-border mt-1 pt-2'
            }, React.createElement('button', {
                onClick: handleDismiss,
                className: 'px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90'
            }, 'Confirm'))
        ].filter(Boolean))
    ]);
}
