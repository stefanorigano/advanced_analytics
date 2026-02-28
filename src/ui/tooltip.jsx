// Tooltip — custom replacement for the API Tooltip that portals content via PortalHost.
// Usage: <Tooltip content="label" side="bottom" delayDuration={300}><button/></Tooltip>
// The single child receives the ref and mouse handlers via cloneElement.

import { Portal } from './portal.jsx';

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function Tooltip({ children, content, side = 'bottom', delayDuration = 300 }) {
    const [visible, setVisible] = React.useState(false);
    const [pos, setPos] = React.useState(null);
    const triggerRef = React.useRef(null);
    const timerRef = React.useRef(null);

    const computePos = () => {
        if (!triggerRef.current) return null;
        const rect = triggerRef.current.getBoundingClientRect();
        const gap = 6;
        switch (side) {
            case 'top':
                return { top: rect.top - gap, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)' };
            case 'bottom':
                return { top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
            case 'left':
                return { top: rect.top + rect.height / 2, left: rect.left - gap, transform: 'translate(-100%, -50%)' };
            case 'right':
                return { top: rect.top + rect.height / 2, left: rect.right + gap, transform: 'translateY(-50%)' };
            default:
                return { top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
        }
    };

    const handleMouseEnter = () => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setPos(computePos());
            setVisible(true);
        }, delayDuration);
    };

    const handleMouseLeave = () => {
        clearTimeout(timerRef.current);
        setVisible(false);
    };

    React.useEffect(() => {
        return () => clearTimeout(timerRef.current);
    }, []);

    const child = React.Children.only(children);
    const trigger = React.cloneElement(child, {
        ref: triggerRef,
        onMouseEnter: (e) => {
            handleMouseEnter();
            child.props.onMouseEnter?.(e);
        },
        onMouseLeave: (e) => {
            handleMouseLeave();
            child.props.onMouseLeave?.(e);
        }
    });

    return (
        <>
            {trigger}
            {visible && pos && (
                <Portal>
                    <div
                        className="aa-tooltip fixed z-[10000] px-3 py-1.5 text-sm rounded-md bg-popover text-popover-foreground border border-border shadow-md pointer-events-none whitespace-nowrap"
                        style={{ top: pos.top, left: pos.left, transform: pos.transform }}
                    >
                        {content}
                    </div>
                </Portal>
            )}
        </>
    );
}
