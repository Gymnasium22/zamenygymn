import { describe, it, expect } from 'vitest';
import { escapeCsv } from '../utils/csv';

describe('escapeCsv', () => {
    it('возвращает обычное значение без изменений', () => {
        expect(escapeCsv('Иванов')).toBe('Иванов');
    });

    it('оборачивает значение с запятой в кавычки', () => {
        expect(escapeCsv('Иванов, Иван')).toBe('"Иванов, Иван"');
    });

    it('удваивает кавычки внутри значения', () => {
        expect(escapeCsv('Иванов, "Иван"')).toBe('"Иванов, ""Иван"""');
    });

    it('оборачивает значение с переводом строки', () => {
        expect(escapeCsv('первая\nвторая')).toBe('"первая\nвторая"');
    });

    it('возвращает пустую строку для null и undefined', () => {
        expect(escapeCsv(null)).toBe('');
        expect(escapeCsv(undefined)).toBe('');
    });

    it('преобразует число в строку', () => {
        expect(escapeCsv(42)).toBe('42');
    });
});
