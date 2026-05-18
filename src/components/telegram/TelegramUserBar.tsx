import React from 'react';
import { useTelegram } from '../../context/TelegramContext';

/**
 * Шапка для Telegram Mini App.
 * Показывает аватар, имя пользователя и название школы.
 * Заменяет sidebar и верхний header.
 */
export const TelegramUserBar: React.FC = () => {
    const { telegramUser, colorScheme } = useTelegram();

    if (!telegramUser) return null;

    return (
        <div
            className={`px-4 py-3 flex items-center gap-3 border-b ${
                colorScheme === 'dark'
                    ? 'bg-dark-800 border-slate-700'
                    : 'bg-white border-slate-100'
            }`}
        >
            {telegramUser.photo_url ? (
                <img
                    src={telegramUser.photo_url}
                    alt={telegramUser.first_name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-indigo-500"
                    referrerPolicy="no-referrer"
                />
            ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                    {telegramUser.first_name[0]}
                    {telegramUser.last_name?.[0]}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 dark:text-white truncate">
                    {telegramUser.first_name} {telegramUser.last_name}
                </div>
                {telegramUser.username && (
                    <div className="text-xs text-slate-400">@{telegramUser.username}</div>
                )}
            </div>
        </div>
    );
};
