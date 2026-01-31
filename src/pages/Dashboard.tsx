
import React, { useMemo, useState, useEffect } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { DayOfWeek, DAYS, ScheduleItem } from '../types';
import { useNavigate } from 'react-router-dom';
import { Modal, useToast, SkeletonCard, SkeletonText } from '../components/UI';

interface SearchItem {
    room?: string;
    subject?: string;
    entityName?: string;
    direction?: string;
    isSubstitution?: boolean;
    originalTeacherName?: string | null;
    cancelled?: boolean;
}

interface SearchResult {
    status: string;
    detail?: string;
    color: string;
    icon?: string;
    items?: SearchItem[];
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

export const DashboardPage = () => {
    const { subjects, teachers, classes, rooms, bellSchedule, settings } = useStaticData();
    const { schedule, substitutions } = useScheduleData();
    const { role } = useAuth();
    const navigate = useNavigate();
    const { addToast } = useToast(); 

    const [notes, setNotes] = useState(localStorage.getItem('gym_notes') || '');
    const [currentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [showAbsentList, setShowAbsentList] = useState(false);
    const [notesChanged, setNotesChanged] = useState(false);

    // Безопасная функция для получения локальной даты в формате YYYY-MM-DD
    const getLocalDateString = (date: Date = new Date()): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [isSendingFeedback, setIsSendingFeedback] = useState(false);

    // Базовая санитизация заметок (удаляем потенциально опасные HTML теги)
    const sanitizeNotes = (text: string): string => {
        return text
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Удаляем script теги
            .replace(/<[^>]*>/g, '') // Удаляем остальные HTML теги
            .slice(0, 10000); // Ограничиваем длину до 10KB
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

    // Автоматическое сохранение через 3 секунды без уведомления
    useEffect(() => {
        if (!notesChanged) return;

        const timeoutId = setTimeout(() => {
            localStorage.setItem('gym_notes', notes);
            setNotesChanged(false);
            // Тихое автосохранение без уведомления
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

    const upcomingBirthdays = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);
        return teachers
          .filter(t => t.birthDate)
          .map(t => {
            const bDate = new Date(t.birthDate!);
            let next = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
            if (next < today) next.setFullYear(today.getFullYear() + 1);
            const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return { ...t, diff, age: today.getFullYear() - bDate.getFullYear() };
          })
          .filter(t => t.diff <= 30)
          .sort((a, b) => a.diff - b.diff);
    }, [teachers]);

    const occupancyStats = useMemo(() => {
        const totalTeachers = teachers.length;
        
        // 1. Teachers absent for the WHOLE DAY
        const fullDayAbsenteesMap = new Map();
        teachers.filter(t => t.unavailableDates.includes(todayStr)).forEach(t => {
            const rawReason = t.absenceReasons?.[todayStr];
            // Rule: Show reason only if "Без записи", else "Отсутствует"
            const displayReason = (rawReason === 'Без записи') ? 'Без записи' : 'Отсутствует';
            
            fullDayAbsenteesMap.set(t.id, {
                id: t.id,
                name: t.name,
                displayReason: displayReason
            });
        });

        // 2. Teachers with SUBSTITUTIONS (Partial absence)
        const todaySubs = substitutions.filter(s => 
            s.date === todayStr && 
            s.replacementTeacherId !== 'conducted' && 
            s.replacementTeacherId !== s.originalTeacherId
        ); 
        
        const partialAbsenceMap = new Map();

        todaySubs.forEach(sub => {
            if (fullDayAbsenteesMap.has(sub.originalTeacherId)) return;

            const originalTeacher = teachers.find(t => t.id === sub.originalTeacherId);
            if (!originalTeacher) return;

            const item = schedule.find(s => s.id === sub.scheduleItemId);
            if (!item) return;

            if (!partialAbsenceMap.has(sub.originalTeacherId)) {
                partialAbsenceMap.set(sub.originalTeacherId, {
                    teacher: originalTeacher,
                    lessons: []
                });
            }

            const entry = partialAbsenceMap.get(sub.originalTeacherId);
            entry.lessons.push({
                period: item.period,
                reason: sub.lessonAbsenceReason
            });
        });

        const combinedList: AbsentTeacher[] = Array.from(fullDayAbsenteesMap.values());

        // Process partial absentees
        partialAbsenceMap.forEach((data, teacherId) => {
            const lessons: { period: number; reason?: string }[] = data.lessons.sort((a: { period: number; reason?: string }, b: { period: number; reason?: string }) => a.period - b.period);
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

    const problemZones = useMemo(() => {
        const nextDay = new Date(currentDate);
        nextDay.setDate(currentDate.getDate() + 1);
        while (nextDay.getDay() === 0 || nextDay.getDay() === 6) nextDay.setDate(nextDay.getDate() + 1);
        const dayMap = [null, 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', null];
        const nextDayName = dayMap[nextDay.getDay()];
        if (!nextDayName) return [];
        const problems: ProblemZone[] = [];
        classes.forEach(cls => {
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
        return problems.filter((v,i,a)=>a.findIndex(t=>(t.class === v.class && t.issue === v.issue))===i).slice(0, 10);
    }, [schedule, classes, teachers, rooms, currentDate]);

    const unresolvedSubstitutions = useMemo(() => {
        if (!todayDayOfWeek) return 0;

        let count = 0;
        const todaysSchedule = schedule.filter(s => s.day === todayDayOfWeek);

        for (const lesson of todaysSchedule) {
            const originalTeacher = teachers.find(t => t.id === lesson.teacherId);
            
            if (originalTeacher && originalTeacher.unavailableDates.includes(todayStr)) {
                const substitution = substitutions.find(sub => 
                    sub.scheduleItemId === lesson.id && sub.date === todayStr
                );
                if (!substitution) {
                    count++;
                }
            }
        }
        return count;
    }, [schedule, teachers, substitutions, todayStr, todayDayOfWeek]);

    const handleSearch = () => {
        if (!searchQuery) { setSearchResult(null); return; }
        const now = new Date();
        const dayMap = [null, DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, null];
        const dayName = dayMap[now.getDay()]; 
        if (!dayName) { setSearchResult({ status: 'Выходной', detail: 'Сегодня уроков нет', color: 'text-slate-500' }); return; }
        const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const minutesNow = now.getHours() * 60 + now.getMinutes();
        let dailyBells = bellSchedule.filter(b => b.day === dayName);
        if (dailyBells.length === 0) dailyBells = bellSchedule.filter(b => b.day === 'default');

        const bell = dailyBells.find(b => {
             const start = timeToMin(b.start);
             const end = timeToMin(b.end);
             return minutesNow >= start && minutesNow <= end;
        });
        const q = searchQuery.toLowerCase();
        const teacher = teachers.find(t => t.name.toLowerCase().includes(q));
        const cls = classes.find(c => c.name.toLowerCase().includes(q));
        if (!teacher && !cls) { setSearchResult({ status: 'Не найдено', detail: 'Проверьте запрос', color: 'text-red-500' }); return; }
        
        if (teacher) {
            if (teacher.unavailableDates.includes(todayStr)) {
                const rawReason = teacher.absenceReasons?.[todayStr];
                const displayReason = (rawReason === 'Без записи') ? 'Без записи' : 'Отсутствует';
                setSearchResult({ status: 'Отсутствует', detail: displayReason, color: 'text-red-500', icon: 'UserX', items: [] });
                return;
            }

            if (!bell) {
                setSearchResult({ status: 'Перемена / Нет урока', detail: 'Свободное время', color: 'text-amber-500', icon: 'Clock', items: [] });
                return;
            }

            const ownLessons = schedule.filter(s => s.teacherId === teacher.id && s.day === dayName && s.period === bell.period && s.shift === bell.shift);
            
            const substituteLessons = substitutions
                .filter(sub => sub.date === todayStr && sub.replacementTeacherId === teacher.id)
                .map(sub => schedule.find(s => s.id === sub.scheduleItemId))
                .filter((lesson): lesson is ScheduleItem => !!lesson && lesson.day === dayName && lesson.period === bell.period && lesson.shift === bell.shift); 
            
            let activeItems: SearchItem[] = [];

            ownLessons.forEach(ownLesson => {
                const ownLessonSub = substitutions.find(s => s.date === todayStr && s.scheduleItemId === ownLesson.id);
                if (!ownLessonSub || ownLessonSub.replacementTeacherId === teacher.id) {
                    const room = rooms.find(r => r.id === (ownLessonSub?.replacementRoomId || ownLesson.roomId))?.name || (ownLessonSub?.replacementRoomId || ownLesson.roomId) || "без каб.";
                    const subject = subjects.find(s => s.id === ownLesson.subjectId)?.name;
                    const className = classes.find(c => c.id === ownLesson.classId)?.name;
                    activeItems.push({ 
                        room, 
                        subject, 
                        entityName: className, 
                        direction: ownLesson.direction,
                        isSubstitution: !!(ownLessonSub && ownLessonSub.replacementTeacherId === teacher.id),
                        originalTeacherName: null
                    });
                }
            });
            
            substituteLessons.forEach(lesson => {
                const subRecord = substitutions.find(sub => sub.date === todayStr && sub.scheduleItemId === lesson.id && sub.replacementTeacherId === teacher.id);
                if (!subRecord) return;

                const room = rooms.find(r => r.id === (subRecord.replacementRoomId || lesson.roomId))?.name || (subRecord.replacementRoomId || lesson.roomId) || "без каб.";
                const subject = subjects.find(s => s.id === lesson.subjectId)?.name;
                const className = classes.find(c => c.id === lesson.classId)?.name;
                const originalTeacher = teachers.find(t => t.id === subRecord.originalTeacherId);

                activeItems.push({
                    room,
                    subject,
                    entityName: className,
                    direction: lesson.direction,
                    isSubstitution: true,
                    originalTeacherName: originalTeacher?.name
                });
            });
            
            if (activeItems.length > 0) {
                setSearchResult({ status: `Урок ${bell.period}`, detail: '', color: 'text-emerald-600', icon: 'MapPin', items: activeItems });
            } else {
                setSearchResult({ status: 'Окно', detail: `Сейчас (Урок ${bell.period}) свободен`, color: 'text-blue-500', icon: 'User', items: [] });
            }
        } else if (cls) {
            if (!bell) { setSearchResult({ status: 'Перемена', detail: 'Класс свободен', color: 'text-amber-500', icon: 'Clock', items: [] }); return; }

            const lessons = schedule.filter(s => s.classId === cls.id && s.day === dayName && s.period === bell.period && s.shift === bell.shift);
            
            if (lessons.length > 0) {
                const items = lessons.map(lesson => {
                    const substitution = substitutions.find(sub => sub.scheduleItemId === lesson.id && sub.date === todayStr);

                    if (substitution && substitution.replacementTeacherId === 'cancelled') {
                        return { cancelled: true, subject: subjects.find(s => s.id === lesson.subjectId)?.name };
                    }

                    const isSubbed = !!(substitution && substitution.replacementTeacherId !== 'conducted' && substitution.replacementTeacherId !== 'cancelled');
                    const teacherId = isSubbed ? substitution.replacementTeacherId : lesson.teacherId;
                    const roomId = substitution?.replacementRoomId || lesson.roomId;
                    
                    const teacherName = teachers.find(t => t.id === teacherId)?.name;
                    const room = rooms.find(r => r.id === roomId)?.name || roomId || "без каб.";
                    const subject = subjects.find(s => s.id === lesson.subjectId)?.name;
                    
                    const originalTeacherName = isSubbed ? teachers.find(t => t.id === substitution.originalTeacherId)?.name : null;

                    return { room, subject, entityName: teacherName, direction: lesson.direction, isSubstitution: isSubbed, originalTeacherName };
                });

                const activeItems = items.filter(item => !item.cancelled) as SearchItem[];
                const cancelledItems = items.filter(item => !!item.cancelled);
                
                if (activeItems.length > 0) {
                    setSearchResult({ status: `Урок ${bell.period}`, detail: '', color: 'text-emerald-600', icon: 'MapPin', items: activeItems });
                } else if (cancelledItems.length > 0) {
                    setSearchResult({ status: `Урок отменен`, detail: cancelledItems.map(i => i.subject).join(', '), color: 'text-red-500', icon: 'X', items: [] });
                } else {
                    setSearchResult({ status: 'Нет урока', detail: 'Класс свободен', color: 'text-blue-500', icon: 'BookOpen', items: [] });
                }
            } else {
                setSearchResult({ status: 'Нет урока', detail: 'Класс свободен', color: 'text-blue-500', icon: 'BookOpen', items: [] });
            }
        }
    };
    
    const handleSendFeedback = async () => {
        if (!feedbackMessage.trim()) {
            alert('Пожалуйста, введите ваше сообщение.');
            return;
        }
        if (!settings?.telegramToken || !settings?.feedbackChatId) {
            alert('Функция обратной связи не настроена администратором.');
            return;
        }

        setIsSendingFeedback(true);
        const text = `📬 *Новое сообщение обратной связи:*\n\n${feedbackMessage}`;

        try {
            const response = await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: settings.feedbackChatId,
                    text: text,
                    parse_mode: 'Markdown',
                }),
            });

            const result = await response.json();
            if (result.ok) {
                alert('Спасибо! Ваше сообщение отправлено.');
                setIsFeedbackModalOpen(false);
                setFeedbackMessage('');
            } else {
                throw new Error(result.description);
            }
        } catch (error) {
            console.error("Ошибка отправки в Telegram:", error);
            alert(`Не удалось отправить сообщение. Ошибка: ${error}`);
        } finally {
            setIsSendingFeedback(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            {/* Header Section with Greeting */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 animate-fade-in">
                 <div>
                    <h1 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight mb-1 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
                        {greeting}, {role === 'admin' ? 'Администратор' : 'Учитель'}!
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">
                        Сегодня {currentDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => setIsFeedbackModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:shadow-lg transition-all text-sm border border-slate-200 dark:border-slate-700">
                        <Icon name="Send" size={18} /> Обратная связь
                    </button>
                 </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Widget 1: Who Where - Search */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col h-full relative overflow-hidden card-hover">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-500/20">
                            <Icon name="Search" size={22}/>
                        </div>
                        <h3 className="font-bold text-xl text-slate-800 dark:text-white">Поиск</h3>
                    </div>
                    
                    <div className="flex gap-2 mb-4">
                        <input 
                            placeholder="Учитель или класс..." 
                            value={searchQuery} 
                            onChange={e => setSearchQuery(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && handleSearch()} 
                            className="w-full bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl p-3.5 text-sm outline-none focus:ring-2 ring-indigo-500/50 dark:text-white transition-all placeholder:text-slate-400" 
                        />
                        <button onClick={handleSearch} className="btn-primary btn-ripple btn-touch p-3.5 mobile-optimized">
                            <Icon name="Search" size={20}/>
                        </button>
                    </div>

                    {searchResult && (
                        <div className="mt-auto p-4 bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 animate-fade-in backdrop-blur-sm">
                            <div className={`text-xs font-bold uppercase mb-3 flex items-center gap-2 ${searchResult.color}`}>
                                <Icon name={searchResult.icon || 'Info'} size={16}/> {searchResult.status}
                            </div>
                            {searchResult.items && searchResult.items.length > 0 ? (
                                <div className="space-y-2.5">
                                    {searchResult.items.map((item, idx) => (
                                        <div key={`${item.room}-${item.subject}-${item.entityName}-${idx}`} className="bg-white dark:bg-dark-900/80 p-3 rounded-xl border border-slate-100 dark:border-slate-600 text-sm shadow-sm">
                                            <div className="flex justify-between items-start">
                                                <div className="font-bold text-slate-700 dark:text-slate-200">{item.subject}</div>
                                                {item.direction && <div className="text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md">{item.direction}</div>}
                                            </div>
                                            {item.isSubstitution && (
                                                <div className="text-[10px] font-bold text-orange-500 mt-1">
                                                    {item.originalTeacherName ? `Замена (${item.originalTeacherName})` : 'Замена кабинета'}
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center mt-2 text-slate-500 dark:text-slate-400 text-xs">
                                                <span>{item.entityName}</span>
                                                <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg font-mono font-bold text-slate-600 dark:text-slate-300">{item.room}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : ( <div className="font-bold text-slate-800 dark:text-white text-base leading-snug">{searchResult.detail}</div> )}
                        </div>
                    )}
                </div>

                {/* Widget 2: Unresolved Substitutions - Priority */}
                <div className={`glass-panel p-6 rounded-3xl flex flex-col h-full card-hover relative overflow-hidden ${unresolvedSubstitutions > 0 ? 'ring-2 ring-red-500/20 dark:ring-red-500/30' : ''}`}>
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

                {/* Widget 3: Occupancy & Absences */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col h-full card-hover">
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

                {/* Widget 4: Quick Notes */}
                <div className="glass-panel p-6 rounded-3xl flex flex-col h-full group card-hover relative">
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
                            <button onClick={() => { if(confirm('Очистить заметки?')) { setNotes(''); setNotesChanged(false); }}} className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><Icon name="Trash2" size={16}/></button>
                        </div>
                    </div>
                    <div className="relative flex-1 bg-yellow-50/50 dark:bg-slate-800/50 rounded-2xl p-1">
                        <textarea
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
            </div>

            {/* Additional Info Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Conflicts */}
                 <div className="glass-panel p-6 rounded-3xl">
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

                 {/* Birthdays */}
                 <div className="glass-panel p-6 rounded-3xl">
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
            </div>

            <Modal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} title="Обратная связь">
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Есть идеи по улучшению приложения или нашли ошибку? Напишите нам!
                    </p>
                    <textarea
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
        </div>
    );
};
