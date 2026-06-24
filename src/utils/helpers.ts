import { AppData, ScheduleItem } from '../types';

/**
 * Генерирует уникальный идентификатор (UUID v4)
 * Работает и на HTTPS, и на HTTP (fallback через Math.random)
 */
export const generateId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback для HTTP-сайтов или старых браузеров
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

/**
 * Определяет текущий семестр на основе даты и конфигурации.
 * null — месяц не назначен ни одному семестру (каникулы).
 */
export const getActiveSemester = (date: Date, settings?: AppData['settings']): 1 | 2 | null => {
    const currentMonth = date.getMonth();
    const semesterConfig = settings?.semesterConfig;

    if (semesterConfig && Array.isArray(semesterConfig.secondSemesterMonths) && Array.isArray(semesterConfig.firstSemesterMonths)) {
        if (semesterConfig.secondSemesterMonths.includes(currentMonth)) return 2;
        if (semesterConfig.firstSemesterMonths.includes(currentMonth)) return 1;
        return null;
    }

    // Без конфигурации:
    // Январь (0) - Май (4) = 2 семестр
    // Сентябрь (8) - Декабрь (11) = 1 семестр
    // Июнь (5) - Август (7) = каникулы (null)
    if (currentMonth >= 0 && currentMonth <= 4) return 2;
    if (currentMonth >= 8 && currentMonth <= 11) return 1;
    return null;
};

/**
 * Возвращает актуальное расписание для указанной даты
 */
export const getScheduleForDate = (
    date: Date,
    data: {
        settings?: AppData['settings'];
        schedule?: ScheduleItem[];
        schedule2?: ScheduleItem[];
    }
): ScheduleItem[] => {
    const semester = getActiveSemester(date, data.settings);
    if (semester === null) return [];
    return semester === 2 ? data.schedule2 || [] : data.schedule || [];
};

/**
 * Безопасное получение даты в формате YYYY-MM-DD
 */
export const formatDateISO = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Форматирование даты в европейском формате DD.MM.YYYY
 */
export const formatDateEuropean = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
};

/**
 * Проверяет, является ли строка валидной датой в формате YYYY-MM-DD.
 */
export const isValidDateString = (value: string): boolean => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value);
    if (isNaN(date.getTime())) return false;
    const [year, month, day] = value.split('-').map(Number);
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
    );
};

/**
 * Безопасно парсит строку даты YYYY-MM-DD в объект Date.
 * Возвращает null, если дата невалидна.
 */
export const parseDateSafe = (value: string | Date | undefined): Date | null => {
    if (!value) return null;
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return null;
    return date;
};

/**
 * Возвращает дату из строки или текущую дату, если строка невалидна.
 */
export const getDateOrToday = (value: string | Date | undefined): Date => {
    return parseDateSafe(value) ?? new Date();
};

/**
 * Проверяет, является ли строка валидным месяцем в формате YYYY-MM.
 */
export const isValidMonthString = (value: string): boolean => {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
    const [year, month] = value.split('-').map(Number);
    return year > 0 && month >= 1 && month <= 12;
};

/**
 * Безопасно парсит строку месяца YYYY-MM в объект Date (первый день месяца).
 * Возвращает null, если строка невалидна.
 */
export const parseMonthSafe = (value: string | undefined): Date | null => {
    if (!value || !isValidMonthString(value)) return null;
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    if (isNaN(date.getTime())) return null;
    return date;
};

/**
 * Возвращает месяц из строки или текущую дату, если строка невалидна.
 */
export const getMonthOrNow = (value: string | undefined): Date => {
    return parseMonthSafe(value) ?? new Date();
};
