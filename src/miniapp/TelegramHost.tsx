import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getTelegramWebApp, initTelegramMiniApp, isInsideTelegram } from './telegram';
import './miniapp.css';

/**
 * Глобальная интеграция Telegram WebApp с полным приложением:
 * — expand / тема
 * — кнопка «Назад» = history.back()
 * — safe-area для notch
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

        const onBack = () => {
            // Не уходим с логина / корня в никуда
            if (location.pathname === '/login' || location.pathname === '/tg' || location.pathname === '/mini') {
                try {
                    wa.close();
                } catch {
                    /* ignore */
                }
                return;
            }
            if (window.history.length > 1) {
                navigate(-1);
            } else {
                navigate('/dashboard', { replace: true });
            }
        };

        // В mini shell «корень» — любой /tg/* с bottom-nav; Back прячем на главных вкладках
        const miniRoot =
            location.pathname === '/tg' ||
            location.pathname === '/tg/dashboard' ||
            location.pathname === '/mini';
        const isRoot =
            miniRoot ||
            location.pathname === '/' ||
            location.pathname === '/dashboard' ||
            location.pathname === '/login';

        if (isRoot) {
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
