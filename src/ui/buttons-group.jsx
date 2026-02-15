// ButtonsGroup component
// Mutually exclusive toggle buttons (only one active at a time)

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

/**
 * ButtonsGroup Component
 * 
 * @param {Object} props
 * @param {string} props.groupClasses - CSS classes for the group wrapper
 * @param {string} props.value - Currently active button value
 * @param {function} props.onChange - Callback when value changes (receives new value)
 * @param {React.Node} props.children - ButtonsGroupItem components
 */
export function ButtonsGroup({
    groupClasses = 'bg-muted inline-block items-center justify-center mx-auto p-1 rounded-md text-muted-foreground',
    value = null,
    onChange = () => {},
    children
}) {
    const handleButtonClick = (buttonValue) => {
        if (value !== buttonValue) {
            onChange(buttonValue);
        }
    };
    
    // Clone children and inject props
    const enhancedChildren = React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        
        const isActive = value === child.props.value;
        
        return React.cloneElement(child, {
            active: isActive,
            onClick: () => {
                if (child.props.onClick) {
                    child.props.onClick();
                }
                handleButtonClick(child.props.value);
            }
        });
    });
    
    return React.createElement('div', {
        className: `aa-btn-group ${groupClasses}`,
        tabIndex: '0',
        style: { outline: 'none' }
    }, enhancedChildren);
}

/**
 * ButtonsGroupItem Component
 * Individual button within a ButtonsGroup
 * 
 * @param {Object} props
 * @param {string} props.value - Value for this button
 * @param {string} props.text - Display text
 * @param {boolean} props.active - Whether this button is active (injected by ButtonsGroup)
 * @param {function} props.onClick - Click handler (enhanced by ButtonsGroup)
 */
export function ButtonsGroupItem({
    value,
    text,
    active = false,
    disabled = false,
    onClick = () => {}
}) {
    const dataState = active ? 'active' : 'inactive';

    const handleClick = () => {
        if (!disabled) {
            onClick();
        }
    };
    
    return React.createElement('button', {
        type: 'button',
        'aria-selected': active ? 'true' : 'false',
        'data-state': dataState,
        disabled: disabled ? 'true' : undefined,
        className: 'aa-btn-group-btn inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        tabIndex: '-1',
        onClick: handleClick
    }, text);
}
