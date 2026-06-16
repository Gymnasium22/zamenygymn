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
