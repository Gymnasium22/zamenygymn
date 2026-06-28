import { useState, useEffect } from 'react';
import { useStaticData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { SchoolCalendar, CalendarEvent } from '../components/SchoolCalendar';
import { useToast } from '../components/UI';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';

const STORAGE_KEY = 'gym_calendar_events';

export const CalendarPage = () => {
    const { settings: _settings } = useStaticData();
    const { addToast } = useToast();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const stored = safeLocalStorageGet(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) setEvents(parsed);
            } catch {
                // ignore
            }
        }
        setLoading(false);
    }, []);

    const handleEventsChange = (newEvents: CalendarEvent[]) => {
        setEvents(newEvents);
        safeLocalStorageSet(STORAGE_KEY, JSON.stringify(newEvents));
        addToast({ type: 'success', title: 'Сохранено', message: 'Календарь обновлён' });
    };

    const exportEvents = () => {
        const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `school_calendar_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importEvents = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target?.result as string);
                if (Array.isArray(parsed)) {
                    setEvents(parsed);
                    safeLocalStorageSet(STORAGE_KEY, JSON.stringify(parsed));
                    addToast({ type: 'success', title: 'Импорт', message: 'События загружены' });
                }
            } catch {
                addToast({ type: 'danger', title: 'Ошибка', message: 'Неверный формат файла' });
            }
        };
        reader.readAsText(file);
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Icon name="Loader" size={32} className="animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col max-w-5xl mx-auto w-full">
            <div className="shrink-0 mb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                            <Icon name="Calendar" className="text-indigo-600 dark:text-indigo-400" />
                            Школьный календарь
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            Каникулы, экзамены, собрания и мероприятия
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            accept=".json"
                            onChange={(e) => e.target.files?.[0] && importEvents(e.target.files[0])}
                            className="hidden"
                            id="calendar-import"
                        />
                        <label
                            htmlFor="calendar-import"
                            className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                        >
                            Импорт
                        </label>
                        <button
                            onClick={exportEvents}
                            className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-xl transition"
                        >
                            Экспорт
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-auto">
                <SchoolCalendar events={events} onEventsChange={handleEventsChange} />
            </div>
        </div>
    );
};
