import React, { useState, useMemo } from 'react';
import { Icon } from './Icons';
import { Modal } from './UI';
import { generateId } from '../utils/helpers';

export interface CalendarEvent {
    id: string;
    date: string; // YYYY-MM-DD
    title: string;
    type: 'holiday' | 'exam' | 'meeting' | 'event' | 'other';
    description?: string;
}

const EVENT_COLORS: Record<CalendarEvent['type'], string> = {
    holiday: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    exam: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    meeting: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    event: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
    other: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
};

const EVENT_LABELS: Record<CalendarEvent['type'], string> = {
    holiday: 'Каникулы/выходной',
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
    const [selectedDate, setSelectedDate] = useState<string>('');

    const [form, setForm] = useState<CalendarEvent>({
        id: '',
        date: '',
        title: '',
        type: 'event',
        description: ''
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
        setSelectedDate(dateStr);
        setForm({ id: generateId(), date: dateStr, title: '', type: 'event', description: '' });
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

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
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

            <div className="grid grid-cols-7 gap-1">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                    <div key={d} className="text-center text-xs font-bold text-slate-400 dark:text-slate-500 py-2 uppercase">
                        {d}
                    </div>
                ))}
                {calendarDays.map((day, i) => {
                    const dayEvents = eventsByDate.get(day.dateStr) || [];
                    return (
                        <div
                            key={i}
                            onClick={() => !readOnly && day.isCurrentMonth && openAdd(day.dateStr)}
                            className={`min-h-[80px] p-1.5 rounded-xl border transition-all cursor-pointer ${
                                day.isCurrentMonth
                                    ? 'bg-white dark:bg-dark-800 border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700'
                                    : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-50 dark:border-slate-800 opacity-50'
                            } ${isToday(day.dateStr) ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                        >
                            <div className={`text-sm font-bold mb-1 ${isToday(day.dateStr) ? 'text-indigo-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                {day.date}
                            </div>
                            <div className="space-y-1">
                                {dayEvents.slice(0, 3).map((ev) => (
                                    <div
                                        key={ev.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            !readOnly && openEdit(ev);
                                        }}
                                        className={`text-[10px] px-1.5 py-0.5 rounded border truncate cursor-pointer ${EVENT_COLORS[ev.type]}`}
                                    >
                                        {ev.title}
                                    </div>
                                ))}
                                {dayEvents.length > 3 && (
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 px-1.5">+{dayEvents.length - 3}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
                {Object.entries(EVENT_LABELS).map(([type, label]) => (
                    <div key={type} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded border ${EVENT_COLORS[type as CalendarEvent['type']]}`} />
                        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
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
