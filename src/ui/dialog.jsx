// Generic Dialog Component
// Handles backdrop, animations, and cleanup

import { Portal } from './portal.jsx';

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function Dialog({ id, title, children, isOpen, onClose, size, noPadding}) {
    const [state, setState] = React.useState('open');

    // Reset state to 'open' when dialog is opened
    React.useEffect(() => {
        if (isOpen) {
            setState('open');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <Portal>
            <>
                {/* Backdrop */}
                <div
                    id={`${id}-backdrop`}
                    data-state={state}
                    className="aa-dialog-backdrop fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] bg-black/50"
                    style={{ pointerEvents: 'auto', width: '100vw', height: '100vh' }}
                    onClick={onClose}
                    aria-hidden="true"
                />

                {/* Dialog */}
                <div
                    id={`${id}-dialog`}
                    role="dialog"
                    data-state={state}
                    className="aa-dialog-dialog fixed flex flex-col left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] border backdrop-blur-md bg-background dark:bg-background/50 sm:rounded-lg select-none max-w-[95vw] max-h-[90vh] p-0"
                    tabIndex="-1"
                    style={{ pointerEvents: 'auto', width: size }}
                >
                    {/* Header */}
                    <div className="aa-dialog-dialog-header bg-background flex flex-col space-y-1.5 text-center sm:text-left px-6 py-4 border-b h-fit">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold leading-none tracking-tight">
                                {title}
                            </h2>
                            <button
                                type="button"
                                onClick={onClose}
                                className="data-[state=open]:bg-accent data-[state=open]:text-muted-foreground disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring hover:opacity-100 opacity-70 ring-offset-background transition-opacity"
                            >
                                <icons.X />
                                <span className="sr-only">Close</span>
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className={noPadding ? 'aa-dialog-dialog-body' : 'aa-dialog-dialog-body px-6 py-4 overflow-y-auto'}>
                        {children}
                    </div>
                </div>
            </>
        </Portal>
    );
}
