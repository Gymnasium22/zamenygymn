/**
 * Обёртка над Telegram WebApp API.
 * Вне Telegram функции безопасно no-op.
 */

export type TelegramWebAppUser = {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
};

export type TelegramWebApp = {
    initData: string;
    initDataUnsafe: {
        user?: TelegramWebAppUser;
        auth_date?: number;
        hash?: string;
        query_id?: string;
        start_param?: string;
    };
    version: string;
    platform: string;
    colorScheme: 'light' | 'dark';
    themeParams: Record<string, string>;
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    ready: () => void;
    expand: () => void;
    close: () => void;
    enableClosingConfirmation?: () => void;
    disableClosingConfirmation?: () => void;
    setHeaderColor: (color: string) => void;
    setBackgroundColor: (color: string) => void;
    MainButton: {
        text: string;
        isVisible: boolean;
        show: () => void;
        hide: () => void;
        setText: (text: string) => void;
        onClick: (cb: () => void) => void;
        offClick: (cb: () => void) => void;
    };
    BackButton: {
        isVisible: boolean;
        show: () => void;
        hide: () => void;
        onClick: (cb: () => void) => void;
        offClick: (cb: () => void) => void;
    };
    HapticFeedback?: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
    };
    openLink: (url: string) => void;
    showAlert: (message: string, callback?: () => void) => void;
    showConfirm: (message: string, callback?: (ok: boolean) => void) => void;
};

declare global {
    interface Window {
        Telegram?: { WebApp?: TelegramWebApp };
    }
}

export const getTelegramWebApp = (): TelegramWebApp | null => {
    if (typeof window === 'undefined') return null;
    return window.Telegram?.WebApp ?? null;
};

/** Настоящий клиент Telegram (есть initData или platform tdesktop/ios/android…) */
export const isInsideTelegram = (): boolean => {
    const wa = getTelegramWebApp();
    if (!wa) return false;
    return Boolean(wa.initData) || ['ios', 'android', 'android_x', 'tdesktop', 'macos', 'weba', 'webk'].includes(wa.platform);
};

export const initTelegramMiniApp = (): TelegramWebApp | null => {
    const wa = getTelegramWebApp();
    if (!wa) return null;
    try {
        wa.ready();
        wa.expand();
        const dark = wa.colorScheme === 'dark';
        wa.setHeaderColor(dark ? '#0f172a' : '#4f46e5');
        wa.setBackgroundColor(dark ? '#0f172a' : '#f8fafc');
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.classList.add('tg-webapp');
        document.body.classList.add('tg-webapp-body');
    } catch {
        // ignore
    }
    return wa;
};

export const hapticLight = () => {
    try {
        getTelegramWebApp()?.HapticFeedback?.impactOccurred('light');
    } catch {
        /* ignore */
    }
};

export const getTelegramUserName = (): string => {
    const u = getTelegramWebApp()?.initDataUnsafe?.user;
    if (!u) return '';
    return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '';
};
