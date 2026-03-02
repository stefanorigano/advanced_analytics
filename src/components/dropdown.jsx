// Dropdown component
// Generic dropdown menu with single/multi-select support

import { Portal } from '../hooks/portal.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

const GAP = 4; // px gap between toggler and menu

/**
 * Compute menu position and flip direction based on available viewport space.
 * Returns a style-ready position object with `top` or `bottom` (the other is 'auto'),
 * plus `maxHeight` clamped to the chosen side's available room.
 *
 * @param {DOMRect} togglerRect
 * @param {number} intrinsicHeight - menu's natural height (measured without max-height)
 * @returns {{ direction: 'up'|'down', top: number|'auto', bottom: number|'auto', left: number, minWidth: number, maxHeight: number }}
 */
function computeMenuPosition(togglerRect, intrinsicHeight) {
    const spaceBelow = window.innerHeight - togglerRect.bottom - GAP;
    const spaceAbove = togglerRect.top - GAP;

    // Flip up only when menu doesn't fit below AND there's more room above
    const goUp = intrinsicHeight > spaceBelow && spaceAbove > spaceBelow;

    if (goUp) {
        return {
            direction: 'up',
            top: 'auto',
            bottom: window.innerHeight - togglerRect.top + GAP,
            left: togglerRect.left,
            minWidth: togglerRect.width,
            maxHeight: Math.max(spaceAbove, 0),
        };
    }

    return {
        direction: 'down',
        top: togglerRect.bottom + GAP,
        bottom: 'auto',
        left: togglerRect.left,
        minWidth: togglerRect.width,
        maxHeight: Math.max(spaceBelow, 0),
    };
}

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
    // null = unmeasured (measuring phase); object = positioned and visible
    const [menuPos, setMenuPos] = React.useState(null);

    const togglerRef = React.useRef(null);
    const menuRef = React.useRef(null);
    // Stores the menu's intrinsic (unconstrained) height so scroll handler
    // can recompute direction without re-measuring the DOM.
    const intrinsicHeightRef = React.useRef(null);

    const handleDismiss = () => setIsOpen(false);

    // ── Phase 1: measure intrinsic height ──────────────────────────────────────
    // Runs after every render (no deps) but is a no-op once measured.
    // The menu renders off-screen with visibility:hidden so getBoundingClientRect
    // returns its natural size. We then immediately compute the correct position
    // and make it visible — all before the browser paints (useLayoutEffect).
    //
    // When a Dropdown lives in an isolated React root (e.g. registered via
    // api.ui.registerComponent separately from PortalHost), the Portal's
    // setPortals() call schedules PortalHost's re-render asynchronously.
    // menuRef.current is therefore null on the first layout-effect run.
    // A requestAnimationFrame retry catches the next paint, by which time
    // PortalHost has committed the menu DOM node and set the ref.
    React.useLayoutEffect(() => {
        if (!isOpen || intrinsicHeightRef.current !== null) return;

        const measure = () => {
            if (!menuRef.current || intrinsicHeightRef.current !== null) return;
            const menuRect    = menuRef.current.getBoundingClientRect();
            const togglerRect = togglerRef.current.getBoundingClientRect();
            intrinsicHeightRef.current = menuRect.height;
            setMenuPos(computeMenuPosition(togglerRect, menuRect.height));
        };

        if (menuRef.current) {
            // Normal path: menu DOM node already exists (same-root Portal).
            measure();
        } else {
            // Deferred path: menu DOM not yet committed (cross-root Portal).
            // Retry after PortalHost has had a chance to paint.
            const frame = requestAnimationFrame(measure);
            return () => cancelAnimationFrame(frame);
        }
    });

    // Reset measurement state when the menu closes
    React.useEffect(() => {
        if (!isOpen) {
            setMenuPos(null);
            intrinsicHeightRef.current = null;
        }
    }, [isOpen]);

    // ── Dismiss on outside mousedown ───────────────────────────────────────────
    // Replaces the old blocking backdrop. Scroll events now pass through freely.
    React.useEffect(() => {
        if (!isOpen) return;

        const onMousedown = (e) => {
            if (
                menuRef.current?.contains(e.target) ||
                togglerRef.current?.contains(e.target)
            ) return;
            handleDismiss();
        };

        document.addEventListener('mousedown', onMousedown);
        return () => document.removeEventListener('mousedown', onMousedown);
    }, [isOpen]);

    // ── Reposition (and re-flip) on scroll ────────────────────────────────────
    // Capture phase catches scrolls on any element in the page.
    // passive:true keeps scroll performance unaffected.
    React.useEffect(() => {
        if (!isOpen) return;

        const onScroll = () => {
            if (!togglerRef.current || intrinsicHeightRef.current === null) return;
            const rect = togglerRef.current.getBoundingClientRect();
            setMenuPos(computeMenuPosition(rect, intrinsicHeightRef.current));
        };

        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => window.removeEventListener('scroll', onScroll, { capture: true });
    }, [isOpen]);

    // ── Item click handling ────────────────────────────────────────────────────
    const handleItemClick = (itemValue) => {
        if (multiselect) {
            const currentValues = Array.isArray(value) ? value : [];
            const newValues = currentValues.includes(itemValue)
                ? currentValues.filter(v => v !== itemValue)
                : [...currentValues, itemValue];
            onChange(newValues);
        } else {
            onChange(itemValue);
            handleDismiss();
        }
    };

    // Inject active/multiselect/onClick into DropdownItem children
    const enhancedChildren = React.Children.map(children, child => {
        if (!React.isValidElement(child)) return child;
        if (child.props.value === undefined) return child;

        const itemValue = child.props.value;
        const isActive = multiselect
            ? Array.isArray(value) && value.includes(itemValue)
            : value === itemValue;

        return React.cloneElement(child, {
            active: isActive,
            multiselect,
            onClick: () => {
                if (child.props.onClick) child.props.onClick();
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

    // isMeasuring: menu is in DOM but hidden while we capture its natural height
    // isPositioned: height known, position computed, menu is visible
    const isMeasuring = isOpen && menuPos === null;
    const isPositioned = isOpen && menuPos !== null;
    const dataState = isOpen ? 'open' : 'closed';

    const menuStyle = isMeasuring
        ? {
            // Off-screen + invisible so the user never sees the unmeasured render
            visibility: 'hidden',
            pointerEvents: 'none',
            top: -9999,
            left: -9999,
          }
        : isPositioned
        ? {
            top: menuPos.top,
            bottom: menuPos.bottom,
            left: menuPos.left,
            minWidth: menuPos.minWidth,
            maxHeight: menuPos.maxHeight,
            // Allow internal scrolling when clamped by maxHeight;
            // hide horizontal overflow to keep the menu tidy.
            overflowX: 'hidden',
            overflowY: 'auto',
          }
        : {};

    return (
        <div className="aa-dropdown-wrapper" data-state={dataState}>
            {/* Toggler button */}
            <button
                ref={togglerRef}
                className={`aa-dropdown-toggler whitespace-nowrap ${togglerClasses}`}
                title={togglerTitle}
                data-state={dataState}
                onClick={() => setIsOpen(prev => !prev)}
                type="button"
            >
                {togglerInner}
            </button>

            {/* Menu rendered in a Portal to escape overflow/transform containers.
                No backdrop — a document mousedown listener handles dismiss instead,
                which lets page scroll events pass through freely. */}
            {(isMeasuring || isPositioned) && (
                <Portal>
                    <div
                        ref={menuRef}
                        className={`aa-dropdown-menu fixed z-[10000] rounded-md bg-primary-foreground text-popover-foreground shadow-md border border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${menuClasses}`}
                        data-state={isPositioned ? 'open' : 'closed'}
                        style={menuStyle}
                        tabIndex="-1"
                        role="menu"
                    >
                        <div className="p-1">{enhancedChildren}</div>

                        {/* Confirm button (multiselect only) */}
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
                </Portal>
            )}
        </div>
    );
}
