// Generic Dialog Component
// Handles backdrop, animations, and cleanup

const api = window.SubwayBuilderAPI;
const { React, icons } = api.utils;

export function Dialog({ id, title, children, isOpen, onClose }) {
    const [state, setState] = React.useState('open');
    
    const handleDismiss = () => {
        // Start closing animation
        setState('closed');
        
        // Wait for animation to complete (150ms), then call onClose
        setTimeout(() => {
            onClose();
        }, 150);
    };
    
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            handleDismiss();
        }
    };
    
    if (!isOpen) return null;
    
    return (
        <>
            {/* Backdrop */}
            <div
                id={`${id}-backdrop`}
                data-state={state}
                className="aa-dialog-backdrop fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                style={{ pointerEvents: 'auto' }}
                onClick={handleBackdropClick}
                aria-hidden="true"
            />
            
            {/* Dialog */}
            <div
                id={`${id}-dialog`}
                role="dialog"
                data-state={state}
                className="aa-dialog-dialog fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%] border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg select-none max-w-[95vw] w-full h-[95vh] p-0 overflow-hidden"
                tabIndex="-1"
                style={{ pointerEvents: 'auto' }}
            >
                {/* Header */}
                <div className="aa-dialog-dialog-header flex flex-col space-y-1.5 text-center sm:text-left px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold leading-none tracking-tight">
                            {title}
                        </h2>
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="absolute data-[state=open]:bg-accent data-[state=open]:text-muted-foreground disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring hover:opacity-100 opacity-70 right-4 ring-offset-background rounded-sm top-4 transition-opacity"
                        >
                            <icons.X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </button>
                    </div>
                </div>
                
                {/* Body */}
                <div className="aa-dialog-dialog-body px-6 py-4 overflow-y-auto h-[calc(95vh-80px)]">
                    {children}
                </div>
            </div>
        </>
    );
}