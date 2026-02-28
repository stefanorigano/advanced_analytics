// Portal — renders children inside PortalHost (top-bar slot, outside panel transforms).
// Renders null in-place; content appears in PortalHost via the shared registry.

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

let _nextPortalId = 0;

export function Portal({ children }) {
    const idRef = React.useRef(null);
    if (idRef.current === null) {
        idRef.current = `aa-portal-${_nextPortalId++}`;
    }
    const id = idRef.current;

    // Sync children to PortalHost after every render (no deps = always up to date)
    React.useLayoutEffect(() => {
        window.AdvancedAnalytics._portalRegistry?.mount(id, children);
    });

    // Remove from PortalHost on unmount
    React.useEffect(() => {
        return () => {
            window.AdvancedAnalytics._portalRegistry?.unmount(id);
        };
    }, []);

    return null;
}
