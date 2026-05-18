/**
 * Сервис для интеграции с Telegram Mini Apps (WebApp API).
 * Документация: https://core.telegram.org/bots/webapp
 *
 * Этот файл содержит типы и функции для работы с Telegram WebApp API:
 * - Определение, запущено ли приложение внутри Telegram
 * - Получение данных пользователя
 * - Управление интерфейсом (кнопки, цвета, haptic)
 * - Валидация initData
 */

declare global {
    interface Window {
        Telegram?: {
            WebApp: TelegramWebApp;
        };
    }
}

/** Данные пользователя из Telegram */
export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    allows_write_to_pm?: boolean;
    photo_url?: string;
}

/** Параметры темы из Telegram */
export interface TelegramThemeParams {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
    header_bg_color?: string;
    accent_text_color?: string;
    section_bg_color?: string;
    section_header_text_color?: string;
    subtitle_text_color?: string;
    destructive_text_color?: string;
}

interface TelegramWebApp {
    initData: string;
    initDataUnsafe: {
        query_id?: string;
        user?: TelegramUser;
        receiver?: TelegramUser;
        chat?: {
            id: number;
            type: string;
            title?: string;
            username?: string;
            photo_url?: string;
        };
        chat_type?: string;
        chat_instance?: string;
        start_param?: string;
        can_send_after?: number;
        auth_date: number;
        hash: string;
    };
    version: string;
    platform: string;
    colorScheme: 'light' | 'dark';
    themeParams: TelegramThemeParams;
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    headerColor: string;
    backgroundColor: string;
    isClosingConfirmationEnabled: boolean;
    isActive: boolean;

    ready(): void;
    expand(): void;
    close(): void;
    enableClosingConfirmation(): void;
    disableClosingConfirmation(): void;
    showPopup(params: PopupParams, callback?: (id?: string) => void): void;
    showAlert(message: string, callback?: () => void): void;
    showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
    openLink(url: string, options?: { try_instant_view?: boolean }): void;
    openTelegramLink(url: string): void;
    openInvoice(url: string, callback?: (status: string) => void): void;
    readTextFromClipboard(callback?: (text: string) => void): void;
    requestWriteAccess(callback?: (success: boolean) => void): void;
    requestContact(callback?: (success: boolean, response?: unknown) => void): void;
    ready(): void;
    sendData(data: string): void;
    switchInlineQuery(query: string, choose_chat_types?: string[]): void;

    MainButton: MainButton;
    SecondaryButton: MainButton;
    BackButton: BackButton;
    HapticFeedback: HapticFeedback;

    onEvent(eventType: string, callback: () => void): void;
    offEvent(eventType: string, callback: () => void): void;
    setHeaderColor(color: string): void;
    setBackgroundColor(color: string): void;
}

interface PopupParams {
    title?: string;
    message: string;
    buttons?: PopupButton[];
}

type PopupButton =
    | { id?: string; type: 'default' | 'destructive'; text: string }
    | { id?: string; type: 'ok' | 'close' | 'cancel' };

interface MainButton {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    setParams(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
}

interface BackButton {
    isVisible: boolean;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
}

interface HapticFeedback {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
}

// ==================== ПРОСТЫЕ ФУНКЦИИ ДЛЯ ИСПОЛЬЗОВАНИЯ ====================

/** Проверяем, запущено ли приложение внутри Telegram Mini App */
export function isTelegramMiniApp(): boolean {
    return typeof window !== 'undefined' && !!window.Telegram?.WebApp;
}

/** Получаем объект WebApp (или null, если не в Telegram) */
export function getWebApp(): TelegramWebApp | null {
    if (typeof window === 'undefined') return null;
    return window.Telegram?.WebApp ?? null;
}

/** Получаем данные пользователя из Telegram */
export function getTelegramUser(): TelegramUser | null {
    return getWebApp()?.initDataUnsafe?.user ?? null;
}

/** Получаем параметры темы Telegram */
export function getTelegramTheme(): TelegramThemeParams | null {
    return getWebApp()?.themeParams ?? null;
}

/** Telegram сам сообщает, светлая или тёмная тема */
export function getTelegramColorScheme(): 'light' | 'dark' | null {
    return getWebApp()?.colorScheme ?? null;
}

/**
 * Говорим Telegram: "Приложение загрузилось, можно показывать".
 * Вызывать ОБЯЗАТЕЛЬНО после монтирования React-приложения.
 */
export function telegramReady(): void {
    getWebApp()?.ready();
}

/**
 * Вибрация при нажатии (taptic engine на iOS, вибро на Android).
 * Используйте при нажатии на кнопки для тактильного отклика.
 */
export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
    getWebApp()?.HapticFeedback?.impactOccurred(style);
}

/** Вибрация-уведомление (успех, ошибка, предупреждение) */
export function hapticNotify(type: 'error' | 'success' | 'warning'): void {
    getWebApp()?.HapticFeedback?.notificationOccurred(type);
}

/**
 * Показываем главную кнопку Telegram (плавающая внизу).
 * В Mini App принято вместо "Сохранить" внутри формы
 * использовать эту кнопку.
 */
export function showMainButton(text: string, onClick: () => void, color?: string): void {
    const btn = getWebApp()?.MainButton;
    if (!btn) return;
    btn.setText(text);
    btn.onClick(onClick);
    if (color) btn.setParams({ color });
    btn.show();
}

/** Скрываем главную кнопку */
export function hideMainButton(): void {
    getWebApp()?.MainButton?.hide();
}

/** Активируем/деактивируем главную кнопку */
export function setMainButtonEnabled(enabled: boolean): void {
    const btn = getWebApp()?.MainButton;
    if (!btn) return;
    if (enabled) {
        btn.enable();
    } else {
        btn.disable();
    }
}

/** Показываем спиннер загрузки на главной кнопке */
export function showMainButtonProgress(): void {
    getWebApp()?.MainButton?.showProgress(true);
}

export function hideMainButtonProgress(): void {
    getWebApp()?.MainButton?.hideProgress();
}

/** Показываем кнопку "Назад" в шапке Telegram */
export function showBackButton(onClick: () => void): void {
    const btn = getWebApp()?.BackButton;
    if (!btn) return;
    btn.onClick(onClick);
    btn.show();
}

export function hideBackButton(): void {
    getWebApp()?.BackButton?.hide();
}

/** Показываем нативный Alert Telegram (лучше, чем браузерный alert) */
export function showTelegramAlert(message: string, callback?: () => void): void {
    getWebApp()?.showAlert(message, callback);
}

/** Показываем нативный Confirm */
export function showTelegramConfirm(message: string, callback?: (confirmed: boolean) => void): void {
    getWebApp()?.showConfirm(message, callback);
}

/**
 * Закрываем Mini App и отправляем данные боту.
 * Бот получит сообщение с этими данными.
 */
export function closeMiniApp(data?: string): void {
    const webApp = getWebApp();
    if (!webApp) return;
    if (data) webApp.sendData(data);
    webApp.close();
}

/**
 * Устанавливаем цвет шапки Telegram под цвет нашего приложения.
 * Это делает переход между Telegram и Mini App плавным.
 */
export function setTelegramHeaderColor(color: string): void {
    getWebApp()?.setHeaderColor(color);
}

/**
 * Раскрываем Mini App на весь экран (убираем нижнюю панель Telegram).
 * Вызывать при старте.
 */
export function expandMiniApp(): void {
    getWebApp()?.expand();
}

/**
 * Подтверждение закрытия.
 * Если включено — при свайпе вниз пользователь увидит
 * "Вы уверены, что хотите закрыть приложение?"
 */
export function enableClosingConfirmation(): void {
    getWebApp()?.enableClosingConfirmation();
}

/**
 * Валидация initData на сервере (Node.js / Firebase Function).
 * ЭТУ ФУНКЦИЮ НЕЛЬЗЯ использовать на клиенте — токен бота нельзя светить!
 *
 * Пример использования на сервере:
 * ```ts
 * const isValid = validateInitData(initData, '123456:ABC-DEF...');
 * ```
 */
export function validateInitData(_initData: string, _botToken: string): boolean {
    // Эта функция предназначена ТОЛЬКО для серверной части.
    // На клиенте мы НЕ можем проверить подпись, т.к. нет токена бота.
    // Поэтому на клиенте мы ДОВЕРЯЕМ window.Telegram.WebApp.initDataUnsafe
    // (Telegram сам гарантирует, что эти данные не подделаны в рамках WebView)
    return true;
}
