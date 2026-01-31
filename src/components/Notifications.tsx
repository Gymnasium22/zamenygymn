import React, { useMemo, useState, useEffect } from 'react';
import { Icon } from './Icons';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { useNavigate } from 'react-router-dom';
import { generateId } from '../utils/helpers';

interface NotificationItem {
    id: string;
    title: string;
    detail?: string;
    type: 'info' | 'warning' | 'alert';
    timestamp?: number;
    href?: string;
}

export const NotificationFeed = ({ limit = 10 }: { limit?: number }) => {
    const { teachers, classes } = useStaticData();
    const { substitutions, schedule } = useScheduleData();
    const navigate = useNavigate();
    const [readMap, setReadMap] = useState<Record<string, boolean>>(() => {
        try {
            const raw = localStorage.getItem('notif_read_map');
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    });

    useEffect(() => {
        try { localStorage.setItem('notif_read_map', JSON.stringify(readMap)); } catch {}
    }, [readMap]);

    const items = useMemo<NotificationItem[]>(() => {
        const list: NotificationItem[] = [];
        const todayStr = new Date().toISOString().slice(0,10);

        // Active substitutions today — high priority
        substitutions.filter(s => s.date === todayStr).slice().reverse().forEach(s => {
            const original = teachers.find(t => t.id === s.originalTeacherId);
            const repl = teachers.find(t => t.id === s.replacementTeacherId);
            list.push({
                id: generateId(),
                title: `Замена: ${s.lesson || ''}`,
                detail: original ? `${original.name} → ${repl ? repl.name : '...'}` : 'Замена',
                type: 'alert',
                timestamp: Date.now(),
                href: '/substitutions'
            });
        });

        // Absent teachers (full day)
        teachers.filter(t => t.unavailableDates.includes(todayStr)).forEach(t => {
            list.push({
                id: generateId(),
                title: `Отсутствует: ${t.name}`,
                detail: 'Отсутствует сегодня',
                type: 'warning',
                timestamp: Date.now() - 1000
            });
        });

        // Upcoming lessons starting soon (derive from schedule)
        const now = new Date();
        const minutesNow = now.getHours() * 60 + now.getMinutes();
        schedule.forEach(it => {
            // try parse start time if present
            if (!it.startTime) return;
            const [h,m] = String(it.startTime).split(':').map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) {
                const mins = h*60 + m;
                const delta = mins - minutesNow;
                if (delta >= 0 && delta <= 30) {
                    list.push({
                        id: generateId(),
                        title: `Скоро: ${it.subjectId || 'урок'}`,
                        detail: `через ${delta} мин — класс ${it.classId || ''}`,
                        type: 'info',
                        timestamp: Date.now() - delta*60000
                    });
                }
            }
        });

        // Sort by type then timestamp
        list.sort((a,b) => {
            const score = (i: NotificationItem) => i.type === 'alert' ? 3 : i.type === 'warning' ? 2 : 1;
            const sd = score(b) - score(a);
            if (sd !== 0) return sd;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        return list.slice(0, limit);
    }, [substitutions, teachers, schedule, limit]);

    if (!items.length) return (
        <div className="glass-panel p-4 rounded-2xl text-sm text-slate-500 dark:text-slate-400">Нет новых уведомлений</div>
    );

    return (
        <div className="glass-panel p-4 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold">Лента уведомлений</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setReadMap({}); localStorage.removeItem('notif_read_map'); }} className="text-xs text-slate-400 hover:text-slate-600">Пометить все прочитанными</button>
                </div>
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar">
                {items.map(i => (
                    <div key={i.id} className={`p-3 rounded-lg border ${i.type === 'alert' ? 'border-red-200 bg-red-50/30' : i.type === 'warning' ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100 bg-white/70'} flex items-start gap-3` }>
                        <div className="mt-0.5">
                            {i.type === 'alert' ? <Icon name="AlertTriangle" size={18} className="text-red-600" /> : i.type === 'warning' ? <Icon name="Info" size={18} className="text-amber-600" /> : <Icon name="Clock" size={18} className="text-slate-500" />}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between gap-4">
                                <div className="font-semibold text-sm text-slate-800 dark:text-white">{i.title}</div>
                                <div className="text-[10px] text-slate-400">{new Date(i.timestamp || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                            </div>
                            {i.detail && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{i.detail}</div>}
                        </div>
                        <div className="flex flex-col gap-1">
                            {i.href ? <button onClick={() => navigate(i.href!)} className="text-xs text-indigo-600 hover:underline">Открыть</button> : null}
                            <button onClick={() => setReadMap(prev => ({ ...prev, [i.id]: true }))} className="text-xs text-slate-400">Пометить</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default NotificationFeed;
