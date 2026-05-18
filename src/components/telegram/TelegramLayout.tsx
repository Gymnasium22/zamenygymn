import React from 'react';
import { Outlet } from 'react-router-dom';
import { useTelegram } from '../../context/TelegramContext';
import { TelegramUserBar } from './TelegramUserBar';
import { TelegramNav } from './TelegramNav';
import { PullToRefresh } from '../PullToRefresh';

/**
 * Layout для Telegram Mini App.
 *
 * Чем отличается от обычного Layout:
 * - Нет sidebar (в Telegram нет места для боковой панели)
 * - Нет BottomNavigation из UI.tsx (используем свой TelegramNav)
 * - Есть шапка с аватаркой пользователя Telegram
 * - Pull-to-refresh на всём экране
 * - Отступ снизу для нижней навигации
 */
export const TelegramLayout: React.FC = () => {
    const { colorScheme, haptic } = useTelegram();

    return (
        <div
            className={`h-screen flex flex-col overflow-hidden ${
                colorScheme === 'dark' ? 'bg-dark-950 text-white' : 'bg-slate-50 text-slate-900'
            }`}
        >
            {/* Шапка с пользователем Telegram */}
            <TelegramUserBar />

            {/* Основной контент */}
            <main className="flex-1 overflow-y-auto">
                <PullToRefresh
                    onRefresh={async () => {
                        haptic('light');
                        await new Promise((r) => setTimeout(r, 800));
                    }}
                >
                    <div className="p-3 pb-20">
                        <Outlet />
                    </div>
                </PullToRefresh>
            </main>

            {/* Нижняя навигация */}
            <TelegramNav />
        </div>
    );
};
