/**
 * Route Badge Component
 * Renders a route badge matching the game's design
 * 
 * @param {Object} props
 * @param {string} props.routeId - The route ID to display
 * @param {string} [props.size='2rem'] - The size of the badge (e.g., '2rem', '1.5rem')
 */

const api = window.SubwayBuilderAPI;
const { React } = api.utils;

export function RouteBadge({ routeId, size = '2rem' }) {
    // Get route data
    const routes = api.gameState.getRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        return null;
    }
    
    const { bullet, color, textColor, shape } = route;
    
    // Calculate responsive sizes based on the base size
    const sizeValue = parseFloat(size);
    const sizeUnit = size.replace(/[0-9.]/g, '');
    
    // Font size is 0.6x the badge size (1.2rem for 2rem badge)
    const fontSize = `${sizeValue * 0.6}${sizeUnit}`;
    
    // Triangle vertical offset is 0.1x the badge size (0.2rem for 2rem badge)
    const triangleOffset = `${sizeValue * 0.1}${sizeUnit}`;
    
    // Base styles for all shapes
    const baseStyles = {
        backgroundColor: color,
        userSelect: 'none',
        minWidth: size,
        height: size,
        fontSize: fontSize,
        color: textColor,
        paddingLeft: 0,
        paddingRight: 0,
    };
    
    // Shape-specific configurations
    const shapeConfigs = {
        circle: {
            className: 'flex items-center justify-center font-bold select-none overflow-hidden font-mta rounded-full cursor-pointer hover:opacity-80',
            wrapperClassName: 'relative inline-block',
            spanTransform: 'translateY(-0.04rem)',
            paddingX: '0.3em',
        },
        square: {
            className: 'flex items-center justify-center font-bold select-none overflow-hidden font-mta cursor-pointer hover:opacity-80',
            wrapperClassName: 'relative inline-block',
            spanTransform: 'translateY(-0.04rem)',
        },
        diamond: {
            className: 'flex items-center justify-center font-bold select-none overflow-hidden font-mta cursor-pointer hover:opacity-80',
            wrapperClassName: 'relative inline-block overflow-visible',
            containerTransform: 'rotate(45deg) scale(0.707107)',
            spanTransform: 'rotate(-45deg) translateY(-0.04rem)',
            paddingX: '0.5rem',
        },
        triangle: {
            className: 'flex items-center justify-center font-bold select-none overflow-hidden font-mta [clip-path:polygon(50%_0%,0%_100%,100%_100%)] cursor-pointer hover:opacity-80',
            wrapperClassName: 'relative inline-block',
            spanTransform: `translateY(${triangleOffset})`,
        },
    };
    
    const config = shapeConfigs[shape] || shapeConfigs.circle;
    
    // Apply padding for diamond shape
    const containerStyles = {
        ...baseStyles,
        ...(config.paddingX && {
            paddingLeft: config.paddingX,
            paddingRight: config.paddingX,
        }),
        ...(config.containerTransform && {
            transform: config.containerTransform,
        }),
    };
    
    return (
        <div 
            className={config.wrapperClassName}
            title={bullet}
            style={{ height: size, maxHeight: size }}
        >
            <div
                className={config.className}
                style={containerStyles}
            >
                <span
                    className="flex items-center justify-center leading-none whitespace-nowrap"
                    style={{
                        lineHeight: 0,
                        transform: config.spanTransform,
                    }}
                >
                    {bullet}
                </span>
            </div>
        </div>
    );
}