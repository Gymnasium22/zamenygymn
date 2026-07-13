import { useEffect, useState } from 'react';

const QUERY = '(max-width: 1023px)';

/**
 * Надёжный детект «мобильной оболочки».
 * По умолчанию true (mobile-first), чтобы PWA на телефоне
 * не мигал десктоп-layout с сайдбаром.
 */
export function useIsMobileApp(): boolean {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return true;
        try {
            return window.matchMedia(QUERY).matches || window.innerWidth < 1024;
        } catch {
            return window.innerWidth < 1024;
        }
    });

    useEffect(() => {
        const mq = window.matchMedia(QUERY);
        const update = () => {
            setIsMobile(mq.matches || window.innerWidth < 1024);
        };
        update();
        mq.addEventListener('change', update);
        window.addEventListener('resize', update);
        // iOS PWA иногда отдаёт неверный width до первого paint
        const t = window.setTimeout(update, 50);
        return () => {
            mq.removeEventListener('change', update);
            window.removeEventListener('resize', update);
            window.clearTimeout(t);
        };
    }, []);

    return isMobile;
}
