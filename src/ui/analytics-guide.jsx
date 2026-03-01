// AnalyticsSetting component
// Settings button that opens storage management dialog

import { AnalyticsGuideDialog } from './analytics-guide-dialog.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function AnalyticsGuide() {
    const [isOpen, setIsOpen] = React.useState(false);
    
    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-accent hover:text-accent-foreground mr-auto"
                title="User Guide"
            >
                <icons.BookText size={16} />
                <span className="ml-2 text-xs">Guide</span>
            </button>
            
            <AnalyticsGuideDialog
                isOpen={isOpen} 
                onClose={() => setIsOpen(false)} 
            />
        </>
    );
}
