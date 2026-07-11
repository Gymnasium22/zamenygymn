import React, { useState, useMemo } from 'react';
import { Icon } from './Icons';
import { Modal } from './UI';
import { generateId } from '../utils/helpers';
import { CalendarEvent } from '../types';

/** Фон + текст чипа события */
const EVENT_COLORS: Record<CalendarEvent['type'], string> = {
    holiday: 'bg-red-500 text-white border-red-600 shadow-sm shadow-red-500/20',
    celebration: 'bg-pink-500 text-white border-pink-600 shadow-sm shadow-pink-500/20',
    exam: 'bg-amber-500 text-white border-amber-600 shadow-sm shadow-amber-500/20',
    meeting: 'bg-sky-500 text-white border-sky-600 shadow-sm shadow-sky-500/20',
    event: 'bg-violet-500 text-white border-violet-600 shadow-sm shadow-violet-500/20',
    other: 'bg-slate-500 text-white border-slate-600 shadow-sm'
};

/** Точка-легенда / полоска */
const EVENT_DOT: Record<CalendarEvent['type'], string> = {
    holiday: 'bg-red-500',
    celebration: 'bg-pink-500',
    exam: 'bg-amber-500',
    meeting: 'bg-sky-500',
    event: 'bg-violet-500',
    other: 'bg-slate-500'
};

const EVENT_LABELS: Record<CalendarEvent['type'], string> = {
    holiday: 'Каникулы/выходной',
    celebration: 'Праздник',
    exam: 'Экзамен/контрольная',
    meeting: 'Собрание',
    event: 'Мероприятие',
    other: 'Другое'
};

interface SchoolCalendarProps {
    events: CalendarEvent[];
    onEventsChange?: (events: CalendarEvent[]) => void;
    readOnly?: boolean;
}

export const SchoolCalendar: React.FC<SchoolCalendarProps> = ({ events, onEventsChange, readOnly = false }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

    const [form, setForm] = useState<CalendarEvent>({
        id: '',
        date: '',
        title: '',
        type: 'event',
        description: '',
        showInWidget: true
    });

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);
    const firstDayOfMonth = useMemo(() => new Date(year, month, 1).getDay(), [year, month]);

    const monthName = new Date(year, month).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });

    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        events.forEach((e) => {
            const list = map.get(e.date) || [];
            list.push(e);
            map.set(e.date, list);
        });
        return map;
    }, [events]);

    const openAdd = (dateStr: string) => {
        setEditingEvent(null);
        setForm({ id: generateId(), date: dateStr, title: '', type: 'event', description: '', showInWidget: true });
        setIsModalOpen(true);
    };

    const openEdit = (event: CalendarEvent) => {
        setEditingEvent(event);
        setForm({ ...event });
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        const newEvents = editingEvent
            ? events.map((ev) => (ev.id === editingEvent.id ? form : ev))
            : [...events, form];
        onEventsChange?.(newEvents);
        setIsModalOpen(false);
    };

    const handleDelete = () => {
        if (!editingEvent) return;
        const newEvents = events.filter((ev) => ev.id !== editingEvent.id);
        onEventsChange?.(newEvents);
        setIsModalOpen(false);
    };

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const today = () => setCurrentDate(new Date());

    const calendarDays: { date: number; dateStr: string; isCurrentMonth: boolean }[] = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Monday start

    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        const m = month === 0 ? 11 : month - 1;
        const y = month === 0 ? year - 1 : year;
        calendarDays.push({ date: d, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push({ date: i, dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`, isCurrentMonth: true });
    }
    const remaining = 42 - calendarDays.length;
    for (let i = 1; i <= remaining; i++) {
        const m = month === 11 ? 0 : month + 1;
        const y = month === 11 ? year + 1 : year;
        calendarDays.push({ date: i, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`, isCurrentMonth: false });
    }

    const isToday = (dateStr: string) => {
        const t = new Date();
        return dateStr === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    };

    const isWeekend = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDay();
        return day === 0 || day === 6;
    };

    return (
        <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                        <Icon name="ArrowRight" size={18} className="rotate-180" />
                    </button>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white capitalize min-w-[200px] text-center">
                        {monthName}
                    </h2>
                    <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                        <Icon name="ArrowRight" size={18} />
                    </button>
                </div>
                <button onClick={today} className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-lg transition">
                    Сегодня
                </button>
            </div>

            <div className="grid grid-cols-7 grid-rows-6 gap-1 flex-1 min-h-0">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                    <div key={d} className="text-center text-xs font-bold text-slate-400 dark:text-slate-500 py-1 uppercase">
                        {d}
                    </div>
                ))}
                {calendarDays.map((day, i) => {
                    const dayEvents = eventsByDate.get(day.dateStr) || [];
                    const weekend = isWeekend(day.dateStr);
                    return (
                        <div
                            key={i}
                            onClick={() => !readOnly && day.isCurrentMonth && openAdd(day.dateStr)}
                            title={`${day.dateStr}${dayEvents.length ? ` • ${dayEvents.length} событий` : ''}`}
                            className={`min-h-0 p-1.5 rounded-xl border transition-all cursor-pointer overflow-hidden flex flex-col ${
                                day.isCurrentMonth
                                    ? weekend
                                        ? 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30 hover:border-rose-200 dark:hover:border-rose-800'
                                        : 'bg-white dark:bg-dark-800 border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700'
                                    : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-50 dark:border-slate-800 opacity-50'
                            } ${isToday(day.dateStr) ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                        >
                            <div className={`text-sm font-bold mb-0.5 shrink-0 ${isToday(day.dateStr) ? 'text-indigo-600' : weekend && day.isCurrentMonth ? 'text-rose-500 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {day.date}
                            </div>
                            <div className="flex-1 overflow-hidden space-y-1 min-h-0">
                                {dayEvents.slice(0, 3).map((ev) => {
                                    const t = ev.type in EVENT_COLORS ? ev.type : 'other';
                                    return (
                                        <div
                                            key={ev.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!readOnly) openEdit(ev);
                                            }}
                                            title={`${EVENT_LABELS[t]}: ${ev.title}`}
                                            className={`text-[10px] px-1.5 py-0.5 rounded-md border truncate cursor-pointer font-semibold ${EVENT_COLORS[t]}`}
                                        >
                                            {ev.title}
                                        </div>
                                    );
                                })}
                                {dayEvents.length > 3 && (
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 px-1.5">+{dayEvents.length - 3}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-3 pt-2 shrink-0 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 w-full sm:w-auto sm:mr-1">Типы:</span>
                {Object.entries(EVENT_LABELS).map(([type, label]) => (
                    <div key={type} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full ${EVENT_DOT[type as CalendarEvent['type']]}`} />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
                    </div>
                ))}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingEvent ? 'Редактировать событие' : 'Новое событие'} maxWidth="max-w-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Дата</label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={(e) => setForm({ ...form, date: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Название</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                            placeholder="Название события"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Тип</label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(EVENT_LABELS).map(([type, label]) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setForm({ ...form, type: type as CalendarEvent['type'] })}
                                    className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                                        form.type === type
                                            ? `${EVENT_COLORS[type as CalendarEvent['type']]} ring-2 ring-offset-1 ring-slate-300`
                                            : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Описание</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            rows={3}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 resize-none"
                            placeholder="Дополнительная информация..."
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.showInWidget !== false}
                            onChange={(e) => setForm({ ...form, showInWidget: e.target.checked })}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Показывать на рабочем столе
                    </label>
                    <div className="flex gap-3 pt-2">
                        {editingEvent && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="px-4 py-2.5 text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-xl transition-colors text-sm font-medium"
                            >
                                Удалить
                            </button>
                        )}
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-sm font-medium"
                        >
                            Сохранить
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
