/**
 * Safe localStorage wrappers with quota/error handling.
 * Use these instead of raw localStorage to avoid crashes in
 * Safari Private Mode, storage quota exceeded, etc.
 */

import { logger } from './logger';

export const safeLocalStorageGet = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        logger.warn('Failed to read from localStorage:', e);
        return null;
    }
};

export const safeLocalStorageSet = (key: string, value: string): boolean => {
    try {
        // Проверяем размер данных (localStorage обычно имеет лимит 5-10MB)
        const sizeInBytes = new Blob([value]).size;
        const maxSize = 4 * 1024 * 1024; // 4MB лимит для безопасности

        if (sizeInBytes > maxSize) {
            logger.warn('Data too large for localStorage, skipping backup');
            return false;
        }

        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        logger.warn('Failed to save to localStorage:', e);
        return false;
    }
};

export const safeLocalStorageRemove = (key: string): void => {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        logger.warn('Failed to remove from localStorage:', e);
    }
};
