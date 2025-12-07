
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useStaticData, useScheduleData } from '../context/DataContext'; 
import { Icon } from '../components/Icons';
import { Modal } from '../components/UI';
import { DAYS, Shift } from '../types';

export const SubstitutionsPage = () => {
    const { subjects, teachers, classes, rooms, settings, saveStaticData } = useStaticData(); 
    // Получаем оба расписания, чтобы выбирать нужное в зависимости от даты
    const { schedule1, schedule2, substitutions, saveScheduleData } = useScheduleData();

    const location = useLocation();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSubParams, setCurrentSubParams] = useState<any>(null);
    const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
    const [manualSearchModalOpen, setManualSearchModalOpen] = useState(false);
    
    const [selectedTeacherId, setSelectedTeacherId] = useState<string|null>(null);
    const [absenceReason, setAbsenceReason] = useState('Болезнь');
    const [showHistory, setShowHistory] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [teacherSearch, setTeacherSearch] = useState('');
    const [teacherShiftFilter, setTeacherShiftFilter] = useState('all');
    const [candidateSearch, setCandidateSearch] = useState('');
    const [manualLessonSearch, setManualLessonSearch] = useState('');

    const [selectedRoomId, setSelectedRoomId] = useState<string>('');
    const [lessonAbsenceReason, setLessonAbsenceReason] = useState<string>('');
    
    // State to track refusals in the current modal session
    const [refusedTeacherIds, setRefusedTeacherIds] = useState<string[]>([]);
    const [showSwapOptions, setShowSwapOptions] = useState(false);
    // State for swap configuration
    const [swapKeepRooms, setSwapKeepRooms] = useState(false);

    // Определяем актуальное расписание на основе выбранной даты
    const activeSchedule = useMemo(() => {
        const month = new Date(selectedDate).getMonth();
        // Январь(0) - Май(4) = 2 полугодие. Остальное (включая лето по дефолту) = 1 полугодие
        const isSecondSemester = month >= 0 && month <= 4;
        return isSecondSemester ? schedule2 : schedule1;
    }, [selectedDate, schedule1, schedule2]);

    useEffect(() => {
        if(location.state?.subParams) {
            setCurrentSubParams(location.state.subParams);
            setSelectedRoomId(''); 
            setLessonAbsenceReason(''); 
            setRefusedTeacherIds([]);
            setShowSwapOptions(false);
            setSwapKeepRooms(false);
            setIsModalOpen(true);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // When opening modal manually, try to load existing refusals if a substitution already exists
    useEffect(() => {
        if (isModalOpen && currentSubParams) {
            const existingSub = substitutions.find(s => s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate);
            if (existingSub) {
                setRefusedTeacherIds(existingSub.refusals || []);
            } else {
                setRefusedTeacherIds([]);
            }
            setShowSwapOptions(false);
            setSwapKeepRooms(false);
        }
    }, [isModalOpen, currentSubParams, substitutions, selectedDate]);


    const selectedDayOfWeek = useMemo(() => { 
        const idx = new Date(selectedDate).getDay(); 
        if (idx === 0 || idx === 6) return null;
        return DAYS[idx - 1]; 
    }, [selectedDate]);

    const filteredTeachersList = useMemo(() => {
        return teachers.filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(teacherSearch.toLowerCase());
            const matchesShift = teacherShiftFilter === 'all' ? true : t.shifts.includes(teacherShiftFilter);
            return matchesSearch && matchesShift;
        });
    }, [teachers, teacherSearch, teacherShiftFilter]);

    const absentTeachers = useMemo(() => teachers.filter(t => t.unavailableDates.includes(selectedDate)), [teachers, selectedDate]);
    
    const affectedLessons = useMemo(() => { 
        if (!selectedDayOfWeek) return []; 
        
        const absentIds = absentTeachers.map(t => t.id); 
        // Используем activeSchedule вместо schedule
        const lessonsOfAbsent = activeSchedule.filter(s => s.day === selectedDayOfWeek && absentIds.includes(s.teacherId));

        const subsOnDate = substitutions.filter(s => s.date === selectedDate);
        const subScheduleIds = subsOnDate.map(s => s.scheduleItemId);
        const lessonsWithSubs = activeSchedule.filter(s => subScheduleIds.includes(s.id));

        const merged = [...lessonsOfAbsent];
        lessonsWithSubs.forEach(l => {
            if (!merged.find(m => m.id === l.id)) merged.push(l);
        });

        return merged.sort((a, b) => a.period - b.period); 
    }, [activeSchedule, selectedDayOfWeek, absentTeachers, substitutions, selectedDate]);

    const openAbsenceModal = (id: string) => { 
        const teacher = teachers.find(t => t.id === id);
        setSelectedTeacherId(id); 
        setAbsenceReason(teacher?.absenceReasons?.[selectedDate] || 'Болезнь'); 
        setAbsenceModalOpen(true); 
    };
    
    const confirmAbsence = useCallback(async () => { 
        let updatedTeachers = [...teachers]; 
        const tIndex = updatedTeachers.findIndex(x => x.id === selectedTeacherId);
        if (tIndex === -1) return;

        const teacher = { ...updatedTeachers[tIndex] };
        if (!teacher.unavailableDates.includes(selectedDate)) { 
            teacher.unavailableDates = [...teacher.unavailableDates, selectedDate]; 
        }
        if(!teacher.absenceReasons) teacher.absenceReasons = {}; 
        teacher.absenceReasons[selectedDate] = absenceReason; 

        updatedTeachers[tIndex] = teacher;
        await saveStaticData({ teachers: updatedTeachers }); 
        setAbsenceModalOpen(false); 
    }, [teachers, selectedTeacherId, selectedDate, absenceReason, saveStaticData]);

    const removeAbsence = useCallback(async (id: string) => { 
        let updatedTeachers = [...teachers]; 
        const tIndex = updatedTeachers.findIndex(x => x.id === id);
        if (tIndex === -1) return;

        const teacher = { ...updatedTeachers[tIndex] };
        teacher.unavailableDates = teacher.unavailableDates.filter((d: string) => d !== selectedDate); 
        if(teacher.absenceReasons) delete teacher.absenceReasons[selectedDate]; 
        updatedTeachers[tIndex] = teacher;
        await saveStaticData({ teachers: updatedTeachers }); 
    }, [teachers, selectedDate, saveStaticData]);
    
    const assignSubstitution = useCallback(async (replacementId: string, isMerger: boolean = false) => { 
        if (!currentSubParams) {
            alert("Ошибка: Невозможно назначить замену. Параметры урока не определены. Пожалуйста, попробуйте еще раз.");
            return;
        }

        const newSubs = [...substitutions];

        // Используем activeSchedule для поиска урока
        const item = activeSchedule.find(s => s.id === currentSubParams.scheduleItemId);
        if (!item) {
            alert("Ошибка: Урок не найден в расписании. Возможно, он был удален или вы переключили полугодие.");
            return;
        }
        
        const existingSubIndex = newSubs.findIndex(s => s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate);
        const subData = { 
            id: existingSubIndex >= 0 ? newSubs[existingSubIndex].id : Math.random().toString(36).substr(2, 9), 
            date: selectedDate, 
            scheduleItemId: currentSubParams.scheduleItemId, 
            originalTeacherId: item.teacherId, 
            replacementTeacherId: replacementId,
            replacementRoomId: selectedRoomId || undefined, 
            isMerger: isMerger,
            lessonAbsenceReason: (replacementId !== 'conducted' && replacementId !== 'cancelled' && lessonAbsenceReason)
                ? lessonAbsenceReason
                : undefined,
            refusals: refusedTeacherIds // Save the list of refusals
        }; 
        
        if (existingSubIndex >= 0) newSubs[existingSubIndex] = subData; else newSubs.push(subData); 
        
        await saveScheduleData({ substitutions: newSubs }); 
        
        setIsModalOpen(false); 
        setCandidateSearch('');
        setSelectedRoomId('');
        setLessonAbsenceReason(''); 
        setRefusedTeacherIds([]);
        setCurrentSubParams(null);
    }, [currentSubParams, selectedDate, selectedRoomId, activeSchedule, substitutions, teachers, lessonAbsenceReason, refusedTeacherIds, saveScheduleData]);

    const swapLessons = useCallback(async (targetLessonId: string) => {
        if (!currentSubParams) return;

        // Source Lesson
        const sourceLesson = activeSchedule.find(s => s.id === currentSubParams.scheduleItemId);
        // Target Lesson
        const targetLesson = activeSchedule.find(s => s.id === targetLessonId);

        if (!sourceLesson || !targetLesson) {
             alert("Ошибка: Не найден урок для обмена.");
             return;
        }

        const newSubs = [...substitutions];

        // Logic for room assignment:
        // By default (swapKeepRooms = false), lessons trade places. 
        //   - Source Lesson (teaching Target Subject) goes to Target Room.
        //   - Target Lesson (teaching Source Subject) goes to Source Room.
        // If swapKeepRooms = true, teachers stay in their own rooms.
        //   - Source Lesson (teaching Target Subject) stays in Source Room.
        //   - Target Lesson (teaching Source Subject) stays in Target Room.
        // Manual override: selectedRoomId overrides Source Lesson's room.

        // Calculate specific room ID for source substitution
        let effectiveRoomForSource: string | undefined;
        if (selectedRoomId) {
            effectiveRoomForSource = selectedRoomId;
        } else {
            effectiveRoomForSource = swapKeepRooms ? sourceLesson.roomId : targetLesson.roomId;
        }

        // Calculate specific room ID for target substitution
        // If keeping rooms, Target stays in Target Room. If swapping (default), Target takes Source Room.
        const effectiveRoomForTarget = swapKeepRooms ? targetLesson.roomId : sourceLesson.roomId;


        // 1. Create Sub for Source Lesson
        const sourceSubIndex = newSubs.findIndex(s => s.scheduleItemId === sourceLesson.id && s.date === selectedDate);
        const sourceSubData = {
            id: sourceSubIndex >= 0 ? newSubs[sourceSubIndex].id : Math.random().toString(36).substr(2, 9),
            date: selectedDate,
            scheduleItemId: sourceLesson.id,
            originalTeacherId: sourceLesson.teacherId,
            replacementTeacherId: sourceLesson.teacherId, // Same teacher
            replacementClassId: targetLesson.classId,
            replacementSubjectId: targetLesson.subjectId,
            replacementRoomId: effectiveRoomForSource !== sourceLesson.roomId ? effectiveRoomForSource : undefined, 
        };
        if (sourceSubIndex >= 0) newSubs[sourceSubIndex] = sourceSubData; else newSubs.push(sourceSubData);

        // 2. Create Sub for Target Lesson
        const targetSubIndex = newSubs.findIndex(s => s.scheduleItemId === targetLesson.id && s.date === selectedDate);
        const targetSubData = {
            id: targetSubIndex >= 0 ? newSubs[targetSubIndex].id : Math.random().toString(36).substr(2, 9),
            date: selectedDate,
            scheduleItemId: targetLesson.id,
            originalTeacherId: targetLesson.teacherId,
            replacementTeacherId: targetLesson.teacherId, // Same teacher
            replacementClassId: sourceLesson.classId,
            replacementSubjectId: sourceLesson.subjectId,
            replacementRoomId: effectiveRoomForTarget !== targetLesson.roomId ? effectiveRoomForTarget : undefined,
        };
        if (targetSubIndex >= 0) newSubs[targetSubIndex] = targetSubData; else newSubs.push(targetSubData);

        await saveScheduleData({ substitutions: newSubs });
        
        setIsModalOpen(false); 
        setCurrentSubParams(null);
        setSelectedRoomId(''); // Reset room selection
        setShowSwapOptions(false);
        setSwapKeepRooms(false);

    }, [currentSubParams, activeSchedule, substitutions, selectedDate, saveScheduleData, selectedRoomId, swapKeepRooms]);
    
    const removeSubstitution = useCallback(async (id: string) => { 
        // If it was a swap, we technically should check if the "other half" exists, 
        // but user might want to cancel just one side or both. 
        // For simplicity, we just delete the selected one. The other one will remain as a "substitution" 
        // (Teacher X teaches Class Y at Period Z) which is still valid state.
        const newSubs = substitutions.filter(s => !(s.scheduleItemId === id && s.date === selectedDate)); 
        await saveScheduleData({ substitutions: newSubs }); 
    }, [substitutions, selectedDate, saveScheduleData]);
    
    const copyForMessenger = useCallback(() => {
        let text = `*Замены на ${new Date(selectedDate).toLocaleDateString('ru-RU')}*\n`;
        
        const hasAnyActiveSubs = substitutions.some(s => s.date === selectedDate && s.replacementTeacherId !== 'conducted');

        const processShift = (shiftName: string, shiftEnum: Shift) => {
            const lessons = affectedLessons.filter(l => l.shift === shiftEnum);
            
            const lessonsWithSubs = lessons.filter(l => {
                const sub = substitutions.find(s => s.scheduleItemId === l.id && s.date === selectedDate);
                return sub && sub.replacementTeacherId !== 'conducted';
            });

            if (lessonsWithSubs.length > 0) {
                text += `\n🔹 *${shiftName.toUpperCase()}*\n`;
                lessonsWithSubs.forEach(l => {
                    const sub = substitutions.find(s => s.scheduleItemId === l.id && s.date === selectedDate);
                    const cls = classes.find(c => c.id === l.classId);
                    const subj = subjects.find(s => s.id === l.subjectId);
                    const rep = sub ? teachers.find(t => t.id === sub.replacementTeacherId) : null;
                    const orig = teachers.find(t => t.id === l.teacherId);
                    const origRoom = rooms.find(r => r.id === l.roomId)?.name || l.roomId || '?';
                    
                    const dayAbsenceReason = orig?.absenceReasons?.[selectedDate];
                    const lessonSpecificReason = sub?.lessonAbsenceReason;
                    
                    const effectiveDayAbsenceDisplay = (dayAbsenceReason === 'Без записи') ? dayAbsenceReason : null;
                    const effectiveLessonSpecificDisplay = (lessonSpecificReason === 'Без записи') ? lessonSpecificReason : null;

                    const effectiveReasonDisplay = effectiveLessonSpecificDisplay || effectiveDayAbsenceDisplay;

                    const origName = orig?.name + (effectiveReasonDisplay ? ` (${effectiveReasonDisplay})` : '');
                    
                    const newRoom = sub?.replacementRoomId ? rooms.find(r => r.id === sub.replacementRoomId)?.name || sub.replacementRoomId : null;
                    
                    // Logic for swapped content
                    const swappedClass = sub?.replacementClassId ? classes.find(c => c.id === sub.replacementClassId) : null;
                    const swappedSubj = sub?.replacementSubjectId ? subjects.find(s => s.id === sub.replacementSubjectId) : null;

                    if (sub) {
                        if (sub.replacementTeacherId === 'cancelled') {
                            text += `❗ ${cls?.name} (${l.period} ур): ${subj?.name} (${origName}) -> УРОК СНЯТ\n`;
                        } else {
                            if (sub.replacementTeacherId === sub.originalTeacherId && newRoom && !swappedClass) {
                                text += `🚪 ${cls?.name} (${l.period} ур): ${subj?.name} (${orig?.name}) -> Кабинет ${origRoom} → ${newRoom}\n`;
                            } else if (swappedClass && swappedSubj) {
                                text += `🔄 ${cls?.name} (${l.period} ур): ${subj?.name} -> Урок ${swappedClass.name} ${swappedSubj.name} (Обмен уроками)${newRoom ? ` в каб. ${newRoom}` : ''}\n`;
                            } else {
                                let line = `✅ ${cls?.name} (${l.period} ур): ${subj?.name} -> ${rep?.name} ${sub.isMerger ? '(ОБЪЕДИНЕНИЕ) ' : ''}(вместо ${origName})`;
                                if (newRoom) line += ` в каб. ${newRoom}`;
                                text += line + '\n';
                            }
                        }
                    }
                });
            }
        };

        if(!hasAnyActiveSubs) {
            text += "\nЗамен нет.";
        } else {
            processShift(Shift.First, Shift.First);
            processShift(Shift.Second, Shift.Second);
        }

        navigator.clipboard.writeText(text);
        alert("Текст скопирован с разделением по сменам!");
    }, [selectedDate, substitutions, affectedLessons, classes, subjects, teachers, rooms]);

    const generateICal = useCallback(() => {
        let icalContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Gymnasium//Manager//RU\n";
        const subs = substitutions.filter(s => s.date === selectedDate);
        subs.forEach(sub => {
            // Используем activeSchedule
            const item = activeSchedule.find(s => s.id === sub.scheduleItemId);
            if(!item) return;
            let repName = "Unknown";
            if(sub.replacementTeacherId === 'cancelled') repName = "УРОК СНЯТ";
            else if(sub.replacementTeacherId === 'conducted') repName = "Урок проведен";
            else {
                const t = teachers.find(t => t.id === sub.replacementTeacherId);
                if(t) repName = t.name;
            }

            const subj = subjects.find(s => s.id === item.subjectId);
            const cls = classes.find(c => c.id === item.classId);
            const dateStr = sub.date.replace(/-/g, '');
            
            const origTeacher = teachers.find(t => t.id === sub.originalTeacherId);
            const dayAbsenceReason = origTeacher?.absenceReasons?.[selectedDate];
            const lessonSpecificReason = sub.lessonAbsenceReason;

            const effectiveDayAbsenceDisplay = (dayAbsenceReason === 'Без записи') ? dayAbsenceReason : null;
            const effectiveLessonSpecificDisplay = (lessonSpecificReason === 'Без записи') ? lessonSpecificReason : null;
            const effectiveReasonDisplay = effectiveLessonSpecificDisplay || effectiveDayAbsenceDisplay;

            icalContent += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${dateStr}\nSUMMARY:Замена: ${cls?.name} - ${subj?.name}\nDESCRIPTION:Заменяет: ${repName}${sub.isMerger ? ' (ОБЪЕДИНЕНИЕ)' : ''}${effectiveReasonDisplay ? ` (Причина: ${effectiveReasonDisplay})` : ''}\nEND:VEVENT\n`;
        });
        icalContent += "END:VCALENDAR";
        const blob = new Blob([icalContent], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = 'substitutions.ics';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }, [selectedDate, substitutions, activeSchedule, teachers, subjects, classes]);

    const sendToTelegram = useCallback(async () => {
        if (!settings?.telegramToken) {
            alert("Токен Telegram бота не настроен в разделе 'Администрация'.");
            return;
        }

        let fullMessage = `*Замены на ${new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}*\n\n`;
        let hasActiveSubs = false;

        const teacherChatIdsToNotify = new Set<string>();

        const shiftsToProcess = [Shift.First, Shift.Second];
        for (const shiftEnum of shiftsToProcess) {
            const lessonsInShift = affectedLessons.filter(l => l.shift === shiftEnum);
            const activeSubstitutionsInShift = lessonsInShift.filter(l => 
                substitutions.some(s => s.scheduleItemId === l.id && s.date === selectedDate && s.replacementTeacherId !== 'conducted')
            );

            if (activeSubstitutionsInShift.length > 0) {
                hasActiveSubs = true;
                fullMessage += `🔹 *${shiftEnum.toUpperCase()}*\n`;

                activeSubstitutionsInShift.forEach(l => {
                    const sub = substitutions.find(s => s.scheduleItemId === l.id && s.date === selectedDate);
                    if (!sub) return;

                    const cls = classes.find(c => c.id === l.classId);
                    const subj = subjects.find(s => s.id === l.subjectId);
                    const originalTeacher = teachers.find(t => t.id === sub.originalTeacherId);
                    const replacementTeacher = teachers.find(t => t.id === sub.replacementTeacherId);

                    const dayAbsenceReason = originalTeacher?.absenceReasons?.[selectedDate];
                    const lessonSpecificReason = sub.lessonAbsenceReason;

                    const effectiveDayAbsenceDisplay = (dayAbsenceReason === 'Без записи') ? dayAbsenceReason : null;
                    const effectiveLessonSpecificDisplay = (lessonSpecificReason === 'Без записи') ? lessonSpecificReason : null;
                    const effectiveReasonDisplay = effectiveLessonSpecificDisplay || effectiveDayAbsenceDisplay;

                    const origTeacherNameWithReason = originalTeacher?.name + (effectiveReasonDisplay ? ` (${effectiveReasonDisplay})` : '');
                    
                    const oldRoomName = rooms.find(r => r.id === l.roomId)?.name || l.roomId || '—';
                    const newRoomName = sub.replacementRoomId ? (rooms.find(r => r.id === sub.replacementRoomId)?.name || sub.replacementRoomId) : oldRoomName;
                    
                    // Logic for swapped content
                    const swappedClass = sub.replacementClassId ? classes.find(c => c.id === sub.replacementClassId) : null;
                    const swappedSubj = sub.replacementSubjectId ? subjects.find(s => s.id === sub.replacementSubjectId) : null;

                    let lessonLine = `${l.period} урок (${cls?.name} ${subj?.name}${l.direction ? ` ${l.direction}` : ''}): `;
                    
                    if (sub.replacementTeacherId === 'cancelled') {
                        lessonLine += `*УРОК СНЯТ* (вместо ${origTeacherNameWithReason})`;
                    } else if (swappedClass && swappedSubj) {
                        lessonLine += `🔄 Обмен уроками: ${swappedClass.name} ${swappedSubj.name} (вместо ${cls?.name} ${subj?.name})`;
                        if (newRoomName !== oldRoomName) lessonLine += ` в каб. ${newRoomName}`;
                    } else if (sub.replacementTeacherId === sub.originalTeacherId) { 
                        lessonLine += `Учитель: ${origTeacherNameWithReason}. Смена кабинета: ${oldRoomName} → ${newRoomName}`;
                    } else { 
                        lessonLine += `*${replacementTeacher?.name}* ${sub.isMerger ? '(ОБЪЕДИНЕНИЕ) ' : ''}(вместо *${origTeacherNameWithReason}*)`;
                        if (oldRoomName !== newRoomName) {
                            lessonLine += `. Кабинет: ${oldRoomName} → ${newRoomName}`;
                        } else if (newRoomName !== '—') {
                            lessonLine += `. Кабинет: ${newRoomName}`;
                        }
                    }

                    fullMessage += `${lessonLine}\n`;

                    if (originalTeacher?.telegramChatId) teacherChatIdsToNotify.add(originalTeacher.telegramChatId);
                    if (replacementTeacher?.telegramChatId) teacherChatIdsToNotify.add(replacementTeacher.telegramChatId);
                });
                fullMessage += '\n';
            }
        }

        if (!hasActiveSubs) {
            fullMessage += "Замен нет.\n";
        }

        absentTeachers.forEach(t => {
            const hasAnyValidSubForAbsentTeacher = substitutions.some(s => 
                s.date === selectedDate && 
                s.originalTeacherId === t.id && 
                s.replacementTeacherId !== 'cancelled' && 
                s.replacementTeacherId !== 'conducted'
            );
            
            const dayAbsenceReason = t.absenceReasons?.[selectedDate];
            const displayReason = (dayAbsenceReason === 'Без записи') ? dayAbsenceReason : 'отсутствует';

            if (t.telegramChatId && !hasAnyValidSubForAbsentTeacher && t.unavailableDates.includes(selectedDate)) {
                teacherChatIdsToNotify.add(t.telegramChatId);
                if (hasActiveSubs) {
                    fullMessage += `_Напоминание: Учитель ${t.name} ${displayReason}, его уроки сегодня без активной замены или отменены/проведены._\n`;
                } else {
                    fullMessage += `_Напоминание: Учитель ${t.name} ${displayReason}, его уроки сегодня без активной замены._\n`;
                }
            }
        });


        if (teacherChatIdsToNotify.size === 0) {
            alert("Не найдено учителей с Telegram Chat ID для отправки уведомлений.");
            return;
        }

        const botApiUrl = `https://api.telegram.org/bot${settings.telegramToken}/sendMessage`;

        try {
            const sendPromises = Array.from(teacherChatIdsToNotify).map(chatId =>
                fetch(botApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: fullMessage,
                        parse_mode: 'Markdown',
                    }),
                })
            );

            await Promise.all(sendPromises);
            alert(`Уведомления успешно отправлены ${teacherChatIdsToNotify.size} учителям!`);
        } catch (error) {
            console.error("Ошибка при отправке в Telegram:", error);
            alert("Ошибка при отправке уведомлений в Telegram. Проверьте токен бота и подключение.");
        }
    }, [selectedDate, affectedLessons, substitutions, classes, subjects, teachers, rooms, absentTeachers, settings?.telegramToken]);
    
    // activeSubstitutionsForSlot теперь использует activeSchedule
    const activeSubstitutionsForSlot = useMemo(() => {
        if (!currentSubParams) return new Set<string>();
        
        return new Set(substitutions
            .filter(s => s.date === selectedDate && s.replacementTeacherId !== 'conducted' && s.replacementTeacherId !== 'cancelled')
            .map(s => {
                // Ищем оригинальный урок в activeSchedule
                const item = activeSchedule.find(i => i.id === s.scheduleItemId);
                if (item && item.period === currentSubParams.period && item.shift === currentSubParams.shift) {
                    return s.replacementTeacherId;
                }
                return null;
            })
            .filter((id): id is string => !!id)
        );
    }, [substitutions, activeSchedule, selectedDate, currentSubParams]);

    const candidates = useMemo(() => { 
        if (!currentSubParams || !selectedDayOfWeek) return [];
        const targetMonth = selectedDate.substring(0, 7);
        return teachers
            .filter(t => t.name.toLowerCase().includes(candidateSearch.toLowerCase()))
            .map(t => { 
            const isAbsent = t.unavailableDates.includes(selectedDate); 
            // Используем activeSchedule для проверки занятости
            const isBusyRegular = activeSchedule.some(s => s.teacherId === t.id && s.day === selectedDayOfWeek && s.period === currentSubParams.period && s.shift === currentSubParams.shift); 
            const isBusySub = activeSubstitutionsForSlot.has(t.id);
            const isBusy = isBusyRegular || isBusySub;

            const isSpecialist = t.subjectIds.includes(currentSubParams.subjectId); 
            const subsCount = substitutions.filter(s => s.replacementTeacherId === t.id && s.date.startsWith(targetMonth)).length;
            let score = 0; 
            if (isAbsent) score -= 1000; 
            if (isBusy) score -= 100; 
            if (isSpecialist) score += 50; 
            return { teacher: t, isAbsent, isBusy, isSpecialist, score, subsCount }; 
        }).sort((a, b) => b.score - a.score); 
    }, [teachers, currentSubParams, selectedDate, candidateSearch, selectedDayOfWeek, activeSchedule, substitutions, activeSubstitutionsForSlot]);
    
    const modalContext = useMemo(() => {
        if(!currentSubParams) return null;
        const s = activeSchedule.find(i => i.id === currentSubParams.scheduleItemId);
        if(!s) return null;
        const c = classes.find(cls => cls.id === s.classId);
        const sub = subjects.find(subj => subj.id === s.subjectId);
        const t = teachers.find(tch => tch.id === s.teacherId);
        
        const isTeacherAbsent = t?.unavailableDates?.includes(selectedDate) || false;

        return { 
            className: c?.name, 
            subjectName: sub?.name, 
            teacherName: t?.name, 
            teacherId: t?.id,
            period: s.period,
            roomId: s.roomId,
            isTeacherAbsent
        };
    }, [currentSubParams, activeSchedule, classes, subjects, teachers, selectedDate]);
    
    const otherLessonsForTeacher = useMemo(() => {
        if (!modalContext?.teacherId || !selectedDayOfWeek) return [];
        return activeSchedule.filter(s => 
            s.teacherId === modalContext.teacherId && 
            s.day === selectedDayOfWeek && 
            s.id !== currentSubParams?.scheduleItemId
        ).sort((a,b) => a.period - b.period);
    }, [activeSchedule, modalContext, selectedDayOfWeek, currentSubParams]);

    const manualSearchResults = useMemo(() => {
        if (!selectedDayOfWeek || manualLessonSearch.length < 2) return [];
        
        const searchLower = manualLessonSearch.toLowerCase();
        const foundTeachers = teachers.filter(t => t.name.toLowerCase().includes(searchLower));
        const foundClasses = classes.filter(c => c.name.toLowerCase().includes(searchLower));
        
        const results: any[] = [];

        foundTeachers.forEach(t => {
            const lessons = activeSchedule.filter(s => s.teacherId === t.id && s.day === selectedDayOfWeek);
            lessons.forEach(l => {
                const c = classes.find(cls => cls.id === l.classId);
                const subj = subjects.find(s => s.id === l.subjectId);
                results.push({ ...l, entityName: t.name, subInfo: c?.name, subjectName: subj?.name });
            });
        });

        foundClasses.forEach(c => {
            const lessons = activeSchedule.filter(s => s.classId === c.id && s.day === selectedDayOfWeek);
            lessons.forEach(l => {
                if (results.find(r => r.id === l.id)) return;
                const t = teachers.find(tch => tch.id === l.teacherId);
                const subj = subjects.find(s => s.id === l.subjectId);
                results.push({ ...l, entityName: c.name, subInfo: t?.name, subjectName: subj?.name });
            });
        });

        return results.sort((a, b) => a.period - b.period);
    }, [manualLessonSearch, selectedDayOfWeek, teachers, classes, activeSchedule, subjects]);

    const notifyTeacherFunction = useCallback(async (replacementTeacher: any, lessonInfo: any, classInfo: any, subjectInfo: any, roomInfo: any, dateStr: string) => {
        const dateObj = new Date(dateStr);
        const formattedDate = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        const shiftText = lessonInfo.shift === Shift.First ? '1 смена' : '2 смена';
        const message = `🔔 *Уведомление о замене*\n${replacementTeacher.name}\n\n📅 Дата: ${formattedDate}\n🕒 Смена: ${shiftText}\n🏫 Класс: ${classInfo?.name}\n1️⃣ Урок: ${lessonInfo.period}\n📚 Предмет: ${subjectInfo?.name}\n🚪 Кабинет: ${roomInfo || 'по расписанию'}`;
        
        if (settings?.telegramToken && replacementTeacher.telegramChatId) {
            try {
                const response = await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: replacementTeacher.telegramChatId, text: message, parse_mode: 'Markdown' })
                });
                const resData = await response.json();
                if (resData.ok) {
                    alert(`Сообщение отправлено в Telegram для ${replacementTeacher.name}!`);
                } else {
                    if (resData.description.includes("chat not found")) {
                        alert(`Ошибка Telegram: Чат не найден.\n\nПопросите учителя ${replacementTeacher.name} найти вашего бота и нажать кнопку "Запустить" (/start).`);
                    } else {
                        alert(`Ошибка Telegram: ${resData.description}`);
                    }
                }
            } catch (error) {
                alert('Ошибка отправки в Telegram (сеть/токен).');
                console.error(error);
            }
        } else {
            if (navigator.share) { navigator.share({ title: 'Замена', text: message }).catch(() => {}); } else { navigator.clipboard.writeText(message); alert(`Сообщение скопировано! (Telegram не настроен или нет Chat ID)`); }
        }
    }, [settings?.telegramToken]);

    const handleCandidateClick = (teacherId: string, isBusy: boolean) => {
        let isMerger = false;
        if (isBusy) {
            if (!window.confirm("Этот учитель занят в данное время. Вы хотите назначить ОБЪЕДИНЕНИЕ классов?")) {
                return;
            }
            isMerger = true;
        }
        assignSubstitution(teacherId, isMerger);
    };

    const toggleRefusal = (teacherId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (refusedTeacherIds.includes(teacherId)) {
            setRefusedTeacherIds(refusedTeacherIds.filter(id => id !== teacherId));
        } else {
            setRefusedTeacherIds([...refusedTeacherIds, teacherId]);
        }
    };


    return (
        <div className="h-full flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-80 flex flex-col gap-6">
                <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Дата замены</label>
                    <div className="relative"><Icon name="Calendar" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full pl-10 border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 bg-transparent dark:text-white"/></div>
                    <button onClick={() => setShowHistory(!showHistory)} className={`mt-3 w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 border transition-all ${showHistory ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white border-indigo-200 dark:border-slate-500'}`}><Icon name="History" size={16}/> {showHistory ? 'Скрыть историю' : 'История замен'}</button>
                </div>
                
                {showHistory ? (
                     <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex-1 overflow-hidden flex flex-col">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-2">История</h3>
                        <input placeholder="Поиск по дате/учителю..." value={historySearch} onChange={e=>setHistorySearch(e.target.value)} className="mb-4 w-full bg-slate-100 dark:bg-slate-700 border-none rounded-lg p-2 text-xs" />
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                            {substitutions.filter(s => s.date.includes(historySearch) || teachers.find(t=>t.id===s.replacementTeacherId)?.name.toLowerCase().includes(historySearch.toLowerCase())).map(s => {
                                 const r = teachers.find(t=>t.id===s.replacementTeacherId);
                                 const room = rooms.find(rm => rm.id === s.replacementRoomId);
                                 return (
                                    <div key={s.id} className="p-2 border border-slate-100 dark:border-slate-700 rounded-lg text-xs">
                                        <div className="font-bold">{s.date}</div>
                                        <div>
                                            {r?.name || (s.replacementTeacherId === 'cancelled' ? 'Снят' : 'Проведен')}
                                            {s.isMerger && <span className="text-purple-600 font-bold ml-1">(Объед.)</span>}
                                        </div>
                                        {room && <div className="text-indigo-500">Каб. {room.name}</div>}
                                    </div>
                                 );
                            })}
                        </div>
                     </div>
                ) : (
                    <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex-1 overflow-hidden flex flex-col">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2"><Icon name="UserX" size={18} className="text-red-500"/> Отсутствующие</h3>
                        
                        <div className="mb-3 space-y-2">
                            <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                <button onClick={() => setTeacherShiftFilter('all')} className={`flex-1 py-1 text-xs font-bold rounded-md ${teacherShiftFilter === 'all' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Все</button>
                                <button onClick={() => setTeacherShiftFilter(Shift.First)} className={`flex-1 py-1 text-xs font-bold rounded-md ${teacherShiftFilter === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>1 см</button>
                                <button onClick={() => setTeacherShiftFilter(Shift.Second)} className={`flex-1 py-1 text-xs font-bold rounded-md ${teacherShiftFilter === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>2 см</button>
                            </div>
                            <div className="relative">
                                <Icon name="Search" className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                                <input placeholder="Найти учителя..." value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl text-xs outline-none focus:ring-1 ring-indigo-500 dark:text-white"/>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                            {filteredTeachersList.map(t => {
                                const isAbsent = t.unavailableDates.includes(selectedDate); 
                                const reason = t.absenceReasons ? t.absenceReasons[selectedDate] : '';
                                return (
                                <div key={t.id} className={`flex flex-col p-3 rounded-xl border transition-all ${isAbsent ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-sm font-medium ${isAbsent ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>{t.name}</span>
                                        <button onClick={() => isAbsent ? removeAbsence(t.id) : openAbsenceModal(t.id)} className={`text-xs px-2 py-1 rounded-lg font-bold transition-colors ${isAbsent ? 'bg-white dark:bg-dark-800 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                                            {isAbsent ? 'Вернуть' : 'Нет'}
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div className="flex gap-1">{t.shifts.map(s => <span key={s} className="text-[9px] bg-white dark:bg-slate-600 px-1 rounded border border-slate-100 dark:border-slate-500 text-slate-400">{s === Shift.First ? '1' : '2'}</span>)}</div>
                                        {isAbsent && (
                                            <div className="flex items-center gap-1">
                                                {reason && <div className="text-[10px] text-red-500 dark:text-red-400 italic">{reason}</div>}
                                                <button onClick={() => openAbsenceModal(t.id)} className="w-6 h-6 flex items-center justify-center bg-white dark:bg-dark-800 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full shadow-sm border border-slate-200 dark:border-slate-600" title="Изменить причину">
                                                    <Icon name="Edit2" size={14}/>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>)
                            })}
                            {filteredTeachersList.length === 0 && <div className="text-center text-xs text-slate-400 py-4">Не найдено</div>}
                        </div>
                    </div>
                )}
            </div>
            <div className="flex-1 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Требуют замены ({affectedLessons.length})</h2>
                    <div className="flex gap-2">
                        <button onClick={generateICal} className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-xl text-sm font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"><Icon name="Calendar" size={16}/> iCal</button>
                        {affectedLessons.length > 0 && <button onClick={copyForMessenger} className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl text-sm font-bold hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"><Icon name="Copy" size={16}/> Копировать</button>}
                        <button onClick={sendToTelegram} className="px-4 py-2 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition shadow-lg shadow-blue-200 dark:shadow-none flex items-center gap-2">
                            <Icon name="Send" size={16} /> Telegram
                        </button>
                        <button onClick={() => { 
                            setManualLessonSearch(''); 
                            setManualSearchModalOpen(true); 
                        }} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors">
                            <Icon name="Search" size={16}/> Ручной выбор
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                    {affectedLessons.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-400"><Icon name="CheckCircle" size={48} className="mb-4 text-slate-200 dark:text-slate-700"/><p>Нет уроков, требующих замены на эту дату</p></div> : affectedLessons.map(l => {
                        const sub = substitutions.find(s => s.scheduleItemId === l.id && s.date === selectedDate);
                        const rep = sub && sub.replacementTeacherId !== 'cancelled' && sub.replacementTeacherId !== 'conducted' ? teachers.find(t => t.id === sub.replacementTeacherId) : null; 
                        const orig = teachers.find(t => t.id === l.teacherId);
                        const subj = subjects.find(s => s.id === l.subjectId); const cls = classes.find(c => c.id === l.classId);
                        const room = rooms.find(r => r.id === l.roomId);
                        const roomName = room ? room.name : l.roomId;
                        
                        const newRoomId = sub?.replacementRoomId;
                        const newRoomName = newRoomId ? (rooms.find(r => r.id === newRoomId)?.name || newRoomId) : null;
                        
                        // Check if content was swapped
                        const swappedClass = sub?.replacementClassId ? classes.find(c => c.id === sub.replacementClassId) : null;
                        const swappedSubj = sub?.replacementSubjectId ? subjects.find(s => s.id === sub.replacementSubjectId) : null;

                        let statusEl = null;
                        if (sub?.replacementTeacherId === 'conducted') {
                            statusEl = <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 pl-4 pr-2 py-2 rounded-xl"><div className="text-blue-700 dark:text-blue-400 font-bold text-sm">Урок проведен</div><button onClick={() => removeSubstitution(l.id)} className="p-2 bg-white dark:bg-dark-800 rounded-lg text-blue-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shadow-sm"><Icon name="X" size={16}/></button></div>;
                        } else if (sub?.replacementTeacherId === 'cancelled') {
                            statusEl = <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900 pl-4 pr-2 py-2 rounded-xl"><div className="text-red-700 dark:text-red-400 font-bold text-sm">УРОК СНЯТ</div><button onClick={() => removeSubstitution(l.id)} className="p-2 bg-white dark:bg-dark-800 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shadow-sm"><Icon name="X" size={16}/></button></div>;
                        } else if (rep || newRoomId) {
                            const isRoomChangeOnly = sub?.replacementTeacherId === sub?.originalTeacherId && newRoomId && !swappedClass;
                            const isSwap = swappedClass && swappedSubj;
                            
                            statusEl = <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900 pl-4 pr-2 py-2 rounded-xl">
                                <div>
                                    <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                                        {isRoomChangeOnly ? 'Замена кабинета' : isSwap ? 'Обмен уроками' : 'Замена назначена'}
                                    </div>
                                    <div className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
                                        {isRoomChangeOnly ? 'Учитель тот же' : isSwap ? `Урок ${swappedClass?.name}` : rep?.name}
                                    </div>
                                    {sub.isMerger && (
                                        <div className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mt-0.5">ОБЪЕДИНЕНИЕ</div>
                                    )}
                                    {sub.lessonAbsenceReason && ( 
                                        <div className="text-[10px] text-red-500 dark:text-red-400 italic mt-0.5">Причина: {sub.lessonAbsenceReason}</div>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => notifyTeacherFunction(rep || orig, l, cls, subj, newRoomName || roomName, selectedDate)} className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 shadow-sm transition-all" title="Отправить уведомление">
                                        <Icon name="Send" size={18}/>
                                    </button>
                                    <button onClick={() => removeSubstitution(l.id)} className="p-2 rounded-lg bg-white dark:bg-slate-800 text-red-500 border border-red-100 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-all" title="Отменить замену"><Icon name="UserX" size={18}/></button>
                                </div>
                            </div>;
                        } else {
                            statusEl = <button onClick={() => { setCurrentSubParams({ scheduleItemId: l.id, subjectId: l.subjectId, period: l.period, shift: l.shift, classId: l.classId, teacherId: l.teacherId, roomId: l.roomId, day: l.day }); setIsModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2 xl:w-auto w-full">Найти замену <Icon name="ArrowRight" size={16}/></button>;
                        }

                        const isTeacherPresent = !absentTeachers.find(t => t.id === l.teacherId);

                        return (<div key={l.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/30 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-600 flex flex-col items-center justify-center text-indigo-600 dark:text-indigo-400"><span className="text-[10px] font-bold uppercase text-slate-400 leading-none">Урок</span><span className="text-xl font-black leading-none mt-1 dark:text-slate-200">{l.period}</span></div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1"><span className="font-bold text-lg text-slate-800 dark:text-slate-100">{cls?.name}</span><div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2"><span className="text-xs font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1 rounded">{l.shift === Shift.First ? '1см' : '2см'}</span><span className="text-slate-400">|</span><span>{subj?.name}</span></div></div>
                                    <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                        <span className={isTeacherPresent ? 'font-semibold' : 'line-through decoration-red-400 decoration-2'}>{orig?.name}</span>
                                        {roomName && <span className="text-xs bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 flex items-center gap-1">{roomName} {newRoomName && <span className="text-indigo-600 font-bold">→ {newRoomName}</span>}</span>}
                                        {sub?.lessonAbsenceReason && ( // Always show lesson-specific reason
                                            <span className="text-xs bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900 text-red-500 dark:text-red-400 font-medium">({sub.lessonAbsenceReason})</span>
                                        )}
                                        {swappedClass && swappedSubj && (
                                            <span className="text-xs bg-purple-50 dark:bg-purple-900/20 px-1.5 py-0.5 rounded border border-purple-100 dark:border-purple-900 text-purple-600 dark:text-purple-400 font-bold">
                                                Меняется на: {swappedClass.name}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {statusEl}
                        </div>)
                    })}
                </div>
            </div>
            
            {/* SUBSTITUTION MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Выбор замены">
                {modalContext && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl mb-4 text-sm border border-slate-100 dark:border-slate-600">
                        <div className="font-bold text-slate-700 dark:text-slate-200 mb-1">{modalContext.className} • {modalContext.period} урок</div>
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                            <span>{modalContext.subjectName}</span>
                            <span className={modalContext.isTeacherAbsent ? 'line-through decoration-red-400' : 'font-semibold'}>{modalContext.teacherName}</span>
                        </div>
                    </div>
                )}
                
                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Замена кабинета (Опционально)</label>
                    <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm outline-none focus:border-indigo-500 dark:bg-slate-700 dark:text-white">
                        <option value="">Без изменения кабинета</option>
                        {rooms.map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.capacity} мест)</option>
                        ))}
                    </select>
                </div>

                {/* NEW: Lesson-specific absence reason */}
                {modalContext && !modalContext.isTeacherAbsent && (
                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Причина отсутствия на уроке (Опционально)</label>
                        <select
                            value={lessonAbsenceReason}
                            onChange={e => setLessonAbsenceReason(e.target.value)}
                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm outline-none focus:border-indigo-500 dark:bg-slate-700 dark:text-white"
                        >
                            <option value="">Без причины</option>
                            <option>Болезнь</option>
                            <option>Курсы</option>
                            <option>Отгул</option>
                            <option>Семейные обстоятельства</option>
                            <option>Командировка</option>
                            <option>Без записи</option>
                        </select>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <button onClick={() => assignSubstitution('conducted')} className="p-3 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100 transition">Урок проведён</button>
                    <button onClick={() => assignSubstitution('cancelled')} className="p-3 rounded-xl bg-red-50 text-red-700 font-bold text-sm hover:bg-red-100 transition">Снять урок</button>
                </div>
                
                {modalContext?.teacherId && !modalContext.isTeacherAbsent && (
                    <>
                        <button onClick={() => assignSubstitution(modalContext.teacherId)} className="w-full p-3 mb-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition border border-emerald-200">
                            Оставить текущего учителя (Только замена кабинета)
                        </button>
                        
                        {otherLessonsForTeacher.length > 0 && (
                            <div className="mb-4">
                                <button 
                                    onClick={() => setShowSwapOptions(!showSwapOptions)} 
                                    className="w-full p-3 rounded-xl bg-purple-50 text-purple-700 font-bold text-sm hover:bg-purple-100 transition border border-purple-200 flex items-center justify-center gap-2"
                                >
                                    <Icon name="RotateCw" size={16}/> Поменять местами с другим уроком
                                </button>
                                
                                {showSwapOptions && (
                                    <div className="mt-2 space-y-2 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <div className="mb-3">
                                            <label className="flex items-center gap-2 cursor-pointer p-2 bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                                                <input 
                                                    type="checkbox" 
                                                    checked={swapKeepRooms} 
                                                    onChange={(e) => setSwapKeepRooms(e.target.checked)} 
                                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                                />
                                                <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Оставить учителей в своих кабинетах</span>
                                            </label>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 pl-1">
                                                Если включено: Учителя меняются классами, но не меняют кабинеты.<br/>
                                                Если выключено: Учителя переходят в кабинет урока, который они заменяют.
                                            </p>
                                        </div>

                                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-1 font-bold">Выберите урок для обмена:</p>
                                        {otherLessonsForTeacher.map(lesson => {
                                             const c = classes.find(cl => cl.id === lesson.classId);
                                             const s = subjects.find(sub => sub.id === lesson.subjectId);
                                             return (
                                                 <button 
                                                    key={lesson.id} 
                                                    onClick={() => swapLessons(lesson.id)}
                                                    className="w-full p-2 text-left bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-purple-500 transition-colors text-sm"
                                                 >
                                                    <span className="font-bold">{lesson.period} урок</span>: {c?.name} - {s?.name}
                                                 </button>
                                             )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                <div className="relative mb-4">
                    <Icon name="Search" className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                    <input autoFocus placeholder="Найти другого учителя..." value={candidateSearch} onChange={e => setCandidateSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:border-indigo-500 dark:text-white"/>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {candidates.map(({ teacher, isAbsent, isBusy, isSpecialist, subsCount }) => {
                        const isRefused = refusedTeacherIds.includes(teacher.id);
                        return (
                        <div 
                            key={teacher.id} 
                            className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all text-left ${isAbsent ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900 opacity-60' : isRefused ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-600 opacity-70' : isBusy ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-900 hover:shadow-md' : 'bg-white dark:bg-dark-800 border-slate-100 dark:border-slate-700 hover:border-indigo-500 hover:shadow-md'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isSpecialist ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}>{isSpecialist ? <Icon name="Star" size={14} fill="currentColor"/> : teacher.name[0]}</div>
                                <div>
                                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200">{teacher.name}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-2">
                                        {isSpecialist && <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 rounded">Профиль</span>}
                                        {isBusy && <span className="text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 rounded font-bold">Занят</span>}
                                        {isAbsent && <span className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 rounded">Отсутствует</span>}
                                        {isRefused && <span className="text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-1.5 rounded font-bold">Отказался</span>}
                                        <span className={`px-1.5 rounded font-medium ${subsCount > 5 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'}`}>
                                            В этом мес: {subsCount}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            {!isAbsent && (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={(e) => toggleRefusal(teacher.id, e)}
                                        className={`px-3 py-1 text-xs font-bold rounded border ${isRefused ? 'bg-slate-300 text-slate-600 border-slate-300' : 'bg-white dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                                        title="Отметить отказ"
                                    >
                                        {isRefused ? 'Вернуть' : 'Отказ'}
                                    </button>
                                    
                                    {!isRefused && !isBusy && <button onClick={() => handleCandidateClick(teacher.id, isBusy)} className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-xs font-bold">Выбрать</button>}
                                    {!isRefused && isBusy && <button onClick={() => handleCandidateClick(teacher.id, isBusy)} className="px-3 py-1 bg-orange-100 dark:bg-orange-800/30 text-orange-700 dark:text-orange-300 rounded text-xs font-bold">Объединить?</button>}
                                </div>
                            )}
                        </div>
                    )})}
                    {candidates.length === 0 && <div className="text-center text-slate-400 text-xs py-4">Нет подходящих учителей</div>}
                </div>
            </Modal>

            {/* MANUAL SEARCH MODAL */}
            <Modal isOpen={manualSearchModalOpen} onClose={() => setManualSearchModalOpen(false)} title="Ручной поиск урока">
                <div className="mb-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Введите имя учителя или название класса, чтобы найти урок и поставить замену (кабинета или учителя).</p>
                    <div className="relative">
                        <Icon name="Search" className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                        <input autoFocus placeholder="Например: 6А или Иванова..." value={manualLessonSearch} onChange={e => setManualLessonSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:border-indigo-500 dark:text-white"/>
                    </div>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {manualSearchResults.map((item: any) => (
                        <button key={item.id} onClick={() => { setManualSearchModalOpen(false); setCurrentSubParams({ scheduleItemId: item.id, subjectId: item.subjectId, period: item.period, shift: item.shift, classId: item.classId, teacherId: item.teacherId, roomId: item.roomId, day: item.day }); setIsModalOpen(true); }} className="w-full p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-left group">
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-slate-800 dark:text-slate-200">{item.entityName} <span className="font-normal text-slate-500">({item.subInfo})</span></span>
                                <span className="text-xs font-bold bg-slate-100 dark:bg-slate-600 px-2 py-0.5 rounded">{item.period} урок</span>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-2">
                                <span>{item.subjectName}</span>
                                {item.roomId && <span className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-1 rounded">Каб. {rooms.find(r=>r.id===item.roomId)?.name || item.roomId}</span>}
                            </div>
                        </button>
                    ))}
                    {manualLessonSearch.length > 1 && manualSearchResults.length === 0 && <div className="text-center text-slate-400 text-xs py-4">Уроки не найдены на выбранную дату ({selectedDate})</div>}
                </div>
            </Modal>

            <Modal isOpen={absenceModalOpen} onClose={() => setAbsenceModalOpen(false)} title="Причина отсутствия"><div className="space-y-4"><select value={absenceReason} onChange={e => setAbsenceReason(e.target.value)} className="w-full border p-3 rounded-xl outline-none font-bold text-slate-700 dark:text-white dark:bg-slate-700 dark:border-slate-600"><option>Болезнь</option><option>Курсы</option><option>Отгул</option><option>Семейные обстоятельства</option><option>Командировка</option><option>Без записи</option><option>Другое</option></select><div className="flex justify-end"><button onClick={confirmAbsence} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold">Подтвердить</button></div></div></Modal>
        </div>
    );
};
