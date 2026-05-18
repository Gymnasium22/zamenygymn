import React, { useMemo } from 'react';
import { useTelegram } from '../../context/TelegramContext';
import { useStaticData } from '../../context/DataContext';
import { Icon } from '../Icons';

/**
 * Авторизация через Telegram Mini App.
 *
 * Как это работает:
 * 1. Пользователь открывает Mini App из Telegram
 * 2. Мы получаем его Telegram ID из window.Telegram.WebApp.initDataUnsafe.user.id
 * 3. Ищем в списке учителей (teachers) совпадение по telegramChatId
 * 4. Если нашли — даём доступ как учителю
 * 5. Если нет — показываем экран "Доступ запрещён"
 *
 * Админ должен заранее внести Telegram ID учителя в справочник учителей.
 * Узнать свой ID: @userinfobot в Telegram.
 */
export const TelegramAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { telegramUser, isMiniApp } = useTelegram();
    const { teachers, isLoading } = useStaticData();

    const matchedTeacher = useMemo(() => {
        if (!telegramUser || !teachers) return null;
        return teachers.find((t) => t.telegramChatId === String(telegramUser.id));
    }, [telegramUser, teachers]);

    const isAuthorized = !!matchedTeacher;

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950">
                <Icon name="Loader" className="animate-spin text-indigo-600" size={48} />
            </div>
        );
    }

    // Если мы не в Mini App — рендерим children (обычная авторизация через Firebase сработает выше)
    if (!isMiniApp) {
        return <>{children}</>;
    }

    // Если данных пользователя Telegram нет (редкий кейс)
    if (!telegramUser) {
        return (
            <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-dark-950">
                <Icon name="AlertTriangle" size={64} className="text-orange-500 mb-4" />
                <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    Не удалось получить данные
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Закройте приложение и откройте снова из Telegram.
                </p>
            </div>
        );
    }

    // Если учитель не найден в справочнике
    if (!isAuthorized) {
        return (
            <div className="h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50 dark:bg-dark-950">
                <Icon name="Shield" size={64} className="text-red-500 mb-4" />
                <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                    Доступ запрещён
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Ваш Telegram-аккаунт не привязан к учителю в системе.
                </p>
                <div className="bg-white dark:bg-dark-800 rounded-xl p-4 text-left text-sm space-y-2 border border-slate-200 dark:border-slate-700">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">Что делать:</p>
                    <ol className="list-decimal list-inside text-slate-500 dark:text-slate-400 space-y-1">
                        <li>Сообщите администратору свой Telegram ID: <span className="font-mono font-bold text-indigo-600">{telegramUser.id}</span></li>
                        <li>Админ внесёт его в вашу карточку учителя (раздел «Справочники → Учителя»)</li>
                        <li>Перезапустите приложение</li>
                    </ol>
                </div>
            </div>
        );
    }

    // Всё ок — рендерим контент
    return <>{children}</>;
};
