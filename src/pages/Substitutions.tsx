import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { DateInput } from '../components/DateInput';
import { Modal, useToast } from '../components/UI';
import { DAYS, ScheduleItem, ClassEntity, Substitution, SubstitutionParams } from '../types';
import {
    formatDateISO,
    formatDateEuropean,
    getScheduleForDate,
    generateId,
    getActiveSemester,
    getDateOrToday
} from '../utils/helpers';
import { escapeMarkdown } from '../utils/escapeHtml';
import { logger } from '../utils/logger';
import useMedia from 'use-media';
import { VirtualList } from '../components/VirtualList';

// Subcomponents
import { TeacherCard } from '../components/Substitutions/TeacherCard';
import { LessonCard } from '../components/Substitutions/LessonCard';
import { TeacherFilter } from '../components/Substitutions/TeacherFilter';
import {
    AbsenceModal,
    BatchActionModal,
    ManualSearchModal,
    TelegramChoiceModal,
    QuickViewScheduleModal
} from '../components/Substitutions/Modals';
import { AssignmentModal } from '../components/Substitutions/AssignmentModal';

export const SubstitutionsPage = () => {
    const { subjects, teachers, classes, rooms, settings, privateSettings, saveStaticData } = useStaticData();
    const { schedule1, schedule2, substitutions, saveScheduleData } = useScheduleData();
    const substitutionsRef = useRef(substitutions);
    substitutionsRef.current = substitutions;
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
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
    const [currentSubParams, setCurrentSubParams] = useState<SubstitutionParams | null>(null);
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

    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
    const [absenceReason, setAbsenceReason] = useState('Болезнь');

    // Search & Filters
    const [historySearch, setHistorySearch] = useState('');
    const [historyFilterTeacher, setHistoryFilterTeacher] = useState('');
    const [teacherSearch, setTeacherSearch] = useState('');
    const [teacherShiftFilter, setTeacherShiftFilter] = useState('all');
    const [teacherSubjectFilter, setTeacherSubjectFilter] = useState(''); // New: Subject filter
    const [candidateSearch, setCandidateSearch] = useState('');
    const [manualLessonSearch, setManualLessonSearch] = useState('');

    const [selectedRoomId, setSelectedRoomId] = useState<string>('');
    const [lessonAbsenceReason, setLessonAbsenceReason] = useState<string>('');
    const [activeReplacementId, setActiveReplacementId] = useState<string | null>(null);
    const [substitutionComment, setSubstitutionComment] = useState<string>(''); // New: per-substitution comment

    const [refusedTeacherIds, setRefusedTeacherIds] = useState<string[]>([]);
    const [swapKeepRooms, setSwapKeepRooms] = useState(false);

    const [isCompactMode, setIsCompactMode] = useState(false); // New: Compact mode
    const [viewScheduleTeacherId, setViewScheduleTeacherId] = useState<string | null>(null); // New: Quick view schedule

    const [batchActionModalOpen, setBatchActionModalOpen] = useState(false);
    const [batchActionType, setBatchActionType] = useState<'cancel' | 'replace' | null>(null);
    const [batchReplacementId, setBatchReplacementId] = useState<string>('');
    const [batchAbsenceReason, setBatchAbsenceReason] = useState<string>('Болезнь');

    // New: common comment for all substitutions on the selected date
    const [dayComment, setDayComment] = useState<string>('');

    // Drag & Drop State
    const [draggedTeacherId, setDraggedTeacherId] = useState<string | null>(null);
    const [dragOverLessonId, setDragOverLessonId] = useState<string | null>(null);

    // Mobile state
    const isMobile = useMedia({ maxWidth: 768 });
    const [mobileTab, setMobileTab] = useState<'lessons' | 'teachers'>('lessons');

    const activeSchedule = useMemo(() => {
        // Construct a partial AppData object that fulfills getScheduleForDate's requirements
        const mockData = {
            settings,
            schedule: schedule1,
            schedule2: schedule2
        };

        return getScheduleForDate(getDateOrToday(selectedDate), mockData);
    }, [selectedDate, schedule1, schedule2, settings]);

    const isVacationDate = useMemo(() => {
        return getActiveSemester(getDateOrToday(selectedDate), settings) === null;
    }, [selectedDate, settings]);

    useEffect(() => {
        if (location.state?.subParams) {
            setCurrentSubParams(location.state.subParams);
            setSelectedRoomId('');
            setLessonAbsenceReason('');
            setSubstitutionComment('');
            setRefusedTeacherIds([]);
            setActiveReplacementId(null);
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

            const existingSub = substitutions.find(
                (s) => s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate
            );
            if (existingSub) {
                setRefusedTeacherIds(existingSub.refusals || []);
                // Determine mode based on existing substitution
                if (existingSub.replacementTeacherId === 'cancelled') setSubMode('cancel');
                else if (existingSub.isMerger || existingSub.replacementClassId) setSubMode('advanced');
                else setSubMode('teacher');

                setSubstitutionComment(existingSub.comment || '');
                if (existingSub.dayComment) setDayComment(existingSub.dayComment);

                // Set active replacement ID if editing via drag/drop on existing sub (rare case)
                if (
                    existingSub.replacementTeacherId &&
                    !['conducted', 'cancelled'].includes(existingSub.replacementTeacherId)
                ) {
                    setActiveReplacementId(existingSub.replacementTeacherId);
                }
            } else {
                setRefusedTeacherIds([]);
                setSubMode('teacher');
                setActiveReplacementId(null);
                setSubstitutionComment('');
            }
            setSwapKeepRooms(false);
        }
    }, [isModalOpen, currentSubParams, substitutions, selectedDate]);

    // Load day-level comment from settings (persistent)
    useEffect(() => {
        const map = settings.substitutionDayComments || {};
        setDayComment(map[selectedDate] || '');
    }, [settings.substitutionDayComments, selectedDate]);

    // Persist day-level comment to settings (debounced)
    useEffect(() => {
        const timer = window.setTimeout(() => {
            const currentSettings = settingsRef.current;
            const map = currentSettings.substitutionDayComments || {};
            const current = map[selectedDate] || '';
            if (current === dayComment) return;

            const next = { ...map };
            const trimmed = dayComment.trim();
            if (trimmed) next[selectedDate] = trimmed;
            else delete next[selectedDate];

            saveStaticData({ settings: { ...currentSettings, substitutionDayComments: next } }, false).catch(() => {
                // No toast spam; user will notice if it doesn't persist
            });
        }, 500);

        return () => window.clearTimeout(timer);
    }, [dayComment, selectedDate, saveStaticData]);

    const selectedDayOfWeek = useMemo(() => {
        const idx = getDateOrToday(selectedDate).getDay();
        if (idx === 0 || idx === 6) return null;
        return DAYS[idx - 1];
    }, [selectedDate]);

    // --- Date Navigation Helpers ---
    const changeDate = (days: number) => {
        const d = getDateOrToday(selectedDate);
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
        return teachers.filter((t) => {
            const matchesSearch = t.name.toLowerCase().includes(teacherSearch.toLowerCase());
            const matchesShift =
                teacherShiftFilter === 'all' ? true : t.shifts && t.shifts.includes(teacherShiftFilter);
            const matchesSubject = teacherSubjectFilter ? t.subjectIds.includes(teacherSubjectFilter) : true;
            return matchesSearch && matchesShift && matchesSubject;
        });
    }, [teachers, teacherSearch, teacherShiftFilter, teacherSubjectFilter]);

    const absentTeachers = useMemo(
        () => teachers.filter((t) => t.unavailableDates.includes(selectedDate)),
        [teachers, selectedDate]
    );

    const affectedLessons = useMemo(() => {
        if (!selectedDayOfWeek) return [];

        const absentIds = absentTeachers.map((t) => t.id);
        const lessonsOfAbsent = activeSchedule.filter(
            (s) => s.day === selectedDayOfWeek && absentIds.includes(s.teacherId)
        );

        const subsOnDate = substitutions.filter((s) => s.date === selectedDate);
        const subScheduleIds = subsOnDate.map((s) => s.scheduleItemId);
        const lessonsWithSubs = activeSchedule.filter((s) => subScheduleIds.includes(s.id));

        const merged = [...lessonsOfAbsent];
        lessonsWithSubs.forEach((l) => {
            if (!merged.find((m) => m.id === l.id)) merged.push(l);
        });

        return merged.sort((a, b) => a.period - b.period);
    }, [activeSchedule, selectedDayOfWeek, absentTeachers, substitutions, selectedDate]);

    // Split lessons into Pending and Resolved
    const { pendingLessons, resolvedLessons } = useMemo(() => {
        const pending: ScheduleItem[] = [];
        const resolved: ScheduleItem[] = [];

        affectedLessons.forEach((lesson) => {
            const subs = substitutions.filter((s) => s.scheduleItemId === lesson.id && s.date === selectedDate);
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
        const teacher = teachers.find((t) => t.id === id);
        setSelectedTeacherId(id);
        setAbsenceReason(teacher?.absenceReasons?.[selectedDate] || 'Болезнь');
        setAbsenceModalOpen(true);
    };

    const confirmAbsence = useCallback(async () => {
        const updatedTeachers = [...teachers];
        const tIndex = updatedTeachers.findIndex((x) => x.id === selectedTeacherId);
        if (tIndex === -1) return;

        const teacher = { ...updatedTeachers[tIndex] };
        if (!teacher.unavailableDates.includes(selectedDate)) {
            teacher.unavailableDates = [...teacher.unavailableDates, selectedDate];
        }
        teacher.absenceReasons = { ...teacher.absenceReasons, [selectedDate]: absenceReason };

        updatedTeachers[tIndex] = teacher;
        await saveStaticData({ teachers: updatedTeachers });
        setAbsenceModalOpen(false);
    }, [teachers, selectedTeacherId, selectedDate, absenceReason, saveStaticData]);

    const openBatchActionModal = () => {
        setBatchAbsenceReason(absenceReason);
        setBatchActionModalOpen(true);
    };

    const confirmBatchAction = useCallback(async () => {
        // 1. Mark as absent first if not already done (optional, but good for consistency)
        const updatedTeachers = [...teachers];
        const tIndex = updatedTeachers.findIndex((x) => x.id === selectedTeacherId);
        if (tIndex !== -1) {
            const teacher = { ...updatedTeachers[tIndex] };
            if (!teacher.unavailableDates.includes(selectedDate)) {
                teacher.unavailableDates = [...teacher.unavailableDates, selectedDate];
            }
            teacher.absenceReasons = { ...teacher.absenceReasons, [selectedDate]: batchAbsenceReason };
            updatedTeachers[tIndex] = teacher;
            await saveStaticData({ teachers: updatedTeachers });
        }

        // 2. Perform Batch Action
        if (selectedDayOfWeek && batchActionType) {
            const lessonsToProcess = activeSchedule.filter(
                (s) => s.teacherId === selectedTeacherId && s.day === selectedDayOfWeek
            );
            const existingSubs = substitutionsRef.current.filter(
                (s) => !(s.originalTeacherId === selectedTeacherId && s.date === selectedDate)
            );

            const createdSubs = lessonsToProcess.map((l) => ({
                id: generateId(),
                date: selectedDate,
                scheduleItemId: l.id,
                originalTeacherId: l.teacherId,
                replacementTeacherId: batchActionType === 'cancel' ? 'cancelled' : batchReplacementId,
                lessonAbsenceReason: batchAbsenceReason,
                dayComment: dayComment || undefined
            }));
            const newSubs = [...existingSubs, ...createdSubs];
            await saveScheduleData({ substitutions: newSubs });
        }

        setBatchActionModalOpen(false);
        setAbsenceModalOpen(false);
        setBatchActionType(null);
        setBatchReplacementId('');
    }, [
        teachers,
        selectedTeacherId,
        selectedDate,
        batchAbsenceReason,
        saveStaticData,
        selectedDayOfWeek,
        activeSchedule,
        saveScheduleData,
        batchActionType,
        batchReplacementId,
        dayComment
    ]);

    const removeAbsence = useCallback(
        async (id: string) => {
            const updatedTeachers = [...teachers];
            const tIndex = updatedTeachers.findIndex((x) => x.id === id);
            if (tIndex === -1) return;

            const teacher = { ...updatedTeachers[tIndex] };
            teacher.unavailableDates = teacher.unavailableDates.filter((d: string) => d !== selectedDate);
            if (teacher.absenceReasons) {
                const { [selectedDate]: _, ...rest } = teacher.absenceReasons;
                teacher.absenceReasons = rest;
            }
            updatedTeachers[tIndex] = teacher;
            await saveStaticData({ teachers: updatedTeachers });
        },
        [teachers, selectedDate, saveStaticData]
    );

    const assignSubstitution = useCallback(
        async (replacementId: string, isMerger: boolean = false) => {
            if (!currentSubParams) {
                addToast({
                    type: 'danger',
                    title: 'Ошибка',
                    message: 'Невозможно назначить замену. Параметры урока не определены.'
                });
                return;
            }

            const item = activeSchedule.find((s) => s.id === currentSubParams.scheduleItemId);
            if (!item) {
                addToast({ type: 'danger', title: 'Ошибка', message: 'Урок не найден в расписании.' });
                return;
            }

            const filteredSubs = substitutionsRef.current.filter(
                (s) => !(s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate)
            );

            const subData = {
                id: generateId(),
                date: selectedDate,
                scheduleItemId: currentSubParams.scheduleItemId,
                originalTeacherId: item.teacherId,
                replacementTeacherId: replacementId,
                replacementRoomId: selectedRoomId || undefined,
                isMerger: isMerger,
                lessonAbsenceReason:
                    replacementId !== 'conducted' && replacementId !== 'cancelled' && lessonAbsenceReason
                        ? lessonAbsenceReason
                        : undefined,
                refusals: refusedTeacherIds,
                comment: substitutionComment || undefined,
                dayComment: dayComment || undefined
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
                setSubstitutionComment('');
            } catch (error) {
                logger.error('Failed to save substitution:', error);
                addToast({
                    type: 'danger',
                    title: 'Ошибка',
                    message: 'Ошибка при сохранении замены. Попробуйте еще раз.'
                });
            }
        },
        [
            currentSubParams,
            selectedDate,
            selectedRoomId,
            activeSchedule,
            lessonAbsenceReason,
            refusedTeacherIds,
            substitutionComment,
            dayComment,
            saveScheduleData,
            addToast
        ]
    );

    const handleBatchClassMerge = useCallback(
        async (targetClassId: string) => {
            if (
                !currentSubParams ||
                !selectedDayOfWeek ||
                !currentSubParams.period ||
                !currentSubParams.shift ||
                !currentSubParams.teacherId
            ) {
                addToast({ type: 'danger', title: 'Ошибка', message: 'Неполные параметры урока.' });
                return;
            }

            const targetLessons = activeSchedule.filter(
                (s) =>
                    s.classId === targetClassId &&
                    s.day === selectedDayOfWeek &&
                    s.period === currentSubParams.period &&
                    s.shift === currentSubParams.shift
            );

            if (targetLessons.length === 0) {
                addToast({ type: 'warning', title: 'Внимание', message: 'Уроки для объединения не найдены.' });
                return;
            }

            const newSubs = substitutionsRef.current.filter(
                (s) => !(s.scheduleItemId === currentSubParams.scheduleItemId && s.date === selectedDate)
            );

            targetLessons.forEach((lesson) => {
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
                    lessonAbsenceReason: lessonAbsenceReason || undefined,
                    dayComment: dayComment || undefined
                };
                newSubs.push(subData);
            });

            await saveScheduleData({ substitutions: newSubs });

            setIsModalOpen(false);
            setCandidateSearch('');
            setSelectedRoomId('');
            setLessonAbsenceReason('');
            setCurrentSubParams(null);
        },
        [
            currentSubParams,
            selectedDate,
            selectedDayOfWeek,
            activeSchedule,
            lessonAbsenceReason,
            saveScheduleData,
            addToast,
            dayComment
        ]
    );

    const swapLessons = useCallback(
        async (targetLessonId: string) => {
            if (!currentSubParams) return;

            const sourceLesson = activeSchedule.find((s) => s.id === currentSubParams.scheduleItemId);
            const targetLesson = activeSchedule.find((s) => s.id === targetLessonId);

            if (!sourceLesson || !targetLesson) {
                addToast({ type: 'danger', title: 'Ошибка', message: 'Не найден урок для обмена.' });
                return;
            }

            const newSubs = [...substitutionsRef.current];

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

            const sourceSubIndex = newSubs.findIndex(
                (s) => s.scheduleItemId === sourceLesson.id && s.date === selectedDate
            );
            const sourceSubData = {
                id: sourceSubIndex >= 0 ? newSubs[sourceSubIndex].id : generateId(),
                date: selectedDate,
                scheduleItemId: sourceLesson.id,
                originalTeacherId: sourceLesson.teacherId,
                replacementTeacherId: sourceLesson.teacherId,
                replacementClassId: targetLesson.classId,
                replacementSubjectId: targetLesson.subjectId,
                replacementRoomId: effectiveRoomForSource !== sourceLesson.roomId ? effectiveRoomForSource : undefined,
                dayComment: dayComment || undefined
            };
            if (sourceSubIndex >= 0) newSubs[sourceSubIndex] = sourceSubData;
            else newSubs.push(sourceSubData);

            const targetSubIndex = newSubs.findIndex(
                (s) => s.scheduleItemId === targetLesson.id && s.date === selectedDate
            );
            const targetSubData = {
                id: targetSubIndex >= 0 ? newSubs[targetSubIndex].id : generateId(),
                date: selectedDate,
                scheduleItemId: targetLesson.id,
                originalTeacherId: targetLesson.teacherId,
                replacementTeacherId: targetLesson.teacherId,
                replacementClassId: sourceLesson.classId,
                replacementSubjectId: sourceLesson.subjectId,
                replacementRoomId: effectiveRoomForTarget !== targetLesson.roomId ? effectiveRoomForTarget : undefined,
                dayComment: dayComment || undefined
            };
            if (targetSubIndex >= 0) newSubs[targetSubIndex] = targetSubData;
            else newSubs.push(targetSubData);

            await saveScheduleData({ substitutions: newSubs });

            setIsModalOpen(false);
            setCurrentSubParams(null);
            setSelectedRoomId('');
            setSwapKeepRooms(false);
        },
        [
            currentSubParams,
            activeSchedule,
            selectedDate,
            saveScheduleData,
            selectedRoomId,
            swapKeepRooms,
            dayComment,
            addToast
        ]
    );

    const removeSubstitution = useCallback(
        async (id: string) => {
            const newSubs = substitutionsRef.current.filter((s) => !(s.scheduleItemId === id && s.date === selectedDate));
            await saveScheduleData({ substitutions: newSubs });
        },
        [selectedDate, saveScheduleData]
    );

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

        setSubstitutionComment(sub.comment || '');
        if (sub.dayComment) setDayComment(sub.dayComment);

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
        const subs = substitutions.filter(
            (s) =>
                s.date === selectedDate &&
                s.replacementTeacherId !== 'conducted' &&
                s.replacementTeacherId !== 'cancelled'
        );
        if (subs.length === 0) return 'На эту дату замен нет.';

        // Sort by period
        const sortedSubs = [...subs].sort((a, b) => {
            const itemA = activeSchedule.find((i) => i.id === a.scheduleItemId);
            const itemB = activeSchedule.find((i) => i.id === b.scheduleItemId);
            return (itemA?.period || 0) - (itemB?.period || 0);
        });

        let text = '';
        const processedIds = new Set();

        sortedSubs.forEach((sub) => {
            if (processedIds.has(sub.scheduleItemId)) return;
            processedIds.add(sub.scheduleItemId);

            const item = activeSchedule.find((i) => i.id === sub.scheduleItemId);
            if (!item) return;

            const cls = classes.find((c) => c.id === item.classId);
            const subj = subjects.find((s) => s.id === item.subjectId);
            const origT = teachers.find((t) => t.id === sub.originalTeacherId);
            const repT = teachers.find((t) => t.id === sub.replacementTeacherId);
            const roomObj = rooms.find((r) => r.id === (sub.replacementRoomId || item.roomId));
            const roomName = roomObj ? roomObj.name : sub.replacementRoomId || item.roomId || '—';

            text += `🔹 **${item.period} урок** | ${escapeMarkdown(cls?.name)} | ${escapeMarkdown(subj?.name)}\n`;
            text += `❌ ${escapeMarkdown(origT?.name)}\n`;

            if (sub.isMerger) {
                text += `✅ ОБЪЕДИНЕНИЕ: ${escapeMarkdown(repT?.name)}\n`;
            } else if (sub.replacementClassId) {
                const swapCls = classes.find((c) => c.id === sub.replacementClassId);
                text += `✅ ОБМЕН УРОКАМИ: ${escapeMarkdown(swapCls?.name)}\n`;
            } else {
                text += `✅ ${escapeMarkdown(repT?.name)}\n`;
            }
            text += `🚪 Каб. ${escapeMarkdown(roomName)}\n\n`;
        });

        return text;
    };

    const generateSubstitutionText = () => {
        const content = generateSubstitutionContent();
        const dateStr = formatDateEuropean(selectedDate);

        // Use template if available
        let template = settings.telegramTemplates?.summary;
        if (!template) {
            template = '⚡️ **ЗАМЕНЫ НА {{date}}** ⚡️\n\n{{content}}';
        }

        return template.replace('{{date}}', dateStr).replace('{{content}}', content);
    };

    const copyToClipboard = async () => {
        const text = generateSubstitutionText();
        try {
            await navigator.clipboard.writeText(text);
            addToast({ type: 'success', title: 'Скопировано', message: 'Сводка замен скопирована в буфер' });
        } catch {
            addToast({
                type: 'danger',
                title: 'Не удалось скопировать',
                message: 'Доступ к буферу обмена запрещён. Скопируйте текст вручную.'
            });
        }
    };

    const sendSummaryToTelegram = async () => {
        if (!privateSettings.telegramToken || !settings.feedbackChatId) {
            addToast({ type: 'warning', title: 'Ошибка', message: 'Telegram не настроен' });
            return;
        }

        const text = generateSubstitutionText();
        setIsSendingSummary(true);
        try {
            const response = await fetch(`https://api.telegram.org/bot${privateSettings.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: settings.feedbackChatId,
                    text: text,
                    parse_mode: 'Markdown'
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            if (!result.ok) {
                throw new Error(result.description || 'Telegram API error');
            }
            addToast({ type: 'success', title: 'Отправлено', message: 'Сводка отправлена в Telegram' });
        } catch (e) {
            logger.error(e);
            addToast({ type: 'danger', title: 'Ошибка', message: `Не удалось отправить: ${e}` });
        } finally {
            setIsSendingSummary(false);
        }
    };

    const handleTelegramClick = (params: {
        teacherId: string;
        lessonId: string;
        roomName: string;
        className: string;
        subjectName: string;
        period: number;
        roomChanged: boolean;
    }) => {
        setTelegramTarget(params);
        setTelegramChoiceOpen(true);
    };

    const confirmSendTelegram = async (mode: 'single' | 'all') => {
        if (!telegramTarget) return;
        const { teacherId, roomName, className, subjectName, period } = telegramTarget;

        const teacher = teachers.find((t) => t.id === teacherId);
        if (!teacher?.telegramChatId || !privateSettings.telegramToken) {
            addToast({
                type: 'warning',
                title: 'Внимание',
                message: 'У учителя не настроен Telegram ID или нет токена бота.'
            });
            setTelegramChoiceOpen(false);
            return;
        }

        const dateStr = formatDateEuropean(selectedDate);
        let message = '';

        if (mode === 'single') {
            const content = `🔹 *${period} урок* | ${escapeMarkdown(className)}\n📖 ${escapeMarkdown(subjectName)}\n🚪 Каб. ${escapeMarkdown(roomName)}`;

            let template = settings.telegramTemplates?.teacherNotification;
            if (!template) {
                template =
                    '🔔 **Вам назначена замена!**\n📅 {{date}}\n\n{{content}}\n\nПожалуйста, ознакомьтесь с деталями.';
            }
            message = template.replace('{{date}}', dateStr).replace('{{content}}', content);
        } else {
            // Gather ALL substitutions for this teacher on this day
            const allTeacherSubs = substitutions.filter(
                (s) => s.date === selectedDate && s.replacementTeacherId === teacherId
            );

            // Sort by period
            const sortedAllTeacherSubs = [...allTeacherSubs].sort((a, b) => {
                const itemA = activeSchedule.find((i) => i.id === a.scheduleItemId);
                const itemB = activeSchedule.find((i) => i.id === b.scheduleItemId);
                return (itemA?.period || 0) - (itemB?.period || 0);
            });

            if (allTeacherSubs.length === 0) {
                addToast({
                    type: 'warning',
                    title: 'Внимание',
                    message: 'У этого учителя нет замен на выбранную дату.'
                });
                setTelegramChoiceOpen(false);
                return;
            }

            let messageBody = '';
            sortedAllTeacherSubs.forEach((sub) => {
                const item = activeSchedule.find((s) => s.id === sub.scheduleItemId);
                if (!item) return;

                const cls = classes.find((c) => c.id === item.classId)?.name || '?';
                const subj = subjects.find((s) => s.id === item.subjectId)?.name || '?';

                const originalRoomId = item.roomId;
                const replacementRoomId = sub.replacementRoomId;
                const finalRoomId = replacementRoomId || originalRoomId;
                const finalRoomName = rooms.find((r) => r.id === finalRoomId)?.name || finalRoomId || '—';

                const roomChangeIndicator =
                    replacementRoomId && replacementRoomId !== originalRoomId ? ' (Смена каб.)' : '';

                messageBody += `🔹 *${item.period} урок* | ${escapeMarkdown(cls)}\n📖 ${escapeMarkdown(subj)}\n🚪 Каб. ${escapeMarkdown(finalRoomName)}${roomChangeIndicator}\n\n`;
            });

            let template = settings.telegramTemplates?.teacherSummary;
            if (!template) {
                template = '🔔 **Ваши замены на {{date}}**\n\n{{content}}Пожалуйста, ознакомьтесь с деталями.';
            }
            message = template.replace('{{date}}', dateStr).replace('{{content}}', messageBody);
        }

        try {
            const response = await fetch(`https://api.telegram.org/bot${privateSettings.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: teacher.telegramChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const result = await response.json();
            if (!result.ok) {
                throw new Error(result.description || 'Telegram API error');
            }
            addToast({ type: 'success', title: 'Отправлено', message: `Уведомление отправлено ${teacher.name}` });
        } catch (e) {
            logger.error(e);
            addToast({ type: 'danger', title: 'Ошибка', message: `Ошибка отправки: ${e}` });
        } finally {
            setTelegramChoiceOpen(false);
            setTelegramTarget(null);
        }
    };

    const activeSubstitutionsForSlot = useMemo(() => {
        if (!currentSubParams) return new Set<string>();
        return new Set(
            substitutions
                .filter(
                    (s) =>
                        s.date === selectedDate &&
                        s.replacementTeacherId !== 'conducted' &&
                        s.replacementTeacherId !== 'cancelled'
                )
                .map((s) => {
                    const item = activeSchedule.find((i) => i.id === s.scheduleItemId);
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
            .filter((t) => t.name.toLowerCase().includes(candidateSearch.toLowerCase()))
            .map((t) => {
                // Check if teacher has conducted a lesson on this day (overrides absence)
                const hasConductedLesson = substitutions.some(
                    (s) =>
                        s.date === selectedDate &&
                        s.originalTeacherId === t.id &&
                        s.replacementTeacherId === 'conducted'
                );
                const isAbsent = t.unavailableDates.includes(selectedDate) && !hasConductedLesson;

                const isBusyRegular = activeSchedule.some(
                    (s) =>
                        s.teacherId === t.id &&
                        s.day === selectedDayOfWeek &&
                        s.period === currentSubParams.period &&
                        s.shift === currentSubParams.shift
                );
                const isBusySub = activeSubstitutionsForSlot.has(t.id);
                const isBusy = isBusyRegular || isBusySub;

                // Detailed busy reason
                let busyReason: { type: 'regular' | 'sub'; details: string } | null = null;
                if (isBusyRegular) {
                    const busyLesson = activeSchedule.find(
                        (s) =>
                            s.teacherId === t.id &&
                            s.day === selectedDayOfWeek &&
                            s.period === currentSubParams.period &&
                            s.shift === currentSubParams.shift
                    );
                    if (busyLesson) {
                        const c = classes.find((cl) => cl.id === busyLesson.classId)?.name;
                        const r = rooms.find((rm) => rm.id === busyLesson.roomId)?.name || busyLesson.roomId;
                        busyReason = { type: 'regular', details: `${c}, каб. ${r}` };
                    }
                } else if (isBusySub) {
                    busyReason = { type: 'sub', details: 'Замена' };
                }

                const isSpecialist = t.subjectIds.includes(currentSubParams.subjectId);
                const subsCount = substitutions.filter(
                    (s) => s.replacementTeacherId === t.id && s.date.startsWith(targetMonth)
                ).length;

                // Smart Scoring
                let score = 0;
                if (isAbsent) score -= 1000;
                if (isBusy) score -= 200;
                if (isSpecialist) score += 50;
                if (!isBusy && !isAbsent) score += 100; // Free window
                score -= subsCount; // Prefer those with less subs

                return { teacher: t, isAbsent, isBusy, busyReason, isSpecialist, score, subsCount };
            })
            .sort((a, b) => b.score - a.score);

        // Split into top 3 recommended (must be free) and others
        const recommended = allCandidates.filter((c) => !c.isBusy && !c.isAbsent).slice(0, 3);
        const others = allCandidates.filter((c) => !recommended.includes(c));

        return { recommended, others };
    }, [
        teachers,
        currentSubParams,
        selectedDate,
        candidateSearch,
        selectedDayOfWeek,
        activeSchedule,
        substitutions,
        activeSubstitutionsForSlot,
        classes,
        rooms
    ]);

    const mergeCandidates = useMemo(() => {
        if (!currentSubParams || !selectedDayOfWeek) return [];
        const possibleLessons = activeSchedule.filter(
            (s) =>
                s.day === selectedDayOfWeek &&
                s.period === currentSubParams.period &&
                s.shift === currentSubParams.shift &&
                s.classId !== currentSubParams.classId
        );
        const classMap = new Map<string, { classEntity: ClassEntity; teachers: string[]; subjects: string[] }>();
        possibleLessons.forEach((l) => {
            const cls = classes.find((c) => c.id === l.classId);
            const tch = teachers.find((t) => t.id === l.teacherId);
            const subj = subjects.find((s) => s.id === l.subjectId);
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
        if (!currentSubParams) return null;
        const s = activeSchedule.find((i) => i.id === currentSubParams.scheduleItemId);
        if (!s) return null;
        const c = classes.find((cls) => cls.id === s.classId);
        const sub = subjects.find((subj) => subj.id === s.subjectId);
        const t = teachers.find((tch) => tch.id === s.teacherId);
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
        return activeSchedule
            .filter(
                (s) =>
                    s.teacherId === modalContext.teacherId &&
                    s.day === selectedDayOfWeek &&
                    s.id !== currentSubParams?.scheduleItemId
            )
            .sort((a, b) => a.period - b.period);
    }, [activeSchedule, modalContext, selectedDayOfWeek, currentSubParams]);

    const manualSearchResults = useMemo(() => {
        if (!selectedDayOfWeek || manualLessonSearch.length < 2) return [];
        const searchLower = manualLessonSearch.toLowerCase();
        const foundTeachers = teachers.filter((t) => t.name.toLowerCase().includes(searchLower));
        const foundClasses = classes.filter((c) => c.name.toLowerCase().includes(searchLower));
        interface ManualSearchResult extends ScheduleItem {
            entityName: string;
            subInfo: string;
            subjectName: string;
        }
        const results: ManualSearchResult[] = [];
        foundTeachers.forEach((t) => {
            const lessons = activeSchedule.filter((s) => s.teacherId === t.id && s.day === selectedDayOfWeek);
            lessons.forEach((l) => {
                const c = classes.find((cls) => cls.id === l.classId);
                const subj = subjects.find((s) => s.id === l.subjectId);
                results.push({ ...l, entityName: t.name, subInfo: c?.name || '', subjectName: subj?.name || '' });
            });
        });
        foundClasses.forEach((c) => {
            const lessons = activeSchedule.filter((s) => s.classId === c.id && s.day === selectedDayOfWeek);
            lessons.forEach((l) => {
                if (results.find((r) => r.id === l.id)) return;
                const t = teachers.find((tch) => tch.id === l.teacherId);
                const subj = subjects.find((s) => s.id === l.subjectId);
                results.push({ ...l, entityName: c.name, subInfo: t?.name || '', subjectName: subj?.name || '' });
            });
        });
        return results.sort((a, b) => a.period - b.period);
    }, [manualLessonSearch, selectedDayOfWeek, teachers, classes, activeSchedule, subjects]);

    // Drag & Drop Handlers
    const handleDragStart = (e: React.DragEvent, teacherId: string) => {
        setDraggedTeacherId(teacherId);
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', teacherId); // Fallback
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
        setCandidateSearch(teachers.find((t) => t.id === draggedTeacherId)?.name || '');

        setDraggedTeacherId(null);
        setDragOverLessonId(null);
    };

    const handleCandidateClick = (teacherId: string, isBusy: boolean, isAbsent: boolean) => {
        if (isAbsent) {
            if (
                !window.confirm(
                    'ВНИМАНИЕ: Этот учитель отмечен как отсутствующий на этот день! Вы уверены, что хотите назначить его?'
                )
            )
                return;
        }

        let isMerger = false;
        if (isBusy) {
            if (!window.confirm('Этот учитель занят. Назначить ОБЪЕДИНЕНИЕ классов?')) return;
            isMerger = true;
        }
        assignSubstitution(teacherId, isMerger);
    };

    const toggleRefusal = (teacherId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setRefusedTeacherIds((prev) =>
            prev.includes(teacherId) ? prev.filter((id) => id !== teacherId) : [...prev, teacherId]
        );
    };

    return (
        <div className="h-full flex flex-col gap-6">
            {/* Top Bar with Actions */}
            <div className="flex flex-col gap-4">
                <div className="bg-white dark:bg-dark-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">
                                Дата замены
                            </label>
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-1.5 rounded-xl border border-slate-200 dark:border-slate-600">
                                <button
                                    onClick={() => changeDate(-1)}
                                    className="p-2 text-slate-500 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition-colors"
                                >
                                    <Icon name="ArrowRight" className="rotate-180" size={18} />
                                </button>
                                <div className="flex-1 flex items-center justify-center gap-2 font-bold text-slate-700 dark:text-slate-200 cursor-pointer relative group">
                                    <Icon name="Calendar" size={18} className="text-indigo-500" />
                                    <span>
                                        {getDateOrToday(selectedDate).toLocaleDateString('ru-RU', {
                                            day: 'numeric',
                                            month: 'long',
                                            weekday: 'short'
                                        })}
                                    </span>
                                    {/* Invisible date picker overlay */}
                                    <DateInput
                                        ref={dateInputRef}
                                        value={selectedDate}
                                        onChange={setSelectedDate}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    />
                                </div>
                                <button
                                    onClick={openCalendar}
                                    className="p-2 bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg hover:text-indigo-600 shadow-sm border border-slate-200 dark:border-slate-500"
                                    title="Открыть календарь"
                                >
                                    <Icon name="Calendar" size={16} />
                                </button>
                                <button
                                    onClick={() => setToday()}
                                    className="px-3 py-1.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                                >
                                    Сегодня
                                </button>
                                <button
                                    onClick={() => changeDate(1)}
                                    className="p-2 text-slate-500 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition-colors"
                                >
                                    <Icon name="ArrowRight" size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-auto">
                            <button
                                onClick={sendSummaryToTelegram}
                                disabled={isSendingSummary}
                                className="h-[48px] px-5 rounded-xl bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                {isSendingSummary ? (
                                    <Icon name="Loader" className="animate-spin" size={18} />
                                ) : (
                                    <Icon name="Send" size={18} />
                                )}{' '}
                                Telegram
                            </button>
                            <button
                                onClick={copyToClipboard}
                                className="h-[48px] px-5 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex items-center gap-2"
                            >
                                <Icon name="Copy" size={18} /> Копия
                            </button>
                            <button
                                onClick={() => setIsHistoryModalOpen(true)}
                                className="h-[48px] px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                            >
                                <Icon name="History" size={18} /> История
                            </button>
                        </div>
                    </div>
                    {/* Day-level comment for all substitutions */}
                    <div className="mt-4">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 block">
                            Общий комментарий ко всем заменам (опционально)
                        </label>
                        <textarea
                            value={dayComment}
                            onChange={(e) => setDayComment(e.target.value)}
                            className="w-full mt-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-1 ring-indigo-500"
                            rows={2}
                            placeholder='Например: "Замены связаны с педсоветом" — будет показано в отчёте и PNG.'
                        />
                    </div>
                </div>
            </div>

            {/* Vacation Banner */}
            {isVacationDate && (
                <div className="bg-gradient-to-r from-violet-500/10 via-amber-500/5 to-sky-500/10 dark:from-violet-900/30 dark:via-amber-900/10 dark:to-sky-900/30 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 flex items-center gap-4 animate-fade-in">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                        <Icon name="Sun" size={20} />
                    </div>
                    <div className="flex-1">
                        <p className="font-bold text-violet-800 dark:text-violet-200 text-sm">
                            🏖️ Выбранная дата приходится на период каникул
                        </p>
                        <p className="text-xs text-violet-600/80 dark:text-violet-300/80 mt-0.5">
                            Расписание уроков за этот месяц неактивно. Замены можно создавать вручную, но уроки из расписания не будут подтягиваться автоматически.
                        </p>
                    </div>
                </div>
            )}

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
                <div
                    className={`w-full md:w-80 flex-col gap-4 ${isMobile && mobileTab !== 'teachers' ? 'hidden' : 'flex'}`}
                >
                    <div className="bg-white dark:bg-dark-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex-1 overflow-hidden flex flex-col h-[600px] md:h-auto">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                            <Icon name="UserX" size={18} className="text-red-500" /> Отсутствующие
                        </h3>

                        <TeacherFilter
                            shiftFilter={teacherShiftFilter}
                            onShiftChange={setTeacherShiftFilter}
                            subjectFilter={teacherSubjectFilter}
                            onSubjectChange={setTeacherSubjectFilter}
                            subjects={subjects}
                            searchQuery={teacherSearch}
                            onSearchChange={setTeacherSearch}
                        />

                        <div className="flex-1 overflow-hidden pr-1">
                            {filteredTeachersList.length > 20 ? (
                                <VirtualList
                                    items={filteredTeachersList}
                                    itemHeight={92}
                                    containerHeight={400}
                                    renderItem={(t) => (
                                        <TeacherCard
                                            teacher={t}
                                            isAbsent={t.unavailableDates.includes(selectedDate)}
                                            absenceReason={t.absenceReasons ? t.absenceReasons[selectedDate] : ''}
                                            selectedDate={selectedDate}
                                            onOpenAbsenceModal={openAbsenceModal}
                                            onRemoveAbsence={removeAbsence}
                                            onDragStart={handleDragStart}
                                        />
                                    )}
                                />
                            ) : (
                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                                    {filteredTeachersList.map((t) => (
                                        <TeacherCard
                                            key={t.id}
                                            teacher={t}
                                            isAbsent={t.unavailableDates.includes(selectedDate)}
                                            absenceReason={t.absenceReasons ? t.absenceReasons[selectedDate] : ''}
                                            selectedDate={selectedDate}
                                            onOpenAbsenceModal={openAbsenceModal}
                                            onRemoveAbsence={removeAbsence}
                                            onDragStart={handleDragStart}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Lessons */}
                <div
                    className={`flex-1 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col overflow-hidden ${isMobile && mobileTab !== 'lessons' ? 'hidden' : 'flex'}`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                            <button
                                onClick={() => setActiveTab('pending')}
                                className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500'}`}
                            >
                                Требуют внимания{' '}
                                {pendingLessons.length > 0 && (
                                    <span className="ml-1 bg-red-500 text-white px-2 py-0.5 rounded-full text-xs">
                                        {pendingLessons.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('resolved')}
                                className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'resolved' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500'}`}
                            >
                                Назначенные{' '}
                                {resolvedLessons.length > 0 && (
                                    <span className="ml-1 bg-emerald-500 text-white px-2 py-0.5 rounded-full text-xs">
                                        {resolvedLessons.length}
                                    </span>
                                )}
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsCompactMode(!isCompactMode)}
                                className={`p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 ${isCompactMode ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-400'}`}
                                title="Компактный вид"
                            >
                                <Icon name={isCompactMode ? 'List' : 'Grid'} size={20} />
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="p-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 print:hidden"
                                title="Печать"
                            >
                                <Icon name="Printer" size={20} />
                            </button>
                            <button
                                onClick={() => {
                                    setManualLessonSearch('');
                                    setManualSearchModalOpen(true);
                                }}
                                className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100"
                            >
                                <Icon name="Search" size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                        {(activeTab === 'pending' ? pendingLessons : resolvedLessons).map((l) => (
                            <LessonCard
                                key={l.id}
                                lesson={l}
                                isResolved={activeTab === 'resolved'}
                                substitutions={substitutions}
                                selectedDate={selectedDate}
                                teachers={teachers}
                                subjects={subjects}
                                classes={classes}
                                rooms={rooms}
                                isCompactMode={isCompactMode}
                                draggedTeacherId={draggedTeacherId}
                                dragOverLessonId={dragOverLessonId}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onEdit={handleEditSubstitution}
                                onAssign={(params) => {
                                    setCurrentSubParams(params);
                                    setIsModalOpen(true);
                                }}
                                onRemove={removeSubstitution}
                                onTelegramClick={handleTelegramClick}
                            />
                        ))}
                        {(activeTab === 'pending' ? pendingLessons : resolvedLessons).length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <Icon
                                    name={activeTab === 'pending' ? 'CheckCircle' : 'List'}
                                    size={64}
                                    className="mb-4 text-slate-200 dark:text-slate-700"
                                />
                                <p className="text-lg font-medium">
                                    {activeTab === 'pending' ? 'Все уроки обработаны!' : 'Нет назначенных замен'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AssignmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                modalContext={modalContext}
                subMode={subMode}
                setSubMode={setSubMode}
                candidates={candidates}
                candidateSearch={candidateSearch}
                setCandidateSearch={setCandidateSearch}
                onViewSchedule={setViewScheduleTeacherId}
                onAssign={assignSubstitution}
                onToggleRefusal={toggleRefusal}
                refusedTeacherIds={refusedTeacherIds}
                handleCandidateClick={handleCandidateClick}
                mergeCandidates={mergeCandidates}
                onBatchClassMerge={handleBatchClassMerge}
                otherLessonsForTeacher={otherLessonsForTeacher}
                onSwapLessons={swapLessons}
                selectedRoomId={selectedRoomId}
                setSelectedRoomId={setSelectedRoomId}
                rooms={rooms}
                lessonAbsenceReason={lessonAbsenceReason}
                setLessonAbsenceReason={setLessonAbsenceReason}
                substitutionComment={substitutionComment}
                setSubstitutionComment={setSubstitutionComment}
                activeReplacementId={activeReplacementId}
                classes={classes}
            />

            <AbsenceModal
                isOpen={absenceModalOpen}
                onClose={() => setAbsenceModalOpen(false)}
                reason={absenceReason}
                onReasonChange={setAbsenceReason}
                onConfirm={confirmAbsence}
                onOpenBatch={openBatchActionModal}
            />

            <BatchActionModal
                isOpen={batchActionModalOpen}
                onClose={() => setBatchActionModalOpen(false)}
                selectedDate={selectedDate}
                batchActionType={batchActionType}
                onTypeChange={setBatchActionType}
                batchReplacementId={batchReplacementId}
                onReplacementChange={setBatchReplacementId}
                teachers={teachers}
                selectedTeacherId={selectedTeacherId}
                onConfirm={confirmBatchAction}
            />

            <ManualSearchModal
                isOpen={manualSearchModalOpen}
                onClose={() => setManualSearchModalOpen(false)}
                searchValue={manualLessonSearch}
                onSearchChange={setManualLessonSearch}
                results={manualSearchResults}
                rooms={rooms}
                selectedDate={selectedDate}
                onSelect={(item) => {
                    setManualSearchModalOpen(false);
                    setCurrentSubParams({
                        scheduleItemId: item.id,
                        subjectId: item.subjectId,
                        period: item.period,
                        shift: item.shift,
                        classId: item.classId,
                        teacherId: item.teacherId,
                        roomId: item.roomId,
                        day: item.day
                    });
                    setIsModalOpen(true);
                }}
            />

            {/* HISTORY MODAL (Improved) */}
            <Modal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                title="История замен"
                maxWidth="max-w-5xl"
            >
                <div className="space-y-4">
                    <div className="flex gap-4 p-1 bg-slate-50 dark:bg-slate-700 rounded-xl">
                        <div className="relative flex-1">
                            <Icon name="Search" className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                placeholder="Поиск по дате (YYYY-MM-DD) или имени..."
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border-none rounded-lg text-sm outline-none dark:text-white"
                            />
                        </div>
                        <div className="relative w-64">
                            <select
                                value={historyFilterTeacher}
                                onChange={(e) => setHistoryFilterTeacher(e.target.value)}
                                className="w-full py-2 px-3 bg-white dark:bg-slate-800 rounded-lg text-sm border-none outline-none cursor-pointer dark:text-white appearance-none"
                            >
                                <option value="">Все учителя</option>
                                {teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                            <Icon
                                name="Filter"
                                className="absolute right-3 top-2.5 text-slate-400 pointer-events-none"
                                size={14}
                            />
                        </div>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        Дата
                                    </th>
                                    <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        Урок
                                    </th>
                                    <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        Кого заменяют
                                    </th>
                                    <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        Кто заменяет
                                    </th>
                                    <th className="p-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">
                                        Тип
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-dark-800">
                                {substitutions
                                    .filter((s) => {
                                        if (
                                            historyFilterTeacher &&
                                            s.replacementTeacherId !== historyFilterTeacher &&
                                            s.originalTeacherId !== historyFilterTeacher
                                        )
                                            return false;
                                        if (historySearch) {
                                            const searchLower = historySearch.toLowerCase();
                                            const dateMatch = s.date.includes(searchLower);
                                            const orig = teachers
                                                .find((t) => t.id === s.originalTeacherId)
                                                ?.name?.toLowerCase()
                                                .includes(searchLower);
                                            const rep = teachers
                                                .find((t) => t.id === s.replacementTeacherId)
                                                ?.name?.toLowerCase()
                                                .includes(searchLower);
                                            return dateMatch || orig || rep;
                                        }
                                        return true;
                                    })
                                    .sort((a, b) => getDateOrToday(b.date).getTime() - getDateOrToday(a.date).getTime())
                                    .map((s) => {
                                        const orig = teachers.find((t) => t.id === s.originalTeacherId);
                                        const rep = teachers.find((t) => t.id === s.replacementTeacherId);
                                        const item = activeSchedule.find((i) => i.id === s.scheduleItemId) || {
                                            period: -1,
                                            classId: '?'
                                        };
                                        const cls = classes.find((c) => c.id === item.classId);

                                        return (
                                            <tr
                                                key={s.id}
                                                className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                                            >
                                                <td className="p-4 text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                    {formatDateEuropean(s.date)}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800 dark:text-white">
                                                            {item.period} урок
                                                        </span>
                                                        <span className="text-xs text-slate-500">
                                                            {cls?.name || '?'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500">
                                                            {orig?.name[0]}
                                                        </div>
                                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                            {orig?.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        {s.replacementTeacherId === 'cancelled' ? (
                                                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                                                                <Icon name="X" size={14} />
                                                            </div>
                                                        ) : s.replacementTeacherId === 'conducted' ? (
                                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500">
                                                                <Icon name="CheckCircle" size={14} />
                                                            </div>
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">
                                                                {rep?.name[0]}
                                                            </div>
                                                        )}
                                                        <span
                                                            className={`text-sm font-bold ${s.replacementTeacherId === 'cancelled' ? 'text-red-500' : 'text-slate-800 dark:text-white'}`}
                                                        >
                                                            {s.replacementTeacherId === 'cancelled'
                                                                ? 'Урок снят'
                                                                : s.replacementTeacherId === 'conducted'
                                                                  ? 'Проведен'
                                                                  : rep?.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    {s.isMerger ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                                            Объединение
                                                        </span>
                                                    ) : s.replacementTeacherId === 'cancelled' ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                            Отмена
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                                            Замена
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <TelegramChoiceModal
                isOpen={telegramChoiceOpen}
                onClose={() => setTelegramChoiceOpen(false)}
                onConfirm={confirmSendTelegram}
            />
            <QuickViewScheduleModal
                teacherId={viewScheduleTeacherId}
                onClose={() => setViewScheduleTeacherId(null)}
                activeSchedule={activeSchedule}
                selectedDayOfWeek={selectedDayOfWeek}
                classes={classes}
                subjects={subjects}
                rooms={rooms}
            />
        </div>
    );
};
