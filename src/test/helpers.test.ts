import { describe, it, expect } from 'vitest';
import { getActiveSemester, getScheduleForDate, formatDateISO } from '../utils/helpers';
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
});
