import { notifyDialog } from '../../hooks/toast.js';
import { Storage } from '../../core/storage.js';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// Add one bullet per notable change in this version.
const NEW = [
];
const IMP = [
];
const FIX = [
    'Unsure correct Dashboard window size when SB panels are rendered on screen',
];

// Prevents showing the changelog twice in the same browser session
// even if onMapReady fires more than once.
let _shownThisSession = false;

function ChangelogToastContent() {
    return (
        <div className="flex flex-col gap-2 py-1">
            <div className="flex items-center justify-center gap-2 font-semibold text-sm mb-4">
                {React.createElement(icons.Eclipse, { size: 14 })}
                <span>Advanced Analytics v{__MOD_VERSION__}</span>
            </div>
            <div className="flex flex-col gap-2 text-sm">
                {NEW.map((entry, i) => (
                    <div key={i} className={`flex items-start gap-2 pb-2 text-blue-500 dark:text-blue-400`}>
                        {React.createElement(icons.Sparkles, { size: 14, className: `shrink-0` })}
                        <div className="flex flex-col gap-1.5">
                            <span className={'text-xs leading-tight font-bold uppercase'}>New Feature</span>
                            <div className={`text-foreground`}>{entry}</div>
                        </div>
                    </div>
                ))}
                {IMP.map((entry, i) => (
                    <div key={i} className={`flex items-start gap-2 pb-2 text-green-500 dark:text-green-400`}>
                        {React.createElement(icons.TrendingUp, { size: 14, className: `shrink-0` })}
                        <div className="flex flex-col gap-1.5">
                            <span className={'text-xs leading-tight font-bold uppercase'}>Improvement</span>
                            <div className={`text-foreground`}>{entry}</div>
                        </div>
                    </div>
                ))}
                {FIX.map((entry, i) => (
                    <div key={i} className={`flex items-start gap-2 pb-2 text-red-500 dark:text-red-400`}>
                        {React.createElement(icons.Bug, { size: 14, className: `shrink-0` })}
                        <div className="flex flex-col gap-1.5">
                            <span className={'text-xs leading-tight font-bold uppercase'}>Bug fix</span>
                            <div className={`text-foreground`}>{entry}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Always shows the changelog toast (bypasses the "seen" flag — use from debug panel).
export function showChangelog() {
    notifyDialog(React.createElement(ChangelogToastContent), {
        toastId: 'aa-changelog',
        className: 'w-[400px]',
    });
}

// Shows the changelog toast only when the stored version differs from the current build.
// Writes the current version to a global IDB key afterward so it won't show again
// until the next mod update.
export async function showChangelogIfNeeded() {
    if (_shownThisSession) return;
    const seen = await Storage.getGlobal('changelogSeenVersion');
    if (seen === __MOD_VERSION__) return;
    _shownThisSession = true;
    showChangelog();
    await Storage.setGlobal('changelogSeenVersion', __MOD_VERSION__);
}
