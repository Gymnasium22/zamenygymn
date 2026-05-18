import React, { useState, useRef, useCallback, ReactNode } from 'react';
import { Icon } from './Icons';

interface PullToRefreshProps {
    children: ReactNode;
    onRefresh?: () => void | Promise<void>;
    disabled?: boolean;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ children, onRefresh, disabled = false }) => {
    const [pulling, setPulling] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const currentY = useRef(0);
    const isAtTop = useRef(true);

    const checkIsAtTop = useCallback(() => {
        const el = containerRef.current;
        if (!el) return true;
        return el.scrollTop <= 0;
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled) return;
        isAtTop.current = checkIsAtTop();
        if (!isAtTop.current) return;
        startY.current = e.touches[0].clientY;
        currentY.current = startY.current;
    }, [disabled, checkIsAtTop]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (disabled || !isAtTop.current || refreshing) return;
        currentY.current = e.touches[0].clientY;
        const diff = currentY.current - startY.current;
        if (diff > 0 && diff < 150) {
            setPulling(true);
            setPullDistance(diff);
            // Prevent default scrolling when pulling
            if (diff > 10) {
                // Only prevent if we're actually pulling down at the top
            }
        }
    }, [disabled, refreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (disabled || !isAtTop.current) {
            setPulling(false);
            setPullDistance(0);
            return;
        }
        if (pullDistance > 80 && onRefresh) {
            setRefreshing(true);
            setPullDistance(60);
            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
                setPulling(false);
                setPullDistance(0);
            }
        } else {
            setPulling(false);
            setPullDistance(0);
        }
    }, [disabled, pullDistance, onRefresh]);

    return (
        <div
            ref={containerRef}
            className="relative h-full overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull indicator */}
            <div
                className="sticky top-0 z-30 flex items-center justify-center pointer-events-none transition-transform duration-200"
                style={{
                    transform: `translateY(${pulling ? pullDistance - 50 : -50}px)`,
                    opacity: pulling ? Math.min(pullDistance / 60, 1) : 0,
                }}
            >
                <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center">
                    <Icon
                        name="Loader"
                        size={20}
                        className={`text-indigo-600 ${refreshing ? 'animate-spin' : ''}`}
                        style={{
                            transform: refreshing ? undefined : `rotate(${Math.min(pullDistance * 2, 360)}deg)`,
                        }}
                    />
                </div>
            </div>
            {children}
        </div>
    );
};
