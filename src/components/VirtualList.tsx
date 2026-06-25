import React, { useRef, useState, useEffect, useCallback } from 'react';

interface VirtualListProps<T> {
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    itemHeight: number;
    containerHeight: number;
    className?: string;
}

export function VirtualList<T>({ items, renderItem, itemHeight, containerHeight, className = '' }: VirtualListProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);

    const handleScroll = useCallback(() => {
        if (containerRef.current) {
            setScrollTop(containerRef.current.scrollTop);
        }
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
    const endIndex = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + 2);
    const visibleItems = items.slice(startIndex, endIndex);

    return (
        <div
            ref={containerRef}
            className={`overflow-auto ${className}`}
            style={{ height: containerHeight }}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                {visibleItems.map((item, i) => (
                    <div
                        key={startIndex + i}
                        style={{
                            position: 'absolute',
                            top: (startIndex + i) * itemHeight,
                            height: itemHeight,
                            left: 0,
                            right: 0
                        }}
                    >
                        {renderItem(item, startIndex + i)}
                    </div>
                ))}
            </div>
        </div>
    );
}
