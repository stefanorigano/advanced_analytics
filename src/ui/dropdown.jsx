// Dropdown component
// Generic dropdown menu with single/multi-select support

import { Portal } from './portal.jsx';

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
 * @param {React.Node} props.togglerContent - Arbitrary React content for the toggler (optional).
 *   When provided, replaces togglerIcon + togglerText (caret is still appended).
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
    togglerContent = null,
    menuClasses = '',
    multiselect = false,
    value = null,
    onChange = () => {},
    children
}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [menuPos, setMenuPos] = React.useState({ top: 0, left: 0, minWidth: 0 });
    const togglerRef = React.useRef(null);

    const dataState = isOpen ? 'open' : 'closed';

    const handleToggle = () => {
        setIsOpen(prev => !prev);
    };

    const handleDismiss = () => {
        setIsOpen(false);
    };

    // Compute menu position from toggler rect whenever opening
    React.useLayoutEffect(() => {
        if (isOpen && togglerRef.current) {
            const rect = togglerRef.current.getBoundingClientRect();
            setMenuPos({
                top: rect.bottom + 4,
                left: rect.left,
                minWidth: rect.width
            });
        }
    }, [isOpen]);

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

    // Clone children and inject props — only for DropdownItem children
    // (custom children like RouteDropdownItem manage their own click handler)
    const enhancedChildren = React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        // Only inject props when the child uses the value/active/multiselect pattern
        // (i.e. it's a DropdownItem). Custom components pass their own onClick.
        if (child.props.value === undefined) return child;

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

    // Build toggler inner content
    const togglerInner = togglerContent
        ? [
            React.createElement('span', { key: 'custom' }, togglerContent),
            React.createElement('span', { key: 'caret', className: 'opacity-70' }, '⏷'),
          ]
        : [
            TogglerIcon && React.createElement(TogglerIcon, { key: 'icon', className: 'w-4 h-4' }),
            togglerText && React.createElement('span', { key: 'text' }, togglerText),
            React.createElement('span', { key: 'caret', className: 'opacity-70' }, '⏷'),
          ].filter(Boolean);

    return (
        <div className="aa-dropdown-wrapper" data-state={dataState}>
            {/* Toggler button */}
            <button
                ref={togglerRef}
                className={`aa-dropdown-toggler whitespace-nowrap ${togglerClasses}`}
                title={togglerTitle}
                data-state={dataState}
                onClick={handleToggle}
                type="button"
            >
                {togglerInner}
            </button>

            {/* Backdrop + menu rendered in PortalHost to escape overflow/transform containers */}
            {isOpen && (
                <Portal>
                    <>
                        {/* Backdrop */}
                        <div
                            className="aa-dropdown-backdrop fixed inset-0 z-[1000]"
                            onClick={handleDismiss}
                            aria-hidden="true"
                        />

                        {/* Menu */}
                        <div
                            className={`aa-dropdown-menu fixed z-[10000] overflow-hidden rounded-md bg-primary-foreground text-popover-foreground shadow-md border border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${menuClasses}`}
                            data-state={dataState}
                            style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
                            tabIndex="-1"
                            role="menu"
                        >
                            {/* Dropdown items */}
                            <div className='p1'>{enhancedChildren}</div>

                            {/* OK button (only for multiselect) */}
                            {multiselect && (
                                <div className="backdrop-blur bg-background/50 border-border border-t bottom-0 mt-1 p-1 pt-2 sticky text-right">
                                    <button
                                        onClick={handleDismiss}
                                        className="px-3 py-1 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90"
                                    >
                                        Confirm
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                </Portal>
            )}
        </div>
    );
}
