
import { AppData, ScheduleItem } from '../types';

/**
 * Генерирует уникальный идентификатор (UUID v4)
 */
export const generateId = (): string => {
    return crypto.randomUUID();
};

/**
 * Определяет текущий семестр на основе даты и конфигурации
 */
export const getActiveSemester = (date: Date, settings?: AppData['settings']): 1 | 2 => {
    const currentMonth = date.getMonth();
    const semesterConfig = settings?.semesterConfig;

    if (semesterConfig) {
        if (semesterConfig.secondSemesterMonths.includes(currentMonth)) return 2;
        if (semesterConfig.firstSemesterMonths.includes(currentMonth)) return 1;
    }

    // По умолчанию: Январь (0) - Май (4) = 2 семестр, остальное = 1 семестр
    return (currentMonth >= 0 && currentMonth <= 4) ? 2 : 1;
};

/**
 * Возвращает актуальное расписание для указанной даты
 */
export const getScheduleForDate = (date: Date, data: AppData): ScheduleItem[] => {
    const semester = getActiveSemester(date, data.settings);
    return semester === 2 ? (data.schedule2 || []) : (data.schedule || []);
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

export const getLocalDateString = formatDateISO;
