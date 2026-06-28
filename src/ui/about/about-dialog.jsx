// GuideDialog component
// Inline user guide with sidebar navigation and scrollable content

import { Dialog } from '../../components/dialog.jsx';
import { CONFIG } from "../../config";

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AboutDialog({ isOpen, onClose }) {
    const handleLinkClick = (e) => {
        e.preventDefault();
        window.electron.openExternalUrl(e.currentTarget.href);
    };

    return (
        <Dialog
            id="aa-about-dialog"
            title="About"
            size={600}
            isOpen={isOpen}
            onClose={onClose}
            backdropClasses="bg-black"
        >
            <div class={'font-mono text-muted-foreground pt-6 pb-3 text-center'}>
                {React.createElement(icons.Eclipse, { size: 48, className: 'mx-auto mb-2 text-foreground', strokeWidth: 1 })}
                <div class="font-bold text-lg text-foreground">Advanced Analytics</div>
                <div class="flex items-center mb-1">
                    <span className={'text-sm font-bold ml-auto w-32 text-right'}>v{CONFIG.VERSION}</span>
                    <span className={`px-3`}>-</span>
                    <span class="text-xs mr-auto w-32 text-left">by Steno</span>
                </div>
                <div className={'grid grid-cols-2 items-center pb-6 pt-2 gap-8 text-xs'}>
                    <div className={'flex gap-2 items-center justify-end text-right'}>
                        <icons.TrainTrack size={16}/>
                        <a
                            href="https://subwaybuildermodded.com/railyard/mods/advanced-analytics/"
                            onClick={handleLinkClick}
                            className="underline hover:text-foreground transition-colors cursor-pointer"
                        >
                            <span>On Railyard</span>
                        </a>
                    </div>
                    <div className={'flex gap-2 items-center justify-start'}>
                        <icons.Github size={16}/>
                        <a
                            href="https://github.com/stefanorigano/advanced_analytics"
                            onClick={handleLinkClick}
                            className="underline hover:text-foreground transition-colors cursor-pointer"
                        >
                            <span>On Github</span>
                        </a>
                    </div>
                </div>
            </div>
            <hr/>
            <div className={`flex flex-col items-center text-center py-6`}>
                <div className={`grid grid-cols-2 gap-8 w-full`}>
                    <a onClick={handleLinkClick} href="https://ko-fi.com/Q5Q61VIM68" target="_blank"
                       rel="noopener noreferrer">
                        <img alt="Ko-fi"
                             className={"ml-auto"}
                             src="data:image/png;base64,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"
                        />
                    </a>
                    <a href="https://liberapay.com/Steno" onClick={handleLinkClick} target="_blank"
                       rel="noopener noreferrer">
                        <img alt="Liberapay"
                             src="data:image/png;base64,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"
                        />
                    </a>
                </div>
                <div class="text-sm font-semibold text-foreground mb-2 pt-4 w-full">
                    Thanks everyone for the donations!<br/>Your support means a lot!
                </div>
            </div>
            <hr/>
            <div className={`flex flex-col items-center text-center text-sm py-6`}>
                <div className="font-semibold text-foreground mb-2">Open Source Libs</div>
                <a onClick={handleLinkClick}
                    href="https://fkhadra.github.io/react-toastify/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={"text-muted-foreground mb-1"}
                >
                    React Toastify
                </a>
            </div>
            <hr/>
            <div class={'text-muted-foreground pt-6 pb-3 text-center text-sm'}>
                <div class="font-semibold text-foreground mb-2">Special thanks:</div>
                <div className={'italic text-muted-foreground mb-1'}>
                    spz213, sanccio, Tom G, DeeCee, R, 吹雪 牧<br/>
                </div>
                <div className={'italic mb-4'}>
                    ...and everyone who reported bugs, tested builds, proposed improvements and helped reverse-engineer the game's formulas.
                </div>
                <div class="italic text-muted-foreground mb-2">
                    A huge thanks to Colin and the SubwayBuilder team for<br/> creating such a great game.<br/>
                </div>
                {React.createElement(icons.Heart, { size: 18, className: 'mx-auto text-red-500 fill-red-500 mt-2', strokeWidth: 3 })}
            </div>

        </Dialog>
    );
}
