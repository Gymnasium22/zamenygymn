import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { LRUCache } from 'lru-cache';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { Modal, SearchableSelect, ContextMenu, useToast } from '../components/UI';
import { Shift, DayOfWeek, DAYS, SHIFT_PERIODS, ScheduleItem } from '../types';
import { generateId } from '../utils/helpers';
import useMedia from 'use-media';
import { useSearchParams } from 'react-router-dom';

interface SchedulePageProps {
    readOnly?: boolean;
    semester?: 1 | 2;
}

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    item: ScheduleItem | null;
    cell: { rowId: string; colKey: string | number } | null;
}

interface CellInfo {
    rowId: string;
    colKey: string | number;
}

export const SchedulePage = ({ readOnly: readOnlyProp = false, semester = 1 }: SchedulePageProps) => {
    const { subjects, teachers, classes, rooms, settings } = useStaticData();
    const readOnly = readOnlyProp || settings.isScheduleLocked;
    const { schedule1, schedule2, saveSemesterSchedule, canUndo, canRedo, undo, redo } = useScheduleData();
    const { addToast } = useToast();

    // Выбираем нужный массив данных в зависимости от пропса semester
    const schedule = semester === 2 ? schedule2 : schedule1;

    // Ref для предотвращения race condition при быстрых drag-and-drop / удалениях
    const scheduleRef = useRef(schedule);
    scheduleRef.current = schedule;

    // Ref для очистки drag-and-drop таймаута
    const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Вспомогательная функция для сохранения, которая знает о текущем семестре
    const saveCurrentSchedule = async (newScheduleData: ScheduleItem[]) => {
        await saveSemesterSchedule(semester, newScheduleData);
    };

    const [selectedShift, setSelectedShift] = useState(Shift.First);
    const [selectedDay, setSelectedDay] = useState<DayOfWeek>(DayOfWeek.Monday);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [tempItem, setTempItem] = useState<Partial<ScheduleItem>>({});
    const [viewMode, setViewMode] = useState<'class' | 'teacher' | 'subject' | 'week'>('class');
    const [filterId, setFilterId] = useState('');
    const [filterRoom, setFilterRoom] = useState('');
    const [filterDirection, setFilterDirection] = useState('');
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        item: null,
        cell: null
    });
    const [clipboard, setClipboard] = useState<ScheduleItem | null>(null);

    const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

    // Interactive Conflicts State
    const [conflictModalOpen, setConflictModalOpen] = useState(false);
    const [activeConflictDetails, setActiveConflictDetails] = useState<{
        item: ScheduleItem;
        conflicts: Array<{ type: string; description: string }>;
    } | null>(null);

    const [draggedItem, setDraggedItem] = useState<ScheduleItem | null>(null);
    const [dragOverCell, setDragOverCell] = useState<string | null>(null);

    const isMobile = useMedia({ maxWidth: 768 });
    const [mobileListView, setMobileListView] = useState(true);

    // --- Mobile Swipe Navigation for Days ---
    const swipeAreaRef = useRef<HTMLDivElement>(null);
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null);

    const goToNextDay = useCallback(() => {
        const currentIndex = DAYS.indexOf(selectedDay);
        if (currentIndex < DAYS.length - 1) {
            setSelectedDay(DAYS[currentIndex + 1]);
            if (navigator.vibrate) navigator.vibrate(10);
        }
    }, [selectedDay]);

    const goToPrevDay = useCallback(() => {
        const currentIndex = DAYS.indexOf(selectedDay);
        if (currentIndex > 0) {
            setSelectedDay(DAYS[currentIndex - 1]);
            if (navigator.vibrate) navigator.vibrate(10);
        }
    }, [selectedDay]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.touches[0].clientX - touchStartX.current;
        const dy = e.touches[0].clientY - touchStartY.current;
        // Only horizontal swipes
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
            setSwipeHint(dx > 0 ? 'right' : 'left');
        }
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        setSwipeHint(null);
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        // Threshold: 60px horizontal, less vertical
        if (Math.abs(dx) > 60 && Math.abs(dy) < 100) {
            if (dx > 0) {
                goToPrevDay();
            } else {
                goToNextDay();
            }
        }
        touchStartX.current = null;
        touchStartY.current = null;
    }, [goToNextDay, goToPrevDay]);

    const [isMassOperationsModalOpen, setIsMassOperationsModalOpen] = useState(false);
    const [massOpConfirm, setMassOpConfirm] = useState({ isOpen: false, type: '', day: '', classId: '' });

    // Conflict save confirmation modal
    const [saveConflictModalOpen, setSaveConflictModalOpen] = useState(false);
    const [saveConflictMessage, setSaveConflictMessage] = useState('');

    // State for Mass Ops Modal Selections
    const [massOpSelectedDay, setMassOpSelectedDay] = useState<string>(DayOfWeek.Monday);
    const [massOpSelectedClass, setMassOpSelectedClass] = useState<string>('');

    // --- NEW: URL Params Handling ---
    const [searchParams] = useSearchParams();

    useEffect(() => {
        const view = searchParams.get('view');
        const id = searchParams.get('id');
        const day = searchParams.get('day');
        const shift = searchParams.get('shift');

        if (view && ['class', 'teacher', 'subject', 'week'].includes(view)) {
            setViewMode(view as typeof viewMode);
            if (id) setFilterId(id);
            if (day && DAYS.includes(day as DayOfWeek)) {
                setSelectedDay(day as DayOfWeek);
            }
            if (shift) {
                if (shift === '1') setSelectedShift(Shift.First);
                if (shift === '2') setSelectedShift(Shift.Second);
            }
        }
    }, [searchParams]);
    // --------------------------------

    const currentPeriods = SHIFT_PERIODS[selectedShift];

    const rows = useMemo(() => {
        if (viewMode === 'week')
            return SHIFT_PERIODS[selectedShift].map((p) => ({ id: p.toString(), name: `${p} урок` }));
        if (viewMode === 'class')
            return filterId
                ? classes.filter((c) => c.id === filterId && c.shift === selectedShift)
                : classes.filter((c) => c.shift === selectedShift);
        if (viewMode === 'teacher') return filterId ? teachers.filter((t) => t.id === filterId) : teachers;
        if (viewMode === 'subject') return filterId ? subjects.filter((s) => s.id === filterId) : subjects;
        return [];
    }, [viewMode, filterId, classes, teachers, subjects, selectedShift]);


    // --- Оптимизированные Map'ы для O(1) доступа к сущностям ---
    const subjectsById = useMemo(() => {
        const map = new Map<string, typeof subjects[0]>();
        subjects.forEach((s) => map.set(s.id, s));
        return map;
    }, [subjects]);

    const teachersById = useMemo(() => {
        const map = new Map<string, typeof teachers[0]>();
        teachers.forEach((t) => map.set(t.id, t));
        return map;
    }, [teachers]);

    const classesById = useMemo(() => {
        const map = new Map<string, typeof classes[0]>();
        classes.forEach((c) => map.set(c.id, c));
        return map;
    }, [classes]);

    const roomsById = useMemo(() => {
        const map = new Map<string, typeof rooms[0]>();
        rooms.forEach((r) => map.set(r.id, r));
        return map;
    }, [rooms]);

    // Группировка расписания по слоту для быстрого поиска конфликтов
    const scheduleSlotMap = useMemo(() => {
        const map = new Map<string, ScheduleItem[]>();
        schedule.forEach((item) => {
            const key = `${item.day}_${item.period}_${item.shift}`;
            const arr = map.get(key) || [];
            arr.push(item);
            map.set(key, arr);
        });
        return map;
    }, [schedule]);

    // Стабильный кэш через useRef (не вызывает ререндеров при мутациях)
    const scheduleItemsCache = useRef(
        new LRUCache<string, ScheduleItem[]>({ max: 500 })
    );

    // Очищаем кеш при изменении расписания или фильтров
    useEffect(() => {
        scheduleItemsCache.current.clear();
    }, [schedule, viewMode, selectedShift, selectedDay, filterId, filterRoom, filterDirection]);

    const getScheduleItems = useCallback(
        (rowId: string, colKey: string | number): ScheduleItem[] => {
            const cacheKey = `${viewMode}-${rowId}-${colKey}-${selectedShift}-${selectedDay}-${filterId}-${filterRoom}-${filterDirection}`;
            const cache = scheduleItemsCache.current;

            if (cache.has(cacheKey)) {
                return cache.get(cacheKey)!;
            }

            let items: ScheduleItem[] = [];
            if (viewMode === 'week') {
                const period = parseInt(rowId);
                if (isNaN(period)) return [];
                const day = String(colKey);
                items = schedule.filter((s) => s.shift === selectedShift && s.period === period && s.day === day);
                if (filterId) items = items.filter((s) => s.classId === filterId);
            } else {
                const period = typeof colKey === 'string' ? parseInt(colKey) : colKey;
                if (isNaN(period)) return [];
                if (viewMode === 'class')
                    items = schedule.filter(
                        (s) =>
                            s.classId === rowId &&
                            s.period === period &&
                            s.day === selectedDay &&
                            s.shift === selectedShift
                    );
                if (viewMode === 'teacher')
                    items = schedule.filter(
                        (s) =>
                            s.teacherId === rowId &&
                            s.period === period &&
                            s.day === selectedDay &&
                            s.shift === selectedShift
                    );
                if (viewMode === 'subject')
                    items = schedule.filter(
                        (s) =>
                            s.subjectId === rowId &&
                            s.period === period &&
                            s.day === selectedDay &&
                            s.shift === selectedShift
                    );
            }

            if (filterRoom) {
                items = items.filter((s) => {
                    if (!s.roomId) return false;
                    const room = roomsById.get(s.roomId);
                    const roomName = room ? room.name : s.roomId;
                    return (roomName || '').toLowerCase().includes(filterRoom.toLowerCase());
                });
            }
            if (filterDirection)
                items = items.filter((s) => s.direction?.toLowerCase().includes(filterDirection.toLowerCase()));

            cache.set(cacheKey, items);
            return items;
        },
        [viewMode, schedule, selectedShift, selectedDay, filterId, filterRoom, filterDirection, roomsById]
    );

    const checkConflicts = useCallback(
        (item: ScheduleItem): string[] => {
            const conflicts: string[] = [];
            const key = `${item.day}_${item.period}_${item.shift}`;
            const slotItems = scheduleSlotMap.get(key) || [];
            const others = slotItems.filter((s) => s.id !== item.id);

            const teacherBusy = others.find((s) => s.teacherId === item.teacherId);
            if (teacherBusy) conflicts.push('teacher');

            const classBusy = others.find((s) => {
                if (s.classId !== item.classId) return false;
                if (s.direction && item.direction && s.direction !== item.direction) return false;
                return true;
            });
            if (classBusy) conflicts.push('class');

            if (item.roomId) {
                const roomBusy = others.find((s) => s.roomId === item.roomId);
                if (roomBusy) conflicts.push('room');
            }

            return conflicts;
        },
        [scheduleSlotMap]
    );

    // Ленивый кэш конфликтов (сбрасывается при изменении расписания)
    const conflictCacheRef = useRef(new Map<string, string[]>());
    useEffect(() => {
        conflictCacheRef.current.clear();
    }, [scheduleSlotMap]);

    const getConflicts = useCallback(
        (item: ScheduleItem) => {
            let cached = conflictCacheRef.current.get(item.id);
            if (!cached) {
                cached = checkConflicts(item);
                conflictCacheRef.current.set(item.id, cached);
            }
            return cached;
        },
        [checkConflicts]
    );

    const getDetailedConflicts = useCallback(
        (item: ScheduleItem) => {
            const detailed: Array<{ type: string; description: string }> = [];
            const key = `${item.day}_${item.period}_${item.shift}`;
            const slotItems = scheduleSlotMap.get(key) || [];
            const others = slotItems.filter((s) => s.id !== item.id);

            // Teacher Conflict
            const teacherBusy = others.filter((s) => s.teacherId === item.teacherId);
            teacherBusy.forEach((t) => {
                const cls = classesById.get(t.classId)?.name;
                const rm = roomsById.get(t.roomId || '')?.name || t.roomId;
                detailed.push({
                    type: 'Учитель',
                    description: `Ведет урок у ${cls} в каб. ${rm || '?'}`
                });
            });

            // Class Conflict
            const classBusy = others.filter((s) => {
                if (s.classId !== item.classId) return false;
                if (s.direction && item.direction && s.direction !== item.direction) return false;
                return true;
            });
            classBusy.forEach((c) => {
                const subj = subjectsById.get(c.subjectId)?.name;
                detailed.push({
                    type: 'Класс',
                    description: `Уже имеет урок "${subj}"`
                });
            });

            // Room Conflict
            if (item.roomId) {
                const roomBusy = others.filter((s) => s.roomId === item.roomId);
                roomBusy.forEach((r) => {
                    const teacher = teachersById.get(r.teacherId)?.name;
                    const cls = classesById.get(r.classId)?.name;
                    detailed.push({
                        type: 'Кабинет',
                        description: `Занят: ${cls}, ${teacher}`
                    });
                });
            }

            return detailed;
        },
        [scheduleSlotMap, classesById, roomsById, subjectsById, teachersById]
    );

    const handleConflictClick = (e: React.MouseEvent, item: ScheduleItem) => {
        e.stopPropagation();
        const details = getDetailedConflicts(item);
        setActiveConflictDetails({ item, conflicts: details });
        setConflictModalOpen(true);
    };

    const validateRoom = (classId: string, subjectId: string, roomId: string) => {
        const warnings: string[] = [];
        const cls = classesById.get(classId);
        const subj = subjectsById.get(subjectId);
        const room = roomsById.get(roomId);

        if (!room) return warnings;

        if (cls && (room.capacity || 0) < cls.studentsCount) {
            warnings.push(`⚠️ Мало мест! В классе ${cls.studentsCount} уч., а в кабинете только ${room.capacity}.`);
        }

        if (
            subj &&
            subj.requiredRoomType &&
            subj.requiredRoomType !== 'Обычный' &&
            room.type !== subj.requiredRoomType
        ) {
            warnings.push(`🚫 Не тот тип! Предмет требует "${subj.requiredRoomType}", а кабинет "${room.type}".`);
        }

        return warnings;
    };

    const updateValidation = (item: Partial<ScheduleItem>) => {
        if (!item.classId || !item.subjectId || !item.roomId) {
            setValidationWarnings([]);
            return;
        }
        const warns = validateRoom(item.classId, item.subjectId, item.roomId);
        setValidationWarnings(warns);
    };

    const handleEditItem = (item: ScheduleItem) => {
        if (readOnly) return;
        setTempItem(item);
        updateValidation(item);
        setIsEditorOpen(true);
    };
    const handleAddItem = (rowId: string, period: number, day: DayOfWeek = selectedDay) => {
        if (readOnly) return;
        const base: Partial<ScheduleItem> = { period, day, shift: selectedShift, id: generateId() };
        if (viewMode === 'class') base.classId = rowId;
        if (viewMode === 'teacher') base.teacherId = rowId;
        if (viewMode === 'subject') base.subjectId = rowId;
        if (viewMode === 'week') {
            base.period = parseInt(rowId);
            base.day = day;
            if (filterId && classesById.has(filterId)) base.classId = filterId;
        }
        setTempItem(base);
        setValidationWarnings([]);
        setIsEditorOpen(true);
    };
    const executeSaveItem = async () => {
        const currentSchedule = scheduleRef.current;
        const newSchedule = [...currentSchedule];
        const idx = newSchedule.findIndex((s) => s.id === tempItem.id);
        if (idx >= 0) newSchedule[idx] = tempItem as ScheduleItem;
        else newSchedule.push(tempItem as ScheduleItem);
        await saveCurrentSchedule(newSchedule);
        setIsEditorOpen(false);
        setSaveConflictModalOpen(false);
    };

    const handleSaveItem = async () => {
        if (!tempItem.subjectId || !tempItem.teacherId || !tempItem.classId) return;

        // Валидация данных перед сохранением
        const validationErrors: string[] = [];

        // Проверяем корректность периода для выбранной смены
        if (tempItem.period !== undefined) {
            const shiftKey = (tempItem.shift || selectedShift) as Shift;
            const validPeriods = SHIFT_PERIODS[shiftKey] || [];
            if (!validPeriods.includes(tempItem.period)) {
                validationErrors.push(`Период ${tempItem.period} недопустим для смены "${shiftKey}"`);
            }
        }

        // Проверяем существование связанных данных
        const teacher = teachersById.get(tempItem.teacherId || '');
        if (!teacher) validationErrors.push('Выбранный учитель не найден');

        const subject = subjectsById.get(tempItem.subjectId || '');
        if (!subject) validationErrors.push('Выбранный предмет не найден');

        const classItem = classesById.get(tempItem.classId || '');
        if (!classItem) validationErrors.push('Выбранный класс не найден');

        if (tempItem.roomId) {
            const room = roomsById.get(tempItem.roomId);
            if (!room) validationErrors.push('Выбранный кабинет не найден');
        }

        if (validationErrors.length > 0) {
            addToast({ type: 'danger', title: 'Ошибки валидации', message: validationErrors.join('\n') });
            return;
        }

        // Проверяем конфликты перед сохранением
        const conflicts = checkConflicts(tempItem as ScheduleItem);
        if (conflicts.length > 0) {
            const conflictNames = {
                teacher: 'Учитель',
                class: 'Класс',
                room: 'Кабинет'
            };
            const conflictMessages = conflicts
                .map((type) => conflictNames[type as keyof typeof conflictNames])
                .join(', ');

            setSaveConflictMessage(conflictMessages);
            setSaveConflictModalOpen(true);
            return;
        }

        await executeSaveItem();
    };
    const handleDeleteItem = async (id?: string) => {
        const currentSchedule = scheduleRef.current;
        const newSchedule = currentSchedule.filter((s) => s.id !== (id || tempItem.id));
        await saveCurrentSchedule(newSchedule);
        setIsEditorOpen(false);
    };

    const handleContextMenu = (e: React.MouseEvent, item: ScheduleItem | null, cellInfo: CellInfo | null) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, item, cell: cellInfo });
    };

    const handleDragStart = (e: React.DragEvent, item: ScheduleItem) => {
        if (readOnly) return;
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
        const el = e.currentTarget as HTMLElement;
        if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
        dragTimeoutRef.current = setTimeout(() => {
            dragTimeoutRef.current = null;
            el.classList.add('dragging');
        }, 0);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        if (dragTimeoutRef.current) {
            clearTimeout(dragTimeoutRef.current);
            dragTimeoutRef.current = null;
        }
        const el = e.currentTarget as HTMLElement;
        el.classList.remove('dragging');
        setDraggedItem(null);
        setDragOverCell(null);
    };

    const handleDragOver = (e: React.DragEvent, cellInfo: CellInfo) => {
        e.preventDefault();
        if (readOnly) return;
        setDragOverCell(`${cellInfo.rowId}-${cellInfo.colKey}`);
    };

    const handleDrop = async (e: React.DragEvent, cellInfo: CellInfo) => {
        e.preventDefault();
        if (!draggedItem || readOnly) return;

        const newItem = { ...draggedItem };

        if (viewMode === 'week') {
            newItem.period = parseInt(cellInfo.rowId);
            newItem.day = cellInfo.colKey as string;
        } else {
            newItem.period = cellInfo.colKey as number;
            newItem.day = selectedDay;
            if (viewMode === 'class') newItem.classId = cellInfo.rowId;
            if (viewMode === 'teacher') newItem.teacherId = cellInfo.rowId;
            if (viewMode === 'subject') newItem.subjectId = cellInfo.rowId;
        }

        // Check for conflicts before saving
        const currentSchedule = scheduleRef.current;
        const potentialSchedule = currentSchedule.map((s) => (s.id === newItem.id ? newItem : s));
        const conflicts = findScheduleConflicts(potentialSchedule, newItem);

        if (conflicts.length > 0) {
            const conflictMessages = conflicts.map((conflict) => {
                switch (conflict.type) {
                    case 'teacher':
                        return `Учитель ${conflict.entityName} уже занят в это время`;
                    case 'room':
                        return `Кабинет ${conflict.entityName} уже занят в это время`;
                    case 'class':
                        return `Класс ${conflict.entityName} уже имеет урок в это время`;
                    default:
                        return 'Обнаружен конфликт расписания';
                }
            });

            addToast({
                type: 'danger',
                title: 'Ошибка',
                message: `Невозможно переместить урок:\n${conflictMessages.join('\n')}`
            });
            setDraggedItem(null);
            setDragOverCell(null);
            return;
        }

        const newSchedule = potentialSchedule;
        await saveCurrentSchedule(newSchedule);
        setDraggedItem(null);
        setDragOverCell(null);
    };

    const findScheduleConflicts = (scheduleItems: ScheduleItem[], newItem: ScheduleItem) => {
        const conflicts: Array<{ type: 'teacher' | 'room' | 'class'; entityName: string }> = [];

        const conflictingItems = scheduleItems.filter(
            (item) =>
                item.id !== newItem.id &&
                item.day === newItem.day &&
                item.period === newItem.period &&
                item.shift === newItem.shift
        );

        const teacherConflict = conflictingItems.find((item) => item.teacherId === newItem.teacherId);
        if (teacherConflict) {
            conflicts.push({
                type: 'teacher',
                entityName: teachersById.get(newItem.teacherId)?.name || newItem.teacherId
            });
        }

        if (newItem.roomId) {
            const roomConflict = conflictingItems.find((item) => item.roomId === newItem.roomId);
            if (roomConflict) {
                conflicts.push({
                    type: 'room',
                    entityName: roomsById.get(newItem.roomId)?.name || newItem.roomId
                });
            }
        }

        const classConflict = conflictingItems.find((item) => {
            if (item.classId !== newItem.classId) return false;
            if (item.direction && newItem.direction && item.direction !== newItem.direction) return false;
            return true;
        });
        if (classConflict) {
            conflicts.push({
                type: 'class',
                entityName: classesById.get(newItem.classId)?.name || newItem.classId
            });
        }

        return conflicts;
    };

    const contextActions = [];
    if (contextMenu.item) {
        contextActions.push(
            { label: 'Копировать', icon: 'Copy', onClick: () => setClipboard(contextMenu.item) },
            {
                label: 'Удалить',
                icon: 'Trash2',
                color: 'text-red-600',
                onClick: () => handleDeleteItem(contextMenu.item!.id)
            }
        );
    } else if (contextMenu.cell) {
        // Capture cell in a const to guarantee strict null check safety within closures
        const cell = contextMenu.cell;
        if (clipboard) {
            contextActions.push({
                label: 'Вставить',
                icon: 'Clipboard',
                onClick: async () => {
                    const newItem = {
                        ...clipboard,
                        id: generateId(),
                        day: selectedDay,
                        shift: selectedShift,
                        period: cell.colKey
                    } as ScheduleItem;
                    if (viewMode === 'week') {
                        newItem.day = cell.colKey as string;
                        newItem.period = parseInt(cell.rowId);
                    }
                    if (viewMode === 'class') newItem.classId = cell.rowId;
                    else if (viewMode === 'teacher') newItem.teacherId = cell.rowId;
                    else if (viewMode === 'subject') newItem.subjectId = cell.rowId;

                    const newSchedule = [...schedule, newItem];
                    await saveCurrentSchedule(newSchedule);
                    setClipboard(null);
                }
            });
        }
        contextActions.push({
            label: 'Добавить урок',
            icon: 'Plus',
            onClick: () =>
                handleAddItem(
                    cell.rowId || '',
                    typeof cell.colKey === 'number' ? cell.colKey : parseInt(cell.rowId || '0'),
                    viewMode === 'week' ? (cell.colKey as DayOfWeek) : selectedDay
                )
        });
    }

    const recommendedTeachers = tempItem.subjectId
        ? teachers.filter((t) => t.subjectIds && t.subjectIds.includes(tempItem.subjectId!))
        : [];
    const otherTeachers = tempItem.subjectId
        ? teachers.filter((t) => !t.subjectIds || !t.subjectIds.includes(tempItem.subjectId!))
        : teachers;

    const printTitle = useMemo(() => {
        const semesterSuffix = semester === 2 ? ' (2-е полугодие)' : '';
        if (filterId) {
            if (viewMode === 'teacher') {
                const teacher = teachersById.get(filterId);
                return teacher ? teacher.name + semesterSuffix : 'Учитель' + semesterSuffix;
            }
            if (viewMode === 'class') {
                const classItem = classesById.get(filterId);
                return classItem ? classItem.name + semesterSuffix : 'Класс' + semesterSuffix;
            }
            if (viewMode === 'subject') {
                const subject = subjectsById.get(filterId);
                return subject ? subject.name + semesterSuffix : 'Предмет' + semesterSuffix;
            }
            if (viewMode === 'week') {
                const classItem = classesById.get(filterId);
                return classItem ? classItem.name + semesterSuffix : 'Неделя' + semesterSuffix;
            }
        }
        return `Расписание на ${selectedDay}` + semesterSuffix;
    }, [filterId, viewMode, teachersById, classesById, subjectsById, selectedDay, semester]);

    // --- PRINT LOGIC START ---
    const isWeeklyPrint = !!filterId;

    const printCols = useMemo(() => {
        if (isWeeklyPrint) return DAYS;
        return currentPeriods;
    }, [isWeeklyPrint, currentPeriods]);

    const printRows = useMemo(() => {
        if (isWeeklyPrint) return SHIFT_PERIODS[selectedShift].map((p) => ({ id: p.toString(), name: `${p} урок` }));
        return rows;
    }, [isWeeklyPrint, selectedShift, rows]);

    const getPrintItems = (rowId: string, colKey: string | number): ScheduleItem[] => {
        if (isWeeklyPrint) {
            const period = parseInt(rowId);
            const day = colKey as string;
            let items = schedule.filter((s) => s.shift === selectedShift && s.period === period && s.day === day);

            if (viewMode === 'class' || viewMode === 'week') items = items.filter((s) => s.classId === filterId);
            else if (viewMode === 'teacher') items = items.filter((s) => s.teacherId === filterId);
            else if (viewMode === 'subject') items = items.filter((s) => s.subjectId === filterId);

            return items;
        } else {
            return getScheduleItems(rowId, colKey);
        }
    };
    // --- PRINT LOGIC END ---

    const cols = viewMode === 'week' ? DAYS : currentPeriods;

    const handleMassClear = (type: string, day?: string, classId?: string) => {
        setMassOpConfirm({ isOpen: true, type, day: day || '', classId: classId || '' });
    };

    const confirmMassClear = async () => {
        let newSchedule = [...schedule];
        if (massOpConfirm.type === 'clearAll') {
            newSchedule = [];
        } else if (massOpConfirm.type === 'clearDay' && massOpConfirm.day) {
            newSchedule = newSchedule.filter((item) => item.day !== massOpConfirm.day);
        } else if (massOpConfirm.type === 'clearClass' && massOpConfirm.classId) {
            newSchedule = newSchedule.filter((item) => item.classId !== massOpConfirm.classId);
        }
        await saveCurrentSchedule(newSchedule);
        setMassOpConfirm({ isOpen: false, type: '', day: '', classId: '' });
        setIsMassOperationsModalOpen(false);
    };

    const renderScheduleItemsContent = (items: ScheduleItem[], colKey: string | number, rowId: string) => {
        if (readOnly && items.length === 0) return null;

        return (
            <div className="h-full flex flex-col gap-1">
                {items.map((item) => {
                    const subj = subjectsById.get(item.subjectId);
                    const teacher = teachersById.get(item.teacherId);
                    const cls = classesById.get(item.classId);
                    const conflicts = getConflicts(item);
                    const room = roomsById.get(item.roomId || '');
                    const roomName = room ? room.name : item.roomId;

                    return (
                        <div
                            key={item.id}
                            draggable={!readOnly}
                            onDragStart={!readOnly ? (e) => handleDragStart(e, item) : undefined}
                            onDragEnd={!readOnly ? handleDragEnd : undefined}
                            onClick={!readOnly ? () => handleEditItem(item) : undefined}
                            onContextMenu={!readOnly ? (e) => handleContextMenu(e, item, null) : undefined}
                            className={`rounded-lg p-2 text-xs shadow-sm ${!readOnly ? 'hover:shadow-md cursor-grab active:cursor-grabbing' : ''} border flex flex-col gap-0.5 flex-1 relative group transition-all ${conflicts.length > 0 ? 'border-red-300 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 conflict-glow-card' : 'border-slate-100 dark:border-slate-600'}`}
                            style={conflicts.length === 0 && subj?.color ? { backgroundColor: `${subj.color}40` } : {}}
                        >
                            <div className="flex justify-between items-center gap-1">
                                <span className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">
                                    {viewMode === 'subject' || viewMode === 'week' ? cls?.name : subj?.name}
                                </span>
                                {item.direction && (
                                    <span className="text-[9px] px-1 rounded bg-white/80 dark:bg-black/30 font-bold text-slate-600 dark:text-slate-300">
                                        {item.direction}
                                    </span>
                                )}
                            </div>
                            {viewMode === 'week' && (
                                <div className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">
                                    {subj?.name}
                                </div>
                            )}
                            <div className="flex justify-between items-center mt-auto">
                                <div
                                    className="text-slate-600 dark:text-slate-400 text-[10px] flex items-center gap-1 leading-tight overflow-hidden"
                                    title={teacher?.name}
                                >
                                    <Icon
                                        name={viewMode === 'teacher' ? 'GraduationCap' : 'User'}
                                        size={10}
                                        className="shrink-0"
                                    />
                                    <span className="truncate">
                                        {viewMode === 'teacher' ? cls?.name : teacher?.name}
                                    </span>
                                </div>
                                {roomName && (
                                    <div
                                        className="text-[9px] font-mono text-slate-400 bg-white/50 dark:bg-black/20 rounded px-1 flex items-center gap-0.5 shrink-0"
                                        title={room ? `Вмест: ${room.capacity}, Тип: ${room.type}` : ''}
                                    >
                                        {roomName}
                                    </div>
                                )}
                            </div>
                            {conflicts.length > 0 && (
                                <button
                                    onClick={(e) => handleConflictClick(e, item)}
                                    className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md shadow-red-500/25 hover:scale-110 active:scale-95 transition-all z-10 tactile-btn"
                                    title="Нажмите для деталей конфликта"
                                >
                                    !
                                </button>
                            )}
                        </div>
                    );
                })}
                {!readOnly && items.length < 3 && (
                    <button
                        onClick={() =>
                            handleAddItem(
                                rowId,
                                typeof colKey === 'number' ? colKey : parseInt(rowId),
                                viewMode === 'week' ? (colKey as DayOfWeek) : selectedDay
                            )
                        }
                        className="w-full rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:border-indigo-300 hover:text-indigo-400 transition-colors mt-auto h-6"
                    >
                        <Icon name="Plus" size={16} />
                    </button>
                )}
            </div>
        );
    };

    const renderMobileListView = () => {
        if (!filterId) {
            return (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                    Выберите класс, учителя или предмет для просмотра в списке.
                </div>
            );
        }

        const lessonsForDay = schedule
            .filter(
                (s) =>
                    s.day === selectedDay &&
                    s.shift === selectedShift &&
                    ((viewMode === 'class' && s.classId === filterId) ||
                        (viewMode === 'teacher' && s.teacherId === filterId) ||
                        (viewMode === 'subject' && s.subjectId === filterId))
            )
            .sort((a, b) => a.period - b.period);

        if (lessonsForDay.length === 0) {
            return (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                    Нет уроков на {selectedDay} в {selectedShift}.
                </div>
            );
        }

        return (
            <div className="p-4 space-y-3">
                {lessonsForDay.map((item) => {
                    const subj = subjectsById.get(item.subjectId);
                    const teacher = teachersById.get(item.teacherId);
                    const cls = classesById.get(item.classId);
                    const room = roomsById.get(item.roomId || '');
                    const roomName = room ? room.name : item.roomId;
                    const conflicts = getConflicts(item);
                    const subjectColor = subj?.color || '#6366f1';

                    return (
                        <div
                            key={item.id}
                            onClick={!readOnly ? () => handleEditItem(item) : undefined}
                            className={`rounded-2xl p-4 shadow-sm border mobile-card-lift ${conflicts.length > 0 ? 'border-red-300 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200' : 'border-slate-100 dark:border-slate-600 bg-white dark:bg-dark-800'} transition-colors ${!readOnly ? 'cursor-pointer' : ''}`}
                            style={{ borderLeftWidth: '4px', borderLeftColor: conflicts.length > 0 ? undefined : subjectColor }}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-sm font-black text-slate-700 dark:text-slate-200">
                                        {item.period}
                                    </span>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        урок
                                    </span>
                                </div>
                                {conflicts.length > 0 && (
                                    <button
                                        onClick={(e) => handleConflictClick(e, item)}
                                        className="bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-md shadow-red-500/25 active:scale-90 transition-transform"
                                    >
                                        <Icon name="AlertTriangle" size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="text-base font-black text-slate-800 dark:text-white mb-2 leading-tight">
                                {subj?.name} {item.direction && <span className="text-sm font-medium text-slate-500">({item.direction})</span>}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 px-2.5 py-1 rounded-lg">
                                    <Icon name={viewMode === 'teacher' ? 'GraduationCap' : 'User'} size={14} />
                                    <span className="font-medium">{viewMode === 'teacher' ? cls?.name : teacher?.name}</span>
                                </div>
                                {roomName && (
                                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-2.5 py-1 rounded-lg">
                                        <Icon name="MapPin" size={14} />
                                        <span className="font-medium">{roomName}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div
            ref={swipeAreaRef}
            className={`h-full flex flex-col ${isMobile && viewMode !== 'week' ? 'day-swipe-hint' : ''} ${swipeHint === 'left' ? 'show-left' : ''} ${swipeHint === 'right' ? 'show-right' : ''}`}
            onTouchStart={isMobile && viewMode !== 'week' ? handleTouchStart : undefined}
            onTouchMove={isMobile && viewMode !== 'week' ? handleTouchMove : undefined}
            onTouchEnd={isMobile && viewMode !== 'week' ? handleTouchEnd : undefined}
        >
            <div className="flex items-center gap-2 mb-4 px-4 pt-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                    {semester === 1 ? 'Расписание (1-е полугодие)' : 'Расписание (2-е полугодие)'}
                </h2>
            </div>

            {contextMenu.visible && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu({ ...contextMenu, visible: false })}
                    actions={contextActions}
                />
            )}
            <div className="bg-white dark:bg-dark-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between no-print">
                <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                        <button
                            onClick={() => setSelectedShift(Shift.First)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedShift === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                            1 смена
                        </button>
                        <button
                            onClick={() => setSelectedShift(Shift.Second)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedShift === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                            2 смена
                        </button>
                    </div>
                    {viewMode !== 'week' && (
                        <div className="flex items-center gap-2">
                            {/* Mobile swipe hint */}
                            {isMobile && (
                                <button
                                    onClick={goToPrevDay}
                                    disabled={DAYS.indexOf(selectedDay) === 0}
                                    className="md:hidden p-1.5 rounded-lg text-slate-400 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                    aria-label="Предыдущий день"
                                >
                                    <Icon name="ChevronLeft" size={18} />
                                </button>
                            )}
                            <div className="flex overflow-x-auto pb-1 gap-1 max-w-[40vw] hide-scrollbar">
                                {DAYS.map((day) => (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedDay(day)}
                                        className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedDay === day ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                            {isMobile && (
                                <button
                                    onClick={goToNextDay}
                                    disabled={DAYS.indexOf(selectedDay) === DAYS.length - 1}
                                    className="md:hidden p-1.5 rounded-lg text-slate-400 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                    aria-label="Следующий день"
                                >
                                    <Icon name="ChevronRight" size={18} />
                                </button>
                            )}
                        </div>
                    )}
                    {!readOnly && (
                        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                            <button
                                onClick={undo}
                                disabled={!canUndo}
                                className="p-2 text-slate-500 disabled:opacity-30 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition"
                            >
                                <Icon name="RotateCcw" size={18} />
                            </button>
                            <button
                                onClick={redo}
                                disabled={!canRedo}
                                className="p-2 text-slate-500 disabled:opacity-30 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition"
                            >
                                <Icon name="RotateCw" size={18} />
                            </button>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                        <button
                            onClick={() => {
                                setViewMode('class');
                                setFilterId('');
                            }}
                            className={`p-2 rounded-md ${viewMode === 'class' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`}
                            title="По классам"
                        >
                            <Icon name="GraduationCap" size={18} />
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('teacher');
                                setFilterId('');
                            }}
                            className={`p-2 rounded-md ${viewMode === 'teacher' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`}
                            title="По учителям"
                        >
                            <Icon name="Users" size={18} />
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('subject');
                                setFilterId('');
                            }}
                            className={`p-2 rounded-md ${viewMode === 'subject' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`}
                            title="По предметам"
                        >
                            <Icon name="BookOpen" size={18} />
                        </button>
                        <button
                            onClick={() => {
                                setViewMode('week');
                                setFilterId(classes[0]?.id || '');
                            }}
                            className={`p-2 rounded-md ${viewMode === 'week' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-400'}`}
                            title="Неделя"
                        >
                            <Icon name="Calendar" size={18} />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-1.5 pl-3 flex-1">
                        <Icon name="Filter" size={16} className="text-slate-400" />
                        <select
                            value={filterId}
                            onChange={(e) => setFilterId(e.target.value)}
                            className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none w-full xl:w-32"
                        >
                            <option value="">
                                Все{' '}
                                {viewMode === 'class'
                                    ? 'классы'
                                    : viewMode === 'teacher'
                                        ? 'учителя'
                                        : viewMode === 'week'
                                            ? 'классы (неделя)'
                                            : 'предметы'}
                            </option>
                            {(viewMode === 'class' || viewMode === 'week') &&
                                classes
                                    .filter((c) => c.shift === selectedShift)
                                    .map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                            {viewMode === 'teacher' &&
                                teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            {viewMode === 'subject' &&
                                subjects.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                        </select>
                    </div>
                    <input
                        placeholder="Каб..."
                        value={filterRoom}
                        onChange={(e) => setFilterRoom(e.target.value)}
                        className="w-24 sm:w-20 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-xs font-bold"
                    />
                    <input
                        placeholder="Проф..."
                        value={filterDirection}
                        onChange={(e) => setFilterDirection(e.target.value)}
                        className="w-24 sm:w-20 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-xs font-bold"
                    />

                    {!readOnly && (
                        <button
                            onClick={() => setIsMassOperationsModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-200 dark:shadow-none transition-all"
                        >
                            <Icon name="List" size={16} /> Масс. опер.
                        </button>
                    )}

                    {(filterId || viewMode === 'week') && (
                        <button
                            onClick={() => setIsPrintModalOpen(true)}
                            className="btn-primary btn-ripple text-sm flex items-center gap-2"
                        >
                            <Icon name="Printer" size={16} />
                        </button>
                    )}
                </div>
            </div>

            {isMobile && !readOnly && filterId && (
                <div className="flex justify-center mb-4 no-print">
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                        <button
                            onClick={() => setMobileListView(false)}
                            className={`flex-1 py-1 px-3 text-xs font-bold rounded-md ${!mobileListView ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                            title="Табличный вид"
                        >
                            <Icon name="Columns" size={16} />
                        </button>
                        <button
                            onClick={() => setMobileListView(true)}
                            className={`flex-1 py-1 px-3 text-xs font-bold rounded-md ${mobileListView ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                            title="Списочный вид"
                        >
                            <Icon name="Rows" size={16} />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 bg-white dark:bg-dark-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col transition-colors duration-300 no-print">
                <div className={`overflow-auto flex-1 custom-scrollbar ${isMobile ? 'mobile-table-scroll' : ''}`}>
                    {isMobile && (mobileListView || readOnly) && filterId ? (
                        renderMobileListView()
                    ) : (
                        <table className="w-full border-collapse min-w-[1000px]">
                            <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0 z-20">
                                <tr>
                                    <th className="p-4 border-b border-r border-slate-100 dark:border-slate-600 text-left text-xs font-extrabold text-slate-400 uppercase w-40 sticky left-0 bg-slate-50 dark:bg-slate-700 z-30">
                                        {viewMode === 'week'
                                            ? 'Урок'
                                            : viewMode === 'class'
                                                ? 'Класс'
                                                : viewMode === 'teacher'
                                                    ? 'Учитель'
                                                    : 'Предмет'}
                                    </th>
                                    {cols.map((col) => (
                                        <th
                                            key={col}
                                            className="p-4 border-b border-slate-100 dark:border-slate-600 text-center text-xs font-extrabold text-slate-400 uppercase min-w-[160px]"
                                        >
                                            {viewMode === 'week' ? col : `${col} урок`}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                {rows.length > 0 ? (
                                    rows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="p-4 border-r border-slate-100 dark:border-slate-600 font-black text-lg text-slate-700 dark:text-slate-200 sticky left-0 bg-white dark:bg-dark-800 z-10 text-left">
                                                {row.name}
                                            </td>
                                            {cols.map((colKey) => {
                                                const items = getScheduleItems(row.id, colKey);
                                                const cellId = `${row.id}-${colKey}`;
                                                const cellInfo: CellInfo = { rowId: row.id, colKey };
                                                return (
                                                    <td
                                                        key={colKey}
                                                        className={`p-2 border-r border-slate-50 dark:border-slate-700 h-28 align-top transition-colors ${dragOverCell === cellId ? 'drag-over' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                                                        onContextMenu={
                                                            !readOnly
                                                                ? (e) => handleContextMenu(e, null, cellInfo)
                                                                : undefined
                                                        }
                                                        onDragOver={
                                                            !readOnly ? (e) => handleDragOver(e, cellInfo) : undefined
                                                        }
                                                        onDrop={!readOnly ? (e) => handleDrop(e, cellInfo) : undefined}
                                                    >
                                                        {renderScheduleItemsContent(items, colKey, row.id)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-400 dark:text-slate-500">
                                            Нет данных для отображения
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <Modal
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                title={tempItem.id ? 'Редактирование урока' : 'Добавить урок'}
            >
                <div className="space-y-4">
                    {/* Top Info Bar */}
                    <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl flex items-center gap-4 text-sm font-bold text-slate-600 dark:text-slate-300">
                        <span>День: {tempItem.day}</span>
                        <span>Урок: {tempItem.period}</span>
                        <span>Смена: {tempItem.shift === Shift.First ? '1 смена' : '2 смена'}</span>
                    </div>

                    {validationWarnings.length > 0 && (
                        <div className="bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 p-3 rounded-lg text-sm border border-orange-100 dark:border-orange-900">
                            {validationWarnings.map((w) => (
                                <div key={w} className="flex items-center gap-2">
                                    <Icon name="AlertTriangle" size={14} />
                                    {w}
                                </div>
                            ))}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                            КЛАСС
                        </label>
                        <SearchableSelect
                            options={classes
                                .filter((c) => c.shift === selectedShift)
                                .map((c) => ({ value: c.id, label: c.name }))}
                            value={tempItem.classId || null}
                            onChange={(val) => {
                                setTempItem({ ...tempItem, classId: val as string });
                                updateValidation({ ...tempItem, classId: val as string });
                            }}
                            placeholder="Выберите класс"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                            ПРЕДМЕТ
                        </label>
                        <SearchableSelect
                            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
                            value={tempItem.subjectId || null}
                            onChange={(val) => {
                                setTempItem({ ...tempItem, subjectId: val as string });
                                updateValidation({ ...tempItem, subjectId: val as string });
                            }}
                            placeholder="Выберите предмет"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                            УЧИТЕЛЬ
                        </label>
                        <SearchableSelect
                            options={[
                                {
                                    label: 'Рекомендуемые',
                                    options: recommendedTeachers.map((t) => ({ value: t.id, label: t.name }))
                                },
                                {
                                    label: 'Остальные',
                                    options: otherTeachers.map((t) => ({ value: t.id, label: t.name }))
                                }
                            ]}
                            value={tempItem.teacherId || null}
                            onChange={(val) => setTempItem({ ...tempItem, teacherId: val as string })}
                            placeholder="Выберите учителя"
                            groupBy
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                            ГРУППА / НАПРАВЛЕНИЕ
                        </label>
                        <input
                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm outline-none bg-white dark:bg-slate-700 dark:text-white focus:border-indigo-500"
                            placeholder="Например: 1 гр. или Профиль"
                            value={tempItem.direction || ''}
                            onChange={(e) => setTempItem({ ...tempItem, direction: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                            КАБИНЕТ
                        </label>
                        <select
                            className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm outline-none bg-white dark:bg-slate-700 dark:text-white focus:border-indigo-500"
                            value={tempItem.roomId || ''}
                            onChange={(e) => {
                                setTempItem({ ...tempItem, roomId: e.target.value });
                                updateValidation({ ...tempItem, roomId: e.target.value });
                            }}
                        >
                            <option value="">Без кабинета</option>
                            {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name} ({r.capacity} мест)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        {tempItem.id && (
                            <button
                                onClick={() => handleDeleteItem()}
                                className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-bold text-sm"
                            >
                                Удалить
                            </button>
                        )}
                        <button onClick={handleSaveItem} className="btn-primary btn-ripple">
                            Сохранить
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Mass Operations Modal */}
            <Modal
                isOpen={isMassOperationsModalOpen}
                onClose={() => setIsMassOperationsModalOpen(false)}
                title="Массовые операции с расписанием"
            >
                <div className="space-y-6">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Внимание: Эти операции необратимы без использования функции "Отменить" сразу после действия.
                    </p>

                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white mb-1">Очистить всё расписание</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                            Удаляет все уроки из расписания (все дни, все смены, все классы).
                        </p>
                        <button
                            onClick={() => handleMassClear('clearAll')}
                            className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition text-sm"
                        >
                            Очистить полностью
                        </button>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white mb-1">Очистить расписание на день</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                            Удаляет все уроки для выбранного дня недели.
                        </p>
                        <div className="flex gap-2">
                            <select
                                value={massOpSelectedDay}
                                onChange={(e) => setMassOpSelectedDay(e.target.value)}
                                className="border border-slate-200 dark:border-slate-600 rounded-xl p-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none w-full"
                            >
                                {DAYS.map((day) => (
                                    <option key={day} value={day}>
                                        {day}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => handleMassClear('clearDay', massOpSelectedDay)}
                            className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition text-sm w-full sm:w-auto"
                        >
                            Очистить {massOpSelectedDay}
                        </button>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white mb-1">
                            Очистить расписание для класса
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                            Удаляет все уроки для выбранного класса.
                        </p>
                        <div className="flex gap-2">
                            <select
                                value={massOpSelectedClass}
                                onChange={(e) => setMassOpSelectedClass(e.target.value)}
                                className="border border-slate-200 dark:border-slate-600 rounded-xl p-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none w-full"
                            >
                                <option value="" disabled>
                                    Выберите класс
                                </option>
                                {classes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => {
                                if (massOpSelectedClass) handleMassClear('clearClass', undefined, massOpSelectedClass);
                            }}
                            disabled={!massOpSelectedClass}
                            className="mt-2 px-4 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Очистить для класса
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={massOpConfirm.isOpen}
                onClose={() => setMassOpConfirm({ ...massOpConfirm, isOpen: false })}
                title="Подтверждение"
            >
                <p className="mb-6 text-slate-600 dark:text-slate-300">
                    Вы уверены? Это действие нельзя будет отменить через историю изменений.
                </p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setMassOpConfirm({ ...massOpConfirm, isOpen: false })}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg font-bold text-slate-600 dark:text-slate-300"
                    >
                        Отмена
                    </button>
                    <button onClick={confirmMassClear} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold">
                        Подтвердить
                    </button>
                </div>
            </Modal>

            {/* Save Conflict Confirmation Modal */}
            <Modal isOpen={saveConflictModalOpen} onClose={() => setSaveConflictModalOpen(false)} title="Обнаружены конфликты">
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        ⚠️ Обнаружены конфликты: <span className="font-bold text-red-600">{saveConflictMessage}</span> уже заняты в это время.
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Все равно сохранить урок?
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setSaveConflictModalOpen(false)}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold hover:bg-slate-300 transition text-sm"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={executeSaveItem}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition text-sm"
                        >
                            Сохранить
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Conflict Details Modal */}
            <Modal isOpen={conflictModalOpen} onClose={() => setConflictModalOpen(false)} title="Детали конфликта">
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Следующие уроки пересекаются с выбранным элементом:
                    </p>
                    <div className="space-y-3">
                        {activeConflictDetails && activeConflictDetails.conflicts.length > 0 ? (
                            activeConflictDetails.conflicts.map((conflict, idx) => (
                                <div
                                    key={idx}
                                    className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-3"
                                >
                                    <Icon name="AlertTriangle" className="text-red-500 shrink-0 mt-0.5" size={18} />
                                    <div>
                                        <h4 className="font-bold text-red-700 dark:text-red-300 text-sm mb-1">
                                            {conflict.type}
                                        </h4>
                                        <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                                            {conflict.description}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-center text-slate-400 py-4">Нет конфликтов</p>
                        )}
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={() => setConflictModalOpen(false)}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold hover:bg-slate-300 transition text-sm"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Print Overlay */}
            {isPrintModalOpen && (
                <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50 no-print">
                        <h2 className="font-bold text-lg text-slate-800">Печать расписания</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() => window.print()}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700"
                            >
                                <Icon name="Printer" size={16} /> Печать
                            </button>
                            <button
                                onClick={() => setIsPrintModalOpen(false)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300"
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                        <div className="max-w-[1100px] mx-auto">
                            <div className="text-center mb-6">
                                <h1 className="text-2xl font-black text-slate-800 uppercase">{printTitle}</h1>
                                <p className="text-slate-500 font-bold">
                                    {new Date().toLocaleDateString('ru-RU', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </p>
                            </div>

                            <table className="w-full border-collapse border border-slate-300 text-xs">
                                <thead>
                                    <tr>
                                        <th className="border border-slate-300 p-2 bg-slate-100 w-24 font-bold text-slate-700">
                                            {isWeeklyPrint
                                                ? 'Урок'
                                                : viewMode === 'week'
                                                    ? 'Урок'
                                                    : viewMode === 'class'
                                                        ? 'Класс'
                                                        : viewMode === 'teacher'
                                                            ? 'Учитель'
                                                            : 'Предмет'}
                                        </th>
                                        {printCols.map((c) => (
                                            <th
                                                key={c}
                                                className="border border-slate-300 p-2 bg-slate-100 text-center font-bold text-slate-700"
                                            >
                                                {isWeeklyPrint ? c : viewMode === 'week' ? c : `${c} урок`}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {printRows.map((row) => (
                                        <tr key={row.id}>
                                            <td className="border border-slate-300 p-2 font-bold bg-slate-50 text-slate-800">
                                                {row.name}
                                            </td>
                                            {printCols.map((colKey) => {
                                                const items = getPrintItems(row.id, colKey);
                                                return (
                                                    <td
                                                        key={colKey}
                                                        className="border border-slate-300 p-1 align-top h-20 bg-white"
                                                    >
                                                        {items.map((item) => {
                                                            const subj = subjectsById.get(item.subjectId);
                                                            const teach = teachersById.get(item.teacherId);
                                                            const cls = classesById.get(item.classId);
                                                            const room = roomsById.get(item.roomId || '');
                                                            const roomName = room ? room.name : item.roomId;

                                                            const isTeacherView = viewMode === 'teacher';
                                                            const isWeeklyTeacher = isWeeklyPrint && isTeacherView;
                                                            const isSubjectOrWeek =
                                                                viewMode === 'subject' || viewMode === 'week';

                                                            const mainText =
                                                                isSubjectOrWeek || isWeeklyTeacher
                                                                    ? cls?.name
                                                                    : subj?.name;
                                                            const subText = isTeacherView ? cls?.name : teach?.name;

                                                            return (
                                                                <div key={item.id} className="mb-1">
                                                                    <div className="font-bold text-slate-900 text-[11px] leading-tight">
                                                                        {mainText}
                                                                        {item.direction && ` (${item.direction})`}
                                                                    </div>
                                                                    <div className="text-[9px] text-slate-600 flex justify-between items-center mt-0.5">
                                                                        <span>{subText}</span>
                                                                        {roomName && (
                                                                            <span className="border px-1 rounded bg-slate-50 border-slate-200">
                                                                                {roomName}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
