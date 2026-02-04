
import { useState, useMemo, useEffect } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext'; 
import { Icon } from '../components/Icons';
import { Shift, SHIFT_PERIODS, DAYS, TelegramTemplates, AdminAnnouncement } from '../types';
import { formatDateISO, getScheduleForDate } from '../utils/helpers';
import { Modal } from '../components/UI';

export const AdminPage = () => {
    const { subjects, teachers, classes, rooms, settings, saveStaticData } = useStaticData(); 
    const { schedule1, schedule2 } = useScheduleData();

    const [activeTab, setActiveTab] = useState('teachers');
    const [selectedDate, setSelectedDate] = useState(formatDateISO());
    
    const [teacherShift, setTeacherShift] = useState(Shift.First);
    const [afterPeriod, setAfterPeriod] = useState(1);
    const [roomShift, setRoomShift] = useState(Shift.First);
    const [roomPeriod, setRoomPeriod] = useState(1);

    const [telegramToken, setTelegramToken] = useState('');
    const [feedbackChatId, setFeedbackChatId] = useState('');
    
    // Weather Settings
    const [weatherApiKey, setWeatherApiKey] = useState('');
    const [weatherCity, setWeatherCity] = useState('');

    // Telegram Templates State
    const [templates, setTemplates] = useState<TelegramTemplates>({ summary: '', teacherNotification: '', teacherSummary: '' });
    const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);

    // Admin Announcement State
    const [announcement, setAnnouncement] = useState<AdminAnnouncement>({ message: '', active: false, lastUpdated: '' });

    // Определяем актуальное расписание на основе выбранной даты
    const activeSchedule = useMemo(() => {
        const data = { schedule: schedule1, schedule2, settings };
        const schedule = getScheduleForDate(new Date(selectedDate), data as any);
        return schedule;
    }, [selectedDate, schedule1, schedule2, settings]);

    useEffect(() => {
        if (settings) {
            setTelegramToken(settings.telegramToken || '');
            setFeedbackChatId(settings.feedbackChatId || '');
            setWeatherApiKey(settings.weatherApiKey || '');
            setWeatherCity(settings.weatherCity || 'Minsk,BY');
            setTemplates(settings.telegramTemplates || { 
                summary: "⚡️ **ЗАМЕНЫ НА {{date}}** ⚡️\n\n{{content}}",
                teacherNotification: "🔔 **Вам назначена замена!**\n📅 {{date}}\n\n{{content}}\n\nПожалуйста, ознакомьтесь с деталями.",
                teacherSummary: "🔔 **Ваши замены на {{date}}**\n\n{{content}}Пожалуйста, ознакомьтесь с деталями."
            });
            setAnnouncement(settings.adminAnnouncement || { message: '', active: false, lastUpdated: '' });
        }
    }, [settings]);

    useEffect(() => {
        setAfterPeriod(teacherShift === Shift.First ? 1 : 0);
    }, [teacherShift]);

    useEffect(() => {
        setRoomPeriod(roomShift === Shift.First ? 1 : 0);
    }, [roomShift]);

    const selectedDayOfWeek = useMemo(() => {
        const idx = new Date(selectedDate).getDay();
        if (idx === 0 || idx === 6) return null;
        return DAYS[idx - 1];
    }, [selectedDate]);

    const periodsForShift = SHIFT_PERIODS[teacherShift];

    const freeTeachers = useMemo(() => {
        if (!selectedDayOfWeek) return [];
        return teachers.filter(teacher => {
            if (teacher.shifts && !teacher.shifts.includes(teacherShift)) return false;
            if (teacher.unavailableDates.includes(selectedDate)) return false;
            // Используем activeSchedule вместо schedule
            const hasLateLessons = activeSchedule.some(s => 
                s.teacherId === teacher.id && 
                s.day === selectedDayOfWeek && 
                s.period > afterPeriod && 
                s.shift === teacherShift
            );
            return !hasLateLessons;
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [teachers, selectedDate, selectedDayOfWeek, afterPeriod, teacherShift, activeSchedule]);

    const freeRooms = useMemo(() => {
        if (!selectedDayOfWeek) return [];
        const occupiedRoomIds = new Set();
        // Используем activeSchedule вместо schedule
        activeSchedule.forEach(s => {
            if (s.day === selectedDayOfWeek && s.period === roomPeriod && s.shift === roomShift && s.roomId) {
                occupiedRoomIds.add(s.roomId);
            }
        });
        const availableDictRooms = rooms.filter(r => !occupiedRoomIds.has(r.id)).map(r => r.name);
        return availableDictRooms;
    }, [activeSchedule, rooms, selectedDayOfWeek, roomPeriod, roomShift]);

    const saveSettings = async () => {
        await saveStaticData({ 
            settings: { 
                ...settings, 
                telegramToken, 
                feedbackChatId,
                weatherApiKey,
                weatherCity,
                telegramTemplates: templates,
                adminAnnouncement: { 
                    ...announcement, 
                    lastUpdated: new Date().toISOString() 
                } 
            } 
        });
        alert("Настройки сохранены!");
        setIsTemplatesModalOpen(false);
    };

    const toggleAnnouncement = () => {
        setAnnouncement(prev => ({ ...prev, active: !prev.active }));
    };

    return (
        <div className="max-w-7xl mx-auto w-full pb-20">
            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <Icon name="Settings" className="text-indigo-600 dark:text-indigo-400" />
                        Администрация и Поиск
                    </h1>
                     <div className="flex gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                        <button onClick={() => setActiveTab('teachers')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'teachers' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>Учителя</button>
                        <button onClick={() => setActiveTab('rooms')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'rooms' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>Кабинеты</button>
                        <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>Настройки</button>
                    </div>
                </div>

                {activeTab !== 'settings' && (
                     <div className="mb-6">
                         <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 tracking-wider">Дата</label>
                         <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border border-slate-200 dark:border-slate-600 p-3 rounded-xl font-bold outline-none focus:border-indigo-500 bg-transparent dark:text-white w-full md:w-auto min-w-[200px]" />
                     </div>
                )}
                
                {activeTab === 'teachers' && (
                    <div className="flex flex-wrap gap-8 items-end">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 tracking-wider">Смена</label>
                            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                                <button onClick={() => setTeacherShift(Shift.First)} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${teacherShift === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>1 смена</button>
                                <button onClick={() => setTeacherShift(Shift.Second)} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${teacherShift === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>2 смена</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 tracking-wider">Свободен после урока №</label>
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                                {periodsForShift.map(num => (
                                    <button key={num} onClick={() => setAfterPeriod(num)} className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold text-sm transition-all ${afterPeriod === num ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>{num}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'rooms' && (
                    <div className="flex flex-wrap gap-8 items-end">
                         <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 tracking-wider">Смена</label>
                            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                                <button onClick={() => setRoomShift(Shift.First)} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${roomShift === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>1 смена</button>
                                <button onClick={() => setRoomShift(Shift.Second)} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${roomShift === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>2 смена</button>
                            </div>
                         </div>
                         <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 tracking-wider">Урок №</label>
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                                {SHIFT_PERIODS[roomShift].map(num => (
                                    <button key={num} onClick={() => setRoomPeriod(num)} className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold text-sm transition-all ${roomPeriod === num ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>{num}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'settings' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-6">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-white flex items-center gap-2"><Icon name="Zap" size={20}/> Основные настройки</h3>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Bot Token</label>
                                    <input 
                                        type="password" 
                                        value={telegramToken} 
                                        onChange={e => setTelegramToken(e.target.value)} 
                                        placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                                        className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Токен от @BotFather</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Chat ID для обратной связи</label>
                                    <input 
                                        type="text" 
                                        value={feedbackChatId} 
                                        onChange={e => setFeedbackChatId(e.target.value)} 
                                        placeholder="-100123456789"
                                        className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">ID чата или администратора</p>
                                </div>

                                <div className="pt-4 border-t border-slate-200 dark:border-slate-600">
                                    <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2"><Icon name="Cloud" size={16}/> Погода (OpenWeatherMap)</h4>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">API Key</label>
                                            <input 
                                                type="password" 
                                                value={weatherApiKey} 
                                                onChange={e => setWeatherApiKey(e.target.value)} 
                                                placeholder="b6907d28..."
                                                className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Город</label>
                                            <input 
                                                type="text" 
                                                value={weatherCity} 
                                                onChange={e => setWeatherCity(e.target.value)} 
                                                placeholder="Minsk,BY"
                                                className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                <button onClick={() => setIsTemplatesModalOpen(true)} className="w-full px-4 py-3 bg-white dark:bg-slate-700 border border-indigo-200 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold hover:bg-indigo-50 dark:hover:bg-slate-600 transition flex items-center justify-center gap-2">
                                    <Icon name="Edit" size={18} /> Редактировать шаблоны сообщений
                                </button>
                            </div>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-2xl border border-amber-100 dark:border-amber-900 space-y-6">
                            <h3 className="font-bold text-lg text-amber-900 dark:text-amber-100 flex items-center gap-2"><Icon name="Bell" size={20}/> Доска объявлений</h3>
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                Сообщение, которое увидят все учителя на главной странице (Рабочий стол).
                            </p>
                            
                            <div>
                                <textarea
                                    value={announcement.message}
                                    onChange={e => setAnnouncement({ ...announcement, message: e.target.value })}
                                    rows={4}
                                    className="w-full border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm bg-white dark:bg-slate-800 dark:text-white outline-none focus:border-amber-500 focus:ring-2 ring-amber-500/20 resize-none"
                                    placeholder="Например: Срочный педсовет сегодня в 14:00..."
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <div className={`w-12 h-6 rounded-full p-1 transition-colors ${announcement.active ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${announcement.active ? 'translate-x-6' : 'translate-x-0'}`}></div>
                                    </div>
                                    <input type="checkbox" className="hidden" checked={announcement.active} onChange={toggleAnnouncement} />
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Активно</span>
                                </label>
                                <div className="text-xs text-slate-400">
                                    {announcement.lastUpdated ? `Обновлено: ${new Date(announcement.lastUpdated).toLocaleDateString()}` : ''}
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                             <button onClick={saveSettings} className="w-full px-6 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 text-lg">
                                <Icon name="Save" size={22} /> Сохранить все настройки
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {activeTab === 'teachers' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {freeTeachers.map(t => (
                        <div key={t.id} className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4 hover:shadow-md transition-all">
                            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <Icon name="CheckCircle" size={22} />
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-slate-800 dark:text-slate-200 text-lg leading-tight truncate">{t.name}</div>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {t.subjectIds.slice(0, 2).map(sid => {
                                        const s = subjects.find(sub => sub.id === sid);
                                        return s ? <span key={sid} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">{s.name}</span> : null
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                    {freeTeachers.length === 0 && <div className="col-span-full py-12 text-center text-slate-400">Не найдено учителей, свободных после {afterPeriod} урока в {teacherShift}</div>}
                </div>
            )}

             {activeTab === 'rooms' && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {freeRooms.map(roomName => (
                        <div key={roomName} className="bg-white dark:bg-dark-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm text-center flex flex-col items-center justify-center hover:border-indigo-500 transition-all hover:shadow-md group">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <Icon name="DoorOpen" size={20}/>
                            </div>
                            <div className="text-xl font-black text-slate-800 dark:text-white">{roomName}</div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1">Свободен</div>
                        </div>
                    ))}
                    {freeRooms.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400">
                            <Icon name="AlertTriangle" size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-600"/>
                            <p>Нет свободных кабинетов в это время (или расписание не заполнено).</p>
                        </div>
                    )}
                </div>
            )}

            <Modal isOpen={isTemplatesModalOpen} onClose={() => setIsTemplatesModalOpen(false)} title="Шаблоны сообщений" maxWidth="max-w-3xl">
                <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900 text-sm text-blue-800 dark:text-blue-300">
                        <p className="font-bold mb-1">Доступные переменные:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li><code>{`{{date}}`}</code> — Текущая дата (напр. "01.09.2023")</li>
                            <li><code>{`{{content}}`}</code> — Сгенерированный список замен</li>
                        </ul>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Общая сводка (Канал/Группа)</label>
                        <textarea
                            value={templates.summary}
                            onChange={e => setTemplates({...templates, summary: e.target.value})}
                            rows={4}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 font-mono"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Личное уведомление (Один урок)</label>
                        <textarea
                            value={templates.teacherNotification}
                            onChange={e => setTemplates({...templates, teacherNotification: e.target.value})}
                            rows={4}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 font-mono"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Личная сводка (Все замены учителю)</label>
                        <textarea
                            value={templates.teacherSummary}
                            onChange={e => setTemplates({...templates, teacherSummary: e.target.value})}
                            rows={4}
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 font-mono"
                        />
                    </div>
                    
                    <div className="flex justify-end pt-4">
                        <button onClick={saveSettings} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">Сохранить шаблоны</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
