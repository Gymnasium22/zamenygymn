/**
 * Простой логгер.
 * В режиме разработки выводит сообщения в консоль.
 * В продакшене подавляет лишний вывод, чтобы не засорять консоль пользователя.
 */
const isDev = import.meta.env.DEV;

export const logger = {
    log: (...args: unknown[]): void => {
        if (isDev) console.log(...args);
    },
    warn: (...args: unknown[]): void => {
        if (isDev) console.warn(...args);
    },
    info: (...args: unknown[]): void => {
        if (isDev) console.info(...args);
    },
    error: (...args: unknown[]): void => {
        // Ошибки в продакшене можно дополнительно отправлять в Sentry
        if (isDev) console.error(...args);
    }
};
