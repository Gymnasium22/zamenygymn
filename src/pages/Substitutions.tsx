
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useStaticData, useScheduleData } from '../context/DataContext'; 
import { Icon } from '../components/Icons';
import { Modal, SearchableSelect, useToast } from '../components/UI';
import { DAYS, Shift, Teacher, ScheduleItem, ClassEntity, Subject, Room, Substitution } from '../types';
import { formatDateISO, getScheduleForDate, generateId } from '../utils/helpers';
import useMedia from 'use-media';

export const SubstitutionsPage = () => {
    const { subjects, teachers, classes, rooms, settings, saveStaticData } = useStaticData(); 
    const { schedule1, schedule2, substitutions, saveScheduleData } = useScheduleData();
    const { addToast } = useToast();

    const location = useLocation();
    const [selectedDate, setSelectedDate] = useState(formatDateISO());
    const dateInputRef = useRef<HTMLInputElement>(null);
    
    // UI State
    const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');
    const [subMode, setSubMode] = useState<'teacher' | 'cancel' | 'advanced'>('teacher');
    const [isSendingSummary, setIsSendingSummary] = useState(false);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSubParams, setCurrentSubParams] = useState<any>(null);
    const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
    const [manualSearchModalOpen, setManualSearchModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    
    // Telegram Choice State
    const [telegramChoiceOpen, setTelegramChoiceOpen] = useState(false);
    const [telegramTarget, setTelegramTarget] = useState<{
        teacherId: string;
        lessonId: string;
        roomName: string;
        className: string;
        subjectName: string;
        period: number;
        roomChanged: boolean;
    } | null>(null);

    const [selectedTeacherId, setSelectedTeacherId] = useState<string|null>(null);
    const [absenceReason, setAbsenceReason] = useState('Болезнь');
    
    // Search & Filters
    const [historySearch, setHistorySearch] = useState('');
    const [historyFilterTeacher, setHistoryFilterTeacher] = useState('');
    const [teacherSearch, setTeacherSearch] = useState('');
    const [teacherShiftFilter, setTeacherShiftFilter] = useState('all');
    const [candidateSearch, setCandidateSearch] = useState('');
    const [manualLessonSearch, setManualLessonSearch] = useState('');

    const [selectedRoomId, setSelectedRoomId] = useState<string>('');
    const [lessonAbsenceReason, setLessonAbsenceReason] = useState<string>('');
    const [activeReplacementId, setActiveReplacementId] = useState<string | null>(null);
    
    const [refusedTeacherIds, setRefusedTeacherIds] = useState<string[]>([]);
    const [showSwapOptions, setShowSwapOptions] = useState(false);
    const [showMergeOptions, setShowMergeOptions] = useState(false);
    const [swapKeepRooms, setSwapKeepRooms] = useState(false);

    // Drag & Drop State
    const [draggedTeacherId, setDraggedTeacherId] = useState<string | null>(null);
    const [dragOverLessonId, setDragOverLessonId] = useState<string | null>(null);

    // Mobile state
    const isMobile = useMedia({ maxWidth: 767 });
    const [mobileTab, setMobileTab] = useState<'lessons' | 'teachers'>('lessons');

    const activeSchedule = useMemo(() => {
        const data = { schedule: schedule1, schedule2, settings };
        const schedule = getScheduleForDate(new Date(selectedDate), data as any);
        return schedule;
    }, [selectedDate, schedule1, schedule2, settings]);

    useEffect(() => {
        if(location.state?.subParams) {
            setCurrentSubParams(location.state.subParams);
            setSelectedRoomId(''); 
            setLessonAbsenceReason(''); 
            setRefusedTeacherIds([]);
            setActiveReplacementId(null);
            setShowSwapOptions(false);
            setShowMergeOptions(false);
            setSwapKeepRooms(false);
            setSubMode('teacher');
            setIsModalOpen(true);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    useEffect(() => {
        if (isModalOpen && currentSubParams) {
            // Check if we are NOT editing an existing valid teacher substitution to avoid overwriting logic
            // If we are editing, we usually set these params in handleEditSubstitution
            if (currentSubParams.isEditing) return;

            const existingSub = substitutions.find(s => s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate);
            if (existingSub) {
                setRefusedTeacherIds(existingSub.refusals || []);
                // Determine mode based on existing substitution
                if (existingSub.replacementTeacherId === 'cancelled') setSubMode('cancel');
                else if (existingSub.isMerger || existingSub.replacementClassId) setSubMode('advanced');
                else setSubMode('teacher');
                
                // Set active replacement ID if editing via drag/drop on existing sub (rare case)
                if (existingSub.replacementTeacherId && !['conducted', 'cancelled'].includes(existingSub.replacementTeacherId)) {
                     setActiveReplacementId(existingSub.replacementTeacherId);
                }
            } else {
                setRefusedTeacherIds([]);
                setSubMode('teacher');
                setActiveReplacementId(null);
            }
            setShowSwapOptions(false);
            setShowMergeOptions(false);
            setSwapKeepRooms(false);
        }
    }, [isModalOpen, currentSubParams, substitutions, selectedDate]);


    const selectedDayOfWeek = useMemo(() => { 
        const idx = new Date(selectedDate).getDay(); 
        if (idx === 0 || idx === 6) return null;
        return DAYS[idx - 1]; 
    }, [selectedDate]);

    // --- Date Navigation Helpers ---
    const changeDate = (days: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        setSelectedDate(formatDateISO(d));
    };

    const setToday = () => {
        setSelectedDate(formatDateISO(new Date()));
    };

    const openCalendar = () => {
        if (dateInputRef.current) {
            dateInputRef.current.showPicker();
        }
    };

    const filteredTeachersList = useMemo(() => {
        return teachers.filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(teacherSearch.toLowerCase());
            const matchesShift = teacherShiftFilter === 'all' ? true : (t.shifts && t.shifts.includes(teacherShiftFilter));
            return matchesSearch && matchesShift;
        });
    }, [teachers, teacherSearch, teacherShiftFilter]);

    const absentTeachers = useMemo(() => teachers.filter(t => t.unavailableDates.includes(selectedDate)), [teachers, selectedDate]);
    
    const affectedLessons = useMemo(() => { 
        if (!selectedDayOfWeek) return []; 
        
        const absentIds = absentTeachers.map(t => t.id); 
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

    // Split lessons into Pending and Resolved
    const { pendingLessons, resolvedLessons } = useMemo(() => {
        const pending: ScheduleItem[] = [];
        const resolved: ScheduleItem[] = [];

        affectedLessons.forEach(lesson => {
            const subs = substitutions.filter(s => s.scheduleItemId === lesson.id && s.date === selectedDate);
            // Treat any substitution record as resolved
            if (subs.length > 0) {
                resolved.push(lesson);
            } else {
                pending.push(lesson);
            }
        });

        return { pendingLessons: pending, resolvedLessons: resolved };
    }, [affectedLessons, substitutions, selectedDate]);

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
            alert("Ошибка: Невозможно назначить замену. Параметры урока не определены.");
            return;
        }

        const item = activeSchedule.find(s => s.id === currentSubParams.scheduleItemId);
        if (!item) {
            alert("Ошибка: Урок не найден в расписании.");
            return;
        }
        
        const filteredSubs = substitutions.filter(s => !(s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate));
        
        const subData = { 
            id: generateId(), 
            date: selectedDate, 
            scheduleItemId: currentSubParams.scheduleItemId, 
            originalTeacherId: item.teacherId, 
            replacementTeacherId: replacementId,
            replacementRoomId: selectedRoomId || undefined, 
            isMerger: isMerger,
            lessonAbsenceReason: (replacementId !== 'conducted' && replacementId !== 'cancelled' && lessonAbsenceReason) ? lessonAbsenceReason : undefined,
            refusals: refusedTeacherIds
        }; 
        
        filteredSubs.push(subData);
        try {
            await saveScheduleData({ substitutions: filteredSubs });
            setIsModalOpen(false); 
            setCandidateSearch('');
            setSelectedRoomId('');
            setLessonAbsenceReason(''); 
            setRefusedTeacherIds([]);
            setActiveReplacementId(null);
            setCurrentSubParams(null);
        } catch (error) {
            console.error('Failed to save substitution:', error);
            alert('Ошибка при сохранении замены. Попробуйте еще раз.');
        }
    }, [currentSubParams, selectedDate, selectedRoomId, activeSchedule, substitutions, teachers, lessonAbsenceReason, refusedTeacherIds, saveScheduleData]);

    const handleBatchClassMerge = useCallback(async (targetClassId: string) => {
        if (!currentSubParams || !selectedDayOfWeek || !currentSubParams.period || !currentSubParams.shift || !currentSubParams.teacherId) {
            alert("Ошибка: Неполные параметры урока.");
            return;
        }

        const targetLessons = activeSchedule.filter(s => 
            s.classId === targetClassId &&
            s.day === selectedDayOfWeek &&
            s.period === currentSubParams.period &&
            s.shift === currentSubParams.shift
        );

        if (targetLessons.length === 0) {
            alert("Уроки для объединения не найдены.");
            return;
        }

        const newSubs = substitutions.filter(s => !(s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate));

        targetLessons.forEach(lesson => {
            const subData = {
                id: generateId(),
                date: selectedDate,
                scheduleItemId: currentSubParams.scheduleItemId, 
                originalTeacherId: currentSubParams.teacherId, 
                replacementTeacherId: lesson.teacherId, 
                replacementClassId: lesson.classId, 
                replacementSubjectId: lesson.subjectId, 
                isMerger: true,
                replacementRoomId: lesson.roomId, 
                lessonAbsenceReason: lessonAbsenceReason || undefined
            };
            newSubs.push(subData);
        });

        await saveScheduleData({ substitutions: newSubs });
        
        setIsModalOpen(false);
        setCandidateSearch('');
        setSelectedRoomId('');
        setLessonAbsenceReason('');
        setCurrentSubParams(null);
        setShowMergeOptions(false);

    }, [currentSubParams, selectedDate, selectedDayOfWeek, activeSchedule, substitutions, lessonAbsenceReason, saveScheduleData]);

    const swapLessons = useCallback(async (targetLessonId: string) => {
        if (!currentSubParams) return;

        const sourceLesson = activeSchedule.find(s => s.id === currentSubParams.scheduleItemId);
        const targetLesson = activeSchedule.find(s => s.id === targetLessonId);

        if (!sourceLesson || !targetLesson) {
             alert("Ошибка: Не найден урок для обмена.");
             return;
        }

        const newSubs = [...substitutions];

        let effectiveRoomForSource: string | undefined;
        let effectiveRoomForTarget: string | undefined;

        if (selectedRoomId) {
            effectiveRoomForSource = selectedRoomId;
            effectiveRoomForTarget = swapKeepRooms ? targetLesson.roomId : sourceLesson.roomId;
        } else {
            if (swapKeepRooms) {
                effectiveRoomForSource = sourceLesson.roomId;
                effectiveRoomForTarget = targetLesson.roomId;
            } else {
                effectiveRoomForSource = targetLesson.roomId;
                effectiveRoomForTarget = sourceLesson.roomId;
            }
        }

        const sourceSubIndex = newSubs.findIndex(s => s.scheduleItemId === sourceLesson.id && s.date === selectedDate);
        const sourceSubData = {
            id: sourceSubIndex >= 0 ? newSubs[sourceSubIndex].id : generateId(),
            date: selectedDate,
            scheduleItemId: sourceLesson.id,
            originalTeacherId: sourceLesson.teacherId,
            replacementTeacherId: sourceLesson.teacherId, 
            replacementClassId: targetLesson.classId,
            replacementSubjectId: targetLesson.subjectId,
            replacementRoomId: effectiveRoomForSource !== sourceLesson.roomId ? effectiveRoomForSource : undefined, 
        };
        if (sourceSubIndex >= 0) newSubs[sourceSubIndex] = sourceSubData; else newSubs.push(sourceSubData);

        const targetSubIndex = newSubs.findIndex(s => s.scheduleItemId === targetLesson.id && s.date === selectedDate);
        const targetSubData = {
            id: targetSubIndex >= 0 ? newSubs[targetSubIndex].id : generateId(),
            date: selectedDate,
            scheduleItemId: targetLesson.id,
            originalTeacherId: targetLesson.teacherId,
            replacementTeacherId: targetLesson.teacherId,
            replacementClassId: sourceLesson.classId,
            replacementSubjectId: sourceLesson.subjectId,
            replacementRoomId: effectiveRoomForTarget !== targetLesson.roomId ? effectiveRoomForTarget : undefined,
        };
        if (targetSubIndex >= 0) newSubs[targetSubIndex] = targetSubData; else newSubs.push(targetSubData);

        await saveScheduleData({ substitutions: newSubs });
        
        setIsModalOpen(false); 
        setCurrentSubParams(null);
        setSelectedRoomId(''); 
        setShowSwapOptions(false);
        setSwapKeepRooms(false);

    }, [currentSubParams, activeSchedule, substitutions, selectedDate, saveScheduleData, selectedRoomId, swapKeepRooms]);
    
    const removeSubstitution = useCallback(async (id: string) => { 
        const newSubs = substitutions.filter(s => !(s.scheduleItemId === id && s.date === selectedDate)); 
        await saveScheduleData({ substitutions: newSubs }); 
    }, [substitutions, selectedDate, saveScheduleData]);

    const handleEditSubstitution = (lesson: ScheduleItem, sub: Substitution) => {
        // Pre-fill parameters for the modal
        setCurrentSubParams({
             scheduleItemId: lesson.id,
             subjectId: lesson.subjectId,
             period: lesson.period,
             shift: lesson.shift,
             classId: lesson.classId,
             teacherId: lesson.teacherId,
             roomId: lesson.roomId,
             day: lesson.day,
             isEditing: true // flag to prevent auto-reset in useEffect
        });
        
        if (sub.replacementRoomId) setSelectedRoomId(sub.replacementRoomId);
        else setSelectedRoomId('');
        
        if (sub.lessonAbsenceReason) setLessonAbsenceReason(sub.lessonAbsenceReason);
        else setLessonAbsenceReason('');

        if (sub.refusals) setRefusedTeacherIds(sub.refusals);
        else setRefusedTeacherIds([]);

        // Determine correct sub mode based on existing data
        if (sub.replacementTeacherId === 'cancelled') setSubMode('cancel');
        else if (sub.isMerger || sub.replacementClassId) setSubMode('advanced');
        else {
             setSubMode('teacher');
             setActiveReplacementId(sub.replacementTeacherId);
        }

        setIsModalOpen(true);
    };
    
    // --- TEXT GENERATION FOR TELEGRAM/COPY ---
    const generateSubstitutionContent = () => {
        const subs = substitutions.filter(s => s.date === selectedDate && s.replacementTeacherId !== 'conducted' && s.replacementTeacherId !== 'cancelled');
        if (subs.length === 0) return "На эту дату замен нет.";

        // Sort by period
        subs.sort((a, b) => {
            const itemA = activeSchedule.find(i => i.id === a.scheduleItemId);
            const itemB = activeSchedule.find(i => i.id === b.scheduleItemId);
            return (itemA?.period || 0) - (itemB?.period || 0);
        });

        let text = "";
        const processedIds = new Set();

        subs.forEach(sub => {
            if (processedIds.has(sub.scheduleItemId)) return;
            processedIds.add(sub.scheduleItemId);

            const item = activeSchedule.find(i => i.id === sub.scheduleItemId);
            if (!item) return;

            const cls = classes.find(c => c.id === item.classId);
            const subj = subjects.find(s => s.id === item.subjectId);
            const origT = teachers.find(t => t.id === sub.originalTeacherId);
            const repT = teachers.find(t => t.id === sub.replacementTeacherId);
            const roomObj = rooms.find(r => r.id === (sub.replacementRoomId || item.roomId));
            const roomName = roomObj ? roomObj.name : (sub.replacementRoomId || item.roomId || "—");

            text += `🔹 **${item.period} урок** | ${cls?.name} | ${subj?.name}\n`;
            text += `❌ ${origT?.name}\n`;
            
            if (sub.isMerger) {
                text += `✅ ОБЪЕДИНЕНИЕ: ${repT?.name}\n`;
            } else if (sub.replacementClassId) {
                const swapCls = classes.find(c => c.id === sub.replacementClassId);
                text += `✅ ОБМЕН УРОКАМИ: ${swapCls?.name}\n`;
            } else {
                text += `✅ ${repT?.name}\n`;
            }
            text += `🚪 Каб. ${roomName}\n\n`;
        });
        
        return text;
    };

    const generateSubstitutionText = () => {
        const content = generateSubstitutionContent();
        const dateStr = new Date(selectedDate).toLocaleDateString('ru-RU');
        
        // Use template if available
        let template = settings.telegramTemplates?.summary;
        if (!template) {
            template = "⚡️ **ЗАМЕНЫ НА {{date}}** ⚡️\n\n{{content}}";
        }
        
        return template.replace('{{date}}', dateStr).replace('{{content}}', content);
    };

    const copyToClipboard = () => {
        const text = generateSubstitutionText();
        navigator.clipboard.writeText(text);
        addToast({ type: 'success', title: 'Скопировано', message: 'Сводка замен скопирована в буфер' });
    };

    const sendSummaryToTelegram = async () => {
        if (!settings.telegramToken || !settings.feedbackChatId) {
             addToast({ type: 'warning', title: 'Ошибка', message: 'Telegram не настроен' });
             return;
        }
        
        const text = generateSubstitutionText();
        setIsSendingSummary(true);
        try {
            await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: settings.feedbackChatId,
                    text: text,
                    parse_mode: 'Markdown'
                })
            });
            addToast({ type: 'success', title: 'Отправлено', message: 'Сводка отправлена в Telegram' });
        } catch (e) {
            console.error(e);
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось отправить сообщение' });
        } finally {
            setIsSendingSummary(false);
        }
    };

    const handleTelegramClick = (teacherId: string, lessonId: string, roomName: string, className: string, subjectName: string, period: number, roomChanged: boolean) => {
        setTelegramTarget({ teacherId, lessonId, roomName, className, subjectName, period, roomChanged });
        setTelegramChoiceOpen(true);
    };

    const confirmSendTelegram = async (mode: 'single' | 'all') => {
        if (!telegramTarget) return;
        const { teacherId, lessonId, roomName, className, subjectName, period, roomChanged } = telegramTarget;
        
        const teacher = teachers.find(t => t.id === teacherId);
        if (!teacher?.telegramChatId || !settings.telegramToken) {
            alert('У учителя не настроен Telegram ID или нет токена бота.');
            setTelegramChoiceOpen(false);
            return;
        }

        const dateStr = new Date(selectedDate).toLocaleDateString('ru-RU');
        let message = "";

        if (mode === 'single') {
            const content = `🔹 *${period} урок* | ${className}\n📖 ${subjectName}\n🚪 Каб. ${roomName}`;
            
            let template = settings.telegramTemplates?.teacherNotification;
            if (!template) {
                 template = "🔔 **Вам назначена замена!**\n📅 {{date}}\n\n{{content}}\n\nПожалуйста, ознакомьтесь с деталями.";
            }
            message = template.replace('{{date}}', dateStr).replace('{{content}}', content);

        } else {
             // Gather ALL substitutions for this teacher on this day
            const allTeacherSubs = substitutions.filter(s => 
                s.date === selectedDate && 
                s.replacementTeacherId === teacherId
            );
            
            // Sort by period
            allTeacherSubs.sort((a, b) => {
                const itemA = activeSchedule.find(i => i.id === a.scheduleItemId);
                const itemB = activeSchedule.find(i => i.id === b.scheduleItemId);
                return (itemA?.period || 0) - (itemB?.period || 0);
            });

            if (allTeacherSubs.length === 0) {
                 alert('У этого учителя нет замен на выбранную дату.');
                 setTelegramChoiceOpen(false);
                 return;
            }

            let messageBody = '';
            allTeacherSubs.forEach(sub => {
                const item = activeSchedule.find(s => s.id === sub.scheduleItemId);
                if (!item) return;

                const cls = classes.find(c => c.id === item.classId)?.name || '?';
                const subj = subjects.find(s => s.id === item.subjectId)?.name || '?';
                
                const originalRoomId = item.roomId;
                const replacementRoomId = sub.replacementRoomId;
                const finalRoomId = replacementRoomId || originalRoomId;
                const finalRoomName = rooms.find(r => r.id === finalRoomId)?.name || finalRoomId || '—';
                
                const roomChangeIndicator = replacementRoomId && replacementRoomId !== originalRoomId ? ' (Смена каб.)' : '';
                
                messageBody += `🔹 *${item.period} урок* | ${cls}\n📖 ${subj}\n🚪 Каб. ${finalRoomName}${roomChangeIndicator}\n\n`;
            });

            let template = settings.telegramTemplates?.teacherSummary;
            if (!template) {
                 template = "🔔 **Ваши замены на {{date}}**\n\n{{content}}Пожалуйста, ознакомьтесь с деталями.";
            }
            message = template.replace('{{date}}', dateStr).replace('{{content}}', messageBody);
        }
        
        try {
            await fetch(`https://api.telegram.org/bot${settings.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: teacher.telegramChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
            addToast({ type: 'success', title: 'Отправлено', message: `Уведомление отправлено ${teacher.name}` });
        } catch (e) {
            console.error(e);
            alert('Ошибка отправки в Telegram');
        } finally {
            setTelegramChoiceOpen(false);
            setTelegramTarget(null);
        }
    };


    const activeSubstitutionsForSlot = useMemo(() => {
        if (!currentSubParams) return new Set<string>();
        return new Set(substitutions
            .filter(s => s.date === selectedDate && s.replacementTeacherId !== 'conducted' && s.replacementTeacherId !== 'cancelled')
            .map(s => {
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
        if (!currentSubParams || !selectedDayOfWeek) return { recommended: [], others: [] };
        const targetMonth = selectedDate.substring(0, 7);
        
        const allCandidates = teachers
            .filter(t => t.name.toLowerCase().includes(candidateSearch.toLowerCase()))
            .map(t => { 
            const isAbsent = t.unavailableDates.includes(selectedDate); 
            const isBusyRegular = activeSchedule.some(s => s.teacherId === t.id && s.day === selectedDayOfWeek && s.period === currentSubParams.period && s.shift === currentSubParams.shift); 
            const isBusySub = activeSubstitutionsForSlot.has(t.id);
            const isBusy = isBusyRegular || isBusySub;

            const isSpecialist = t.subjectIds.includes(currentSubParams.subjectId); 
            const subsCount = substitutions.filter(s => s.replacementTeacherId === t.id && s.date.startsWith(targetMonth)).length;
            
            // Smart Scoring
            let score = 0; 
            if (isAbsent) score -= 1000; 
            if (isBusy) score -= 200; 
            if (isSpecialist) score += 50;
            if (!isBusy && !isAbsent) score += 100; // Free window
            score -= subsCount; // Prefer those with less subs

            return { teacher: t, isAbsent, isBusy, isSpecialist, score, subsCount }; 
        }).sort((a, b) => b.score - a.score); 

        // Split into top 3 recommended (must be free) and others
        const recommended = allCandidates.filter(c => !c.isBusy && !c.isAbsent).slice(0, 3);
        const others = allCandidates.filter(c => !recommended.includes(c));

        return { recommended, others };
    }, [teachers, currentSubParams, selectedDate, candidateSearch, selectedDayOfWeek, activeSchedule, substitutions, activeSubstitutionsForSlot]);
    
    const mergeCandidates = useMemo(() => {
        if (!currentSubParams || !selectedDayOfWeek) return [];
        const possibleLessons = activeSchedule.filter(s => 
            s.day === selectedDayOfWeek && 
            s.period === currentSubParams.period && 
            s.shift === currentSubParams.shift && 
            s.classId !== currentSubParams.classId
        );
        const classMap = new Map<string, { classEntity: ClassEntity, teachers: string[], subjects: string[] }>();
        possibleLessons.forEach(l => {
            const cls = classes.find(c => c.id === l.classId);
            const tch = teachers.find(t => t.id === l.teacherId);
            const subj = subjects.find(s => s.id === l.subjectId);
            if (cls && tch) {
                if (!classMap.has(cls.id)) classMap.set(cls.id, { classEntity: cls, teachers: [], subjects: [] });
                const entry = classMap.get(cls.id)!;
                if (!entry.teachers.includes(tch.name)) entry.teachers.push(tch.name);
                if (subj && !entry.subjects.includes(subj.name)) entry.subjects.push(subj.name);
            }
        });
        return Array.from(classMap.values());
    }, [activeSchedule, currentSubParams, selectedDayOfWeek, classes, teachers, subjects]);

    const modalContext = useMemo(() => {
        if(!currentSubParams) return null;
        const s = activeSchedule.find(i => i.id === currentSubParams.scheduleItemId);
        if(!s) return null;
        const c = classes.find(cls => cls.id === s.classId);
        const sub = subjects.find(subj => subj.id === s.subjectId);
        const t = teachers.find(tch => tch.id === s.teacherId);
        const isTeacherAbsent = t?.unavailableDates?.includes(selectedDate) || false;
        return { className: c?.name, subjectName: sub?.name, teacherName: t?.name, teacherId: t?.id, period: s.period, roomId: s.roomId, isTeacherAbsent };
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
        interface ManualSearchResult extends ScheduleItem { entityName: string; subInfo?: string; subjectName?: string; }
        const results: ManualSearchResult[] = [];
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

    // Drag & Drop Handlers
    const handleDragStart = (e: React.DragEvent, teacherId: string) => {
        setDraggedTeacherId(teacherId);
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("text/plain", teacherId); // Fallback
    };

    const handleDragOver = (e: React.DragEvent, lessonId: string) => {
        e.preventDefault();
        setDragOverLessonId(lessonId);
    };

    const handleDragLeave = () => {
        setDragOverLessonId(null);
    };

    const handleDrop = (e: React.DragEvent, lesson: ScheduleItem) => {
        e.preventDefault();
        if (!draggedTeacherId) return;
        
        setCurrentSubParams({ 
            scheduleItemId: lesson.id, 
            subjectId: lesson.subjectId, 
            period: lesson.period, 
            shift: lesson.shift, 
            classId: lesson.classId, 
            teacherId: lesson.teacherId, 
            roomId: lesson.roomId, 
            day: lesson.day 
        });
        
        setIsModalOpen(true);
        setCandidateSearch(teachers.find(t => t.id === draggedTeacherId)?.name || '');
        
        setDraggedTeacherId(null);
        setDragOverLessonId(null);
    };

    const handleCandidateClick = (teacherId: string, isBusy: boolean) => {
        let isMerger = false;
        if (isBusy) {
            if (!window.confirm("Этот учитель занят. Назначить ОБЪЕДИНЕНИЕ классов?")) return;
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

    const renderLessonCard = (l: ScheduleItem, isResolved: boolean) => {
        const subs = substitutions.filter(s => s.scheduleItemId === l.id && s.date === selectedDate);
        const hasSubs = subs.length > 0;
        const firstSub = hasSubs ? subs[0] : null;
        
        const rep = firstSub && !['conducted','cancelled'].includes(firstSub.replacementTeacherId) ? teachers.find(t => t.id === firstSub.replacementTeacherId) : null;
        const orig = teachers.find(t => t.id === l.teacherId);
        const subj = subjects.find(s => s.id === l.subjectId); 
        const cls = classes.find(c => c.id === l.classId);
        
        // Logic for showing room changes
        const originalRoomName = rooms.find(r => r.id === l.roomId)?.name || l.roomId || '—';
        const replacementRoomId = firstSub?.replacementRoomId;
        const replacementRoomName = replacementRoomId ? (rooms.find(r => r.id === replacementRoomId)?.name || replacementRoomId) : null;
        const isRoomChanged = replacementRoomId && replacementRoomId !== l.roomId;

        const isCancelled = firstSub?.replacementTeacherId === 'cancelled';
        const isConducted = firstSub?.replacementTeacherId === 'conducted';
        
        return (
            <div 
                key={l.id} 
                onDragOver={(e) => handleDragOver(e, l.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, l)}
                className={`p-5 rounded-2xl border transition-all ${dragOverLessonId === l.id ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-500' : 'bg-white dark:bg-dark-800 border-slate-100 dark:border-slate-700 shadow-sm'}`}
            >
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl ${isResolved ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{l.period}</div>
                        <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 text-lg">{cls?.name}</div>
                            <div className="text-sm text-slate-500">{subj?.name}</div>
                        </div>
                    </div>
                    <div className="text-right">
                         <div className="text-xs font-bold text-slate-400 uppercase">{l.shift === Shift.First ? '1 смена' : '2 смена'}</div>
                         <div className="mt-1">
                            {isRoomChanged ? (
                                <div className="flex items-center justify-end gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-800">
                                    <span className="text-xs font-mono font-bold text-slate-400 line-through decoration-red-400">{originalRoomName}</span>
                                    <Icon name="ArrowRight" size={10} className="text-indigo-400"/>
                                    <span className="text-xs font-mono font-black text-indigo-700 dark:text-indigo-300">{replacementRoomName}</span>
                                </div>
                            ) : (
                                <div className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded inline-block font-bold">{originalRoomName}</div>
                            )}
                         </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                     <div className={`text-base font-medium ${isResolved ? 'text-slate-400 line-through' : 'text-red-500'}`}>
                        {orig?.name}
                     </div>
                     {!isResolved ? (
                        <button onClick={() => { setCurrentSubParams({ scheduleItemId: l.id, subjectId: l.subjectId, period: l.period, shift: l.shift, classId: l.classId, teacherId: l.teacherId, roomId: l.roomId, day: l.day }); setIsModalOpen(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
                            Заменить
                        </button>
                     ) : (
                        <div className="flex items-center gap-3 justify-end">
                             {isCancelled ? <span className="text-red-600 font-black text-sm uppercase">УРОК СНЯТ</span> :
                              isConducted ? <span className="text-blue-600 font-bold text-sm">ПРОВЕДЕН</span> :
                              <div className="flex flex-col items-end">
                                  <span className="text-emerald-600 font-bold text-base">{rep?.name || 'Замена'}</span>
                                  {firstSub?.isMerger && <span className="text-[10px] text-purple-500 font-bold">ОБЪЕДИНЕНИЕ</span>}
                              </div>
                             }
                             
                             {/* Telegram Send Button for Individual */}
                             {rep && rep.telegramChatId && !isCancelled && !isConducted && (
                                <button 
                                    onClick={() => {
                                        const roomInfo = isRoomChanged ? `${originalRoomName} -> ${replacementRoomName}` : originalRoomName;
                                        handleTelegramClick(
                                            rep.id, 
                                            l.id, 
                                            roomInfo, 
                                            cls?.name || '?', 
                                            subj?.name || '?', 
                                            l.period, 
                                            !!isRoomChanged
                                        );
                                    }}
                                    className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                    title="Отправить учителю в Telegram"
                                >
                                    <Icon name="Send" size={16} />
                                </button>
                             )}

                             {firstSub && (
                                <button onClick={() => handleEditSubstitution(l, firstSub)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors" title="Редактировать замену">
                                    <Icon name="Edit" size={18} />
                                </button>
                             )}

                             <button onClick={() => removeSubstitution(l.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Icon name="X" size={18}/></button>
                        </div>
                     )}
                </div>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col gap-6">
            {/* Top Bar with Actions */}
            <div className="flex flex-col gap-4">
                <div className="bg-white dark:bg-dark-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Дата замены</label>
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-1.5 rounded-xl border border-slate-200 dark:border-slate-600">
                                <button onClick={() => changeDate(-1)} className="p-2 text-slate-500 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition-colors"><Icon name="ArrowRight" className="rotate-180" size={18}/></button>
                                <div className="flex-1 flex items-center justify-center gap-2 font-bold text-slate-700 dark:text-slate-200 cursor-pointer relative group">
                                    <Icon name="Calendar" size={18} className="text-indigo-500"/>
                                    <span>{new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}</span>
                                    {/* Invisible date picker overlay */}
                                    <input 
                                        ref={dateInputRef}
                                        type="date" 
                                        value={selectedDate} 
                                        onChange={e => setSelectedDate(e.target.value)} 
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                </div>
                                <button onClick={openCalendar} className="p-2 bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:text-indigo-600 shadow-sm border border-slate-200 dark:border-slate-500" title="Открыть календарь">
                                    <Icon name="Calendar" size={16}/>
                                </button>
                                <button onClick={() => setToday()} className="px-3 py-1.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors">Сегодня</button>
                                <button onClick={() => changeDate(1)} className="p-2 text-slate-500 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition-colors"><Icon name="ArrowRight" size={18}/></button>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 mt-auto">
                            <button onClick={sendSummaryToTelegram} disabled={isSendingSummary} className="h-[48px] px-5 rounded-xl bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50">
                                {isSendingSummary ? <Icon name="Loader" className="animate-spin" size={18}/> : <Icon name="Send" size={18}/>} Telegram
                            </button>
                            <button onClick={copyToClipboard} className="h-[48px] px-5 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center gap-2">
                                <Icon name="Copy" size={18}/> Копия
                            </button>
                            <button onClick={() => setIsHistoryModalOpen(true)} className="h-[48px] px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors">
                                <Icon name="History" size={18}/> История
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Tabs Switcher */}
            <div className="md:hidden flex bg-white dark:bg-dark-800 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 shrink-0">
                <button 
                    onClick={() => setMobileTab('lessons')} 
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${mobileTab === 'lessons' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    <Icon name="List" size={18} />
                    Замены
                </button>
                <button 
                    onClick={() => setMobileTab('teachers')} 
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${mobileTab === 'teachers' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
                >
                    <Icon name="Users" size={18} />
                    Учителя
                </button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
                {/* Left Column: Teachers List */}
                <div className={`w-full md:w-80 flex-col gap-4 ${isMobile && mobileTab !== 'teachers' ? 'hidden' : 'flex'}`}>
                     <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex-1 overflow-hidden flex flex-col h-[600px] md:h-auto">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2"><Icon name="UserX" size={18} className="text-red-500"/> Отсутствующие</h3>
                        
                        <div className="mb-3 space-y-2">
                            <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                <button onClick={() => setTeacherShiftFilter('all')} className={`flex-1 py-2 text-xs font-bold rounded-md ${teacherShiftFilter === 'all' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Все</button>
                                <button onClick={() => setTeacherShiftFilter(Shift.First)} className={`flex-1 py-2 text-xs font-bold rounded-md ${teacherShiftFilter === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>1 см</button>
                                <button onClick={() => setTeacherShiftFilter(Shift.Second)} className={`flex-1 py-2 text-xs font-bold rounded-md ${teacherShiftFilter === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>2 см</button>
                            </div>
                            <div className="relative">
                                <Icon name="Search" className="absolute left-3 top-3 text-slate-400" size={16}/>
                                <input placeholder="Найти учителя..." value={teacherSearch} onChange={e => setTeacherSearch(e.target.value)} className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-1 ring-indigo-500 dark:text-white"/>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                            {filteredTeachersList.map(t => {
                                const isAbsent = t.unavailableDates.includes(selectedDate); 
                                const reason = t.absenceReasons ? t.absenceReasons[selectedDate] : '';
                                return (
                                <div 
                                    key={t.id} 
                                    draggable={!isAbsent}
                                    onDragStart={(e) => handleDragStart(e, t.id)}
                                    className={`flex flex-col p-4 rounded-xl border transition-all ${isAbsent ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600 cursor-grab active:cursor-grabbing hover:border-indigo-300'}`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={`text-base font-bold ${isAbsent ? 'text-red-700 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>{t.name}</span>
                                        <div className="flex gap-1">
                                            {isAbsent && <button onClick={() => openAbsenceModal(t.id)} className="p-1.5 bg-white text-slate-500 rounded-lg hover:text-indigo-600 shadow-sm" title="Изменить причину"><Icon name="Edit" size={14}/></button>}
                                            <button onClick={() => isAbsent ? removeAbsence(t.id) : openAbsenceModal(t.id)} className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition-colors ${isAbsent ? 'bg-white dark:bg-dark-800 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                                                {isAbsent ? 'Вернуть' : 'Нет'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div className="flex gap-1">{t.shifts.map(s => <span key={s} className="text-[10px] bg-white dark:bg-slate-600 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-500 text-slate-500 font-medium">{s === Shift.First ? '1' : '2'}</span>)}</div>
                                        {isAbsent && reason && <div className="text-xs text-red-500 dark:text-red-400 italic font-medium">{reason}</div>}
                                    </div>
                                </div>)
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Column: Lessons */}
                <div className={`flex-1 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col overflow-hidden ${isMobile && mobileTab !== 'lessons' ? 'hidden' : 'flex'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                            <button onClick={() => setActiveTab('pending')} className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500'}`}>
                                Требуют внимания {pendingLessons.length > 0 && <span className="ml-1 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs">{pendingLessons.length}</span>}
                            </button>
                            <button onClick={() => setActiveTab('resolved')} className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'resolved' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500'}`}>
                                Назначенные {resolvedLessons.length > 0 && <span className="ml-1 bg-emerald-500 text-white px-2 py-0.5 rounded-full text-xs">{resolvedLessons.length}</span>}
                            </button>
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => { setManualLessonSearch(''); setManualSearchModalOpen(true); }} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100"><Icon name="Search" size={20}/></button>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                        {(activeTab === 'pending' ? pendingLessons : resolvedLessons).map(l => renderLessonCard(l, activeTab === 'resolved'))}
                        {(activeTab === 'pending' ? pendingLessons : resolvedLessons).length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Icon name={activeTab === 'pending' ? 'CheckCircle' : 'List'} size={64} className="mb-4 text-slate-200 dark:text-slate-700"/>
                                <p className="text-lg font-medium">{activeTab === 'pending' ? 'Все уроки обработаны!' : 'Нет назначенных замен'}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* SUBSTITUTION MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Управление заменой" maxWidth="max-w-2xl">
                {/* Flex container to handle scrolling */}
                <div className="flex flex-col h-[90vh] md:h-[850px] -m-6">
                    {/* Fixed Header */}
                    <div className="p-6 pb-2 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-dark-800 z-10">
                        {modalContext && (
                            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl mb-4 text-sm border border-slate-100 dark:border-slate-600 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200 text-xl">{modalContext.className}</div>
                                    <div className="text-slate-500 dark:text-slate-400 font-medium">{modalContext.period} урок • {modalContext.subjectName}</div>
                                </div>
                                <div className="text-right">
                                     <div className="text-slate-400 text-xs uppercase font-bold">Учитель</div>
                                     <div className={`text-base ${modalContext.isTeacherAbsent ? 'line-through decoration-red-400 text-red-400' : 'font-bold dark:text-white'}`}>{modalContext.teacherName}</div>
                                </div>
                            </div>
                        )}
                        
                        {/* Action Tabs */}
                        <div className="flex gap-2 border-b border-slate-100 dark:border-slate-700">
                            <button onClick={() => setSubMode('teacher')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all ${subMode === 'teacher' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Замена учителем</button>
                            <button onClick={() => setSubMode('cancel')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all ${subMode === 'cancel' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Отмена урока</button>
                            <button onClick={() => setSubMode('advanced')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all ${subMode === 'advanced' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Спец. действия</button>
                        </div>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white dark:bg-dark-800">
                        {subMode === 'teacher' && (
                            <div className="space-y-6">
                                {/* Smart Recommendations */}
                                {candidates.recommended.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1"><Icon name="Star" size={14}/> Рекомендуемые</h4>
                                        <div className="space-y-2">
                                            {candidates.recommended.map(({ teacher, isSpecialist }) => (
                                                <div key={teacher.id} className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl hover:bg-emerald-100/50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-emerald-200 text-emerald-700 flex items-center justify-center text-sm font-bold">{teacher.name[0]}</div>
                                                        <div>
                                                            <div className="font-bold text-slate-800 text-base">{teacher.name}</div>
                                                            <div className="text-xs text-emerald-600 font-bold uppercase">{isSpecialist ? 'Профиль' : 'Есть окно'}</div>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => assignSubstitution(teacher.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">Выбрать</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Все учителя</label>
                                    <div className="relative mb-2">
                                        <Icon name="Search" className="absolute left-3 top-3 text-slate-400" size={16}/>
                                        <input placeholder="Найти учителя..." value={candidateSearch} onChange={e => setCandidateSearch(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500"/>
                                    </div>
                                    <div className="space-y-1">
                                        {candidates.others.map(({ teacher, isBusy, isAbsent, subsCount }) => {
                                            const isRefused = refusedTeacherIds.includes(teacher.id);
                                            return (
                                                <div key={teacher.id} className={`flex items-center justify-between p-3 rounded-lg text-sm ${isAbsent ? 'opacity-50' : 'hover:bg-slate-50'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${isBusy ? 'bg-orange-400' : isAbsent ? 'bg-red-400' : 'bg-slate-300'}`}></div>
                                                        <span className="font-bold text-base text-slate-700">{teacher.name}</span>
                                                        {isRefused && <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-bold text-slate-500">Отказ</span>}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {!isAbsent && <button onClick={(e) => toggleRefusal(teacher.id, e)} className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded"><Icon name="X" size={16}/></button>}
                                                        {!isAbsent && <button onClick={() => handleCandidateClick(teacher.id, isBusy)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isBusy ? 'text-orange-600 bg-orange-50' : 'text-indigo-600 bg-indigo-50'}`}>{isBusy ? 'Объед?' : 'Выбрать'}</button>}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {subMode === 'cancel' && (
                            <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6"><Icon name="X" size={40}/></div>
                                <h3 className="font-black text-2xl mb-2 text-slate-800">Снять урок?</h3>
                                <p className="text-slate-500 text-base mb-8 max-w-sm">Урок будет отмечен как отмененный в расписании и отобразится красным цветом.</p>
                                <button onClick={() => assignSubstitution('cancelled')} className="px-8 py-4 bg-red-600 text-white rounded-xl font-bold text-lg hover:bg-red-700 shadow-lg shadow-red-200 hover:shadow-xl transition-all">Подтвердить отмену</button>
                            </div>
                        )}

                        {subMode === 'advanced' && (
                            <div className="space-y-6 pt-4">
                                <button onClick={() => assignSubstitution('conducted')} className="w-full p-4 rounded-xl bg-blue-50 text-blue-700 font-bold text-base hover:bg-blue-100 flex items-center justify-center gap-3 border border-blue-100 transition-all hover:shadow-md"><Icon name="CheckCircle" size={20}/> Урок проведен (без замены)</button>
                                
                                <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100">
                                    <h4 className="font-bold text-amber-800 text-base mb-2 flex items-center gap-2"><Icon name="Users" size={18}/> Объединение</h4>
                                    <p className="text-sm text-amber-700 mb-4">Присоединить этот класс к другому уроку.</p>
                                    <div className="space-y-2">
                                        {mergeCandidates.length === 0 ? <div className="text-sm text-amber-500 italic text-center py-4">Нет подходящих классов</div> : mergeCandidates.map(c => (
                                            <button key={c.classEntity.id} onClick={() => handleBatchClassMerge(c.classEntity.id)} className="w-full p-3 bg-white rounded-xl border border-amber-200 text-left text-sm hover:border-amber-400 hover:shadow-sm transition-all">
                                                <span className="font-bold text-base">{c.classEntity.name}</span> <span className="text-slate-400 mx-2">|</span> <span className="font-medium">{c.subjects.join(', ')}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {otherLessonsForTeacher.length > 0 && (
                                    <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                                        <h4 className="font-bold text-purple-800 text-base mb-2 flex items-center gap-2"><Icon name="RotateCw" size={18}/> Обмен</h4>
                                        <p className="text-sm text-purple-700 mb-4">Поменять местами с другим уроком этого учителя.</p>
                                        <div className="space-y-2">
                                            {otherLessonsForTeacher.map(l => (
                                                <button key={l.id} onClick={() => swapLessons(l.id)} className="w-full p-3 bg-white rounded-xl border border-purple-200 text-left text-sm hover:border-purple-400 hover:shadow-sm transition-all">
                                                    <span className="font-bold text-base">{l.period} урок</span>: <span className="font-medium">{classes.find(c=>c.id===l.classId)?.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Fixed Footer for Options */}
                    {subMode === 'teacher' && (
                        <div className="p-6 pt-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-dark-800 flex flex-col gap-4 rounded-b-3xl">
                             <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Кабинет (Опционально)</label>
                                    <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)} className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white font-medium outline-none focus:ring-2 ring-indigo-500"><option value="">Авто / Без изменений</option>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                                </div>
                             </div>
                             
                             {(activeReplacementId || (modalContext?.teacherId && selectedRoomId)) && (
                                <button 
                                    onClick={() => assignSubstitution(activeReplacementId || modalContext?.teacherId || '')} 
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl text-base font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
                                >
                                    Сохранить изменения
                                </button>
                             )}
                        </div>
                    )}
                </div>
            </Modal>

            {/* ABSENCE MODAL */}
            <Modal isOpen={absenceModalOpen} onClose={() => setAbsenceModalOpen(false)} title="Причина отсутствия"><div className="space-y-4"><select value={absenceReason} onChange={e => setAbsenceReason(e.target.value)} className="w-full border p-3 rounded-xl outline-none font-bold text-slate-700 dark:text-white dark:bg-slate-700 dark:border-slate-600"><option>Болезнь</option><option>Курсы</option><option>Отгул</option><option>Семейные обстоятельства</option><option>Командировка</option><option>Без записи</option><option>Другое</option></select><div className="flex justify-end"><button onClick={confirmAbsence} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold">Подтвердить</button></div></div></Modal>
            
            {/* MANUAL SEARCH MODAL */}
            <Modal isOpen={manualSearchModalOpen} onClose={() => setManualSearchModalOpen(false)} title="Ручной поиск урока">
                <div className="mb-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Введите имя учителя или название класса.</p>
                    <div className="relative">
                        <Icon name="Search" className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                        <input autoFocus placeholder="Например: 6А или Иванова..." value={manualLessonSearch} onChange={e => setManualLessonSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:border-indigo-500 dark:text-white"/>
                    </div>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {manualSearchResults.map((item) => (
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

            {/* HISTORY MODAL (Improved) */}
            <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title="История замен" maxWidth="max-w-5xl">
                 <div className="space-y-4">
                     <div className="flex gap-4 p-1 bg-slate-50 dark:bg-slate-700 rounded-xl">
                         <div className="relative flex-1">
                             <Icon name="Search" className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                             <input placeholder="Поиск по дате (YYYY-MM-DD) или имени..." value={historySearch} onChange={e => setHistorySearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border-none rounded-lg text-sm outline-none dark:text-white" />
                         </div>
                         <div className="relative w-64">
                            <select value={historyFilterTeacher} onChange={e => setHistoryFilterTeacher(e.target.value)} className="w-full py-2 px-3 bg-white dark:bg-slate-800 rounded-lg text-sm border-none outline-none cursor-pointer dark:text-white appearance-none">
                                <option value="">Все учителя</option>
                                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <Icon name="Filter" className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={14}/>
                         </div>
                     </div>
                     <div className="max-h-[60vh] overflow-y-auto custom-scrollbar rounded-xl border border-slate-200 dark:border-slate-700">
                         <table className="w-full text-left border-collapse">
                             <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                                 <tr>
                                     <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Дата</th>
                                     <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Урок</th>
                                     <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Кого заменяют</th>
                                     <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Кто заменяет</th>
                                     <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Тип</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-dark-800">
                                 {substitutions
                                     .filter(s => {
                                         if (historyFilterTeacher && s.replacementTeacherId !== historyFilterTeacher && s.originalTeacherId !== historyFilterTeacher) return false;
                                         if (historySearch) {
                                             const searchLower = historySearch.toLowerCase();
                                             const dateMatch = s.date.includes(searchLower);
                                             const orig = teachers.find(t=>t.id===s.originalTeacherId)?.name.toLowerCase().includes(searchLower);
                                             const rep = teachers.find(t=>t.id===s.replacementTeacherId)?.name.toLowerCase().includes(searchLower);
                                             return dateMatch || orig || rep;
                                         }
                                         return true;
                                     })
                                     .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                     .map(s => {
                                         const orig = teachers.find(t => t.id === s.originalTeacherId);
                                         const rep = teachers.find(t => t.id === s.replacementTeacherId);
                                         const item = activeSchedule.find(i => i.id === s.scheduleItemId) || { period: '?', classId: '?' } as any; 
                                         const cls = classes.find(c => c.id === item.classId);

                                         return (
                                             <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                                                 <td className="p-4 text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                     {new Date(s.date).toLocaleDateString('ru-RU')}
                                                 </td>
                                                 <td className="p-4">
                                                     <div className="flex flex-col">
                                                         <span className="font-bold text-slate-800 dark:text-white">{item.period} урок</span>
                                                         <span className="text-xs text-slate-500">{cls?.name || '?'}</span>
                                                     </div>
                                                 </td>
                                                 <td className="p-4">
                                                     <div className="flex items-center gap-3">
                                                         <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500">{orig?.name[0]}</div>
                                                         <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{orig?.name}</span>
                                                     </div>
                                                 </td>
                                                 <td className="p-4">
                                                     <div className="flex items-center gap-3">
                                                         {s.replacementTeacherId === 'cancelled' ? (
                                                             <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500"><Icon name="X" size={14}/></div>
                                                         ) : s.replacementTeacherId === 'conducted' ? (
                                                             <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500"><Icon name="CheckCircle" size={14}/></div>
                                                         ) : (
                                                             <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">{rep?.name[0]}</div>
                                                         )}
                                                         <span className={`text-sm font-bold ${s.replacementTeacherId === 'cancelled' ? 'text-red-500' : 'text-slate-800 dark:text-white'}`}>
                                                             {s.replacementTeacherId === 'cancelled' ? 'Урок снят' : 
                                                              s.replacementTeacherId === 'conducted' ? 'Проведен' : 
                                                              rep?.name}
                                                         </span>
                                                     </div>
                                                 </td>
                                                 <td className="p-4 text-right">
                                                     {s.isMerger ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Объединение</span> :
                                                      s.replacementTeacherId === 'cancelled' ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Отмена</span> :
                                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Замена</span>}
                                                 </td>
                                             </tr>
                                         );
                                     })}
                             </tbody>
                         </table>
                     </div>
                 </div>
            </Modal>
            
            {/* TELEGRAM CHOICE MODAL */}
            <Modal isOpen={telegramChoiceOpen} onClose={() => setTelegramChoiceOpen(false)} title="Отправка уведомления">
                <div className="space-y-6">
                    <p className="text-base text-slate-600 dark:text-slate-300">
                        Вы хотите отправить учителю информацию только об этой замене или сводку всех его замен на сегодня?
                    </p>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => confirmSendTelegram('single')}
                            className="w-full p-4 bg-white border border-slate-200 dark:bg-slate-700 dark:border-slate-600 rounded-xl flex items-center gap-4 hover:shadow-md transition-all group"
                        >
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <Icon name="Bell" size={20} />
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-slate-800 dark:text-white">Только этот урок</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Уведомление о конкретной замене</div>
                            </div>
                        </button>

                        <button 
                            onClick={() => confirmSendTelegram('all')}
                            className="w-full p-4 bg-white border border-slate-200 dark:bg-slate-700 dark:border-slate-600 rounded-xl flex items-center gap-4 hover:shadow-md transition-all group"
                        >
                            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                <Icon name="List" size={20} />
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-slate-800 dark:text-white">Все замены (Сводка)</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Полный список замен учителя на сегодня</div>
                            </div>
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
