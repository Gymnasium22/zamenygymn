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

/** Locale for Belarus-facing UI (dates, months, weekdays). */
export const BY_LOCALE = 'ru-BY';

/**
 * Storage / SQL format: YYYY-MM-DD (local calendar day, no UTC shift).
 */
export const formatDateISO = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Belarus / EU display format: DD.MM.YYYY
 * Accepts Date, ISO YYYY-MM-DD, or already DD.MM.YYYY.
 */
export const formatDateEuropean = (date: Date | string): string => {
    if (date == null || date === '') return '';
    if (typeof date === 'string') {
        const s = date.trim();
        // Already Belarus format
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
        // ISO date (optionally with time)
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            return `${iso[3]}.${iso[2]}.${iso[1]}`;
        }
        const d = new Date(s);
        if (isNaN(d.getTime())) return '';
        return formatDateEuropean(d);
    }
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
};

/**
 * Time display/storage for UI: HH:MM (24-hour, as in Belarus).
 */
export const formatTimeHM = (value: Date | string | null | undefined): string => {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
        const s = value.trim();
        const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (m) {
            const hh = String(Math.min(23, Number(m[1]))).padStart(2, '0');
            const mm = String(Math.min(59, Number(m[2]))).padStart(2, '0');
            return `${hh}:${mm}`;
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        return '';
    }
    if (isNaN(value.getTime())) return '';
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
};

/**
 * Date + time for logs/exports: DD.MM.YYYY HH:MM
 */
export const formatDateTimeEuropean = (date: Date | string): string => {
    const d = typeof date === 'string' ? parseDateSafe(date) : date;
    if (!d || isNaN(d.getTime())) {
        // ISO datetime string without reliable parse
        if (typeof date === 'string' && date.includes('T')) {
            const [dayPart, timePart] = date.split('T');
            const dateStr = formatDateEuropean(dayPart);
            const timeStr = formatTimeHM(timePart);
            return timeStr ? `${dateStr} ${timeStr}` : dateStr;
        }
        return formatDateEuropean(date);
    }
    return `${formatDateEuropean(d)} ${formatTimeHM(d)}`;
};

/**
 * Month display: MM.YYYY (from YYYY-MM storage or Date).
 */
export const formatMonthEuropean = (value: string | Date | undefined): string => {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
        if (/^\d{2}\.\d{4}$/.test(value)) return value;
        const m = value.match(/^(\d{4})-(\d{2})/);
        if (m) return `${m[2]}.${m[1]}`;
    }
    const d = typeof value === 'string' ? parseMonthSafe(value) : value;
    if (!d || isNaN(d.getTime())) return '';
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

/**
 * Convert display date (DD.MM.YYYY or YYYY-MM-DD) → storage YYYY-MM-DD.
 * Does not call parseDateSafe (avoids recursion).
 */
export const toDateISO = (value: string | Date | undefined | null): string => {
    if (value == null || value === '') return '';
    if (value instanceof Date) {
        if (isNaN(value.getTime())) return '';
        return formatDateISO(value);
    }
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return isValidDateString(s) ? s : '';
    }
    const eu = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (eu) {
        const day = Number(eu[1]);
        const month = Number(eu[2]);
        const year = Number(eu[3]);
        if (!isValidYmd(year, month, day)) return '';
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
};

/**
 * Convert display month (MM.YYYY or YYYY-MM) → storage YYYY-MM.
 */
export const toMonthISO = (value: string | undefined | null): string => {
    if (!value) return '';
    const s = value.trim();
    if (/^\d{4}-\d{2}$/.test(s) && isValidMonthString(s)) return s;
    const eu = s.match(/^(\d{1,2})\.(\d{4})$/);
    if (eu) {
        const month = Number(eu[1]);
        const year = Number(eu[2]);
        if (month < 1 || month > 12) return '';
        return `${year}-${String(month).padStart(2, '0')}`;
    }
    return '';
};

const isValidYmd = (year: number, month: number, day: number): boolean => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
};

/**
 * Проверяет, является ли строка валидной датой в формате YYYY-MM-DD.
 */
export const isValidDateString = (value: string): boolean => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    return isValidYmd(year, month, day);
};

/**
 * Валидная дата в отображаемом формате DD.MM.YYYY.
 */
export const isValidEuropeanDateString = (value: string): boolean => {
    return isValidDateString(toDateISO(value));
};

/**
 * Безопасно парсит YYYY-MM-DD, DD.MM.YYYY или Date → Date (local calendar).
 */
export const parseDateSafe = (value: string | Date | undefined): Date | null => {
    if (!value) return null;
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }
    const s = value.trim();
    const iso = toDateISO(s);
    if (iso) {
        const [year, month, day] = iso.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
    }
    // ISO datetime with time part
    const withTime = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
    if (withTime) {
        const date = new Date(Number(withTime[1]), Number(withTime[2]) - 1, Number(withTime[3]));
        return isNaN(date.getTime()) ? null : date;
    }
    return null;
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
 * Безопасно парсит строку месяца YYYY-MM / MM.YYYY в объект Date (первый день месяца).
 */
export const parseMonthSafe = (value: string | undefined): Date | null => {
    if (!value) return null;
    const iso = toMonthISO(value) || (isValidMonthString(value) ? value : '');
    if (!iso || !isValidMonthString(iso)) return null;
    const [year, month] = iso.split('-').map(Number);
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

/**
 * Month name + year in Belarus locale, e.g. "сентябрь 2026 г."
 */
export const formatMonthLong = (value: string | Date | undefined): string => {
    const d = typeof value === 'string' ? parseMonthSafe(value) ?? parseDateSafe(value) : value;
    if (!d || isNaN(d.getTime())) return '';
    return d.toLocaleDateString(BY_LOCALE, { month: 'long', year: 'numeric' });
};

/**
 * Long date for dashboards: "понедельник, 15 сентября"
 */
export const formatDateLong = (value: Date | string): string => {
    const d = parseDateSafe(value);
    if (!d) return formatDateEuropean(value);
    return d.toLocaleDateString(BY_LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
};
