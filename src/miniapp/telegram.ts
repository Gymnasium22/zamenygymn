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

export type TelegramThemeParams = {
    bg_color?: string;
    secondary_bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    header_bg_color?: string;
    accent_text_color?: string;
    section_bg_color?: string;
    section_header_text_color?: string;
    subtitle_text_color?: string;
    destructive_text_color?: string;
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
    themeParams: TelegramThemeParams;
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
    openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
    openTelegramLink?: (url: string) => void;
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

/** Настоящий клиент Telegram */
export const isInsideTelegram = (): boolean => {
    const wa = getTelegramWebApp();
    if (!wa) return false;
    return (
        Boolean(wa.initData) ||
        ['ios', 'android', 'android_x', 'tdesktop', 'macos', 'weba', 'webk'].includes(wa.platform)
    );
};

/** Прокидываем themeParams Telegram в CSS variables */
export const applyTelegramTheme = (wa: TelegramWebApp) => {
    const root = document.documentElement;
    const tp = wa.themeParams || {};
    const map: Record<string, string | undefined> = {
        '--tg-theme-bg-color': tp.bg_color,
        '--tg-theme-secondary-bg-color': tp.secondary_bg_color,
        '--tg-theme-text-color': tp.text_color,
        '--tg-theme-hint-color': tp.hint_color,
        '--tg-theme-link-color': tp.link_color,
        '--tg-theme-button-color': tp.button_color,
        '--tg-theme-button-text-color': tp.button_text_color,
        '--tg-theme-header-bg-color': tp.header_bg_color,
        '--tg-theme-accent-text-color': tp.accent_text_color,
        '--tg-theme-section-bg-color': tp.section_bg_color
    };
    for (const [key, val] of Object.entries(map)) {
        if (val) root.style.setProperty(key, val);
        else root.style.removeProperty(key);
    }
};

export const initTelegramMiniApp = (): TelegramWebApp | null => {
    const wa = getTelegramWebApp();
    if (!wa) return null;
    try {
        wa.ready();
        wa.expand();
        applyTelegramTheme(wa);

        const dark = wa.colorScheme === 'dark';
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.classList.add('tg-webapp');
        document.body.classList.add('tg-webapp-body');

        const header =
            wa.themeParams.header_bg_color ||
            wa.themeParams.bg_color ||
            (dark ? '#0f172a' : '#ffffff');
        const bg =
            wa.themeParams.secondary_bg_color ||
            wa.themeParams.bg_color ||
            (dark ? '#0f172a' : '#f8fafc');
        try {
            wa.setHeaderColor(header);
            wa.setBackgroundColor(bg);
        } catch {
            /* older clients */
            wa.setHeaderColor(dark ? '#0f172a' : '#4f46e5');
            wa.setBackgroundColor(dark ? '#0f172a' : '#f8fafc');
        }

        try {
            wa.enableClosingConfirmation?.();
        } catch {
            /* ignore */
        }
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

export const hapticSuccess = () => {
    try {
        getTelegramWebApp()?.HapticFeedback?.notificationOccurred('success');
    } catch {
        /* ignore */
    }
};

export const getTelegramUserName = (): string => {
    const u = getTelegramWebApp()?.initDataUnsafe?.user;
    if (!u) return '';
    return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '';
};

/** Открыть полную веб-версию во внешнем браузере */
export const openExternalAppUrl = (hashRoute = '/dashboard') => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const base = import.meta.env.BASE_URL || '/';
    const basePath = base.endsWith('/') ? base : `${base}/`;
    const route = hashRoute.startsWith('/') ? hashRoute : `/${hashRoute}`;
    // e.g. https://host/zamenygymn/#/dashboard
    const url = `${origin}${basePath}#${route}`;

    const wa = getTelegramWebApp();
    if (wa && isInsideTelegram()) {
        try {
            wa.openLink(url, { try_instant_view: false });
            return;
        } catch {
            /* fall through */
        }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};
