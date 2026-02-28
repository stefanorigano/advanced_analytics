// PortalHost — rendered in the top-bar slot (outside all panel transforms/overflow).
// Maintains a registry of portal content pushed by Portal components elsewhere in the tree.

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function PortalHost() {
    const [portals, setPortals] = React.useState(new Map());

    React.useEffect(() => {
        window.AdvancedAnalytics._portalRegistry = {
            mount:   (id, el) => setPortals(p => new Map(p).set(id, el)),
            unmount: (id)     => setPortals(p => { const n = new Map(p); n.delete(id); return n; })
        };
        return () => {
            window.AdvancedAnalytics._portalRegistry = null;
        };
    }, []);

    const entries = [...portals.values()];
    if (entries.length === 0) return null;

    return React.createElement(React.Fragment, null, ...entries);
}
