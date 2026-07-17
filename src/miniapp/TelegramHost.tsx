import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getTelegramWebApp, initTelegramMiniApp, isInsideTelegram } from './telegram';
import './miniapp.css';

/** Primary mini-app tabs where Telegram Back should be hidden */
const MINI_PRIMARY_PATHS = new Set([
    '/tg',
    '/tg/',
    '/tg/dashboard',
    '/tg/substitutions',
    '/tg/schedule',
    '/tg/schedule2',
    '/tg/duty',
    '/tg/nutrition',
    '/mini'
]);

/**
 * Глобальная интеграция Telegram WebApp:
 * — expand / тема
 * — BackButton
 * — safe-area
 */
export const TelegramHost = () => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isInsideTelegram()) return;
        initTelegramMiniApp();
    }, []);

    useEffect(() => {
        if (!isInsideTelegram()) return;
        const wa = getTelegramWebApp();
        if (!wa?.BackButton) return;

        const path = location.pathname.replace(/\/$/, '') || '/';
        const inMini = path === '/tg' || path.startsWith('/tg/');

        const onBack = () => {
            if (path === '/login' || path === '/tg' || path === '/mini') {
                try {
                    wa.close();
                } catch {
                    /* ignore */
                }
                return;
            }

            // Primary mini tabs: close mini app rather than jump to desktop
            if (MINI_PRIMARY_PATHS.has(path) || MINI_PRIMARY_PATHS.has(path + '/')) {
                try {
                    wa.close();
                } catch {
                    navigate(inMini ? '/tg/dashboard' : '/dashboard', { replace: true });
                }
                return;
            }

            if (window.history.length > 1) {
                navigate(-1);
            } else {
                navigate(inMini ? '/tg/dashboard' : '/dashboard', { replace: true });
            }
        };

        // Hide Back on primary surfaces
        const isPrimary =
            MINI_PRIMARY_PATHS.has(path) ||
            path === '/' ||
            path === '/dashboard' ||
            path === '/login' ||
            path === '/substitutions' ||
            path === '/schedule' ||
            path === '/schedule2';

        if (isPrimary) {
            try {
                wa.BackButton.offClick(onBack);
            } catch {
                /* ignore */
            }
            wa.BackButton.hide();
        } else {
            wa.BackButton.show();
            wa.BackButton.onClick(onBack);
        }

        return () => {
            try {
                wa.BackButton.offClick(onBack);
                wa.BackButton.hide();
            } catch {
                /* ignore */
            }
        };
    }, [location.pathname, navigate]);

    return null;
};

export default TelegramHost;
