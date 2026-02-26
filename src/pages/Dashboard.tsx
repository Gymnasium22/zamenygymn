
import React, { useMemo, useState, useEffect } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { DayOfWeek, DAYS, ScheduleItem, Shift } from '../types';
import { useNavigate, NavLink } from 'react-router-dom';
import { Modal, useToast, SkeletonCard, SkeletonText } from '../components/UI';
import { getActiveSemester, getLocalDateString } from '../utils/helpers';
// Notifications component removed

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
    visible: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: 'search', label: 'Поиск', visible: true },
    { id: 'substitutions', label: 'Замены', visible: true },
    { id: 'occupancy', label: 'Штат', visible: true },
    { id: 'conflicts', label: 'Конфликты', visible: true },
    { id: 'birthdays', label: 'Праздники', visible: true },
    { id: 'notes', label: 'Заметки', visible: true }
];

const WeatherWidget = () => {
    const { settings } = useStaticData();
    const [weatherData, setWeatherData] = useState<any>(null);
    const [forecastData, setForecastData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const apiKey = settings.weatherApiKey;
    const city = settings.weatherCity || 'Minsk,BY';

    useEffect(() => {
        const fetchWeather = async () => {
            if (!apiKey) {
                setLoading(false);
                return;
            }

            const CACHE_KEY = 'gym_weather_cache';
            const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                        setWeatherData(parsed.current);
                        setForecastData(parsed.forecast);
                        setLoading(false);
                        return;
                    }
                } catch (e) {
                    console.warn("Weather cache invalid");
                }
            }

            try {
                // Fetch Current Weather
                const currentRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=ru&appid=${apiKey}`);
                if (!currentRes.ok) throw new Error('Weather API Error');
                const currentData = await currentRes.json();

                // Fetch Forecast (5 days / 3 hour steps)
                const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&lang=ru&appid=${apiKey}`);
                if (!forecastRes.ok) throw new Error('Forecast API Error');
                const forecastRaw = await forecastRes.json();

                // Process Forecast: Extract daily data (approx at 12:00 or closest)
                // Filter to get one entry per day for next 3 days
                const dailyForecast: any[] = [];
                const seenDates = new Set();
                const todayDate = new Date().toISOString().split('T')[0];

                for (const item of forecastRaw.list) {
                    const date = item.dt_txt.split(' ')[0];
                    if (date !== todayDate && !seenDates.has(date)) {
                        dailyForecast.push(item);
                        seenDates.add(date);
                        if (dailyForecast.length >= 3) break;
                    }
                }

                setWeatherData(currentData);
                setForecastData(dailyForecast);
                setLoading(false);

                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    current: currentData,
                    forecast: dailyForecast
                }));

            } catch (err) {
                console.error(err);
                setError('Ошибка загрузки погоды');
                setLoading(false);
            }
        };

        fetchWeather();
    }, [apiKey, city]);

    if (!apiKey) {
        return null; // Don't show if not configured to save space
    }

    if (loading) return <div className="h-32 w-full bg-slate-100 dark:bg-slate-800 rounded-3xl animate-pulse"></div>;
    if (error) return null;
    if (!weatherData) return null;

    const getWeatherIcon = (code: string) => {
        if (code.startsWith('01')) return 'Sun';
        if (code.startsWith('02') || code.startsWith('03') || code.startsWith('04')) return 'Cloud';
        if (code.startsWith('09') || code.startsWith('10')) return 'CloudRain';
        if (code.startsWith('11')) return 'Snowflake';
        if (code.startsWith('50')) return 'Wind';
        return 'Cloud';
    };

    const bgGradient = (() => {
        const code = weatherData.weather[0].icon;
        if (code.endsWith('n')) return 'bg-gradient-to-br from-indigo-900 to-purple-900'; // Night
        if (code.startsWith('01') || code.startsWith('02')) return 'bg-gradient-to-br from-sky-400 to-blue-600'; // Clear/Few Clouds
        if (code.startsWith('09') || code.startsWith('10') || code.startsWith('11')) return 'bg-gradient-to-br from-slate-500 to-slate-700'; // Rain/Snow
        return 'bg-gradient-to-br from-blue-300 to-slate-400'; // Clouds/Mist
    })();

    return (
        <div className={`p-5 rounded-3xl relative overflow-hidden shadow-lg text-white ${bgGradient} flex flex-col justify-center h-full`}>
             <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
             
             <div className="relative z-10 flex justify-between items-center">
                 <div>
                     <div className="text-3xl font-black">{Math.round(weatherData.main.temp)}°</div>
                     <div className="text-xs opacity-90 font-medium">{weatherData.name}</div>
                 </div>
                 <div className="flex flex-col items-end">
                     <Icon name={getWeatherIcon(weatherData.weather[0].icon)} size={36} className="text-white/90 drop-shadow-md mb-1" />
                     <div className="text-[10px] opacity-75 capitalize">{weatherData.weather[0].description}</div>
                 </div>
             </div>

             <div className="mt-3 pt-2 border-t border-white/20 flex justify-between text-center relative z-10">
                 {forecastData.slice(0, 3).map((day, idx) => (
                     <div key={idx} className="flex flex-col items-center">
                         <span className="text-[9px] opacity-80 uppercase font-bold">{new Date(day.dt * 1000).toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                         <span className="text-xs font-bold">{Math.round(day.main.temp)}°</span>
                     </div>
                 ))}
             </div>
        </div>
    );
};

export const DashboardPage = () => {
    const { subjects, teachers, classes, rooms, bellSchedule, settings } = useStaticData();
    const { schedule, substitutions, nutritionRecords } = useScheduleData();
    const { role } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast(); 

    const [notes, setNotes] = useState(localStorage.getItem('gym_notes') || '');
    const [currentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<EntityStatus[]>([]);
    const [showAbsentList, setShowAbsentList] = useState(false);
    const [notesChanged, setNotesChanged] = useState(false);

    // Using v4 key to force layout reset for weather widget move
    const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
        const saved = localStorage.getItem('gym_dashboard_widgets_v4');
        return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    });
    const [isWidgetModalOpen, setIsWidgetModalOpen] = useState(false);

    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [isSendingFeedback, setIsSendingFeedback] = useState(false);

    // Базовая санитизация заметок
    const sanitizeNotes = (text: string): string => {
        return text
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') 
            .replace(/<[^>]*>/g, '') 
            .slice(0, 10000); 
    };

    const handleNotesChange = (value: string) => {
        const sanitized = sanitizeNotes(value);
        setNotes(sanitized);
        setNotesChanged(true);
    };

    const saveNotes = () => {
        localStorage.setItem('gym_notes', notes);
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
            localStorage.setItem('gym_notes', notes);
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

    const todayStr = useMemo(() => getLocalDateString(currentDate), [currentDate]);
    const todayDayOfWeek = useMemo(() => {
        const idx = currentDate.getDay();
        if (idx === 0 || idx === 6) return null; 
        return DAYS[idx - 1];
    }, [currentDate]);

    // --- Live Search Logic ---

    // 1. Determine current school state
    const schoolStatus = useMemo(() => {
        const now = new Date();
        const minutesNow = now.getHours() * 60 + now.getMinutes();
        const dayMap = [null, DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, null];
        const dayName = dayMap[now.getDay()];

        if (!dayName) return { type: 'weekend', label: 'Выходной' };

        let dailyBells = bellSchedule.filter(b => b.day === dayName);
        if (dailyBells.length === 0) dailyBells = bellSchedule.filter(b => b.day === 'default');

        const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

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
                const nextBell = dailyBells[i+1];
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

    }, [bellSchedule, currentDate]); 

    // 2. Perform Live Search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const q = searchQuery.toLowerCase();
        const results: EntityStatus[] = [];
        const isLessonNow = schoolStatus.type === 'lesson';
        const activeBell = schoolStatus.type === 'lesson' ? schoolStatus.bell : null;

        const getLessonStatus = (lesson: ScheduleItem | undefined, teacherId: string, isSubstitution: boolean): { text: string, color: EntityStatus['statusColor'], room: string } => {
            if (!lesson) return { text: 'Свободен', color: 'blue', room: '' };
            const sub = substitutions.find(s => s.date === todayStr && s.scheduleItemId === lesson.id);
            if (sub?.replacementTeacherId === 'cancelled') return { text: 'Урок отменен', color: 'red', room: '' };
            const subjName = subjects.find(s => s.id === lesson.subjectId)?.name || 'Предмет';
            const roomName = rooms.find(r => r.id === (sub?.replacementRoomId || lesson.roomId))?.name || (sub?.replacementRoomId || lesson.roomId) || '?';
            return { text: `${subjName} ${isSubstitution ? '(Замена)' : ''}`, color: isSubstitution ? 'amber' : 'green', room: roomName };
        };

        teachers.forEach(t => {
            if (t.name.toLowerCase().includes(q)) {
                let status: EntityStatus = { type: 'teacher', id: t.id, name: t.name, icon: 'User', statusText: 'Неизвестно', statusColor: 'slate', isBusy: false };
                if (t.unavailableDates.includes(todayStr)) {
                    status.statusText = 'Отсутствует'; status.statusColor = 'red'; status.icon = 'UserX';
                } else if (isLessonNow && activeBell) {
                    const originalLesson = schedule.find(s => s.teacherId === t.id && s.period === activeBell.period && s.day === todayDayOfWeek && s.shift === activeBell.shift);
                    const subAsReplacement = substitutions.find(s => s.date === todayStr && s.replacementTeacherId === t.id);
                    let activeLesson = originalLesson;
                    let isSub = false;
                    if (subAsReplacement) {
                        const subbedLesson = schedule.find(s => s.id === subAsReplacement.scheduleItemId);
                        if (subbedLesson && subbedLesson.period === activeBell.period && subbedLesson.shift === activeBell.shift) {
                            activeLesson = subbedLesson; isSub = true;
                        }
                    } else if (originalLesson) {
                        const subAsOriginal = substitutions.find(s => s.date === todayStr && s.scheduleItemId === originalLesson.id);
                        if (subAsOriginal && subAsOriginal.replacementTeacherId !== t.id) activeLesson = undefined;
                    }
                    if (activeLesson) {
                        const info = getLessonStatus(activeLesson, t.id, isSub);
                        status.statusText = info.text; status.location = `Каб. ${info.room}`; status.statusColor = info.color; status.isBusy = true;
                    } else {
                        status.statusText = 'Свободен'; status.statusColor = 'blue'; status.isBusy = false;
                    }
                } else {
                    status.statusText = schoolStatus.label; status.statusColor = 'slate';
                }
                results.push(status);
            }
        });

        classes.forEach(c => {
            if (c.name.toLowerCase().includes(q)) {
                let status: EntityStatus = { type: 'class', id: c.id, name: c.name, icon: 'GraduationCap', statusText: '', statusColor: 'slate', isBusy: false };
                if (isLessonNow && activeBell) {
                    const lesson = schedule.find(s => s.classId === c.id && s.period === activeBell.period && s.day === todayDayOfWeek && s.shift === activeBell.shift);
                    if (lesson) {
                        const sub = substitutions.find(s => s.date === todayStr && s.scheduleItemId === lesson.id);
                        if (sub?.replacementTeacherId === 'cancelled') {
                             status.statusText = 'Урок отменен'; status.statusColor = 'red';
                        } else {
                             const subjName = subjects.find(s => s.id === lesson.subjectId)?.name;
                             const roomName = rooms.find(r => r.id === (sub?.replacementRoomId || lesson.roomId))?.name || (sub?.replacementRoomId || lesson.roomId);
                             status.statusText = subjName || 'Урок'; status.location = `Каб. ${roomName}`; status.statusColor = 'green'; status.isBusy = true;
                        }
                    } else {
                        status.statusText = 'Нет урока'; status.statusColor = 'blue';
                    }
                } else {
                     status.statusText = schoolStatus.label;
                }
                results.push(status);
            }
        });

        rooms.forEach(r => {
             if (r.name.toLowerCase().includes(q)) {
                 let status: EntityStatus = { type: 'room', id: r.id, name: r.name, subName: r.type, icon: 'DoorOpen', statusText: '', statusColor: 'slate', isBusy: false };
                 if (isLessonNow && activeBell) {
                     const lesson = schedule.find(s => s.roomId === r.id && s.period === activeBell.period && s.day === todayDayOfWeek && s.shift === activeBell.shift);
                     const subToThisRoom = substitutions.find(s => s.date === todayStr && s.replacementRoomId === r.id);
                     let actualLesson = lesson;
                     if (subToThisRoom) {
                         const l = schedule.find(s => s.id === subToThisRoom.scheduleItemId);
                         if (l && l.period === activeBell.period && l.shift === activeBell.shift) actualLesson = l;
                     }
                     if (lesson) {
                         const subFromThisRoom = substitutions.find(s => s.date === todayStr && s.scheduleItemId === lesson.id && s.replacementRoomId && s.replacementRoomId !== r.id);
                         if (subFromThisRoom) actualLesson = undefined;
                     }
                     if (actualLesson) {
                         const clsName = classes.find(c => c.id === actualLesson!.classId)?.name;
                         const tName = teachers.find(t => t.id === (substitutions.find(s=>s.scheduleItemId===actualLesson!.id && s.date===todayStr)?.replacementTeacherId || actualLesson!.teacherId))?.name;
                         status.statusText = 'Занят'; status.location = `${clsName} • ${tName?.split(' ')[0]}`; status.statusColor = 'green'; status.isBusy = true;
                     } else {
                         status.statusText = 'Свободен'; status.statusColor = 'blue';
                     }
                 } else {
                      status.statusText = schoolStatus.label;
                 }
                 results.push(status);
             }
        });
        setSearchResults(results.slice(0, 5));
    }, [searchQuery, teachers, classes, rooms, schedule, substitutions, schoolStatus, todayStr, todayDayOfWeek, subjects]);

    // Other calculated values (birthdays, stats, etc.)
    const upcomingBirthdays = useMemo(() => {
        const today = new Date(); today.setHours(0,0,0,0);
        return teachers.filter(t => t.birthDate).map(t => {
            const bDate = new Date(t.birthDate!);
            let next = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
            if (next < today) next.setFullYear(today.getFullYear() + 1);
            const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return { ...t, diff, age: today.getFullYear() - bDate.getFullYear() };
        }).filter(t => t.diff <= 30).sort((a, b) => a.diff - b.diff);
    }, [teachers]);

    const occupancyStats = useMemo(() => {
        const totalTeachers = teachers.length;
        const fullDayAbsenteesMap = new Map();
        teachers.filter(t => t.unavailableDates.includes(todayStr)).forEach(t => {
            const rawReason = t.absenceReasons?.[todayStr];
            const displayReason = (rawReason === 'Без записи') ? 'Без записи' : 'Отсутствует';
            fullDayAbsenteesMap.set(t.id, { id: t.id, name: t.name, displayReason: displayReason });
        });
        const todaySubs = substitutions.filter(s => s.date === todayStr && s.replacementTeacherId !== 'conducted' && s.replacementTeacherId !== s.originalTeacherId); 
        const partialAbsenceMap = new Map();
        todaySubs.forEach(sub => {
            if (fullDayAbsenteesMap.has(sub.originalTeacherId)) return;
            const originalTeacher = teachers.find(t => t.id === sub.originalTeacherId);
            if (!originalTeacher) return;
            const item = schedule.find(s => s.id === sub.scheduleItemId);
            if (!item) return;
            if (!partialAbsenceMap.has(sub.originalTeacherId)) partialAbsenceMap.set(sub.originalTeacherId, { teacher: originalTeacher, lessons: [] });
            const entry = partialAbsenceMap.get(sub.originalTeacherId);
            entry.lessons.push({ period: item.period, reason: sub.lessonAbsenceReason });
        });
        const combinedList: AbsentTeacher[] = Array.from(fullDayAbsenteesMap.values());
        partialAbsenceMap.forEach((data, teacherId) => {
            const lessons: { period: number; reason?: string }[] = data.lessons.sort((a: { period: number; reason?: string }, b: { period: number; reason?: string }) => a.period - b.period);
            const periods = lessons.map((l) => l.period).join(', ');
            const hasBezZapisi = lessons.some((l) => l.reason === 'Без записи');
            const reasonText = hasBezZapisi ? 'Без записи' : 'Отсутствует';
            combinedList.push({ id: teacherId, name: data.teacher.name, displayReason: `${periods} урок: ${reasonText}` });
        });
        combinedList.sort((a, b) => a.name.localeCompare(b.name));
        const absentCount = combinedList.length;
        const presentCount = totalTeachers - absentCount;
        const presentPercent = totalTeachers > 0 ? Math.round((presentCount / totalTeachers) * 100) : 0;
        return { presentPercent, absentCount, totalTeachers, absentTeachersList: combinedList };
    }, [teachers, todayStr, substitutions, schedule]);

    const problemZones = useMemo(() => {
        const nextDay = new Date(currentDate); nextDay.setDate(currentDate.getDate() + 1);
        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) nextDay.setDate(nextDay.getDate() + 1);
        const dayMap = [null, 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', null];
        const nextDayName = dayMap[nextDay.getDay()];
        if (!nextDayName) return [];
        const problems: ProblemZone[] = [];
        const checkableClasses = classes.filter(c => !c.excludeFromReports);
        checkableClasses.forEach(cls => {
            const lessons = schedule.filter(s => s.classId === cls.id && s.day === nextDayName);
            if (lessons.length === 0) problems.push({ class: cls.name, issue: `Нет уроков на ${nextDayName}` });
            else if (lessons.length < 4) problems.push({ class: cls.name, issue: `Мало уроков (${lessons.length})` });
            lessons.forEach(l => {
                const tc = schedule.some(s => s.id !== l.id && s.day === nextDayName && s.period === l.period && s.shift === l.shift && s.teacherId === l.teacherId);
                if(tc) problems.push({ class: cls.name, issue: `Конфликт учителя (${l.period} ур)` });
                if (l.roomId) {
                    const room = rooms.find(r => r.id === l.roomId);
                    if (room && room.capacity < cls.studentsCount) problems.push({ class: cls.name, issue: `Тесно: ${room.name} (${l.period} ур)` });
                }
            });
        });
        return problems.filter((v,i,a)=>a.findIndex(t=>(t.class === v.class && t.issue === v.issue))===i);
    }, [schedule, classes, teachers, rooms, currentDate]);

    const unresolvedSubstitutions = useMemo(() => {
        if (!todayDayOfWeek) return 0;
        let count = 0;
        const todaysSchedule = schedule.filter(s => s.day === todayDayOfWeek);
        for (const lesson of todaysSchedule) {
            const originalTeacher = teachers.find(t => t.id === lesson.teacherId);
            if (originalTeacher && originalTeacher.unavailableDates.includes(todayStr)) {
                const substitution = substitutions.find(sub => sub.scheduleItemId === lesson.id && sub.date === todayStr);
                if (!substitution) count++;
            }
        }
        return count;
    }, [schedule, teachers, substitutions, todayStr, todayDayOfWeek]);

    const classesWithoutDataForToday = useMemo(() => {
        if (role !== 'canteen') return 0;
        const todayRecords = nutritionRecords.filter(r => r.date === todayStr);
        const classesWithData = new Set(todayRecords.map(r => r.classId));
        return classes.filter(cls => !classesWithData.has(cls.id)).length;
    }, [role, nutritionRecords, todayStr, classes]);

    const handleSendFeedback = async () => {
        if (!feedbackMessage.trim()) { alert('Пожалуйста, введите ваше сообщение.'); return; }
        if (!settings?.telegramToken || !settings?.feedbackChatId) { alert('Функция обратной связи не настроена администратором.'); return; }
        setIsSendingFeedback(true);
        const text = `📬 *Новое сообщение обратной связи:*\n\n${feedbackMessage}`;
        try {
            const response = await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: settings.feedbackChatId, text: text, parse_mode: 'Markdown', }),
            });
            const result = await response.json();
            if (result.ok) { alert('Спасибо! Ваше сообщение отправлено.'); setIsFeedbackModalOpen(false); setFeedbackMessage(''); } 
            else { throw new Error(result.description); }
        } catch (error) { console.error("Ошибка отправки в Telegram:", error); alert(`Не удалось отправить сообщение. Ошибка: ${error}`); } finally { setIsSendingFeedback(false); }
    };

    const handleWidgetToggle = (id: string) => {
        const newWidgets = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
        setWidgets(newWidgets);
    };

    const handleWidgetReorder = (id: string, direction: 'up' | 'down') => {
        const index = widgets.findIndex(w => w.id === id);
        if (index === -1) return;
        const newWidgets = [...widgets];
        if (direction === 'up' && index > 0) { [newWidgets[index], newWidgets[index - 1]] = [newWidgets[index - 1], newWidgets[index]]; } 
        else if (direction === 'down' && index < newWidgets.length - 1) { [newWidgets[index], newWidgets[index + 1]] = [newWidgets[index + 1], newWidgets[index]]; }
        setWidgets(newWidgets);
    };

    const saveWidgets = () => {
        localStorage.setItem('gym_dashboard_widgets_v4', JSON.stringify(widgets));
        setIsWidgetModalOpen(false);
    };

    // --- Render Widgets Helper ---
    const renderWidget = (widget: WidgetConfig) => {
        if (!widget.visible) return null;

        switch (widget.id) {
            case 'search':
                return (
                    <div key={widget.id} className="p-6 rounded-3xl flex flex-col h-full relative overflow-hidden card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-500/20">
                                <Icon name="Search" size={22}/>
                            </div>
                            <h3 className="font-bold text-xl text-slate-800 dark:text-white">Поиск</h3>
                        </div>
                        
                        <div className="relative mb-4">
                            <input 
                                type="text"
                                inputMode="search"
                                placeholder="Учитель, класс или кабинет..." 
                                value={searchQuery} 
                                onChange={e => setSearchQuery(e.target.value)} 
                                className="w-full bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl py-3.5 pl-11 pr-4 text-sm outline-none focus:ring-2 ring-indigo-500/50 dark:text-white transition-all placeholder:text-slate-400" 
                            />
                            <Icon name="Search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>

                        {searchResults.length > 0 && (
                            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2 space-y-2">
                                {searchResults.map((item) => (
                                    <div key={`${item.type}-${item.id}`} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors cursor-pointer" onClick={() => {
                                        const currentSemester = getActiveSemester(new Date(), settings);
                                        const targetPath = currentSemester === 2 ? '/schedule2' : '/schedule';
                                        const dayParam = todayDayOfWeek ? `&day=${todayDayOfWeek}` : '';
                                        
                                        // Detect shift if class is selected
                                        let shiftParam = '';
                                        if (item.type === 'class') {
                                            const cls = classes.find(c => c.id === item.id);
                                            if (cls) {
                                                shiftParam = `&shift=${cls.shift === Shift.First ? 1 : 2}`;
                                            }
                                        }

                                        if (item.type === 'teacher') navigate(`${targetPath}?view=teacher&id=${item.id}${dayParam}`);
                                        if (item.type === 'class') navigate(`${targetPath}?view=class&id=${item.id}${dayParam}${shiftParam}`);
                                    }}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.isBusy ? 'bg-indigo-100 text-indigo-600' : item.statusColor === 'red' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                                <Icon name={item.icon} size={18} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-800 dark:text-white text-sm truncate">{item.name} {item.subName && <span className="text-slate-400 font-normal">{item.subName}</span>}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.type === 'room' ? 'Кабинет' : item.type === 'class' ? 'Класс' : 'Учитель'}</div>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className={`text-xs font-bold px-2 py-1 rounded-lg inline-block ${
                                                item.statusColor === 'green' ? 'bg-emerald-100 text-emerald-700' :
                                                item.statusColor === 'red' ? 'bg-red-100 text-red-700' :
                                                item.statusColor === 'blue' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {item.statusText}
                                            </div>
                                            {item.location && <div className="text-[10px] font-mono mt-1 text-slate-400">{item.location}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            case 'substitutions':
                return (
                    <div key={widget.id} className={`p-6 rounded-3xl flex flex-col h-full card-hover relative overflow-hidden bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 ${unresolvedSubstitutions > 0 ? 'ring-2 ring-red-500/20 dark:ring-red-500/30' : ''}`}>
                        {unresolvedSubstitutions > 0 && <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 blur-2xl -mr-10 -mt-10 rounded-full"></div>}
                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className={`p-3 rounded-2xl shadow-lg ${unresolvedSubstitutions > 0 ? 'bg-gradient-to-br from-red-500 to-orange-600 text-white shadow-red-500/30' : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/30'}`}>
                                <Icon name={unresolvedSubstitutions > 0 ? "AlertTriangle" : "CheckCircle"} size={22}/>
                            </div>
                            <h3 className="font-bold text-xl dark:text-white">Замены</h3>
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10">
                            {unresolvedSubstitutions > 0 ? (
                                <>
                                    <div className="text-6xl font-black text-slate-800 dark:text-white mb-2 tracking-tighter">{unresolvedSubstitutions}</div>
                                    <div className="text-sm font-bold text-red-500 uppercase tracking-wider mb-6">Требуют внимания</div>
                                    <button onClick={() => navigate('/substitutions')} className="w-full py-3 bg-slate-800 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-all shadow-xl flex items-center justify-center gap-2 group">
                                        Перейти <Icon name="ArrowRight" size={18} className="group-hover:translate-x-1 transition-transform"/>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-slate-200 dark:text-slate-700 mb-4 transform scale-125 opacity-50"><Icon name="CheckCircle" size={64} /></div>
                                    <p className="text-base font-medium text-slate-500 dark:text-slate-400">Все замены разрешены</p>
                                </>
                            )}
                        </div>
                    </div>
                );
            case 'occupancy':
                return (
                    <div key={widget.id} className="p-6 rounded-3xl flex flex-col h-full card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 text-white p-3 rounded-2xl shadow-lg shadow-blue-500/20">
                                    <Icon name="PieChart" size={22}/>
                                </div>
                                <h3 className="font-bold text-xl dark:text-white">Штат</h3>
                            </div>
                            <button onClick={() => setShowAbsentList(!showAbsentList)} className="p-2.5 text-slate-400 hover:text-indigo-600 bg-white dark:bg-slate-700/50 rounded-xl transition-all hover:shadow-md" title={showAbsentList ? "Показать график" : "Список отсутствующих"}>
                                <Icon name={showAbsentList ? "PieChart" : "List"} size={20}/>
                            </button>
                        </div>
                        
                        {showAbsentList ? (
                            <div className="flex-1 overflow-y-auto custom-scrollbar animate-fade-in -mr-2 pr-2">
                                {occupancyStats.absentTeachersList.length > 0 ? (
                                    <div className="space-y-3">
                                        {occupancyStats.absentTeachersList.map(t => (
                                            <div key={t.id} className="flex justify-between items-center text-sm p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                                                <span className="font-bold text-slate-700 dark:text-slate-300 truncate pr-2">{t.name}</span>
                                                <span className="text-[10px] uppercase font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">{t.displayReason}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : ( <div className="h-full flex flex-col items-center justify-center text-center text-slate-400"><p className="text-sm font-medium">Все учителя на месте</p></div> )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-between flex-1 animate-fade-in px-2">
                                <div className="relative w-28 h-28">
                                     <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90 drop-shadow-md">
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" className="dark:stroke-slate-700" strokeLinecap="round"/>
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="url(#gradient)" strokeWidth="3" strokeDasharray={`${occupancyStats.presentPercent}, 100`} strokeLinecap="round" />
                                        <defs>
                                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#3b82f6" />
                                                <stop offset="100%" stopColor="#06b6d4" />
                                            </linearGradient>
                                        </defs>
                                     </svg>
                                     <div className="absolute inset-0 flex flex-col items-center justify-center">
                                         <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">На месте</span>
                                         <span className="text-2xl font-black text-slate-800 dark:text-white">{occupancyStats.presentPercent}%</span>
                                     </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">{occupancyStats.absentCount}</div>
                                    <div className="text-xs text-slate-400 font-bold uppercase leading-tight">Отсутствуют<br/>сегодня</div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'notes':
                return (
                    <div key={widget.id} className="p-6 rounded-3xl flex flex-col h-full group card-hover relative bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 text-white p-3 rounded-2xl shadow-lg shadow-orange-500/20">
                                    <Icon name="Edit2" size={22}/>
                                </div>
                                <h3 className="font-bold text-xl dark:text-white">Заметки</h3>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={saveNotes}
                                    disabled={!notesChanged}
                                    className={`p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                                        notesChanged
                                            ? 'text-amber-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 animate-pulse'
                                            : 'text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                                    title={notesChanged ? "Сохранить изменения" : "Заметки сохранены"}
                                >
                                    <Icon name="Save" size={16}/>
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(notes); addToast({type: 'success', title: 'Скопировано', message: 'Заметки скопированы в буфер обмена', duration: 2000}); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><Icon name="Copy" size={16}/></button>
                                <button onClick={() => { 
                                    if(confirm('Очистить заметки?')) { 
                                        setNotes(''); 
                                        localStorage.setItem('gym_notes', ''); 
                                        setNotesChanged(false);
                                        addToast({type: 'success', title: 'Заметки очищены', duration: 2000});
                                    }
                                }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><Icon name="Trash2" size={16}/></button>
                            </div>
                        </div>
                        <div className="relative flex-1 bg-yellow-50/50 dark:bg-slate-800/50 rounded-2xl p-1">
                            <textarea
                                inputMode="text"
                                className="w-full h-full p-4 bg-transparent border-none outline-none font-medium text-slate-700 dark:text-slate-200 resize-none text-sm leading-relaxed"
                                placeholder="Напишите что-нибудь..."
                                value={notes}
                                onChange={e => handleNotesChange(e.target.value)}
                                maxLength={10000}
                            />
                            {notesChanged && (
                                <div className="absolute bottom-3 right-3 text-[10px] font-bold uppercase tracking-widest text-amber-600 animate-pulse flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1 rounded-full shadow-sm">
                                    <Icon name="Clock" size={10}/> Не сохранено
                                </div>
                            )}
                        </div>
                    </div>
                );
            case 'conflicts':
                return (
                    <div key={widget.id} className="p-6 rounded-3xl h-full card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 p-2 rounded-xl"><Icon name="AlertTriangle" size={20}/></div>
                            <h3 className="font-bold text-lg dark:text-white">Возможные конфликты</h3>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                            {problemZones.length ? problemZones.map((p) => (
                                <div key={`${p.class}-${p.issue}`} className="flex justify-between items-center p-3 bg-white dark:bg-dark-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <span className="font-bold text-slate-700 dark:text-slate-200">{p.class}</span>
                                    <span className="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">{p.issue}</span>
                                </div>
                            )) : <div className="p-4 text-center text-slate-400 text-sm italic">В расписании не найдено критических ошибок</div>}
                        </div>
                     </div>
                );
            case 'birthdays':
                return (
                    <div key={widget.id} className="p-6 rounded-3xl h-full card-hover bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 p-2 rounded-xl"><Icon name="Gift" size={20}/></div>
                            <h3 className="font-bold text-lg dark:text-white">Ближайшие праздники</h3>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                            {upcomingBirthdays.length ? upcomingBirthdays.map(t => (
                                <div key={t.id} className="flex justify-between items-center p-3 bg-white dark:bg-dark-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <span className="font-medium text-slate-700 dark:text-slate-300 text-sm">{t.name}</span>
                                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${t.diff === 0 ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                        {t.diff === 0 ? 'Сегодня!' : `через ${t.diff} дн.`}
                                    </span>
                                </div>
                            )) : <div className="p-4 text-center text-slate-400 text-sm italic">Нет дней рождения в ближайший месяц</div>}
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
                        {greeting}, {role === 'admin' ? 'Администратор' : role === 'canteen' ? 'Столовая' : 'Учитель'}!
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-lg font-medium mb-4">
                        Сегодня {currentDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    
                    <div className="flex gap-3">
                        <button onClick={() => setIsWidgetModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:shadow-lg transition-all text-sm border border-slate-200 dark:border-slate-700" title="Настроить рабочий стол">
                            <Icon name="Settings" size={18} />
                        </button>
                        <button onClick={() => setIsFeedbackModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:shadow-lg transition-all text-sm border border-slate-200 dark:border-slate-700">
                            <Icon name="Send" size={18} /> Обратная связь
                        </button>
                    </div>

                    {/* Admin Broadcast moved here for flow */}
                    {settings?.adminAnnouncement?.active && (
                        <div className="mt-6 bg-amber-100 dark:bg-amber-900/30 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm">
                            <div className="flex items-start gap-4">
                                <div className="text-amber-600 dark:text-amber-400 shrink-0 mt-1">
                                    <Icon name="Bell" size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-amber-800 dark:text-amber-100 mb-1">Объявление</h3>
                                    <p className="text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                                        {settings.adminAnnouncement.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
                 
                 {/* Weather Widget Dedicated Spot */}
                 <div className="hidden lg:block h-full min-h-[160px]">
                     <WeatherWidget />
                 </div>
            </div>

            {/* Soft Notifications */}
            {role === 'admin' && unresolvedSubstitutions > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-500 text-white p-2 rounded-xl">
                            <Icon name="AlertTriangle" size={20} />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-slate-800 dark:text-white">
                                {unresolvedSubstitutions} замен{unresolvedSubstitutions === 1 ? 'а' : unresolvedSubstitutions < 5 ? 'ы' : ''} требуют внимания
                            </h3>
                        </div>
                        <NavLink to="/substitutions" className="px-4 py-2 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 transition-colors text-sm">
                            Посмотреть
                        </NavLink>
                    </div>
                </div>
            )}



            {/* Dashboard widgets - Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {widgets.slice(0, 4).map(widget => renderWidget(widget))}
            </div>

            {/* Additional Info Row - Remaining Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {widgets.slice(4).map(widget => renderWidget(widget))}
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
                            {isSendingFeedback ? <Icon name="Loader" size={16} className="animate-spin" /> : <Icon name="Send" size={16} />}
                            {isSendingFeedback ? 'Отправка...' : 'Отправить'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Widget Customization Modal */}
            <Modal isOpen={isWidgetModalOpen} onClose={() => setIsWidgetModalOpen(false)} title="Настройка рабочего стола">
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        Включите нужные виджеты и настройте их порядок.
                    </p>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                        {widgets.map((widget, idx) => (
                            <div key={widget.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600">
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
                                        disabled={idx === widgets.length - 1}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Icon name="ArrowRight" className="rotate-90" size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end pt-4">
                        <button onClick={saveWidgets} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">Сохранить</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
