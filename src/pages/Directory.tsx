import React, { useMemo, useRef, useState } from 'react';
import { useScheduleData, useStaticData } from '../context/DataContext';
import { DateInput } from '../components/DateInput';
import { Icon } from '../components/Icons';
import { Modal, StaggerContainer, useToast } from '../components/UI';
import { Shift, ROOM_TYPES, Teacher, Subject, ClassEntity, Room } from '../types';
import { formatDateEuropean } from '../utils/helpers';
import { generateId } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { findEntityUsage, UsageKind, UsageLine } from '../utils/entityUsage';
import { parseDelimited, pick } from '../utils/csvImport';
import { offerUndo } from '../components/CloudSaveStatus';

type DirectoryTabId = 'teachers' | 'subjects' | 'classes' | 'rooms';
type SubjectAssignFilter = 'all' | 'assigned' | 'unassigned';
type ShiftQuickFilter = 'all' | 'first' | 'second' | 'none';

const normalizeFio = (name: string) =>
    name
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ');

/** Палитра цветов предметов (фон ячеек расписания + акценты) */
const SUBJECT_COLOR_PRESETS = [
    '#e0e7ff', // indigo-100
    '#dbeafe', // blue-100
    '#e0f2fe', // sky-100
    '#cffafe', // cyan-100
    '#d1fae5', // emerald-100
    '#dcfce7', // green-100
    '#fef9c3', // yellow-100
    '#fef3c7', // amber-100
    '#ffedd5', // orange-100
    '#fee2e2', // red-100
    '#fce7f3', // pink-100
    '#f3e8ff', // purple-100
    '#ede9fe', // violet-100
    '#c7d2fe', // indigo-200
    '#a5b4fc', // indigo-300
    '#c038ff', // vivid purple
    '#6366f1', // indigo-500
    '#0ea5e9', // sky-500
    '#10b981', // emerald-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#ec4899', // pink-500
    '#8b5cf6', // violet-500
    '#334155' // slate-700
];

const normalizeHex = (value: string) => value.trim().toLowerCase();

export const DirectoryPage = () => {
    const { subjects, teachers, classes, rooms, saveStaticData, isLoading, undo } = useStaticData();
    const { schedule1, schedule2, substitutions, dutySchedule } = useScheduleData();
    const { addToast } = useToast();
    const { hasPermission } = useAuth();
    const canEditDirectory = hasPermission('edit_directory');

    const [activeTab, setActiveTab] = useState<DirectoryTabId>('teachers');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState<'name' | 'parallel' | 'room'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [onlyDuplicateNames, setOnlyDuplicateNames] = useState(false);
    const [subjectAssignFilter, setSubjectAssignFilter] = useState<SubjectAssignFilter>('all');
    const [shiftQuickFilter, setShiftQuickFilter] = useState<ShiftQuickFilter>('all');
    const [usageModal, setUsageModal] = useState<{ id: string; kind: UsageKind; name: string; lines: UsageLine[] } | null>(
        null
    );
    const [importPreview, setImportPreview] = useState<{
        tab: DirectoryTabId;
        rows: Record<string, string>[];
        snapshot: unknown;
    } | null>(null);
    const [importRollback, setImportRollback] = useState<null | (() => Promise<void>)>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const [teacherForm, setTeacherForm] = useState<Partial<Teacher>>({});
    const [subjectForm, setSubjectForm] = useState<Partial<Subject>>({});
    const [classForm, setClassForm] = useState<Partial<ClassEntity>>({});
    const [roomForm, setRoomForm] = useState<Partial<Room>>({});

    const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

    const openModal = (id?: string) => {
        if (!canEditDirectory) return;
        setEditingId(id || null);
        if (activeTab === 'teachers') {
            setTeacherForm(
                id
                    ? (teachers.find((x) => x.id === id) ?? {})
                    : {
                          subjectIds: [],
                          unavailableDates: [],
                          shifts: [Shift.First, Shift.Second],
                          telegramChatId: ''
                      }
            );
        } else if (activeTab === 'subjects') {
            setSubjectForm(
                id
                    ? (subjects.find((x) => x.id === id) ?? {})
                    : { color: '#e0e7ff', difficulty: 5, requiredRoomType: 'Обычный' }
            );
        } else if (activeTab === 'classes') {
            setClassForm(
                id
                    ? (classes.find((x) => x.id === id) ?? {})
                    : { shift: Shift.First, studentsCount: 25, excludeFromReports: false }
            );
        } else if (activeTab === 'rooms') {
            setRoomForm(id ? (rooms.find((x) => x.id === id) ?? {}) : { capacity: 30, type: 'Обычный' });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!canEditDirectory) {
            addToast({ type: 'warning', title: 'Нет прав', message: 'Справочники открыты только для просмотра' });
            return;
        }
        const configMap = {
            teachers: { list: teachers, form: teacherForm, key: 'teachers' as const },
            subjects: { list: subjects, form: subjectForm, key: 'subjects' as const },
            classes: { list: classes, form: classForm, key: 'classes' as const },
            rooms: { list: rooms, form: roomForm, key: 'rooms' as const }
        };

        const activeConfig = configMap[activeTab];
        const { list, form, key } = activeConfig;

        if (!form.name) return;
        if (isLoading) {
            addToast({
                type: 'warning',
                title: 'Подождите',
                message: 'Данные ещё загружаются. Не сохраняйте справочник, пока не появятся все записи.'
            });
            return;
        }

        let newList: (Teacher | Subject | ClassEntity | Room)[] = [...list];
        if (editingId) {
            newList = newList.map((item) => (item.id === editingId ? { ...item, ...form } : item));
        } else {
            const maxOrder = list.reduce((max, item) => {
                const itemWithOrder = item as { order?: number };
                return Math.max(max, itemWithOrder.order || 0);
            }, 0);
            const newItem = { ...form, id: generateId(), order: maxOrder + 1 };
            newList.push(newItem as (typeof newList)[number]);
        }

        try {
            await saveStaticData({ [key]: newList });
            setIsModalOpen(false);
            addToast({ type: 'success', title: 'Сохранено' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка сохранения', message: 'Не удалось сохранить изменения в справочнике' });
        }
    };

    const usageBundle = {
        schedule: schedule1,
        schedule2,
        substitutions,
        dutySchedule,
        classes,
        subjects,
        teachers,
        rooms
    };

    const requestDelete = (id: string) => {
        if (!canEditDirectory) return;
        const kind: UsageKind =
            activeTab === 'teachers' ? 'teacher' : activeTab === 'classes' ? 'class' : activeTab === 'rooms' ? 'room' : 'subject';
        const name =
            (kind === 'teacher' ? teachers : kind === 'class' ? classes : kind === 'room' ? rooms : subjects).find(
                (x) => x.id === id
            )?.name || id;
        const lines = findEntityUsage(kind, id, usageBundle);
        setUsageModal({ id, kind, name, lines });
    };

    const confirmDelete = async () => {
        if (!usageModal) return;
        const { id } = usageModal;
        setUsageModal(null);
        try {
            switch (activeTab) {
                case 'teachers':
                    await saveStaticData({ teachers: teachers.filter((t) => t.id !== id) });
                    break;
                case 'subjects':
                    await saveStaticData({ subjects: subjects.filter((s) => s.id !== id) });
                    break;
                case 'classes':
                    await saveStaticData({ classes: classes.filter((c) => c.id !== id) });
                    break;
                case 'rooms':
                    await saveStaticData({ rooms: rooms.filter((r) => r.id !== id) });
                    break;
            }
            addToast({ type: 'success', title: 'Запись удалена' });
            offerUndo('Запись удалена из справочника', () => undo());
        } catch {
            addToast({ type: 'danger', title: 'Ошибка удаления', message: 'Не удалось удалить запись из справочника' });
        }
    };

    const handleDelete = (id: string) => requestDelete(id);

    const q = query.trim().toLowerCase();
    const cmpName = (a: string, b: string) =>
        a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' }) * (sortDir === 'asc' ? 1 : -1);
    const parallelOf = (name: string) => parseInt(name.replace(/[^\d]/g, ''), 10) || 0;

    const fioCounts = useMemo(() => {
        const map = new Map<string, number>();
        teachers.forEach((t) => {
            const key = normalizeFio(t.name);
            if (!key) return;
            map.set(key, (map.get(key) || 0) + 1);
        });
        return map;
    }, [teachers]);

    const duplicateFioCount = useMemo(
        () => teachers.filter((t) => (fioCounts.get(normalizeFio(t.name)) || 0) > 1).length,
        [teachers, fioCounts]
    );

    const visibleTeachers = useMemo(() => {
        let list = teachers.filter((t) => !q || t.name.toLowerCase().includes(q));
        if (onlyDuplicateNames) {
            list = list.filter((t) => (fioCounts.get(normalizeFio(t.name)) || 0) > 1);
        }
        if (subjectAssignFilter === 'assigned') {
            list = list.filter((t) => (t.subjectIds || []).length > 0);
        } else if (subjectAssignFilter === 'unassigned') {
            list = list.filter((t) => !(t.subjectIds || []).length);
        }
        if (shiftQuickFilter === 'first') {
            list = list.filter((t) => t.shifts.includes(Shift.First));
        } else if (shiftQuickFilter === 'second') {
            list = list.filter((t) => t.shifts.includes(Shift.Second));
        } else if (shiftQuickFilter === 'none') {
            list = list.filter((t) => !t.shifts.length);
        }
        list = [...list].sort((a, b) => {
            if (onlyDuplicateNames) {
                const byFio = normalizeFio(a.name).localeCompare(normalizeFio(b.name), 'ru');
                if (byFio) return byFio;
            }
            return cmpName(a.name, b.name);
        });
        return list;
    }, [teachers, q, sortDir, onlyDuplicateNames, subjectAssignFilter, shiftQuickFilter, fioCounts]);

    const teacherFiltersActive =
        onlyDuplicateNames || subjectAssignFilter !== 'all' || shiftQuickFilter !== 'all';

    const visibleClasses = useMemo(() => {
        let list = classes.filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.grade || '').includes(q));
        list = [...list].sort((a, b) => {
            if (sortKey === 'parallel') {
                const d = (parallelOf(a.name) - parallelOf(b.name)) * (sortDir === 'asc' ? 1 : -1);
                return d || cmpName(a.name, b.name);
            }
            return cmpName(a.name, b.name);
        });
        return list;
    }, [classes, q, sortKey, sortDir]);

    const visibleRooms = useMemo(() => {
        let list = rooms.filter(
            (r) => !q || r.name.toLowerCase().includes(q) || (r.type || '').toLowerCase().includes(q)
        );
        list = [...list].sort((a, b) => cmpName(a.name, b.name));
        return list;
    }, [rooms, q, sortDir]);

    const visibleSubjects = useMemo(() => {
        let list = subjects.filter((s) => !q || s.name.toLowerCase().includes(q));
        return [...list].sort((a, b) => cmpName(a.name, b.name));
    }, [subjects, q, sortDir]);

    const onPickImport = async (file: File) => {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith('.xlsx') || text.includes('PK')) {
            addToast({
                type: 'warning',
                title: 'Excel',
                message: 'Сохраните книгу как CSV (разделитель ; или ,) и загрузите снова.'
            });
            return;
        }
        const rows = parseDelimited(text);
        if (!rows.length) {
            addToast({ type: 'danger', title: 'Пустой файл', message: 'Нужна строка заголовков и хотя бы одна запись' });
            return;
        }
        const snapshot =
            activeTab === 'teachers'
                ? teachers
                : activeTab === 'subjects'
                  ? subjects
                  : activeTab === 'classes'
                    ? classes
                    : rooms;
        setImportPreview({ tab: activeTab, rows, snapshot });
    };

    const applyImport = async () => {
        if (!importPreview || !canEditDirectory) return;
        const { tab, rows, snapshot } = importPreview;
        try {
            if (tab === 'teachers') {
                let maxOrder = teachers.reduce((m, t) => Math.max(m, t.order || 0), 0);
                const extra: Teacher[] = rows.map((row) => ({
                    id: generateId(),
                    name: pick(row, ['фио', 'фамилия', 'name', 'учитель']),
                    subjectIds: [],
                    unavailableDates: [],
                    shifts: [Shift.First, Shift.Second],
                    order: ++maxOrder
                })).filter((t) => t.name);
                await saveStaticData({ teachers: [...teachers, ...extra] });
                addToast({ type: 'success', title: 'Импорт', message: `Добавлено учителей: ${extra.length}` });
            } else if (tab === 'classes') {
                let maxOrder = classes.reduce((m, t) => Math.max(m, t.order || 0), 0);
                const extra: ClassEntity[] = rows.map((row) => ({
                    id: generateId(),
                    name: pick(row, ['класс', 'name', 'название']),
                    shift: /2|ii|втор/i.test(pick(row, ['смена', 'shift'])) ? Shift.Second : Shift.First,
                    studentsCount: Number(pick(row, ['ученик', 'кол', 'count'])) || 25,
                    order: ++maxOrder
                })).filter((c) => c.name);
                await saveStaticData({ classes: [...classes, ...extra] });
                addToast({ type: 'success', title: 'Импорт', message: `Добавлено классов: ${extra.length}` });
            } else if (tab === 'rooms') {
                let maxOrder = rooms.reduce((m, t) => Math.max(m, t.order || 0), 0);
                const extra: Room[] = rows.map((row) => ({
                    id: generateId(),
                    name: pick(row, ['кабинет', 'name', 'номер']),
                    capacity: Number(pick(row, ['вмест', 'capacity'])) || 30,
                    type: pick(row, ['тип', 'type']) || 'Обычный',
                    order: ++maxOrder
                })).filter((r) => r.name);
                await saveStaticData({ rooms: [...rooms, ...extra] });
                addToast({ type: 'success', title: 'Импорт', message: `Добавлено кабинетов: ${extra.length}` });
            } else {
                let maxOrder = subjects.reduce((m, t) => Math.max(m, t.order || 0), 0);
                const extra: Subject[] = rows.map((row) => ({
                    id: generateId(),
                    name: pick(row, ['предмет', 'name', 'название']),
                    color: '#e0e7ff',
                    difficulty: 5,
                    requiredRoomType: 'Обычный',
                    order: ++maxOrder
                })).filter((s) => s.name);
                await saveStaticData({ subjects: [...subjects, ...extra] });
                addToast({ type: 'success', title: 'Импорт', message: `Добавлено предметов: ${extra.length}` });
            }
            setImportPreview(null);
            const snap = snapshot;
            const rollback = async () => {
                await saveStaticData({ [tab]: snap } as never);
            };
            setImportRollback(() => rollback);
            offerUndo('Импорт справочника', rollback);
        } catch {
            addToast({ type: 'danger', title: 'Импорт', message: 'Не удалось записать данные' });
        }
    };

    // Drag & Drop reorder
    const onDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIdx(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const byOrder = <T extends { order?: number; name?: string }>(items: T[]) =>
        [...items].sort(
            (a, b) =>
                (a.order ?? 1e9) - (b.order ?? 1e9) ||
                String(a.name || '').localeCompare(String(b.name || ''), 'ru', { sensitivity: 'base' })
        );

    const onDrop = async (_e: React.DragEvent, index: number) => {
        if (!canEditDirectory) return;
        if (draggedIdx === null || draggedIdx === index) return;

        const reorderWithUpdate = <T extends { order?: number }>(items: T[]) => {
            const newList = [...items];
            const [movedItem] = newList.splice(draggedIdx, 1);
            newList.splice(index, 0, movedItem);
            // 0,1,2… — валидные order (нельзя писать `order || null`)
            return newList.map((item, idx) => ({ ...item, order: idx }));
        };

        switch (activeTab) {
            case 'teachers': {
                await saveStaticData({ teachers: reorderWithUpdate(byOrder(teachers)) });
                break;
            }
            case 'subjects': {
                await saveStaticData({ subjects: reorderWithUpdate(byOrder(subjects)) });
                break;
            }
            case 'classes': {
                await saveStaticData({ classes: reorderWithUpdate(byOrder(classes)) });
                break;
            }
            case 'rooms': {
                await saveStaticData({ rooms: reorderWithUpdate(byOrder(rooms)) });
                break;
            }
        }

        setDraggedIdx(null);
    };

    return (
        <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 mb-4 sm:mb-8 shrink-0 min-w-0">
                <div className="flex p-1 bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-x-auto w-full max-w-full min-w-0 no-scrollbar mobile-h-scroll">
                    {[
                        { id: 'teachers', icon: 'Users', label: 'Учителя' },
                        { id: 'subjects', icon: 'BookOpen', label: 'Предметы' },
                        { id: 'classes', icon: 'GraduationCap', label: 'Классы' },
                        { id: 'rooms', icon: 'DoorOpen', label: 'Кабинеты' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as DirectoryTabId)}
                            className={`px-2.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1 sm:gap-2 transition-all shrink-0 whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                        >
                            <Icon name={tab.icon} size={15} className="shrink-0" />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
                {canEditDirectory && (
                    <button
                        onClick={() => openModal()}
                        className="btn-primary btn-touch flex items-center justify-center gap-2 px-4 py-2.5 text-sm w-full sm:w-auto shrink-0"
                    >
                        <Icon name="Plus" size={18} className="shrink-0" /> Добавить
                    </button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                        activeTab === 'teachers'
                            ? 'Поиск по фамилии…'
                            : activeTab === 'classes'
                              ? 'Поиск по классу / параллели…'
                              : activeTab === 'rooms'
                                ? 'Поиск по кабинету…'
                                : 'Поиск…'
                    }
                    className="flex-1 min-w-[12rem] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
                <select
                    value={`${sortKey}:${sortDir}`}
                    onChange={(e) => {
                        const [k, d] = e.target.value.split(':') as ['name' | 'parallel' | 'room', 'asc' | 'desc'];
                        setSortKey(k);
                        setSortDir(d);
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                    <option value="name:asc">А → Я</option>
                    <option value="name:desc">Я → А</option>
                    {activeTab === 'classes' && <option value="parallel:asc">Параллель 1→11</option>}
                    {activeTab === 'classes' && <option value="parallel:desc">Параллель 11→1</option>}
                    {activeTab === 'rooms' && <option value="name:asc">Кабинет А→Я</option>}
                </select>
                {canEditDirectory && (
                    <>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,.txt,.tsv"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) onPickImport(f);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold"
                        >
                            Импорт CSV
                        </button>
                        {importRollback && (
                            <button
                                type="button"
                                onClick={async () => {
                                    await importRollback();
                                    setImportRollback(null);
                                    addToast({ type: 'info', title: 'Импорт отменён' });
                                }}
                                className="px-3 py-2 rounded-xl text-sm font-semibold text-amber-700 bg-amber-50"
                            >
                                Откатить импорт
                            </button>
                        )}
                    </>
                )}
            </div>
            {activeTab === 'teachers' && teachers.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    {(
                        [
                            {
                                id: 'dupes',
                                label: 'Одинаковые ФИО',
                                active: onlyDuplicateNames,
                                count: duplicateFioCount,
                                onClick: () => setOnlyDuplicateNames((v) => !v)
                            },
                            {
                                id: 'assigned',
                                label: 'С предметом',
                                active: subjectAssignFilter === 'assigned',
                                count: teachers.filter((t) => (t.subjectIds || []).length > 0).length,
                                onClick: () =>
                                    setSubjectAssignFilter((v) => (v === 'assigned' ? 'all' : 'assigned'))
                            },
                            {
                                id: 'unassigned',
                                label: 'Без предмета',
                                active: subjectAssignFilter === 'unassigned',
                                count: teachers.filter((t) => !(t.subjectIds || []).length).length,
                                onClick: () =>
                                    setSubjectAssignFilter((v) => (v === 'unassigned' ? 'all' : 'unassigned'))
                            },
                            {
                                id: 's1',
                                label: '1 смена',
                                active: shiftQuickFilter === 'first',
                                count: teachers.filter((t) => t.shifts.includes(Shift.First)).length,
                                onClick: () => setShiftQuickFilter((v) => (v === 'first' ? 'all' : 'first'))
                            },
                            {
                                id: 's2',
                                label: '2 смена',
                                active: shiftQuickFilter === 'second',
                                count: teachers.filter((t) => t.shifts.includes(Shift.Second)).length,
                                onClick: () => setShiftQuickFilter((v) => (v === 'second' ? 'all' : 'second'))
                            },
                            {
                                id: 'noshift',
                                label: 'Без смены',
                                active: shiftQuickFilter === 'none',
                                count: teachers.filter((t) => !t.shifts.length).length,
                                onClick: () => setShiftQuickFilter((v) => (v === 'none' ? 'all' : 'none'))
                            }
                        ] as const
                    ).map((chip) => (
                        <button
                            key={chip.id}
                            type="button"
                            onClick={chip.onClick}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                                chip.active
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                            }`}
                        >
                            {chip.label}
                            <span
                                className={`min-w-[1.25rem] text-center rounded-full px-1.5 py-0.5 text-[10px] ${
                                    chip.active
                                        ? 'bg-white/20 text-white'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                }`}
                            >
                                {chip.count}
                            </span>
                        </button>
                    ))}
                    <span className="text-xs text-slate-400 ml-auto">
                        Показано {visibleTeachers.length} из {teachers.length}
                    </span>
                    {teacherFiltersActive && (
                        <button
                            type="button"
                            onClick={() => {
                                setOnlyDuplicateNames(false);
                                setSubjectAssignFilter('all');
                                setShiftQuickFilter('all');
                            }}
                            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                            Сбросить фильтры
                        </button>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar pr-2">
                {activeTab === 'teachers' && (
                    teachers.length === 0 ? (
                        <div className="app-mobile-empty modern-card">
                            <Icon name="Users" size={32} className="text-indigo-400" />
                            <p className="font-bold text-slate-800 dark:text-white text-base">Нет учителей</p>
                            <p className="text-sm max-w-xs">
                                {canEditDirectory
                                    ? 'Добавьте первого учителя кнопкой «Добавить»'
                                    : 'Справочник пуст — обратитесь к администратору'}
                            </p>
                            {canEditDirectory && (
                                <button type="button" onClick={() => openModal()} className="btn-primary mt-2 px-4 py-2 text-sm font-bold">
                                    <Icon name="Plus" size={16} className="inline mr-1" /> Добавить
                                </button>
                            )}
                        </div>
                    ) : visibleTeachers.length === 0 ? (
                        <div className="app-mobile-empty modern-card">
                            <Icon name="Search" size={32} className="text-slate-400" />
                            <p className="font-bold text-slate-800 dark:text-white text-base">Никого не найдено</p>
                            <p className="text-sm max-w-xs text-slate-500">
                                Измените поиск или сбросьте фильтры — в справочнике {teachers.length} учителей.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery('');
                                    setOnlyDuplicateNames(false);
                                    setSubjectAssignFilter('all');
                                    setShiftQuickFilter('all');
                                }}
                                className="btn-primary mt-2 px-4 py-2 text-sm font-bold"
                            >
                                Сбросить
                            </button>
                        </div>
                    ) : (
                    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {visibleTeachers.map((t) => {
                            const dupeN = fioCounts.get(normalizeFio(t.name)) || 0;
                            const isDupe = dupeN > 1;
                            const hasSubject = (t.subjectIds || []).length > 0;
                            return (
                            <div
                                key={t.id}
                                className={`modern-card p-4 group flex flex-col ${
                                    isDupe ? 'ring-2 ring-amber-400/80 border-amber-200 dark:border-amber-700' : ''
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2 gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="font-bold text-slate-800 dark:text-slate-100 text-lg truncate">
                                            {t.name}
                                        </div>
                                        {isDupe && (
                                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                                совпадение ×{dupeN}
                                            </span>
                                        )}
                                    </div>
                                    {canEditDirectory && (
                                    <div className="flex gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openModal(t.id)}
                                            className="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 bg-slate-50 dark:bg-slate-700 rounded-full"
                                            aria-label="Редактировать"
                                        >
                                            <Icon name="Edit2" size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(t.id)}
                                            className="p-2 text-slate-600 dark:text-slate-300 hover:text-red-600 bg-slate-50 dark:bg-slate-700 rounded-full"
                                            aria-label="Удалить"
                                        >
                                            <Icon name="Trash2" size={16} />
                                        </button>
                                    </div>
                                    )}
                                </div>
                                <div className="text-xs text-slate-500 mb-2">
                                    {t.birthDate ? `ДР: ${formatDateEuropean(t.birthDate)}` : ''}
                                </div>
                                <div className="flex gap-2 mb-3">
                                    {t.shifts.includes(Shift.First) && (
                                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">
                                            1 см
                                        </span>
                                    )}
                                    {t.shifts.includes(Shift.Second) && (
                                        <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold">
                                            2 см
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-auto">
                                    {hasSubject ? (
                                        t.subjectIds.map((sid) => {
                                        const s = subjects.find((sub) => sub.id === sid);
                                        return s ? (
                                            <span
                                                key={sid}
                                                className="text-xs px-2 py-1 rounded-md font-medium"
                                                style={{ backgroundColor: s.color, color: '#334155' }}
                                            >
                                                {s.name}
                                            </span>
                                        ) : null;
                                        })
                                    ) : (
                                        <span className="text-xs px-2 py-1 rounded-md font-medium bg-slate-100 dark:bg-slate-700 text-slate-400">
                                            Предмет не назначен
                                        </span>
                                    )}
                                </div>
                            </div>
                            );
                        })}
                    </StaggerContainer>
                    )
                )}

                {activeTab === 'subjects' && (
                    subjects.length === 0 ? (
                        <div className="app-mobile-empty modern-card">
                            <Icon name="BookOpen" size={32} className="text-indigo-400" />
                            <p className="font-bold text-slate-800 dark:text-white text-base">Нет предметов</p>
                            <p className="text-sm max-w-xs">
                                {canEditDirectory ? 'Добавьте предмет кнопкой «Добавить»' : 'Справочник пуст'}
                            </p>
                        </div>
                    ) : (
                    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {(q ? visibleSubjects : byOrder(subjects)).map((s, i) => (
                            <div
                                key={s.id}
                                draggable={canEditDirectory}
                                onDragStart={canEditDirectory ? (e) => onDragStart(e, i) : undefined}
                                onDragOver={canEditDirectory ? onDragOver : undefined}
                                onDrop={canEditDirectory ? (e) => onDrop(e, i) : undefined}
                                className={`modern-card p-4 flex items-center justify-between group border-l-4 ${canEditDirectory ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                style={{ borderLeftColor: s.color || '#e0e7ff' }}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Icon
                                        name="GripVertical"
                                        className="text-slate-300 dark:text-slate-600 shrink-0 hidden sm:block"
                                        size={16}
                                    />
                                    <span
                                        className="w-4 h-4 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/15 shadow-sm"
                                        style={{ backgroundColor: s.color || '#e0e7ff' }}
                                        title={s.color}
                                        aria-hidden
                                    />
                                    <div className="min-w-0">
                                        <div className="font-bold text-slate-700 dark:text-slate-200 truncate">{s.name}</div>
                                        <div className="text-xs text-slate-400">
                                            Сложность {s.difficulty} • {s.requiredRoomType}
                                        </div>
                                    </div>
                                </div>
                                {canEditDirectory && (
                                <div className="flex gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openModal(s.id)}
                                        className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                                        aria-label="Редактировать"
                                    >
                                        <Icon name="Edit2" size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(s.id)}
                                        className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-red-600"
                                        aria-label="Удалить"
                                    >
                                        <Icon name="Trash2" size={16} />
                                    </button>
                                </div>
                                )}
                            </div>
                        ))}
                    </StaggerContainer>
                    )
                )}

                {activeTab === 'classes' && (
                    classes.length === 0 ? (
                        <div className="app-mobile-empty modern-card">
                            <Icon name="GraduationCap" size={32} className="text-indigo-400" />
                            <p className="font-bold text-slate-800 dark:text-white text-base">Нет классов</p>
                            <p className="text-sm">{canEditDirectory ? 'Добавьте класс кнопкой «Добавить»' : 'Справочник пуст'}</p>
                        </div>
                    ) : (
                    <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {(q || sortKey === 'parallel' ? visibleClasses : byOrder(classes)).map((c, i) => (
                            <div
                                key={c.id}
                                draggable={canEditDirectory}
                                onDragStart={canEditDirectory ? (e) => onDragStart(e, i) : undefined}
                                onDragOver={canEditDirectory ? onDragOver : undefined}
                                onDrop={canEditDirectory ? (e) => onDrop(e, i) : undefined}
                                className={`modern-card p-4 border ${
                                    c.excludeFromReports
                                        ? 'border-dashed border-slate-300 bg-slate-50'
                                        : 'border-slate-100'
                                } dark:border-slate-700 text-center group transition-all relative ${canEditDirectory ? 'cursor-grab active:cursor-grabbing' : ''}`}
                            >
                                <div className="absolute left-2 top-2 text-slate-300 dark:text-slate-600">
                                    <Icon name="GripVertical" size={14} />
                                </div>
                                <div
                                    className={`text-2xl font-black ${
                                        c.excludeFromReports ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100'
                                    } mb-1`}
                                >
                                    {c.name}
                                </div>
                                <div className="text-xs text-slate-500 mb-1">{c.studentsCount || 0} учеников</div>
                                <div
                                    className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${
                                        c.shift === Shift.First
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'bg-orange-50 text-orange-600'
                                    }`}
                                >
                                    {c.shift === Shift.First ? 'I' : 'II'} смена
                                </div>
                                {c.excludeFromReports && (
                                    <div className="mt-2 text-[10px] text-slate-400 font-bold uppercase border border-slate-200 rounded px-1 inline-block">
                                        Исключен
                                    </div>
                                )}
                                {canEditDirectory && (
                                <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openModal(c.id)}
                                        className="p-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                                        aria-label="Редактировать"
                                    >
                                        <Icon name="Edit2" size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(c.id)}
                                        className="p-1 text-slate-600 dark:text-slate-300 hover:text-red-600"
                                        aria-label="Удалить"
                                    >
                                        <Icon name="Trash2" size={14} />
                                    </button>
                                </div>
                                )}
                            </div>
                        ))}
                    </StaggerContainer>
                    )
                )}

                {activeTab === 'rooms' && (
                    rooms.length === 0 ? (
                        <div className="app-mobile-empty modern-card">
                            <Icon name="DoorOpen" size={32} className="text-indigo-400" />
                            <p className="font-bold text-slate-800 dark:text-white text-base">Нет кабинетов</p>
                            <p className="text-sm">{canEditDirectory ? 'Добавьте кабинет кнопкой «Добавить»' : 'Справочник пуст'}</p>
                        </div>
                    ) : (
                    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {(q ? visibleRooms : byOrder(rooms)).map((r, i) => (
                            <div
                                key={r.id}
                                draggable={canEditDirectory}
                                onDragStart={canEditDirectory ? (e) => onDragStart(e, i) : undefined}
                                onDragOver={canEditDirectory ? onDragOver : undefined}
                                onDrop={canEditDirectory ? (e) => onDrop(e, i) : undefined}
                                className={`modern-card p-4 flex items-center justify-between group border-l-4 ${
                                    canEditDirectory ? 'cursor-grab active:cursor-grabbing' : ''
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon
                                        name="GripVertical"
                                        className="text-slate-300 dark:text-slate-600"
                                        size={16}
                                    />
                                    <div className="bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600">
                                        <Icon name="DoorOpen" size={20} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-700 dark:text-slate-200">{r.name}</div>
                                        <div className="text-xs text-slate-400">
                                            Вмест: {r.capacity} • {r.type}
                                        </div>
                                    </div>
                                </div>
                                {canEditDirectory && (
                                    <div className="flex gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openModal(r.id)}
                                        className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600"
                                        aria-label="Редактировать"
                                    >
                                        <Icon name="Edit2" size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(r.id)}
                                        className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-red-600"
                                        aria-label="Удалить"
                                    >
                                        <Icon name="Trash2" size={16} />
                                    </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </StaggerContainer>
                    )
                )}
            </div>

            {/* Standard Modal for Forms — footer keeps Save visible on short viewports */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingId ? 'Редактировать' : 'Добавить'}
                footer={
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleSave}
                            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold shadow-lg shadow-indigo-200 dark:shadow-none min-h-[44px]"
                        >
                            Сохранить
                        </button>
                    </div>
                }
            >
                <div className="space-y-4">
                    {activeTab === 'teachers' && (
                        <>
                            <input
                                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                placeholder="ФИО Учителя"
                                value={teacherForm.name || ''}
                                onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                            />
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Дата рождения
                                </label>
                                <DateInput
                                    value={teacherForm.birthDate || ''}
                                    onChange={(value) => setTeacherForm({ ...teacherForm, birthDate: value })}
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Telegram Chat ID
                                </label>
                                <input
                                    type="text"
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                    value={teacherForm.telegramChatId || ''}
                                    onChange={(e) => setTeacherForm({ ...teacherForm, telegramChatId: e.target.value })}
                                    placeholder="12345678"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                                    Смены
                                </div>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                            checked={teacherForm.shifts?.includes(Shift.First)}
                                            onChange={() => {
                                                const current = teacherForm.shifts || [];
                                                setTeacherForm({
                                                    ...teacherForm,
                                                    shifts: current.includes(Shift.First)
                                                        ? current.filter((s) => s !== Shift.First)
                                                        : [...current, Shift.First]
                                                });
                                            }}
                                        />
                                        <span className="text-sm font-medium dark:text-slate-300">1 смена</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="rounded text-purple-600 focus:ring-purple-500"
                                            checked={teacherForm.shifts?.includes(Shift.Second)}
                                            onChange={() => {
                                                const current = teacherForm.shifts || [];
                                                setTeacherForm({
                                                    ...teacherForm,
                                                    shifts: current.includes(Shift.Second)
                                                        ? current.filter((s) => s !== Shift.Second)
                                                        : [...current, Shift.Second]
                                                });
                                            }}
                                        />
                                        <span className="text-sm font-medium dark:text-slate-300">2 смена</span>
                                    </label>
                                </div>
                            </div>

                            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mt-2">
                                Предметы
                            </div>
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar border border-slate-100 dark:border-slate-700 p-2 rounded-xl">
                                {subjects.map((s) => (
                                    <label
                                        key={s.id}
                                        className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                            checked={teacherForm.subjectIds?.includes(s.id)}
                                            onChange={(e) => {
                                                const current = teacherForm.subjectIds || [];
                                                setTeacherForm({
                                                    ...teacherForm,
                                                    subjectIds: e.target.checked
                                                        ? [...current, s.id]
                                                        : current.filter((x: string) => x !== s.id)
                                                });
                                            }}
                                        />
                                        <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10"
                                            style={{ backgroundColor: s.color || '#e0e7ff' }}
                                            aria-hidden
                                        />
                                        <span className="text-sm dark:text-slate-300">{s.name}</span>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {activeTab === 'subjects' && (
                        <>
                            <input
                                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                placeholder="Название предмета"
                                value={subjectForm.name || ''}
                                onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                            />
                            <div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                                        Цвет
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="w-7 h-7 rounded-lg ring-1 ring-black/10 dark:ring-white/15 shadow-sm shrink-0"
                                            style={{ backgroundColor: subjectForm.color || '#e0e7ff' }}
                                            title={subjectForm.color}
                                        />
                                        <input
                                            type="text"
                                            className="w-[7.5rem] border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500 uppercase"
                                            value={subjectForm.color || ''}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                setSubjectForm({
                                                    ...subjectForm,
                                                    color: raw.startsWith('#') ? raw : `#${raw.replace(/^#*/, '')}`
                                                });
                                            }}
                                            placeholder="#E0E7FF"
                                            maxLength={7}
                                            aria-label="HEX-код цвета"
                                        />
                                        <label
                                            className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 cursor-pointer shrink-0 hover:border-indigo-400 transition-colors"
                                            title="Свой цвет"
                                        >
                                            <span
                                                className="absolute inset-0"
                                                style={{ backgroundColor: subjectForm.color || '#e0e7ff' }}
                                            />
                                            <input
                                                type="color"
                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                value={
                                                    /^#[0-9a-fA-F]{6}$/.test(subjectForm.color || '')
                                                        ? subjectForm.color!
                                                        : '#e0e7ff'
                                                }
                                                onChange={(e) =>
                                                    setSubjectForm({ ...subjectForm, color: e.target.value })
                                                }
                                            />
                                        </label>
                                    </div>
                                </div>
                                <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
                                    {SUBJECT_COLOR_PRESETS.map((c) => {
                                        const selected =
                                            normalizeHex(subjectForm.color || '') === normalizeHex(c);
                                        return (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setSubjectForm({ ...subjectForm, color: c })}
                                                className={`aspect-square rounded-lg ring-offset-2 dark:ring-offset-slate-800 transition-all ${
                                                    selected
                                                        ? 'ring-2 ring-indigo-500 scale-105'
                                                        : 'ring-1 ring-black/10 dark:ring-white/10 hover:scale-105'
                                                }`}
                                                style={{ backgroundColor: c }}
                                                title={c}
                                                aria-label={`Цвет ${c}`}
                                                aria-pressed={selected}
                                            />
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1.5">
                                    Выберите цвет из палитры или укажите свой HEX / пипеткой
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Сложность (СанПиН 1-12)
                                </label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={12}
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                    value={subjectForm.difficulty || 5}
                                    onChange={(e) =>
                                        setSubjectForm({
                                            ...subjectForm,
                                            difficulty: parseInt(e.target.value, 10)
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Требуемый тип кабинета
                                </label>
                                <select
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                    value={subjectForm.requiredRoomType}
                                    onChange={(e) =>
                                        setSubjectForm({
                                            ...subjectForm,
                                            requiredRoomType: e.target.value
                                        })
                                    }
                                >
                                    {ROOM_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {type}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {activeTab === 'classes' && (
                        <>
                            <input
                                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                placeholder="Название класса (5А)"
                                value={classForm.name || ''}
                                onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                            />
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Количество учеников
                                </label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                    value={classForm.studentsCount || 25}
                                    onChange={(e) =>
                                        setClassForm({
                                            ...classForm,
                                            studentsCount: parseInt(e.target.value, 10)
                                        })
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setClassForm({ ...classForm, shift: Shift.First })}
                                    className={`p-3 rounded-xl border text-sm font-bold transition-all ${
                                        classForm.shift === Shift.First
                                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                                            : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                                    }`}
                                >
                                    1 смена
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setClassForm({ ...classForm, shift: Shift.Second })}
                                    className={`p-3 rounded-xl border text-sm font-bold transition-all ${
                                        classForm.shift === Shift.Second
                                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                                            : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                                    }`}
                                >
                                    2 смена
                                </button>
                            </div>

                            <label className="flex items-center gap-2 mt-4 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                    checked={classForm.excludeFromReports || false}
                                    onChange={(e) =>
                                        setClassForm({
                                            ...classForm,
                                            excludeFromReports: e.target.checked
                                        })
                                    }
                                />
                                <span className="text-sm font-medium dark:text-slate-300">
                                    Исключить из проверки конфликтов
                                </span>
                            </label>
                            <p className="text-[10px] text-slate-500 mt-1">
                                Класс не будет отображаться в виджете конфликтов, если у него нет уроков.
                            </p>
                        </>
                    )}

                    {activeTab === 'rooms' && (
                        <>
                            <input
                                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                placeholder="Номер/Название (напр. 101)"
                                value={roomForm.name || ''}
                                onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                            />
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Вместимость (мест)
                                </label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                    value={roomForm.capacity || 30}
                                    onChange={(e) =>
                                        setRoomForm({
                                            ...roomForm,
                                            capacity: parseInt(e.target.value, 10)
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                    Тип кабинета
                                </label>
                                <select
                                    className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                    value={roomForm.type}
                                    onChange={(e) =>
                                        setRoomForm({
                                            ...roomForm,
                                            type: e.target.value
                                        })
                                    }
                                >
                                    {ROOM_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {type}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={!!usageModal}
                onClose={() => setUsageModal(null)}
                title={usageModal ? `Удалить «${usageModal.name}»?` : 'Удаление'}
                footer={
                    <div className="flex justify-end gap-2">
                        <button type="button" className="px-4 py-2 rounded-xl text-sm font-bold" onClick={() => setUsageModal(null)}>
                            Отмена
                        </button>
                        <button
                            type="button"
                            className="px-4 py-2 rounded-xl text-sm font-bold bg-red-600 text-white"
                            onClick={confirmDelete}
                        >
                            Удалить
                        </button>
                    </div>
                }
            >
                {usageModal && (
                    <div className="space-y-2 text-sm">
                        {usageModal.lines.length === 0 ? (
                            <p className="text-slate-500">Связанных уроков, замен и дежурств не найдено.</p>
                        ) : (
                            <>
                                <p className="font-semibold text-amber-700 dark:text-amber-300">
                                    Используется в {usageModal.lines.length} местах:
                                </p>
                                <ul className="max-h-48 overflow-auto space-y-1 text-slate-600 dark:text-slate-300">
                                    {usageModal.lines.map((l, i) => (
                                        <li key={i}>
                                            <span className="font-bold">{l.where}:</span> {l.detail}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={!!importPreview}
                onClose={() => setImportPreview(null)}
                title="Предпросмотр импорта"
                footer={
                    <div className="flex justify-end gap-2">
                        <button type="button" className="px-4 py-2 rounded-xl text-sm" onClick={() => setImportPreview(null)}>
                            Отмена
                        </button>
                        <button type="button" className="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white" onClick={applyImport}>
                            Добавить {importPreview?.rows.length || 0} записей
                        </button>
                    </div>
                }
            >
                {importPreview && (
                    <div className="overflow-auto max-h-64 text-xs">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    {Object.keys(importPreview.rows[0] || {}).map((h) => (
                                        <th key={h} className="text-left p-1 border-b font-bold">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {importPreview.rows.slice(0, 20).map((row, i) => (
                                    <tr key={i}>
                                        {Object.keys(importPreview.rows[0] || {}).map((h) => (
                                            <td key={h} className="p-1 border-b">
                                                {row[h]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {importPreview.rows.length > 20 && (
                            <p className="mt-2 text-slate-400">Показаны первые 20 из {importPreview.rows.length}</p>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};
