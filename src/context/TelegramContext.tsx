import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    isTelegramMiniApp,
    getTelegramUser,
    getTelegramTheme,
    getTelegramColorScheme,
    telegramReady,
    expandMiniApp,
    setTelegramHeaderColor,
    hapticImpact,
} from '../services/telegramMiniApp';
import type { TelegramUser, TelegramThemeParams } from '../services/telegramMiniApp';

interface TelegramContextType {
    /** Запущено ли приложение внутри Telegram Mini App */
    isMiniApp: boolean;
    /** Данные пользователя Telegram (null если не в Mini App или данных нет) */
    telegramUser: TelegramUser | null;
    /** Параметры темы Telegram */
    theme: TelegramThemeParams | null;
    /** Светлая или тёмная тема в Telegram */
    colorScheme: 'light' | 'dark' | null;
    /** Вибро-отклик (если доступен) */
    haptic: (style?: 'light' | 'medium' | 'heavy') => void;
}

const TelegramContext = createContext<TelegramContextType>({
    isMiniApp: false,
    telegramUser: null,
    theme: null,
    colorScheme: null,
    haptic: () => {},
});

/**
 * Провайдер для Telegram Mini App.
 *
 * Что делает:
 * 1. Определяет, запущено ли приложение в Telegram
 * 2. Получает данные пользователя (имя, фото, id)
 * 3. Синхронизирует цветовую тему с Telegram
 * 4. Сообщает Telegram, что приложение готово (ready)
 * 5. Раскрывает приложение на весь экран
 */
export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isMiniApp] = useState(() => isTelegramMiniApp());
    const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
    const [theme, setTheme] = useState<TelegramThemeParams | null>(null);
    const [colorScheme, setColorScheme] = useState<'light' | 'dark' | null>(null);

    useEffect(() => {
        if (!isMiniApp) return;

        // Получаем данные пользователя
        const user = getTelegramUser();
        setTelegramUser(user);

        // Получаем тему
        const tgTheme = getTelegramTheme();
        setTheme(tgTheme);

        // Получаем цветовую схему
        const scheme = getTelegramColorScheme();
        setColorScheme(scheme);

        // Применяем тему Telegram к нашему приложению
        if (scheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Устанавливаем цвет шапки Telegram = цвету нашего фона
        const bgColor = scheme === 'dark' ? '#020617' : '#f8fafc';
        setTelegramHeaderColor(bgColor);

        // Раскрываем на весь экран
        expandMiniApp();

        // Сообщаем Telegram: "Мы готовы!"
        telegramReady();
    }, [isMiniApp]);

    // Подписываемся на изменение темы (если пользователь переключит в Telegram)
    useEffect(() => {
        if (!isMiniApp) return;

        const webApp = window.Telegram?.WebApp;
        if (!webApp) return;

        const handleThemeChange = () => {
            setTheme(getTelegramTheme());
            setColorScheme(getTelegramColorScheme());
            const newScheme = getTelegramColorScheme();
            if (newScheme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        webApp.onEvent('themeChanged', handleThemeChange);
        return () => {
            webApp.offEvent('themeChanged', handleThemeChange);
        };
    }, [isMiniApp]);

    return (
        <TelegramContext.Provider
            value={{
                isMiniApp,
                telegramUser,
                theme,
                colorScheme,
                haptic: (style = 'light') => hapticImpact(style),
            }}
        >
            {children}
        </TelegramContext.Provider>
    );
};

/** Хук для получения данных Telegram Mini App */
export const useTelegram = () => useContext(TelegramContext);
