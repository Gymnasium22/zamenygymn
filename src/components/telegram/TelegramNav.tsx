import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTelegram } from '../../context/TelegramContext';
import { Icon } from '../Icons';

/**
 * Нижняя навигация для Telegram Mini App.
 * Вместо sidebar — табы внизу экрана (привычный мобильный паттерн).
 * Максимум 5 пунктов, иначе не влезет на маленький экран.
 */
const NAV_ITEMS = [
    { to: '/schedule', label: 'Расписание', icon: 'Calendar' },
    { to: '/substitutions', label: 'Замены', icon: 'Repeat' },
    { to: '/nutrition', label: 'Питание', icon: 'Coffee' },
    { to: '/bells', label: 'Звонки', icon: 'Bell' },
];

export const TelegramNav: React.FC = () => {
    const { colorScheme } = useTelegram();
    const location = useLocation();

    return (
        <nav
            className={`fixed bottom-0 left-0 right-0 z-50 border-t flex justify-around items-center h-14 pb-safe ${
                colorScheme === 'dark'
                    ? 'bg-dark-800 border-slate-700'
                    : 'bg-white border-slate-100'
            }`}
        >
            {NAV_ITEMS.map((item) => {
                const isActive = location.pathname.includes(item.to);
                return (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
                    >
                        <Icon
                            name={item.icon}
                            size={20}
                            className={isActive ? 'text-indigo-500' : 'text-slate-400'}
                        />
                        <span
                            className={`text-[10px] font-medium ${
                                isActive ? 'text-indigo-500' : 'text-slate-400'
                            }`}
                        >
                            {item.label}
                        </span>
                    </NavLink>
                );
            })}
        </nav>
    );
};
