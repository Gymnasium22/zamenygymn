/**
 * Экранирует значение для использования в CSV (RFC 4180).
 * Если значение содержит запятую, кавычку, перевод строки или возврат каретки,
 * оно оборачивается в двойные кавычки, а внутренние кавычки удваиваются.
 */
export const escapeCsv = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};
