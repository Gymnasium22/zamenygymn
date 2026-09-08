import React, { useEffect, useState } from 'react';
import { Icon } from './Icons';
import { useStaticData } from '../context/DataContext';

export const CloudSaveStatus: React.FC<{ compact?: boolean }> = ({ compact }) => {
    const {
        saveStatus = 'saved',
        lastSavedAt = null,
        lastSaveError = null,
        queueLength = 0,
        isSaving = false
    } = useStaticData();
    const [, tick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => tick((n) => n + 1), 15000);
        return () => clearInterval(id);
    }, []);

    const when = lastSavedAt
        ? new Date(lastSavedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
        : null;

    let label = 'Сохранено';
    let sub = when ? `в облаке · ${when}` : 'в облаке';
    let cls = 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300';
    let icon: string = 'Cloud';

    if (!navigator.onLine && saveStatus !== 'queued') {
        label = 'Нет сети';
        sub = 'правки на этом устройстве';
        cls = 'text-amber-800 bg-amber-50 dark:bg-amber-900/25 dark:text-amber-300';
        icon = 'WifiOff';
    }
    if (isSaving || saveStatus === 'saving') {
        label = 'Сохранение…';
        sub = 'отправка в облако';
        cls = 'text-indigo-700 bg-indigo-50 dark:bg-indigo-900/25 dark:text-indigo-300';
        icon = 'Loader';
    } else if (saveStatus === 'queued' || queueLength > 0) {
        label = 'Ждёт сеть';
        sub = queueLength > 1 ? `${queueLength} изменений в очереди` : 'синхронизируется при связи';
        cls = 'text-amber-800 bg-amber-50 dark:bg-amber-900/25 dark:text-amber-300';
        icon = 'WifiOff';
    } else if (saveStatus === 'error') {
        label = 'Ошибка';
        sub = lastSaveError || 'не удалось сохранить в облако';
        cls = 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300';
        icon = 'AlertTriangle';
    } else if (saveStatus === 'offline') {
        label = 'Нет сети';
        sub = 'сохранено локально';
        cls = 'text-amber-800 bg-amber-50 dark:bg-amber-900/25 dark:text-amber-300';
        icon = 'WifiOff';
    }

    return (
        <div
            title={sub}
            className={`flex items-center gap-1 rounded-lg font-bold ${cls} ${
                compact ? 'max-w-[5.5rem] px-1.5 py-1 text-[10px]' : 'gap-1.5 px-2 py-1 text-[11px]'
            }`}
        >
            <Icon name={icon} size={compact ? 12 : 13} className={icon === 'Loader' ? 'animate-spin shrink-0' : 'shrink-0'} />
            <span className="truncate leading-tight min-w-0">
                {label}
                {!compact && <span className="font-medium opacity-80"> · {sub}</span>}
            </span>
        </div>
    );
};

export const UndoBar: React.FC = () => {
    const [msg, setMsg] = useState<string | null>(null);
    const [restore, setRestore] = useState<{ run: () => void | Promise<void> } | null>(null);
    const [left, setLeft] = useState(0);

    useEffect(() => {
        const onUndo = (e: Event) => {
            const d = (e as CustomEvent).detail as {
                message?: string;
                restore?: () => void | Promise<void>;
                timeout?: number;
            };
            if (!d?.restore) return;
            setMsg(d.message || 'Удалено');
            setRestore({ run: d.restore });
            setLeft(Math.round((d.timeout || 45000) / 1000));
        };
        window.addEventListener('app-undo', onUndo);
        return () => window.removeEventListener('app-undo', onUndo);
    }, []);

    useEffect(() => {
        if (!msg) return;
        const t = setInterval(() => {
            setLeft((s) => {
                if (s <= 1) {
                    setMsg(null);
                    setRestore(null);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [msg]);

    if (!msg || !restore) return null;

    return (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-900 text-white shadow-xl text-sm font-semibold">
            <span className="max-w-[16rem] truncate">{msg}</span>
            <span className="text-slate-400 text-xs tabular-nums">{left}с</span>
            <button
                type="button"
                className="px-3 py-1 rounded-lg bg-white text-slate-900 text-xs font-black"
                onClick={async () => {
                    await restore.run();
                    setMsg(null);
                    setRestore(null);
                }}
            >
                Отменить
            </button>
        </div>
    );
};

export function offerUndo(message: string, restore: () => void | Promise<void>, timeout = 45000) {
    window.dispatchEvent(new CustomEvent('app-undo', { detail: { message, restore, timeout } }));
}
