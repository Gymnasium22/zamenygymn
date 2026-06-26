import { useMemo, useState, useEffect, useRef } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { DayOfWeek, DAYS, ScheduleItem, Shift } from '../types';
import { useNavigate, NavLink } from 'react-router-dom';
import { Modal, useToast } from '../components/UI';
import { getActiveSemester, formatDateISO } from '../utils/helpers';
import { weatherService, WeatherData, ForecastItem } from '../services/weatherService';
import { escapeMarkdown } from '../utils/escapeHtml';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';
import { migrateDataToSupabase } from '../services/migration';
import { logger } from '../utils/logger';

// Enhanced interfaces for Live Search
interface EntityStatus {
    type: 'teacher' | 'class' | 'room';
    id: string;
    name: string;
    subName?: string; // e.g. "Математика" or "5А"
    statusText: string;
    statusColor: 'green' | 'blue' | 'red' | 'amber' | 'slate';
    location?: string;
    icon: string;
    isBusy: boolean;
}

interface AbsentTeacher {
    id: string;
    name: string;
    displayReason: string;
}

interface ProblemZone {
    class: string;
    issue: string;
}

interface WidgetConfig {
    id: string;
    label: string;
    fullWidth?: boolean;
    colSpan?: number;
    visible: boolean;
}

// Weather interfaces moved to weatherService.ts

const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'kpi', label: 'KPI', visible: true, colSpan: 1 },
    { id: 'search', label: 'Поиск', visible: true, colSpan: 1 },
    { id: 'substitutions', label: 'Замены', visible: true, colSpan: 1 },
    { id: 'occupancy', label: 'Штат', visible: true, colSpan: 1 },
    { id: 'conflicts', label: 'Конфликты', visible: true, colSpan: 1 },
    { id: 'birthdays', label: 'Праздники', visible: true, colSpan: 1 },
    { id: 'notes', label: 'Заметки', visible: true, colSpan: 2 }
];

const WeatherWidget = () => {
    const { settings, privateSettings } = useStaticData();
    const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
    const [forecastData, setForecastData] = useState<ForecastItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const apiKey = privateSettings.weatherApiKey || settings.weatherApiKey;
    const city = settings.weatherCity || 'Minsk,BY';

    useEffect(() => {
        const controller = new AbortController();
        const fetchWeather = async () => {
            if (!apiKey) {
                setLoading(false);
                return;
            }

            try {
                const data = await weatherService.getWeather(apiKey, city, controller.signal);
                setWeatherData(data.current);
                setForecastData(data.forecast);
                setLoading(false);
            } catch (err) {
                if ((err as Error).name === 'AbortError') return;
                logger.error(err);
                setError('Ошибка загрузки погоды');
                setLoading(false);
            }
        };

        fetchWeather();
        return () => controller.abort();
    }, [apiKey, city]);

    if (!apiKey) {
        return <div className="h-full min-h-[140px] rounded-3xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm font-medium gap-2"><Icon name="Settings" size={16} /> API ключ погоды не настроен</div>;
    }

    if (loading) return <div className="h-32 w-full bg-slate-100 dark:bg-slate-800 rounded-3xl animate-pulse"></div>;
    if (error) return <div className="h-full min-h-[140px] rounded-3xl bg-slate-200 dark:bg-slate-700/50 flex items-center justify-center text-red-500 text-sm font-medium gap-2"><Icon name="AlertTriangle" size={18} /> Не удалось загрузить погоду</div>;
    if (!weatherData) return <div className="h-full min-h-[140px] rounded-3xl bg-slate-100 dark:bg-slate-800 rounded-3xl animate-pulse"></div>;

    const getWeatherIcon = (code: string) => {
        if (code.startsWith('01')) return 'Sun';
        if (code.startsWith('02') || code.startsWith('03') || code.startsWith('04')) return 'Cloud';
        if (code.startsWith('09') || code.startsWith('10')) return 'CloudRain';
        if (code.startsWith('11')) return 'Snowflake';
        if (code.startsWith('50')) return 'Wind';
        return 'Cloud';
    };

    const getWeatherIconClass = (code: string) => {
        if (code.startsWith('01')) return 'animate-weather-sun';
        if (code.startsWith('02') || code.startsWith('03') || code.startsWith('04')) return 'animate-weather-cloud';
        return '';
    };

    const bgGradient = (() => {
        const code = weatherData.weather[0].icon;
        if (code.endsWith('n')) return 'bg-gradient-to-br from-indigo-900 to-purple-900'; // Night
        if (code.startsWith('01') || code.startsWith('02')) return 'bg-gradient-to-br from-sky-400 to-blue-600'; // Clear/Few Clouds
        if (code.startsWith('09') || code.startsWith('10') || code.startsWith('11'))
            return 'bg-gradient-to-br from-slate-500 to-slate-700'; // Rain/Snow
        return 'bg-gradient-to-br from-blue-300 to-slate-400'; // Clouds/Mist
    })();

    const renderLiveEffects = () => {
        const code = weatherData.weather[0].icon;
        
        // Sunny / Clear
        if (code.startsWith('01')) {
            return (
                <div className="absolute top-10 right-10 w-24 h-24 bg-yellow-400/20 dark:bg-yellow-300/15 rounded-full blur-xl animate-pulse pointer-events-none" />
            );
        }
        
        // Cloudy
        if (code.startsWith('02') || code.startsWith('03') || code.startsWith('04')) {
            return (
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                    <div className="absolute -left-10 top-2 w-20 h-10 bg-white rounded-full blur-sm cloud-layer-1" />
                    <div className="absolute -left-20 top-12 w-28 h-12 bg-white rounded-full blur-sm cloud-layer-2" />
                </div>
            );
        }
        
        // Rain
        if (code.startsWith('09') || code.startsWith('10')) {
            return (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                        <div 
                            key={i} 
                            className="rain-streak" 
                            style={{ 
                                left: `${15 + i * 16}%`, 
                                animationDelay: `${i * 0.18}s`,
                                animationDuration: `${0.9 + i * 0.12}s` 
                            }} 
                        />
                    ))}
                </div>
            );
        }
        
        // Snow
        if (code.startsWith('11')) {
            return (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                        <div 
                            key={i} 
                            className="snow-flake-particle" 
                            style={{ 
                                left: `${10 + i * 18}%`, 
                                animationDelay: `${i * 0.3}s`,
                                animationDuration: `${3.8 + i * 0.4}s` 
                            }} 
                        />
                    ))}
                </div>
            );
        }
        
        // Mist / Fog
        if (code.startsWith('50')) {
            return (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[...Array(3)].map((_, i) => (
                        <div 
                            key={i} 
                            className="mist-streak w-2/3" 
                            style={{ 
                                top: `${20 + i * 25}%`, 
                                animationDelay: `${i * 1.5}s`,
                                animationDuration: `${8 + i * 2}s` 
                            }} 
                        />
                    ))}
                </div>
            );
        }

        return null;
    };

    return (
        <div
            className={`py-3.5 px-4 rounded-3xl relative overflow-hidden shadow-md text-white ${bgGradient} flex flex-col justify-between group hover:shadow-lg transition-all duration-300`}
        >
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
            {renderLiveEffects()}

            <div className="relative z-10 flex justify-between items-center">
                <div>
                    <div className="text-2xl font-black tracking-tight">{Math.round(weatherData.main.temp)}°</div>
                    <div className="text-[11px] opacity-90 font-semibold">{weatherData.name}</div>
                </div>
                <div className="flex flex-col items-end">
                    <Icon
                        name={getWeatherIcon(weatherData.weather[0].icon)}
                        size={28}
                        className={`text-white/90 drop-shadow-md mb-0.5 transition-transform duration-300 group-hover:scale-110 ${getWeatherIconClass(weatherData.weather[0].icon)}`}
                    />
                    <div className="text-[8px] opacity-85 uppercase tracking-wider font-bold capitalize">{weatherData.weather[0].description}</div>
                </div>
            </div>

            {/* Advanced Telemetry Grid */}
            <div className="mt-2 grid grid-cols-3 gap-0.5 bg-white/10 dark:bg-black/10 backdrop-blur-md rounded-xl py-1.5 px-2 text-[8px] font-semibold text-center border border-white/10 relative z-10 transition-transform duration-300 hover:scale-[1.02]">
                <div className="flex flex-col items-center gap-0.5">
                    <span className="opacity-75 uppercase tracking-wider text-[7px]">Ощущ.</span>
                    <span className="font-black text-white text-xs">{Math.round(weatherData.main.feels_like ?? weatherData.main.temp)}°</span>
                </div>
                <div className="flex flex-col items-center gap-0.5 border-x border-white/10">
                    <span className="opacity-75 uppercase tracking-wider text-[7px]">Влажн.</span>
                    <span className="font-black text-white text-xs">{weatherData.main.humidity ?? 0}%</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                    <span className="opacity-75 uppercase tracking-wider text-[7px]">Ветер</span>
                    <span className="font-black text-white text-xs">{Math.round(weatherData.wind?.speed ?? 0)} м/с</span>
                </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-white/15 flex justify-between text-center relative z-10">
                {forecastData.slice(0, 3).map((day, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                        <span className="text-[8px] opacity-80 uppercase font-bold">
                            {new Date(day.dt * 1000).toLocaleDateString('ru-RU', { weekday: 'short' })}
                        </span>
                        <span className="text-xs font-bold">{Math.round(day.main.temp)}°</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const DashboardPage = () => {
    const { subjects, teachers, classes, rooms, bellSchedule, settings, privateSettings } = useStaticData();
    const { schedule, substitutions } = useScheduleData();
    const { role, profile } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [notes, setNotes] = useState(safeLocalStorageGet('gym_notes') || '');
    const [currentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<EntityStatus[]>([]);
    const [showAbsentList, setShowAbsentList] = useState(false);
    const [notesChanged, setNotesChanged] = useState(false);

    const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
        const saved = safeLocalStorageGet('gym_dashboard_widgets_v4');
        if (!saved) return DEFAULT_WIDGETS;
        try {
            return JSON.parse(saved);
        } catch {
            return DEFAULT_WIDGETS;
        }
    });

    const roleWidgetAccess = settings.dashboardWidgetAccess || {
        admin: ['weather', 'kpi', 'search', 'substitutions', 'occupancy', 'conflicts', 'birthdays', 'notes'],
        teacher: ['weather', 'kpi', 'search', 'substitutions', 'occupancy', 'conflicts', 'birthdays', 'notes'],
        canteen: ['weather', 'kpi', 'search', 'substitutions', 'occupancy', 'conflicts', 'birthdays', 'notes']
    };

    const allowedWidgets: string[] = role ? roleWidgetAccess[role as 'admin' | 'teacher' | 'canteen'] ?? [] : [];
    const filteredWidgets = widgets.filter((widget) => allowedWidgets.includes(widget.id));
    const canShowWeather = allowedWidgets.includes('weather');
    const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);
    const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
    const widgetDragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [migrating, setMigrating] = useState(false);

    const handleMigrate = async () => {
        if (!window.confirm('Перенести все данные из Firebase в Supabase? Это действие нельзя отменить.')) return;
        setMigrating(true);
        try {
            await migrateDataToSupabase('f1bd501e-e4ee-4e9f-a657-cbd6ccee41c7');
            addToast({ type: 'success', title: 'Готово', message: 'Данные успешно перенесены в Supabase' });
        } catch (err) {
            logger.error('Migration error:', err);
            addToast({ type: 'danger', title: 'Ошибка миграции', message: String(err) });
        } finally {
            setMigrating(false);
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
        setDraggedWidgetId(id);
        e.dataTransfer.effectAllowed = 'move';
        if (widgetDragTimeoutRef.current) clearTimeout(widgetDragTimeoutRef.current);
        const target = e.target;
        widgetDragTimeoutRef.current = setTimeout(() => {
            widgetDragTimeoutRef.current = null;
            if (target instanceof HTMLElement) {
                target.style.opacity = '0.5';
            }
        }, 0);
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        if (widgetDragTimeoutRef.current) {
            clearTimeout(widgetDragTimeoutRef.current);
            widgetDragTimeoutRef.current = null;
        }
        setDraggedWidgetId(null);
        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '1';
            safeLocalStorageSet('gym_dashboard_widgets_v4', JSON.stringify(widgets));
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, id: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (!draggedWidgetId || draggedWidgetId === id) return;

        setWidgets((prev) => {
            const newWidgets = [...prev];
            const draggedIndex = newWidgets.findIndex(w => w.id === draggedWidgetId);
            const dropIndex = newWidgets.findIndex(w => w.id === id);
            
            if (draggedIndex === -1 || dropIndex === -1) return prev;
            
            const [removed] = newWidgets.splice(draggedIndex, 1);
            newWidgets.splice(dropIndex, 0, removed);
            return newWidgets;
        });
    };

    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [isSendingFeedback, setIsSendingFeedback] = useState(false);

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Базовая санитизация заметок — извлекаем только текст, удаляя всю HTML-разметку
    const sanitizeNotes = (text: string): string => {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        return (doc.body.textContent || '').slice(0, 10000);
    };

    const handleNotesChange = (value: string) => {
        const sanitized = sanitizeNotes(value);
        setNotes(sanitized);
        setNotesChanged(true);
    };

    const saveNotes = () => {
        safeLocalStorageSet('gym_notes', notes);
        setNotesChanged(false);
        addToast({
            type: 'success',
            title: 'Заметки сохранены',
            message: 'Ваши заметки успешно сохранены в браузере',
            duration: 3000
        });
    };

    useEffect(() => {
        if (!notesChanged) return;
        const timeoutId = setTimeout(() => {
            safeLocalStorageSet('gym_notes', notes);
            setNotesChanged(false);
        }, 3000);
        return () => clearTimeout(timeoutId);
    }, [notes, notesChanged]);

    // Greeting logic
    const greeting = useMemo(() => {
        const hour = currentDate.getHours();
        if (hour < 5) return 'Доброй ночи';
        if (hour < 12) return 'Доброе утро';
        if (hour < 18) return 'Добрый день';
        return 'Добрый вечер';
    }, [currentDate]);

    const todayStr = useMemo(() => formatDateISO(currentDate), [currentDate]);
    const tomorrowStr = useMemo(() => {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 1);
        return formatDateISO(d);
    }, [currentDate]);
    const todayDayOfWeek = useMemo(() => {
        const idx = currentDate.getDay();
        if (idx === 0 || idx === 6) return null;
        return DAYS[idx - 1];
    }, [currentDate]);

    // kpiData is defined after occupancyStats (see below) to avoid reference-before-initialization

    // --- Live Search Logic ---

    // 1. Determine current school state
    const schoolStatus = useMemo(() => {
        const now = new Date();
        if (getActiveSemester(now, settings) === null) {
            return { type: 'vacation', label: 'Каникулы' };
        }

        const minutesNow = now.getHours() * 60 + now.getMinutes();
        const dayMap = [
            null,
            DayOfWeek.Monday,
            DayOfWeek.Tuesday,
            DayOfWeek.Wednesday,
            DayOfWeek.Thursday,
            DayOfWeek.Friday,
            null
        ];
        const dayName = dayMap[now.getDay()];

        if (!dayName) return { type: 'weekend', label: 'Выходной' };

        let dailyBells = bellSchedule.filter((b) => b.day === dayName);
        if (dailyBells.length === 0) dailyBells = bellSchedule.filter((b) => b.day === 'default');

        const timeToMin = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        // Sort bells
        dailyBells.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

        for (let i = 0; i < dailyBells.length; i++) {
            const bell = dailyBells[i];
            const start = timeToMin(bell.start);
            const end = timeToMin(bell.end);

            if (minutesNow >= start && minutesNow < end) {
                return { type: 'lesson', bell, label: `${bell.period} урок` };
            }

            if (i < dailyBells.length - 1) {
                const nextBell = dailyBells[i + 1];
                const nextStart = timeToMin(nextBell.start);
                if (minutesNow >= end && minutesNow < nextStart) {
                    return { type: 'break', nextBell, label: `Перемена (след. ${nextBell.period} урок)` };
                }
            }
        }

        if (dailyBells.length > 0) {
            const firstStart = timeToMin(dailyBells[0].start);
            if (minutesNow < firstStart) return { type: 'before', label: 'До занятий' };
            return { type: 'after', label: 'Уроки закончились' };
        }

        return { type: 'unknown', label: 'Нет расписания звонков' };
    }, [bellSchedule, settings]);

    // 2. Perform Live Search
    useEffect(() => {
        if (!debouncedSearchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const q = debouncedSearchQuery.toLowerCase();
        const results: EntityStatus[] = [];
        const isLessonNow = schoolStatus.type === 'lesson';
        const activeBell = schoolStatus.type === 'lesson' ? schoolStatus.bell : null;

        const getLessonStatus = (
            lesson: ScheduleItem | undefined,
            _teacherId: string,
            isSubstitution: boolean
        ): { text: string; color: EntityStatus['statusColor']; room: string } => {
            if (!lesson) return { text: 'Свободен', color: 'blue', room: '' };
            const sub = substitutions.find((s) => s.date === todayStr && s.scheduleItemId === lesson.id);
            if (sub?.replacementTeacherId === 'cancelled') return { text: 'Урок отменен', color: 'red', room: '' };
            const subjName = subjects.find((s) => s.id === lesson.subjectId)?.name || 'Предмет';
            const roomName =
                rooms.find((r) => r.id === (sub?.replacementRoomId || lesson.roomId))?.name ||
                sub?.replacementRoomId ||
                lesson.roomId ||
                '?';
            return {
                text: `${subjName} ${isSubstitution ? '(Замена)' : ''}`,
                color: isSubstitution ? 'amber' : 'green',
                room: roomName
            };
        };

        teachers.forEach((t) => {
            if (t.name.toLowerCase().includes(q)) {
                const status: EntityStatus = {
                    type: 'teacher',
                    id: t.id,
                    name: t.name,
                    icon: 'User',
                    statusText: 'Неизвестно',
                    statusColor: 'slate',
                    isBusy: false
                };
                if (t.unavailableDates.includes(todayStr)) {
                    status.statusText = 'Отсутствует';
                    status.statusColor = 'red';
                    status.icon = 'UserX';
                } else if (isLessonNow && activeBell) {
                    const originalLesson = schedule.find(
                        (s) =>
                            s.teacherId === t.id &&
                            s.period === activeBell.period &&
                            s.day === todayDayOfWeek &&
                            s.shift === activeBell.shift
                    );
                    const subAsReplacement = substitutions.find(
                        (s) => s.date === todayStr && s.replacementTeacherId === t.id
                    );
                    let activeLesson = originalLesson;
                    let isSub = false;
                    if (subAsReplacement) {
                        const subbedLesson = schedule.find((s) => s.id === subAsReplacement.scheduleItemId);
                        if (
                            subbedLesson &&
                            subbedLesson.period === activeBell.period &&
                            subbedLesson.shift === activeBell.shift
                        ) {
                            activeLesson = subbedLesson;
                            isSub = true;
                        }
                    } else if (originalLesson) {
                        const subAsOriginal = substitutions.find(
                            (s) => s.date === todayStr && s.scheduleItemId === originalLesson.id
                        );
                        if (subAsOriginal && subAsOriginal.replacementTeacherId !== t.id) activeLesson = undefined;
                    }
                    if (activeLesson) {
                        const info = getLessonStatus(activeLesson, t.id, isSub);
                        status.statusText = info.text;
                        status.location = `Каб. ${info.room}`;
                        status.statusColor = info.color;
                        status.isBusy = true;
                    } else {
                        status.statusText = 'Свободен';
                        status.statusColor = 'blue';
                        status.isBusy = false;
                    }
                } else {
                    status.statusText = schoolStatus.label;
                    status.statusColor = 'slate';
                }
                results.push(status);
            }
        });

        classes.forEach((c) => {
            if (c.name.toLowerCase().includes(q)) {
                const status: EntityStatus = {
                    type: 'class',
                    id: c.id,
                    name: c.name,
                    icon: 'GraduationCap',
                    statusText: '',
                    statusColor: 'slate',
                    isBusy: false
                };
                if (isLessonNow && activeBell) {
                    const lesson = schedule.find(
                        (s) =>
                            s.classId === c.id &&
                            s.period === activeBell.period &&
                            s.day === todayDayOfWeek &&
                            s.shift === activeBell.shift
                    );
                    if (lesson) {
                        const sub = substitutions.find((s) => s.date === todayStr && s.scheduleItemId === lesson.id);
                        if (sub?.replacementTeacherId === 'cancelled') {
                            status.statusText = 'Урок отменен';
                            status.statusColor = 'red';
                        } else {
                            const subjName = subjects.find((s) => s.id === lesson.subjectId)?.name;
                            const roomName =
                                rooms.find((r) => r.id === (sub?.replacementRoomId || lesson.roomId))?.name ||
                                sub?.replacementRoomId ||
                                lesson.roomId;
                            status.statusText = subjName || 'Урок';
                            status.location = `Каб. ${roomName}`;
                            status.statusColor = 'green';
                            status.isBusy = true;
                        }
                    } else {
                        status.statusText = 'Нет урока';
                        status.statusColor = 'blue';
                    }
                } else {
                    status.statusText = schoolStatus.label;
                }
                results.push(status);
            }
        });

        rooms.forEach((r) => {
            if (r.name.toLowerCase().includes(q)) {
                const status: EntityStatus = {
                    type: 'room',
                    id: r.id,
                    name: r.name,
                    subName: r.type,
                    icon: 'DoorOpen',
                    statusText: '',
                    statusColor: 'slate',
                    isBusy: false
                };
                if (isLessonNow && activeBell) {
                    const lesson = schedule.find(
                        (s) =>
                            s.roomId === r.id &&
                            s.period === activeBell.period &&
                            s.day === todayDayOfWeek &&
                            s.shift === activeBell.shift
                    );
                    const subToThisRoom = substitutions.find(
                        (s) => s.date === todayStr && s.replacementRoomId === r.id
                    );
                    let actualLesson = lesson;
                    if (subToThisRoom) {
                        const l = schedule.find((s) => s.id === subToThisRoom.scheduleItemId);
                        if (l && l.period === activeBell.period && l.shift === activeBell.shift) actualLesson = l;
                    }
                    if (lesson) {
                        const subFromThisRoom = substitutions.find(
                            (s) =>
                                s.date === todayStr &&
                                s.scheduleItemId === lesson.id &&
                                s.replacementRoomId &&
                                s.replacementRoomId !== r.id
                        );
                        if (subFromThisRoom) actualLesson = undefined;
                    }
                    if (actualLesson) {
                        const clsName = classes.find((c) => c.id === actualLesson!.classId)?.name;
                        const tName = teachers.find(
                            (t) =>
                                t.id ===
                                (substitutions.find((s) => s.scheduleItemId === actualLesson!.id && s.date === todayStr)
                                    ?.replacementTeacherId || actualLesson!.teacherId)
                        )?.name;
                        status.statusText = 'Занят';
                        status.location = `${clsName} • ${tName?.split(' ')[0]}`;
                        status.statusColor = 'green';
                        status.isBusy = true;
                    } else {
                        status.statusText = 'Свободен';
                        status.statusColor = 'blue';
                    }
                } else {
                    status.statusText = schoolStatus.label;
                }
                results.push(status);
            }
        });
        setSearchResults(results.slice(0, 5));
    }, [
        debouncedSearchQuery,
        teachers,
        classes,
        rooms,
        schedule,
        substitutions,
        schoolStatus,
        todayStr,
        todayDayOfWeek,
        subjects
    ]);

    // Other calculated values (birthdays, stats, etc.)
    const upcomingBirthdays = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return teachers
            .filter((t) => t.birthDate)
            .map((t) => {
                const bDate = new Date(t.birthDate!);
                const next = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
                if (next < today) next.setFullYear(today.getFullYear() + 1);
                const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return { ...t, diff, age: today.getFullYear() - bDate.getFullYear() };
            })
            .filter((t) => t.diff <= 30)
            .sort((a, b) => a.diff - b.diff);
    }, [teachers]);

    const occupancyStats = useMemo(() => {
        const totalTeachers = teachers.length;
        const fullDayAbsenteesMap = new Map();
        teachers
            .filter((t) => t.unavailableDates.includes(todayStr))
            .forEach((t) => {
                const rawReason = t.absenceReasons?.[todayStr];
                const displayReason = rawReason === 'Без записи' ? 'Без записи' : 'Отсутствует';
                fullDayAbsenteesMap.set(t.id, { id: t.id, name: t.name, displayReason: displayReason });
            });
        const todaySubs = substitutions.filter(
            (s) =>
                s.date === todayStr &&
                s.replacementTeacherId !== 'conducted' &&
                s.replacementTeacherId !== s.originalTeacherId
        );
        const partialAbsenceMap = new Map();
        todaySubs.forEach((sub) => {
            if (fullDayAbsenteesMap.has(sub.originalTeacherId)) return;
            const originalTeacher = teachers.find((t) => t.id === sub.originalTeacherId);
            if (!originalTeacher) return;
            const item = schedule.find((s) => s.id === sub.scheduleItemId);
            if (!item) return;
            if (!partialAbsenceMap.has(sub.originalTeacherId))
                partialAbsenceMap.set(sub.originalTeacherId, { teacher: originalTeacher, lessons: [] });
            const entry = partialAbsenceMap.get(sub.originalTeacherId);
            entry.lessons.push({ period: item.period, reason: sub.lessonAbsenceReason });
        });
        const combinedList: AbsentTeacher[] = Array.from(fullDayAbsenteesMap.values());
        partialAbsenceMap.forEach((data, teacherId) => {
            const lessons: { period: number; reason?: string }[] = data.lessons.sort(
                (a: { period: number; reason?: string }, b: { period: number; reason?: string }) => a.period - b.period
            );
            const periods = lessons.map((l) => l.period).join(', ');
            const hasBezZapisi = lessons.some((l) => l.reason === 'Без записи');
            const reasonText = hasBezZapisi ? 'Без записи' : 'Отсутствует';
            combinedList.push({
                id: teacherId,
                name: data.teacher.name,
                displayReason: `${periods} урок: ${reasonText}`
            });
        });
        combinedList.sort((a, b) => a.name.localeCompare(b.name));
        const absentCount = combinedList.length;
        const presentCount = totalTeachers - absentCount;
        const presentPercent = totalTeachers > 0 ? Math.round((presentCount / totalTeachers) * 100) : 0;
        return { presentPercent, absentCount, totalTeachers, absentTeachersList: combinedList };
    }, [teachers, todayStr, substitutions, schedule]);

    // --- KPI Metrics --- (must be after occupancyStats)
    const kpiData = useMemo(() => {
        const todayLessons = todayDayOfWeek ? (schedule || []).filter((s) => s.day === todayDayOfWeek).length : 0;
        const validRoomIds = new Set(rooms.map((r) => r.id));
        const occupiedRooms = new Set(
            (schedule || [])
                .filter((s) => s.day === todayDayOfWeek && s.roomId && validRoomIds.has(s.roomId))
                .map((s) => s.roomId)
        ).size;
        const totalRooms = rooms.length;
        const roomUtilization =
            totalRooms > 0 ? Math.min(100, Math.round((occupiedRooms / totalRooms) * 100)) : 0;
        const substitutionsTomorrow = (substitutions || []).filter((s) => s.date === tomorrowStr).length;
        return {
            absentTeachers: occupancyStats.absentCount,
            totalTeachers: occupancyStats.totalTeachers,
            substitutionsTomorrow,
            todayLessons,
            roomUtilization,
            occupiedRooms,
            totalRooms
        };
    }, [schedule, todayDayOfWeek, rooms, substitutions, tomorrowStr, occupancyStats]);

    const problemZones = useMemo(() => {
        const nextDay = new Date(currentDate);
        nextDay.setDate(currentDate.getDate() + 1);
        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) nextDay.setDate(nextDay.getDate() + 1);
        const dayMap = [null, 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', null];
        const nextDayName = dayMap[nextDay.getDay()];
        if (!nextDayName) return [];
        const problems: ProblemZone[] = [];
        const checkableClasses = classes.filter((c) => !c.excludeFromReports);
        checkableClasses.forEach((cls) => {
            const lessons = schedule.filter((s) => s.classId === cls.id && s.day === nextDayName);
            if (lessons.length === 0) problems.push({ class: cls.name, issue: `Нет уроков на ${nextDayName}` });
            else if (lessons.length < 4) problems.push({ class: cls.name, issue: `Мало уроков (${lessons.length})` });
            lessons.forEach((l) => {
                const tc = schedule.some(
                    (s) =>
                        s.id !== l.id &&
                        s.day === nextDayName &&
                        s.period === l.period &&
                        s.shift === l.shift &&
                        s.teacherId === l.teacherId
                );
                if (tc) problems.push({ class: cls.name, issue: `Конфликт учителя (${l.period} ур)` });
                if (l.roomId) {
                    const room = rooms.find((r) => r.id === l.roomId);
                    if (room && room.capacity < cls.studentsCount)
                        problems.push({ class: cls.name, issue: `Тесно: ${room.name} (${l.period} ур)` });
                }
            });
        });
        return problems.filter((v, i, a) => a.findIndex((t) => t.class === v.class && t.issue === v.issue) === i);
    }, [schedule, classes, rooms, currentDate]);

    const unresolvedSubstitutions = useMemo(() => {
        if (!todayDayOfWeek) return 0;
        let count = 0;
        const todaysSchedule = schedule.filter((s) => s.day === todayDayOfWeek);
        for (const lesson of todaysSchedule) {
            const originalTeacher = teachers.find((t) => t.id === lesson.teacherId);
            if (originalTeacher && originalTeacher.unavailableDates.includes(todayStr)) {
                const substitution = substitutions.find(
                    (sub) => sub.scheduleItemId === lesson.id && sub.date === todayStr
                );
                if (!substitution) count++;
            }
        }
        return count;
    }, [schedule, teachers, substitutions, todayStr, todayDayOfWeek]);

    const feedbackAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            feedbackAbortRef.current?.abort();
        };
    }, []);

    const handleSendFeedback = async () => {
        if (!feedbackMessage.trim()) {
            addToast({ type: 'warning', title: 'Внимание', message: 'Пожалуйста, введите ваше сообщение.' });
            return;
        }
        if (!privateSettings?.telegramToken || !settings?.feedbackChatId) {
            addToast({
                type: 'warning',
                title: 'Внимание',
                message: 'Функция обратной связи не настроена администратором.'
            });
            return;
        }
        feedbackAbortRef.current?.abort();
        const controller = new AbortController();
        feedbackAbortRef.current = controller;
        setIsSendingFeedback(true);
        const text = `📬 *Новое сообщение обратной связи:*\n\n${escapeMarkdown(feedbackMessage)}`;
        try {
            const response = await fetch(`https://api.telegram.org/bot${privateSettings.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: settings.feedbackChatId, text: text, parse_mode: 'Markdown' }),
                signal: controller.signal
            });
            const result = await response.json();
            if (result.ok) {
                addToast({ type: 'success', title: 'Успешно', message: 'Спасибо! Ваше сообщение отправлено.' });
                setIsFeedbackModalOpen(false);
                setFeedbackMessage('');
            } else {
                throw new Error(result.description);
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            logger.error('Ошибка отправки в Telegram:', error);
            addToast({ type: 'danger', title: 'Ошибка', message: `Не удалось отправить сообщение. Ошибка: ${error}` });
        } finally {
            setIsSendingFeedback(false);
        }
    };

    const handleWidgetToggle = (id: string) => {
        const newWidgets = widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
        setWidgets(newWidgets);
    };

    const handleWidgetReorder = (id: string, direction: 'up' | 'down') => {
        const index = widgets.findIndex((w) => w.id === id);
        if (index === -1) return;
        const newWidgets = [...widgets];
        if (direction === 'up' && index > 0) {
            [newWidgets[index], newWidgets[index - 1]] = [newWidgets[index - 1], newWidgets[index]];
        } else if (direction === 'down' && index < newWidgets.length - 1) {
            [newWidgets[index], newWidgets[index + 1]] = [newWidgets[index + 1], newWidgets[index]];
        }
        setWidgets(newWidgets);
    };

    const handleWidgetResize = (id: string) => {
        setWidgets((prev) => {
            const newWidgets = prev.map(w => {
                if (w.id === id) {
                    const currentSpan = w.colSpan || 1;
                    // Cycle through 1, 2, 3, 4
                    const nextSpan = currentSpan >= 4 ? 1 : currentSpan + 1;
                    return { ...w, colSpan: nextSpan };
                }
                return w;
            });
            safeLocalStorageSet('gym_dashboard_widgets_v4', JSON.stringify(newWidgets));
            return newWidgets;
        });
    };

    const getColSpanClass = (span: number = 1) => {
        switch(span) {
            case 4: return 'md:col-span-2 lg:col-span-4';
            case 3: return 'md:col-span-2 lg:col-span-3';
            case 2: return 'md:col-span-2 lg:col-span-2';
            case 1: 
            default: return 'col-span-1';
        }
    };

    const saveWidgets = () => {
        safeLocalStorageSet('gym_dashboard_widgets_v4', JSON.stringify(widgets));
        setIsWidgetModalOpen(false);
    };

    // --- Render Widgets Helper ---
    const renderWidget = (widget: WidgetConfig) => {
        if (!widget.visible) return null;

        switch (widget.id) {
            case 'search':
                return (
                    <div
                        key={widget.id}
                        className="p-6 rounded-3xl flex flex-col h-full relative overflow-hidden card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-500/20">
                                <Icon name="Search" size={22} />
                            </div>
                            <h3 className="font-bold text-xl text-slate-800 dark:text-white">Поиск</h3>
                        </div>

                        <div className="relative mb-4">
                            <input
                                type="text"
                                inputMode="search"
                                placeholder="Учитель, класс или кабинет..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl py-3.5 pl-11 pr-4 text-sm outline-none focus:ring-2 ring-indigo-500/50 dark:text-white transition-all placeholder:text-slate-400"
                            />
                            <Icon
                                name="Search"
                                size={18}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                        </div>

                        {searchResults.length > 0 && (
                            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2 space-y-2">
                                {searchResults.map((item) => (
                                    <div
                                        key={`${item.type}-${item.id}`}
                                        className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors cursor-pointer"
                                        onClick={() => {
                                            const currentSemester = getActiveSemester(new Date(), settings) ?? 1;
                                            const targetPath = currentSemester === 2 ? '/schedule2' : '/schedule';
                                            const dayParam = todayDayOfWeek ? `&day=${todayDayOfWeek}` : '';

                                            // Detect shift if class is selected
                                            let shiftParam = '';
                                            if (item.type === 'class') {
                                                const cls = classes.find((c) => c.id === item.id);
                                                if (cls) {
                                                    shiftParam = `&shift=${cls.shift === Shift.First ? 1 : 2}`;
                                                }
                                            }

                                            if (item.type === 'teacher')
                                                navigate(`${targetPath}?view=teacher&id=${item.id}${dayParam}`);
                                            if (item.type === 'class')
                                                navigate(
                                                    `${targetPath}?view=class&id=${item.id}${dayParam}${shiftParam}`
                                                );
                                        }}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div
                                                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.isBusy ? 'bg-indigo-100 text-indigo-600' : item.statusColor === 'red' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}
                                            >
                                                <Icon name={item.icon} size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 dark:text-white text-sm truncate">
                                                    {item.name}{' '}
                                                    {item.subName && (
                                                        <span className="text-slate-400 font-normal">
                                                            {item.subName}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                    {item.type === 'room'
                                                        ? 'Кабинет'
                                                        : item.type === 'class'
                                                            ? 'Класс'
                                                            : 'Учитель'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div
                                                className={`text-xs font-bold px-2 py-1 rounded-lg inline-block ${item.statusColor === 'green'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : item.statusColor === 'red'
                                                            ? 'bg-red-100 text-red-700'
                                                            : item.statusColor === 'blue'
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-slate-100 text-slate-600'
                                                    }`}
                                            >
                                                {item.statusText}
                                            </div>
                                            {item.location && (
                                                <div className="text-[10px] font-mono mt-1 text-slate-400">
                                                    {item.location}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            case 'substitutions':
                return (
                    <div
                        key={widget.id}
                        className={`p-6 rounded-3xl flex flex-col h-full card-hover relative overflow-hidden bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 ${unresolvedSubstitutions > 0 ? 'ring-2 ring-red-500/20 dark:ring-red-500/30' : ''}`}
                    >
                        {unresolvedSubstitutions > 0 && (
                            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-2xl -mr-10 -mt-10 rounded-full"></div>
                        )}
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div
                                className={`p-3 rounded-2xl shadow-lg ${unresolvedSubstitutions > 0 ? 'bg-gradient-to-br from-red-500 to-orange-600 text-white shadow-red-500/30' : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/30'}`}
                            >
                                <Icon name={unresolvedSubstitutions > 0 ? 'AlertTriangle' : 'CheckCircle'} size={22} />
                            </div>
                            <h3 className="font-bold text-xl dark:text-white">Замены</h3>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10">
                            {unresolvedSubstitutions > 0 ? (
                                <>
                                    <div className="text-6xl font-black text-slate-800 dark:text-white mb-2 tracking-tighter">
                                        {unresolvedSubstitutions}
                                    </div>
                                    <div className="text-sm font-bold text-red-500 uppercase tracking-wider mb-6">
                                        Требуют внимания
                                    </div>
                                    <button
                                        onClick={() => navigate('/substitutions')}
                                        className="w-full py-3 bg-slate-800 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-all shadow-xl flex items-center justify-center gap-2 group"
                                    >
                                        Перейти{' '}
                                        <Icon
                                            name="ArrowRight"
                                            size={18}
                                            className="group-hover:translate-x-1 transition-transform"
                                        />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-slate-200 dark:text-slate-700 mb-4 transform scale-125 opacity-50">
                                        <Icon name="CheckCircle" size={64} />
                                    </div>
                                    <p className="text-base font-medium text-slate-500 dark:text-slate-400">
                                        Все замены разрешены
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                );
            case 'occupancy':
                return (
                    <div
                        key={widget.id}
                        className="p-6 rounded-3xl flex flex-col h-full card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white p-3 rounded-2xl shadow-lg shadow-blue-500/20">
                                    <Icon name="PieChart" size={22} />
                                </div>
                                <h3 className="font-bold text-xl dark:text-white">Штат</h3>
                            </div>
                            <button
                                onClick={() => setShowAbsentList(!showAbsentList)}
                                className="p-2.5 text-slate-400 hover:text-indigo-600 bg-white dark:bg-slate-700/50 rounded-xl transition-all hover:shadow-md"
                                title={showAbsentList ? 'Показать график' : 'Список отсутствующих'}
                            >
                                <Icon name={showAbsentList ? 'PieChart' : 'List'} size={20} />
                            </button>
                        </div>

                        {showAbsentList ? (
                            <div className="flex-1 overflow-y-auto custom-scrollbar animate-fade-in -mr-2 pr-2">
                                {occupancyStats.absentTeachersList.length > 0 ? (
                                    <div className="space-y-3">
                                        {occupancyStats.absentTeachersList.map((t) => (
                                            <div
                                                key={t.id}
                                                className="flex justify-between items-center text-sm p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                                            >
                                                <span className="font-bold text-slate-700 dark:text-slate-300 truncate pr-2">
                                                    {t.name}
                                                </span>
                                                <span className="text-[10px] uppercase font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                                                    {t.displayReason}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                                        <p className="text-sm font-medium">Все учителя на месте</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between flex-1 animate-fade-in px-2">
                                <div className="relative w-28 h-28 flex items-center justify-center drop-shadow-md">
                                    <div
                                        className="absolute inset-0 rounded-full"
                                        style={{
                                            background: `conic-gradient(#3b82f6 ${occupancyStats.presentPercent * 3.6}deg, #e2e8f0 0deg)`
                                        }}
                                    />
                                    <div className="absolute inset-[10px] bg-white dark:bg-slate-800 rounded-full flex flex-col items-center justify-center">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                            На месте
                                        </span>
                                        <span className="text-2xl font-black text-slate-800 dark:text-white">
                                            {occupancyStats.presentPercent}%
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">
                                        {occupancyStats.absentCount}
                                    </div>
                                    <div className="text-xs text-slate-400 font-bold uppercase leading-tight">
                                        Отсутствуют
                                        <br />
                                        сегодня
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'notes':
                return (
                    <div
                        key={widget.id}
                        className="p-6 rounded-3xl flex flex-col h-full group card-hover relative bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 text-white p-3 rounded-2xl shadow-lg shadow-orange-500/20">
                                    <Icon name="Edit2" size={22} />
                                </div>
                                <h3 className="font-bold text-xl dark:text-white">Заметки</h3>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={saveNotes}
                                    disabled={!notesChanged}
                                    className={`p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${notesChanged
                                            ? 'text-amber-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 animate-pulse'
                                            : 'text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    title={notesChanged ? 'Сохранить изменения' : 'Заметки сохранены'}
                                >
                                    <Icon name="Save" size={16} />
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(notes);
                                        addToast({
                                            type: 'success',
                                            title: 'Скопировано',
                                            message: 'Заметки скопированы в буфер обмена',
                                            duration: 2000
                                        });
                                    }}
                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                                >
                                    <Icon name="Copy" size={16} />
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm('Очистить заметки?')) {
                                            setNotes('');
                                            safeLocalStorageSet('gym_notes', '');
                                            setNotesChanged(false);
                                            addToast({ type: 'success', title: 'Заметки очищены', duration: 2000 });
                                        }
                                    }}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                                >
                                    <Icon name="Trash2" size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="relative flex-1 bg-yellow-50/50 dark:bg-slate-800/50 rounded-2xl p-1">
                            <textarea
                                inputMode="text"
                                className="w-full h-full p-4 bg-transparent border-none outline-none font-medium text-slate-700 dark:text-slate-200 resize-none text-sm leading-relaxed"
                                placeholder="Напишите что-нибудь..."
                                value={notes}
                                onChange={(e) => handleNotesChange(e.target.value)}
                                maxLength={10000}
                            />
                            {notesChanged && (
                                <div className="absolute bottom-3 right-3 text-[10px] font-bold uppercase tracking-widest text-amber-600 animate-pulse flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1 rounded-full shadow-sm">
                                    <Icon name="Clock" size={10} /> Не сохранено
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'conflicts':
                return (
                    <div
                        key={widget.id}
                        className="p-6 rounded-3xl h-full card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 p-2 rounded-xl">
                                <Icon name="AlertTriangle" size={20} />
                            </div>
                            <h3 className="font-bold text-lg dark:text-white">Возможные конфликты</h3>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                            {schoolStatus.type === 'vacation' ? (
                                <div className="p-4 text-center">
                                    <div className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-900/30 text-violet-500 flex items-center justify-center mx-auto mb-2">
                                        <Icon name="Sun" size={20} />
                                    </div>
                                    <p className="text-sm font-bold text-violet-600 dark:text-violet-400">Каникулы</p>
                                    <p className="text-xs text-slate-400 mt-1">Расписание неактивно — конфликты не проверяются</p>
                                </div>
                            ) : problemZones.length ? (
                                problemZones.map((p) => (
                                    <div
                                        key={`${p.class}-${p.issue}`}
                                        className="flex justify-between items-center p-3 bg-white dark:bg-dark-900/50 rounded-xl border border-slate-100 dark:border-slate-700"
                                    >
                                        <span className="font-bold text-slate-700 dark:text-slate-200">{p.class}</span>
                                        <span className="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">
                                            {p.issue}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-slate-400 text-sm italic">
                                    В расписании не найдено критических ошибок
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'birthdays':
                return (
                    <div
                        key={widget.id}
                        className="p-6 rounded-3xl h-full card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 p-2 rounded-xl">
                                <Icon name="Gift" size={20} />
                            </div>
                            <h3 className="font-bold text-lg dark:text-white">Ближайшие праздники</h3>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                            {upcomingBirthdays.length ? (
                                upcomingBirthdays.map((t) => (
                                    <div
                                        key={t.id}
                                        className="flex justify-between items-center p-3 bg-white dark:bg-dark-900/50 rounded-xl border border-slate-100 dark:border-slate-700"
                                    >
                                        <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">
                                            {t.name}
                                        </span>
                                        <span
                                            className={`text-xs font-bold px-2 py-1 rounded-lg ${t.diff === 0 ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                                        >
                                            {t.diff === 0 ? 'Сегодня!' : `через ${t.diff} дн.`}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-slate-400 text-sm italic">
                                    Нет дней рождения в ближайший месяц
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'kpi':
                return (
                    <div
                        key={widget.id}
                        className="p-6 rounded-3xl h-full card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 p-2 rounded-xl">
                                <Icon name="BarChart2" size={20} />
                            </div>
                            <h3 className="font-bold text-lg dark:text-white">Ключевые показатели</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
                                <div className="text-2xl font-black text-slate-800 dark:text-white">
                                    {kpiData.absentTeachers}
                                    <span className="text-sm font-medium text-slate-400 dark:text-slate-500">/{kpiData.totalTeachers}</span>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Отсутствуют учителей</div>
                            </div>
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
                                <div className="text-2xl font-black text-slate-800 dark:text-white">{kpiData.substitutionsTomorrow}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Замен на завтра</div>
                            </div>
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
                                <div className="text-2xl font-black text-slate-800 dark:text-white">{kpiData.todayLessons}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Уроков сегодня</div>
                            </div>
                            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
                                <div className="text-2xl font-black text-slate-800 dark:text-white">{kpiData.roomUtilization}%</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Кабинеты занято</div>
                                <div className="mt-2 h-1.5 w-full bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 rounded-full transition-all"
                                        style={{ width: `${kpiData.roomUtilization}%` }}
                                    />
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1 text-right">
                                    {kpiData.occupiedRooms} из {kpiData.totalRooms}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            {/* NEW Header Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                <div className="lg:col-span-2 flex flex-col justify-end">
                    <h1 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight mb-1 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
                        {greeting}, {profile?.firstName || profile?.displayName || (role === 'admin' ? 'Администратор' : role === 'canteen' ? 'Столовая' : 'Учитель')}!
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-lg font-medium mb-4">
                        Сегодня{' '}
                        {currentDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsWidgetModalOpen(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:shadow-lg transition-all text-sm border border-slate-200 dark:border-slate-700"
                            title="Настроить рабочий стол"
                        >
                            <Icon name="Settings" size={18} />
                        </button>
                        <button
                            onClick={() => setIsFeedbackModalOpen(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:shadow-lg transition-all text-sm border border-slate-200 dark:border-slate-700"
                        >
                            <Icon name="Send" size={18} /> Обратная связь
                        </button>
                    </div>

                    {/* Admin Broadcast */}
                    {settings?.adminAnnouncement?.active && (
                        <div className="mt-6 bg-amber-100 dark:bg-amber-900/30 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm">
                            <div className="flex items-start gap-4">
                                <div className="text-amber-600 dark:text-amber-400 shrink-0 mt-1">
                                    <Icon name="Bell" size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-amber-800 dark:text-amber-100 mb-1">
                                        Объявление
                                    </h3>
                                    <p className="text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                                        {settings.adminAnnouncement.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Weather Widget Dedicated Spot */}
                {canShowWeather && (
                    <div className="hidden lg:flex items-center justify-end">
                        <div className="w-full max-w-[280px]">
                            <WeatherWidget />
                        </div>
                    </div>
                )}
            </div>

            {/* Vacation Banner */}
            {schoolStatus.type === 'vacation' && (
                <div className="bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-sky-500/10 dark:from-violet-900/30 dark:via-indigo-900/30 dark:to-sky-900/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-5 animate-fade-in flex items-center gap-5">
                    <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <Icon name="Sun" size={24} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-lg text-indigo-800 dark:text-indigo-200">🏖️ Сейчас каникулы</h3>
                        <p className="text-sm text-indigo-600/80 dark:text-indigo-300/80 mt-0.5">
                            Текущий месяц не относится ни к одному семестру — расписание уроков неактивно.
                            Конфигурацию семестров можно изменить в{' '}
                            <a href="#/settings" className="font-bold underline underline-offset-2 hover:text-indigo-800 dark:hover:text-indigo-100 transition-colors">
                                Настройках → Расписание
                            </a>
                            .
                        </p>
                    </div>
                </div>
            )}

            {/* Soft Notifications */}
            {role === 'admin' && unresolvedSubstitutions > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-500 text-white p-2 rounded-xl">
                            <Icon name="AlertTriangle" size={20} />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800 dark:text-white">
                                {unresolvedSubstitutions} замен
                                {unresolvedSubstitutions === 1 ? 'а' : unresolvedSubstitutions < 5 ? 'ы' : ''} требуют
                                внимания
                            </h3>
                        </div>
                        <NavLink
                            to="/substitutions"
                            className="px-4 py-2 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm"
                        >
                            Посмотреть
                        </NavLink>
                    </div>
                </div>
            )}

            {/* Dashboard widgets - Drag and Drop Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredWidgets.filter((w) => w.visible).map((widget) => (
                    <div
                        key={widget.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, widget.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, widget.id)}
                        className={`cursor-grab active:cursor-grabbing transition-all relative group ${draggedWidgetId === widget.id ? 'scale-95 z-50' : ''} ${getColSpanClass(widget.colSpan)}`}
                    >
                        <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleWidgetResize(widget.id); }}
                                className="p-1.5 bg-slate-100 dark:bg-slate-700/80 backdrop-blur rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 text-slate-500 hover:text-indigo-600 transition-colors shadow-sm"
                                title="Изменить размер виджета"
                            >
                                <Icon name="Maximize2" size={14} />
                            </button>
                        </div>
                        {renderWidget(widget)}
                    </div>
                ))}
            </div>

            <Modal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} title="Обратная связь">
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Есть идеи по улучшению приложения или нашли ошибку? Напишите нам!
                    </p>
                    <textarea
                        inputMode="text"
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        rows={5}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:ring-2 ring-indigo-500/50 resize-y"
                        placeholder="Ваше сообщение..."
                    />
                    <div className="flex justify-end">
                        <button
                            onClick={handleSendFeedback}
                            disabled={isSendingFeedback}
                            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
                        >
                            {isSendingFeedback ? (
                                <Icon name="Loader" size={16} className="animate-spin" />
                            ) : (
                                <Icon name="Send" size={16} />
                            )}
                            {isSendingFeedback ? 'Отправка...' : 'Отправить'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Widget Customization Modal */}
            <Modal
                isOpen={isWidgetModalOpen}
                onClose={() => setIsWidgetModalOpen(false)}
                title="Настройка рабочего стола"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        Включите нужные виджеты и настройте их порядок.
                    </p>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                        {filteredWidgets.map((widget, idx) => (
                            <div
                                key={widget.id}
                                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600"
                            >
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={widget.visible}
                                        onChange={() => handleWidgetToggle(widget.id)}
                                        className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span className="font-bold text-slate-700 dark:text-white">{widget.label}</span>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleWidgetReorder(widget.id, 'up')}
                                        disabled={idx === 0}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Icon name="ArrowRight" className="-rotate-90" size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleWidgetReorder(widget.id, 'down')}
                                        disabled={idx === filteredWidgets.length - 1}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Icon name="ArrowRight" className="rotate-90" size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={saveWidgets}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition"
                        >
                            Сохранить
                        </button>
                    </div>
                </div>
            </Modal>
            {role === 'admin' && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 mt-8">
                    <h3 className="text-lg font-bold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
                        <Icon name="Database" size={20} />
                        Миграция данных
                    </h3>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                        Перенести все данные (учителя, классы, расписание, замены) из Firebase в Supabase. 
                        Это действие выполняется один раз.
                    </p>
                    <button
                        onClick={handleMigrate}
                        disabled={migrating}
                        className="px-6 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {migrating ? (
                            <Icon name="Loader" className="animate-spin" size={18} />
                        ) : (
                            <Icon name="Database" size={18} />
                        )}
                        {migrating ? 'Перенос данных...' : 'Перенести данные в Supabase'}
                    </button>
                </div>
            )}
        </div>
    );
};
