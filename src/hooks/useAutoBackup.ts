import { useEffect, useRef } from 'react';
import { useStaticData } from '../context/DataContext';
import { formatDateISO, formatDateEuropean } from '../utils/helpers';
import { AppData } from '../types';

const LAST_BACKUP_KEY = 'gym_last_auto_backup_date';

const performBackup = async (settings: AppData['settings'], privateSettings: AppData['privateSettings']) => {
    const data = localStorage.getItem('gym_data_local_backup_v2');
    if (!data) return;

    const blob = new Blob([data], { type: 'application/json' });

    // Auto-backup sends ONLY to Telegram — no local download
    if (privateSettings.telegramToken && settings.feedbackChatId) {
        try {
            const formData = new FormData();
            formData.append('chat_id', settings.feedbackChatId);
            formData.append('caption', `📦 Автобекап ${formatDateEuropean(new Date())}`);
            formData.append('document', new File([blob], `backup_${formatDateISO()}.json`, { type: 'application/json' }));
            await fetch(
                `https://api.telegram.org/bot${privateSettings.telegramToken}/sendDocument`,
                { method: 'POST', body: formData }
            );
        } catch {
            // Silently fail — nothing to do if Telegram is unreachable
        }
    }
};

export const useAutoBackup = () => {
    const { settings, privateSettings } = useStaticData();
    const lastCheckRef = useRef<number>(-1);

    useEffect(() => {
        if (!settings?.autoBackup || !settings?.backupTime) return;

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
                const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
                if (lastBackup !== todayStr) {
                    localStorage.setItem(LAST_BACKUP_KEY, todayStr);
                    performBackup(settings, privateSettings);
                }
            }
        }, 30000); // Check every 30 seconds

        return () => clearInterval(interval);
    }, [settings, privateSettings]);
};
