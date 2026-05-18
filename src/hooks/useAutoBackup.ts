import { useEffect, useRef } from 'react';
import { useStaticData } from '../context/DataContext';
import { formatDateISO, formatDateEuropean } from '../utils/helpers';
import { AppData } from '../types';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';

const LAST_BACKUP_KEY = 'gym_last_auto_backup_date';

const performBackup = async (
    settings: AppData['settings'],
    privateSettings: AppData['privateSettings'],
    signal: AbortSignal
) => {
    const data = safeLocalStorageGet('gym_data_local_backup_v2');
    if (!data) return;

    const blob = new Blob([data], { type: 'application/json' });

    // Auto-backup sends ONLY to Telegram — no local download
    if (privateSettings.telegramToken && settings.feedbackChatId) {
        try {
            const formData = new FormData();
            formData.append('chat_id', settings.feedbackChatId);
            formData.append('caption', `📦 Автобэкап ${formatDateEuropean(new Date())}`);
            formData.append('document', new File([blob], `backup_${formatDateISO()}.json`, { type: 'application/json' }));
            const response = await fetch(
                `https://api.telegram.org/bot${privateSettings.telegramToken}/sendDocument`,
                { method: 'POST', body: formData, signal }
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            if (!result.ok) {
                throw new Error(result.description || 'Telegram API error');
            }
        } catch (err) {
            console.warn('Auto-backup failed:', err);
        }
    }
};

export const useAutoBackup = () => {
    const { settings, privateSettings } = useStaticData();
    const lastCheckRef = useRef<number>(-1);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!settings?.autoBackup || !settings?.backupTime) return;

        abortRef.current?.abort();
        const interval = setInterval(() => {
            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            // Avoid duplicate backups within the same minute
            if (nowMinutes === lastCheckRef.current) return;
            lastCheckRef.current = nowMinutes;

            const [backupHour, backupMinute] = settings.backupTime!.split(':').map(Number);
            const backupMinutes = backupHour * 60 + backupMinute;

            if (nowMinutes === backupMinutes) {
                const todayStr = formatDateISO();
                const lastBackup = safeLocalStorageGet(LAST_BACKUP_KEY);
                if (lastBackup !== todayStr) {
                    safeLocalStorageSet(LAST_BACKUP_KEY, todayStr);
                    abortRef.current?.abort();
                    abortRef.current = new AbortController();
                    performBackup(settings, privateSettings, abortRef.current.signal);
                }
            }
        }, 30000); // Check every 30 seconds

        return () => {
            clearInterval(interval);
            abortRef.current?.abort();
        };
    }, [settings, privateSettings]);
};
