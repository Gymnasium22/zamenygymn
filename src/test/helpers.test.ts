import { describe, it, expect } from 'vitest';
import {
    getActiveSemester,
    getScheduleForDate,
    formatDateISO,
    isValidDateString,
    parseDateSafe,
    getDateOrToday,
    isValidMonthString,
    parseMonthSafe,
    getMonthOrNow
} from '../utils/helpers';
import { AppData, ScheduleItem } from '../types';

describe('getActiveSemester', () => {
    it('возвращает 2 семестр для января (0)', () => {
        const date = new Date(2026, 0, 15);
        expect(getActiveSemester(date)).toBe(2);
    });

    it('возвращает 2 семестр для мая (4)', () => {
        const date = new Date(2026, 4, 15);
        expect(getActiveSemester(date)).toBe(2);
    });

    it('возвращает 1 семестр для сентября (8)', () => {
        const date = new Date(2026, 8, 1);
        expect(getActiveSemester(date)).toBe(1);
    });

    it('учитывает кастомную конфигурацию семестров', () => {
        const date = new Date(2026, 6, 15); // июль
        const settings = {
            semesterConfig: {
                firstSemesterMonths: [6, 7, 8],
                secondSemesterMonths: [0, 1, 2]
            }
        } as AppData['settings'];
        expect(getActiveSemester(date, settings)).toBe(1);
    });

    it('возвращает null для каникулярного месяца (июнь)', () => {
        const date = new Date(2026, 5, 15);
        const settings = {
            semesterConfig: {
                firstSemesterMonths: [8, 9, 10, 11],
                secondSemesterMonths: [0, 1, 2, 3, 4]
            }
        } as AppData['settings'];
        expect(getActiveSemester(date, settings)).toBeNull();
    });

    it('возвращает null для июня (5) без кастомной конфигурации', () => {
        const date = new Date(2026, 5, 15);
        expect(getActiveSemester(date)).toBeNull();
    });

    it('возвращает null для июля (6) без кастомной конфигурации', () => {
        const date = new Date(2026, 6, 15);
        expect(getActiveSemester(date)).toBeNull();
    });

    it('возвращает null для августа (7) без кастомной конфигурации', () => {
        const date = new Date(2026, 7, 15);
        expect(getActiveSemester(date)).toBeNull();
    });
});

describe('formatDateISO', () => {
    it('форматирует дату в YYYY-MM-DD', () => {
        const date = new Date(2026, 4, 13); // 13 мая 2026
        expect(formatDateISO(date)).toBe('2026-05-13');
    });

    it('добавляет ведущий ноль к месяцу и дню', () => {
        const date = new Date(2026, 0, 5); // 5 января 2026
        expect(formatDateISO(date)).toBe('2026-01-05');
    });
});

describe('getScheduleForDate', () => {
    it('возвращает schedule2 для 2-го семестра', () => {
        const date = new Date(2026, 0, 15); // январь
        const schedule = [{ id: '1' }] as ScheduleItem[];
        const schedule2 = [{ id: '2' }] as ScheduleItem[];
        expect(getScheduleForDate(date, { schedule, schedule2 })).toEqual(schedule2);
    });

    it('возвращает schedule для 1-го семестра', () => {
        const date = new Date(2026, 8, 1); // сентябрь
        const schedule = [{ id: '1' }] as ScheduleItem[];
        const schedule2 = [{ id: '2' }] as ScheduleItem[];
        expect(getScheduleForDate(date, { schedule, schedule2 })).toEqual(schedule);
    });

    it('возвращает пустой массив в каникулы', () => {
        const date = new Date(2026, 5, 15); // июнь
        const schedule = [{ id: '1' }] as ScheduleItem[];
        const schedule2 = [{ id: '2' }] as ScheduleItem[];
        const settings = {
            semesterConfig: {
                firstSemesterMonths: [8, 9, 10, 11],
                secondSemesterMonths: [0, 1, 2, 3, 4]
            }
        } as AppData['settings'];
        expect(getScheduleForDate(date, { settings, schedule, schedule2 })).toEqual([]);
    });
});


describe('isValidDateString', () => {
    it('принимает корректную дату', () => {
        expect(isValidDateString('2026-05-13')).toBe(true);
    });

    it('отклоняет невалидную дату', () => {
        expect(isValidDateString('2026-02-30')).toBe(false);
    });

    it('отклоняет пустую строку', () => {
        expect(isValidDateString('')).toBe(false);
    });

    it('отклоняет неправильный формат', () => {
        expect(isValidDateString('13.05.2026')).toBe(false);
    });
});

describe('parseDateSafe', () => {
    it('парсит корректную строку', () => {
        const date = parseDateSafe('2026-05-13');
        expect(date).not.toBeNull();
        expect(date!.toISOString().startsWith('2026-05-13')).toBe(true);
    });

    it('возвращает null для невалидной строки', () => {
        expect(parseDateSafe('invalid')).toBeNull();
    });

    it('возвращает null для пустой строки', () => {
        expect(parseDateSafe('')).toBeNull();
    });
});

describe('getDateOrToday', () => {
    it('возвращает дату для корректной строки', () => {
        const date = getDateOrToday('2026-05-13');
        expect(date.toISOString().startsWith('2026-05-13')).toBe(true);
    });

    it('возвращает сегодня для невалидной строки', () => {
        const date = getDateOrToday('invalid');
        expect(date.getTime()).not.toBeNaN();
    });
});

describe('isValidMonthString', () => {
    it('принимает корректный месяц', () => {
        expect(isValidMonthString('2026-05')).toBe(true);
    });

    it('отклоняет месяц больше 12', () => {
        expect(isValidMonthString('2026-13')).toBe(false);
    });

    it('отклоняет неправильный формат', () => {
        expect(isValidMonthString('05.2026')).toBe(false);
    });
});

describe('parseMonthSafe', () => {
    it('парсит корректный месяц', () => {
        const date = parseMonthSafe('2026-05');
        expect(date).not.toBeNull();
        expect(date!.getMonth()).toBe(4);
    });

    it('возвращает null для невалидного месяца', () => {
        expect(parseMonthSafe('2026-13')).toBeNull();
    });
});

describe('getMonthOrNow', () => {
    it('возвращает месяц для корректной строки', () => {
        const date = getMonthOrNow('2026-05');
        expect(date.getMonth()).toBe(4);
    });

    it('возвращает сегодня для невалидной строки', () => {
        const date = getMonthOrNow('invalid');
        expect(date.getTime()).not.toBeNaN();
    });
});
