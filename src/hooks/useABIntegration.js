// useABIntegration — detects Advanced Bureau and exposes its slot components.
// Handles async load ordering: AB may initialize after AA has already rendered.
// Returns { isInstalled, CompanyBadge, DashboardCards }.

const { React } = window.SubwayBuilderAPI.utils;

export function useABIntegration() {
    const [isInstalled, setIsInstalled] = React.useState(
        !!window.AdvancedBureau?.initialized
    );

    React.useEffect(() => {
        if (isInstalled) return;
        const handler = () => setIsInstalled(true);
        window.addEventListener('AdvancedBureauReady', handler);
        return () => window.removeEventListener('AdvancedBureauReady', handler);
    }, [isInstalled]);

    return {
        isInstalled,
        DashboardCardsWrapper: isInstalled ? (window.AdvancedBureau?.dashboardCardsWrapper ?? null) : null,
        CompanyBadge:   isInstalled ? (window.AdvancedBureau?.companyBadge   ?? null) : null,
        DashboardCards: isInstalled ? (window.AdvancedBureau?.dashboardCards ?? null) : null,
    };
}
