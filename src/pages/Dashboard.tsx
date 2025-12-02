import { useMemo, useState, useEffect } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext'; 
import { Icon } from '../components/Icons';
import { DayOfWeek, DAYS, ScheduleItem } from '../types'; 
import { useNavigate } from 'react-router-dom'; 
import { Modal } from '../components/UI';

export const DashboardPage = () => {
    const { subjects, teachers, classes, rooms, bellSchedule, settings } = useStaticData();
    const { schedule, substitutions } = useScheduleData();
    const navigate = useNavigate(); 

    const [notes, setNotes] = useState(localStorage.getItem('gym_notes') || '');
    const [currentDate] = useState(new Date());
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResult, setSearchResult] = useState<any>(null);
    const [showAbsentList, setShowAbsentList] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [isSendingFeedback, setIsSendingFeedback] = useState(false);

    useEffect(() => { 
        localStorage.setItem('gym_notes', notes); 
        if(notes) {
            setSaveStatus('Сохранено');
            const t = setTimeout(() => setSaveStatus(''), 2000);
            return () => clearTimeout(t);
        }
    }, [notes]);

    const getLocalDateString = (date: Date) => {
        const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return d.toISOString().split('T')[0];
    };

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
        // Find substitutions for today
        // FIX: Added condition `s.replacementTeacherId !== s.originalTeacherId` to ignore mere room changes where teacher is same
        const todaySubs = substitutions.filter(s => 
            s.date === todayStr && 
            s.replacementTeacherId !== 'conducted' && 
            s.replacementTeacherId !== s.originalTeacherId
        ); 
        
        const partialAbsenceMap = new Map();

        todaySubs.forEach(sub => {
            // If already marked as full day absent, skip
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

        const combinedList: any[] = Array.from(fullDayAbsenteesMap.values());

        // Process partial absentees
        partialAbsenceMap.forEach((data, teacherId) => {
            const lessons = data.lessons.sort((a: any, b: any) => a.period - b.period);
            const periods = lessons.map((l: any) => l.period).join(', ');
            
            // Determine reason text. 
            // If ANY of the substituted lessons has "Без записи", we show "Без записи"? 
            // Or strictly "Отсутствует" unless specifically "Без записи".
            // Let's check if there is at least one "Без записи".
            const hasBezZapisi = lessons.some((l: any) => l.reason === 'Без записи');
            const reasonText = hasBezZapisi ? 'Без записи' : 'Отсутствует';

            combinedList.push({
                id: teacherId,
                name: data.teacher.name,
                displayReason: `${periods} урок: ${reasonText}`
            });
        });

        // Sort alphabetically
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
        const problems: any[] = [];
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

                // FIX: Если есть ЛЮБАЯ запись в заменах (отменен, проведен, заменен), то ситуация разрешена.
                // Считаем только если записи вообще нет.
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

            // Fix: Added check for s.shift === bell.shift to ensure we only show lessons for the CURRENT shift time
            const ownLessons = schedule.filter(s => s.teacherId === teacher.id && s.day === dayName && s.period === bell.period && s.shift === bell.shift);
            
            const substituteLessons = substitutions
                .filter(sub => sub.date === todayStr && sub.replacementTeacherId === teacher.id)
                .map(sub => schedule.find(s => s.id === sub.scheduleItemId))
                .filter((lesson): lesson is ScheduleItem => !!lesson && lesson.day === dayName && lesson.period === bell.period && lesson.shift === bell.shift); // Fix: Added shift check
            
            let activeItems: any[] = [];

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

            // Fix: Added check for s.shift === bell.shift
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

                const activeItems = items.filter(item => !item.cancelled);
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
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            <header className="mb-6 flex justify-between items-start">
                 <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white">Рабочий стол администратора</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{currentDate.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                 </div>
                 <button onClick={() => setIsFeedbackModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition text-sm">
                    <Icon name="Send" size={16} /> Обратная связь
                </button>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Widget 1: Who Where */}
                <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-4"><div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 p-2 rounded-lg"><Icon name="Search" size={20}/></div><h3 className="font-bold text-lg dark:text-white">Кто где?</h3></div>
                    <div className="flex gap-2 mb-4">
                        <input placeholder="Учитель или класс..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm outline-none dark:text-white" />
                        <button onClick={handleSearch} className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl transition-colors"><Icon name="Search" size={20}/></button>
                    </div>
                    {searchResult && (
                        <div className="mt-auto p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700 animate-fade-in">
                            <div className={`text-xs font-bold uppercase mb-2 flex items-center gap-2 ${searchResult.color}`}><Icon name={searchResult.icon || 'Info'} size={14}/> {searchResult.status}</div>
                            {searchResult.items && searchResult.items.length > 0 ? (
                                <div className="space-y-2">
                                    {searchResult.items.map((item: any, idx: number) => (
                                        <div key={idx} className="bg-white dark:bg-dark-800 p-2 rounded-lg border border-slate-100 dark:border-slate-600 text-xs shadow-sm">
                                            {item.direction && <div className="text-[10px] font-bold text-indigo-500 mb-0.5">{item.direction}</div>}
                                            <div className="font-bold text-slate-700 dark:text-slate-200">{item.subject}</div>
                                            {item.isSubstitution && (
                                                <div className="text-[10px] font-bold text-orange-500">
                                                    {item.originalTeacherName ? `Замена (вместо ${item.originalTeacherName})` : 'Замена кабинета'}
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center mt-1 text-slate-500 dark:text-slate-400">
                                                <span>{item.entityName}</span>
                                                <span className="bg-slate-100 dark:bg-slate-700 px-1.5 rounded font-mono">{item.room}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : ( <div className="font-bold text-slate-800 dark:text-white text-sm leading-snug">{searchResult.detail}</div> )}
                        </div>
                    )}
                </div>

                {/* Widget 2: Unresolved Substitutions */}
                <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4"><div className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 p-2 rounded-lg"><Icon name="AlertTriangle" size={20}/></div><h3 className="font-bold text-lg dark:text-white">Неразрешенные Замены</h3></div>
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        {unresolvedSubstitutions > 0 ? (
                            <>
                                <div className="text-5xl font-black text-red-500 mb-2">{unresolvedSubstitutions}</div>
                                <div className="text-sm text-slate-500 dark:text-slate-400 mb-4">уроков требуют замены сегодня</div>
                                <button onClick={() => navigate('/substitutions')} className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition shadow-lg shadow-red-200 dark:shadow-none flex items-center gap-2">
                                    <Icon name="ArrowRight" size={16}/> Перейти к заменам
                                </button>
                            </>
                        ) : (
                            <>
                                <Icon name="CheckCircle" size={48} className="mb-4 text-emerald-400"/>
                                <p className="text-sm text-slate-400">Сегодня нет уроков, требующих замены</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Widget 3: Occupancy */}
                <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3"><div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 p-2 rounded-lg"><Icon name="PieChart" size={20}/></div><h3 className="font-bold text-lg dark:text-white">Наполняемость</h3></div>
                        <button onClick={() => setShowAbsentList(!showAbsentList)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors" title={showAbsentList ? "Показать график" : "Список отсутствующих"}>
                            <Icon name={showAbsentList ? "PieChart" : "List"} size={20}/>
                        </button>
                    </div>
                    {showAbsentList ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar animate-fade-in">
                            {occupancyStats.absentTeachersList.length > 0 ? (
                                <div className="space-y-2">
                                    {occupancyStats.absentTeachersList.map(t => (
                                        <div key={t.id} className="flex justify-between items-center text-sm border-b border-slate-50 dark:border-slate-700 pb-1 mb-1 last:border-0">
                                            <span className="font-medium text-slate-700 dark:text-slate-300 truncate pr-2">{t.name}</span>
                                            <span className="text-xs text-red-500 font-bold whitespace-nowrap">{t.displayReason}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : ( <div className="h-full flex flex-col items-center justify-center text-center text-slate-400"><Icon name="CheckCircle" size={32} className="text-emerald-400 mb-2"/><p className="text-sm">Все учителя на месте</p></div> )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-between flex-1 animate-fade-in">
                            <div className="relative w-24 h-24">
                                 <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f1f5f9" strokeWidth="4" className="dark:stroke-slate-700" />
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray={`${occupancyStats.presentPercent}, 100`} />
                                 </svg>
                                 <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-slate-400 font-bold">Присут.</span><span className="font-black text-slate-700 dark:text-white">{occupancyStats.presentPercent}%</span></div>
                            </div>
                            <div className="text-right"><div className="text-3xl font-black text-red-500">{occupancyStats.absentCount}</div><div className="text-xs text-slate-400 font-bold uppercase leading-tight">Учителей<br/>отсутствует</div></div>
                        </div>
                    )}
                </div>

                {/* Widget 3: Birthdays */}
                <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4"><div className="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 p-2 rounded-lg"><Icon name="Gift" size={20}/></div><h3 className="font-bold text-lg dark:text-white">Дни рождения</h3></div>
                    <div className="flex-1 overflow-y-auto max-h-40 custom-scrollbar space-y-3">{upcomingBirthdays.length ? upcomingBirthdays.map(t => <div key={t.id} className="flex justify-between text-sm text-slate-700 dark:text-slate-300"><span>{t.name}</span><span className="font-bold text-slate-400">{t.diff === 0 ? 'Сегодня!' : `${t.diff} дн.`}</span></div>) : <div className="text-slate-400 text-sm text-center">Нет ближайших</div>}</div>
                </div>

                {/* Widget 4: Conflicts */}
                <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4"><div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 p-2 rounded-lg"><Icon name="AlertTriangle" size={20}/></div><h3 className="font-bold text-lg dark:text-white">Конфликты</h3></div>
                    <div className="flex-1 overflow-y-auto max-h-40 custom-scrollbar space-y-2">{problemZones.length ? problemZones.map((p,i) => <div key={i} className="flex justify-between text-sm text-slate-700 dark:text-slate-300"><span>{p.class}</span><span className="text-amber-600 text-xs font-bold">{p.issue}</span></div>) : <div className="text-slate-400 text-sm text-center">Расписание в порядке</div>}</div>
                </div>

                {/* Notes */}
                <div className="md:col-span-2 lg:col-span-4 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col relative group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3"><div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 p-2 rounded-lg"><Icon name="CheckSquare" size={20}/></div><h3 className="font-bold text-lg dark:text-white">Быстрые заметки</h3></div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { navigator.clipboard.writeText(notes); alert('Скопировано'); }} className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-bold text-slate-500 hover:text-indigo-600">Копировать</button>
                            <button onClick={() => { if(confirm('Очистить заметки?')) setNotes(''); }} className="text-xs bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded font-bold text-red-500 hover:text-red-700">Очистить</button>
                        </div>
                    </div>
                    <div className="relative flex-1">
                        <textarea 
                            className="w-full h-48 p-6 rounded-xl bg-yellow-50 dark:bg-slate-700 border border-yellow-200 dark:border-slate-600 outline-none font-medium text-slate-700 dark:text-slate-200 resize-none focus:ring-4 ring-yellow-100 dark:ring-slate-600/50 transition-shadow leading-relaxed shadow-inner" 
                            placeholder="Список задач на сегодня..." 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)}
                            style={{ backgroundImage: 'linear-gradient(transparent, transparent 27px, #e5e7eb 28px)', backgroundSize: '100% 28px', lineHeight: '28px' }}
                        />
                        {saveStatus && <div className="absolute bottom-4 right-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-fade-in flex items-center gap-1"><Icon name="Save" size={12}/> {saveStatus}</div>}
                    </div>
                </div>
            </div>
            <Modal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} title="Обратная связь и предложения">
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Есть идеи по улучшению приложения или нашли ошибку? Напишите нам! Ваше сообщение будет отправлено напрямую администратору.
                    </p>
                    <textarea
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        rows={6}
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 resize-y"
                        placeholder="Ваше сообщение..."
                    />
                    <div className="flex justify-end">
                        <button
                            onClick={handleSendFeedback}
                            disabled={isSendingFeedback}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50"
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