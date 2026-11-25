import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../UI';
import { Icon } from '../Icons';
import { ClassEntity, Room, ScheduleItem, Subject, Substitution, Teacher } from '../../types';
import {
    DayRoomLesson,
    buildClassQuarantinePlan,
    describeRoomConflict,
    effectiveRoomId,
    lessonsTouchingRoom,
    listRoomOptions,
    roomLabel,
    suggestFreeRoom,
    suggestFreeRooms
} from '../../utils/roomSubstitution';

interface Lookup {
    rooms: Room[];
    classes: ClassEntity[];
    teachers: Teacher[];
    subjects: Subject[];
    schedule: ScheduleItem[];
    substitutions: Substitution[];
}

const names = (lesson: ScheduleItem, data: Lookup) => ({
    className: data.classes.find((item) => item.id === lesson.classId)?.name || 'класс удалён',
    teacherName: data.teachers.find((item) => item.id === lesson.teacherId)?.name || 'учитель удалён',
    subjectName: data.subjects.find((item) => item.id === lesson.subjectId)?.name || 'предмет удалён'
});

const inputClass = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2';

export const RoomChangeModal = ({
    lesson,
    date,
    existing,
    dayNameMissing,
    vacation,
    data,
    onClose,
    onSave
}: {
    lesson: ScheduleItem;
    date: string;
    existing?: Substitution | null;
    dayNameMissing: boolean;
    vacation: boolean;
    data: Lookup;
    onClose: () => void;
    onSave: (payload: {
        replacementRoomId?: string;
        reason: string;
        comment: string;
        source: 'auto' | 'manual';
        conflict: boolean;
        cancelLesson: boolean;
        clearRoom: boolean;
    }) => void;
}) => {
    const [roomId, setRoomId] = useState(existing?.replacementRoomId || '');
    const [reason, setReason] = useState(existing?.roomChangeReason || '');
    const [comment, setComment] = useState(existing?.comment || '');
    const [source, setSource] = useState<'auto' | 'manual'>(existing?.roomChangeSource || 'manual');
    const [clearRoom, setClearRoom] = useState(Boolean(existing?.type === 'room' && !existing.replacementRoomId));
    const [commentOpen, setCommentOpen] = useState(Boolean(existing?.comment));

    const excludeIds = existing ? [existing.id] : [];
    const options = useMemo(
        () =>
            listRoomOptions(
                data.rooms,
                data.schedule,
                data.substitutions,
                date,
                lesson,
                data.classes,
                data.teachers,
                data.subjects,
                excludeIds
            ),
        [data, date, lesson, existing?.id]
    );
    const recommendations = useMemo(
        () => suggestFreeRooms(lesson, data.classes, data.rooms, options, 3),
        [lesson, data.classes, data.rooms, options]
    );
    const recommendationIds = new Set(recommendations.map((room) => room.id));
    const selectedConflict =
        roomId && !clearRoom
            ? describeRoomConflict(
                  data.schedule,
                  data.substitutions,
                  date,
                  lesson,
                  roomId,
                  data.classes,
                  data.teachers,
                  data.subjects,
                  excludeIds
              )
            : null;
    const meta = names(lesson, data);
    const fromName = roomLabel(data.rooms, lesson.roomId);
    const origin = data.rooms.find((room) => room.id === lesson.roomId);
    const recommendationHint = (room: Room) => {
        if (origin?.type && room.type === origin.type) return 'тот же тип';
        if (origin?.floor != null && room.floor === origin.floor) return 'тот же этаж';
        return 'свободен';
    };
    const selectRoom = (id: string, nextSource: 'auto' | 'manual') => {
        setRoomId(id);
        setClearRoom(false);
        setSource(nextSource);
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Изменить кабинет"
            maxWidth="max-w-2xl"
            footer={
                <div className="flex flex-wrap gap-2 justify-end">
                    <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300">
                        Закрыть
                    </button>
                    <button
                        type="button"
                        disabled={!clearRoom && !roomId}
                        onClick={() =>
                            onSave({
                                replacementRoomId: clearRoom ? undefined : roomId,
                                reason,
                                comment,
                                source,
                                conflict: Boolean(selectedConflict),
                                cancelLesson: false,
                                clearRoom
                            })
                        }
                        className="px-3 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white disabled:opacity-40"
                    >
                        Сохранить
                    </button>
                </div>
            }
        >
            <div className="space-y-4 text-sm">
                <div>
                    <p className="text-slate-600 dark:text-slate-300">
                        {meta.className} · {lesson.period} урок · {meta.subjectName} · {meta.teacherName}
                    </p>
                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 px-4 py-3">
                        <Icon name="DoorOpen" size={22} className="text-slate-400" />
                        {roomId && !clearRoom ? (
                            <div className="flex flex-wrap items-center gap-2 text-lg">
                                <span className="text-slate-400 line-through">{fromName}</span>
                                <Icon name="ArrowRight" size={18} className="text-slate-400" />
                                <strong className="text-indigo-600 dark:text-indigo-400">{roomLabel(data.rooms, roomId)}</strong>
                            </div>
                        ) : (
                            <div>
                                <div className="text-xs text-slate-500">Текущий кабинет</div>
                                <div className="text-xl font-bold text-slate-800 dark:text-white">{fromName}</div>
                            </div>
                        )}
                    </div>
                </div>
                {(vacation || dayNameMissing) && (
                    <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        {dayNameMissing
                            ? 'Это выходной: в расписании нет уроков этого дня недели. Замену можно сохранить только если урок уже выбран из истории.'
                            : 'Дата попадает на каникулы или вне семестра. Замена кабинета всё равно сохранится на эту дату.'}
                    </p>
                )}

                <section>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Рекомендуемые кабинеты</h3>
                    {recommendations.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {recommendations.map((room) => (
                                <button
                                    key={room.id}
                                    type="button"
                                    onClick={() => selectRoom(room.id, 'auto')}
                                    className={`rounded-xl border px-3 py-2 text-left transition ${
                                        roomId === room.id && !clearRoom
                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                                            : 'border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                                    }`}
                                >
                                    <span className="block font-bold text-indigo-700 dark:text-indigo-300">{room.name}</span>
                                    <span className="block text-xs text-slate-500">{recommendationHint(room)}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            Свободных кабинетов нет. Можно выбрать занятый кабинет с конфликтом или оставить урок без кабинета.
                        </p>
                    )}
                </section>

                <section>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">Все кабинеты</h3>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                        {options.filter((option) => !recommendationIds.has(option.room.id)).map((option) => (
                            <button
                                key={option.room.id}
                                type="button"
                                title={option.conflictText || 'Кабинет свободен'}
                                onClick={() => selectRoom(option.room.id, 'manual')}
                                className={`min-w-0 rounded-lg border px-3 py-2 text-left ${
                                    roomId === option.room.id && !clearRoom
                                        ? 'border-indigo-500 ring-1 ring-indigo-500'
                                        : option.busy
                                          ? 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-90'
                                          : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-900/10'
                                }`}
                            >
                                <span className="block font-semibold text-slate-800 dark:text-slate-100">{option.room.name}</span>
                                <span className={`block truncate text-xs ${option.busy ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                    {option.busy ? option.conflictText.replace(/^Кабинет занят:\s*/, '').replace(/\.$/, '') : 'свободен'}
                                </span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setClearRoom(true);
                                setSource('manual');
                            }}
                            className={`rounded-lg border border-dashed px-3 py-2 text-left font-semibold ${
                                clearRoom
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                                    : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                            }`}
                        >
                            Без кабинета
                        </button>
                    </div>
                </section>
                {selectedConflict && (
                    <p className="text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-300 rounded-lg px-3 py-2">
                        {selectedConflict} Сохранение возможно, запись будет помечена «конфликт кабинета».
                    </p>
                )}

                <section>
                    <label className="block font-semibold" htmlFor="room-change-reason">Причина замены кабинета</label>
                    <div className="my-2 flex gap-2">
                        {['Мероприятие', 'Ремонт'].map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setReason(value)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${reason === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}
                            >
                                {value}
                            </button>
                        ))}
                    </div>
                    <input
                        id="room-change-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className={inputClass}
                        placeholder="Например, мероприятие в кабинете"
                    />
                </section>
                {commentOpen ? (
                    <label className="block">
                        <span className="font-semibold">Комментарий</span>
                        <textarea
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            rows={2}
                            className={`${inputClass} mt-1`}
                        />
                    </label>
                ) : (
                    <button type="button" onClick={() => setCommentOpen(true)} className="font-semibold text-indigo-600 dark:text-indigo-400">
                        + Комментарий
                    </button>
                )}
            </div>
        </Modal>
    );
};

type DayAction = 'suggest' | 'manual' | 'clear' | 'cancel' | 'later';

interface DayRowState {
    lessonId: string;
    action: DayAction;
    roomId: string;
    source: 'auto' | 'manual';
}

export const FreeRoomDayModal = ({
    date,
    dayName,
    vacation,
    data,
    onClose,
    onApply
}: {
    date: string;
    dayName: string | null;
    vacation: boolean;
    data: Lookup;
    onClose: () => void;
    onApply: (payload: {
        roomId: string;
        reason: string;
        comment: string;
        rows: { lesson: ScheduleItem; action: DayAction; roomId: string; source: 'auto' | 'manual'; conflict: boolean }[];
    }) => void;
}) => {
    const [roomId, setRoomId] = useState('');
    const [reason, setReason] = useState('');
    const [comment, setComment] = useState('');
    const [rows, setRows] = useState<DayRowState[]>([]);

    const touching = useMemo(
        () => lessonsTouchingRoom(data.schedule, data.substitutions, date, dayName, roomId),
        [data.schedule, data.substitutions, date, dayName, roomId]
    );
    const touchingKey = touching.map((row) => row.lesson.id).join('|');

    const suggestAll = () => {
        const taken: string[] = [];
        const next = touching.map((row) => {
            if (row.cancelled) return { lessonId: row.lesson.id, action: 'later' as DayAction, roomId: '', source: 'manual' as const };
            const options = listRoomOptions(
                data.rooms,
                data.schedule,
                data.substitutions,
                date,
                row.lesson,
                data.classes,
                data.teachers,
                data.subjects,
                [],
                taken
            );
            const room = suggestFreeRoom(row.lesson, data.classes, data.rooms, options, [roomId, ...taken]);
            if (room) taken.push(room.id);
            return {
                lessonId: row.lesson.id,
                action: (room ? 'suggest' : 'later') as DayAction,
                roomId: room?.id || '',
                source: 'auto' as const
            };
        });
        setRows(next);
    };

    useEffect(() => {
        suggestAll();
    }, [roomId, touchingKey]);

    const update = (lessonId: string, patch: Partial<DayRowState>) => {
        setRows((prev) => prev.map((row) => (row.lessonId === lessonId ? { ...row, ...patch } : row)));
    };

    const prepared = touching.map((row) => {
        const state = rows.find((item) => item.lessonId === row.lesson.id);
        const action = state?.action || 'later';
        const chosen = state?.roomId || '';
        const conflict =
            (action === 'suggest' || action === 'manual') && chosen
                ? Boolean(
                      describeRoomConflict(
                          data.schedule,
                          data.substitutions,
                          date,
                          row.lesson,
                          chosen,
                          data.classes,
                          data.teachers,
                          data.subjects
                      )
                  )
                : false;
        return { row, action, chosen, conflict, source: state?.source || 'manual' };
    });
    const activeRows = prepared.filter((item) => !item.row.cancelled);
    const summary = {
        moved: activeRows.filter((item) => (item.action === 'suggest' || item.action === 'manual') && item.chosen).length,
        clear: activeRows.filter((item) => item.action === 'clear').length,
        cancel: activeRows.filter((item) => item.action === 'cancel').length,
        later: activeRows.filter((item) => item.action === 'later').length
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Освободить кабинет на весь день"
            maxWidth="max-w-3xl"
            footer={
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Переедут: {summary.moved} · Без кабинета: {summary.clear} · Отменено: {summary.cancel} · Отложено: {summary.later}
                    </p>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                            Закрыть
                        </button>
                        <button
                            type="button"
                            disabled={!roomId}
                            onClick={() =>
                                onApply({
                                    roomId,
                                    reason,
                                    comment,
                                    rows: prepared
                                        .filter((item) => item.action !== 'later' && !item.row.cancelled)
                                        .map((item) => ({
                                            lesson: item.row.lesson,
                                            action: item.action,
                                            roomId: item.chosen,
                                            source: item.action === 'manual' ? 'manual' : item.source,
                                            conflict: item.conflict
                                        }))
                                })
                            }
                            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40"
                        >
                            Применить ко всем урокам
                        </button>
                    </div>
                </div>
            }
        >
            <div className="space-y-3 text-sm">
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="font-semibold">Кабинет</span>
                        <select value={roomId} onChange={(event) => setRoomId(event.target.value)} className={`${inputClass} mt-1`}>
                            <option value="">Выберите кабинет</option>
                            {data.rooms.map((room) => (
                                <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                        </select>
                    </label>
                    <div>
                        <div className="font-semibold">Дата</div>
                        <div className="mt-1 py-2">{date}</div>
                    </div>
                </div>
                {!dayName && <p className="text-amber-700">Выходной: уроков в расписании нет.</p>}
                {vacation && <p className="text-amber-700">Дата в каникулы или вне семестра. Список строится по расписанию этого времени года, если оно есть.</p>}
                <div className="grid sm:grid-cols-2 gap-2">
                    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина" className={inputClass} />
                    <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Комментарий" className={inputClass} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">Предложения можно изменить. Для каждого урока создаётся отдельная запись.</p>
                    <button type="button" onClick={suggestAll} disabled={!roomId} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 disabled:opacity-40">
                        <Icon name="RefreshCw" size={13} /> Обновить предложения
                    </button>
                </div>
                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                    {prepared.map(({ row, action, chosen, conflict }) => (
                        <DayLessonRow key={row.lesson.id} row={row} data={data} action={action} chosen={chosen} conflict={conflict} date={date} onChange={update} />
                    ))}
                    {roomId && prepared.length === 0 && <p className="text-slate-500">В этом кабинете на выбранную дату уроков нет.</p>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 sm:hidden">
                    Переедут: {summary.moved} · Без кабинета: {summary.clear} · Отменено: {summary.cancel} · Отложено: {summary.later}
                </p>
            </div>
        </Modal>
    );
};

const DayLessonRow = ({
    row,
    data,
    action,
    chosen,
    conflict,
    date,
    onChange
}: {
    row: DayRoomLesson;
    data: Lookup;
    action: DayAction;
    chosen: string;
    conflict: boolean;
    date: string;
    onChange: (lessonId: string, patch: Partial<DayRowState>) => void;
}) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const meta = names(row.lesson, data);
    const options = listRoomOptions(data.rooms, data.schedule, data.substitutions, date, row.lesson, data.classes, data.teachers, data.subjects);

    useEffect(() => {
        if (!menuOpen) return;
        const close = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menuOpen]);

    if (row.cancelled) {
        return (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 opacity-55">
                <span className="font-semibold">{row.lesson.period} урок · {meta.className} · {meta.teacherName}</span>
                <span className="ml-2 text-xs text-rose-600">урок уже снят</span>
            </div>
        );
    }

    const badge = action === 'clear' ? 'без кабинета' : action === 'cancel' ? 'урок снят' : action === 'later' ? 'позже' : '';
    const menuAction = (nextAction: DayAction) => {
        onChange(row.lesson.id, { action: nextAction, roomId: '', source: 'manual' });
        setMenuOpen(false);
    };

    return (
        <div className="relative flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
            <div className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{row.lesson.period} урок · {meta.className} · {meta.teacherName}</span>
                <Icon name="ArrowRight" size={13} className="mx-2 inline text-slate-400" />
                <span className={conflict ? 'font-semibold text-rose-600' : 'text-indigo-700 dark:text-indigo-300'}>
                    {(action === 'suggest' || action === 'manual') && chosen ? roomLabel(data.rooms, chosen) : '—'}
                </span>
                {badge && <span className={`ml-2 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs ${action === 'cancel' ? 'text-rose-600' : 'text-slate-500 dark:text-slate-300'}`}>{badge}</span>}
                {conflict && <span className="ml-2 text-xs font-semibold text-rose-600">конфликт</span>}
            </div>
            <select
                aria-label={`Кабинет для урока ${row.lesson.period}`}
                value={action === 'manual' || action === 'suggest' ? chosen : ''}
                onChange={(event) => onChange(row.lesson.id, { action: 'manual', roomId: event.target.value, source: 'manual' })}
                className="w-28 shrink-0 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
            >
                <option value="">Выбрать</option>
                {options.map((option) => (
                    <option key={option.room.id} value={option.room.id}>
                        {option.room.name}{option.busy ? ' — занят' : ''}
                    </option>
                ))}
            </select>
            <div className="relative shrink-0" ref={menuRef}>
                <button type="button" aria-label="Другие действия" onClick={() => setMenuOpen((open) => !open)} className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                    ⋯
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-1 shadow-lg">
                        <button type="button" onClick={() => menuAction('clear')} className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700">Без кабинета</button>
                        <button type="button" onClick={() => menuAction('cancel')} className="block w-full rounded-md px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20">Отменить урок</button>
                        <button type="button" onClick={() => menuAction('later')} className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700">Выбрать позже</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export const LessonPickModal = ({
    lessons,
    data,
    onClose,
    onPick
}: {
    lessons: ScheduleItem[];
    data: Lookup;
    onClose: () => void;
    onPick: (lesson: ScheduleItem) => void;
}) => {
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase('ru');
        return lessons.filter((lesson) => {
            if (!needle) return true;
            const meta = names(lesson, data);
            return [meta.className, meta.teacherName, meta.subjectName].some((value) => value.toLocaleLowerCase('ru').includes(needle));
        });
    }, [lessons, data, query]);
    const shifts = ['1 смена', '2 смена'];

    return (
        <Modal isOpen onClose={onClose} title="Урок для смены кабинета" maxWidth="max-w-lg">
            <div className="relative">
                <Icon name="Search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Класс, учитель или предмет"
                    className={`${inputClass} pl-9`}
                />
            </div>
            <div className="mt-3 space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                {lessons.length === 0 && <p className="text-sm text-slate-500">На эту дату уроков нет.</p>}
                {lessons.length > 0 && filtered.length === 0 && <p className="text-sm text-slate-500">По вашему запросу ничего не найдено.</p>}
                {shifts.map((shift) => {
                    const shiftLessons = filtered.filter((lesson) => lesson.shift === shift).sort((a, b) => a.period - b.period);
                    if (shiftLessons.length === 0) return null;
                    return (
                        <section key={shift}>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{shift}</h3>
                            <div className="space-y-2">
                                {shiftLessons.map((lesson) => {
                                    const meta = names(lesson, data);
                                    return (
                                        <button
                                            key={lesson.id}
                                            type="button"
                                            onClick={() => onPick(lesson)}
                                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-left hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icon name="DoorOpen" size={16} className="shrink-0 text-indigo-500" />
                                                <span className="font-bold text-slate-800 dark:text-slate-100">{lesson.period} урок · {meta.className}</span>
                                                <span className="ml-auto shrink-0 text-xs text-slate-500">{roomLabel(data.rooms, lesson.roomId)}</span>
                                            </div>
                                            <div className="mt-1 pl-6 text-xs text-slate-500 dark:text-slate-400">{meta.subjectName} · {meta.teacherName}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
        </Modal>
    );
};


export const ClassQuarantineModal = ({
    date,
    dayName,
    vacation,
    data,
    onClose,
    onApply
}: {
    date: string;
    dayName: string | null;
    vacation: boolean;
    data: Lookup;
    onClose: () => void;
    onApply: (payload: {
        classId: string;
        roomId: string;
        reason: string;
        comment: string;
        rows: { lesson: ScheduleItem; kind: 'class' | 'evicted'; roomId: string; source: 'auto' | 'manual'; conflict: boolean }[];
    }) => void;
}) => {
    const [classId, setClassId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [reason, setReason] = useState('');
    const [comment, setComment] = useState('');
    const [manual, setManual] = useState<Record<string, string>>({});

    const className = data.classes.find((c) => c.id === classId)?.name || '';
    const plan = useMemo(
        () =>
            buildClassQuarantinePlan(
                data.schedule,
                data.substitutions,
                date,
                dayName,
                classId,
                roomId,
                data.rooms,
                data.classes
            ),
        [data, date, dayName, classId, roomId]
    );
    useEffect(() => setManual({}), [classId, roomId]);
    useEffect(() => {
        if (className && (!reason || reason.startsWith('Карантин'))) setReason(`Карантин ${className}`);
    }, [className]);

    // Занятость слота ПОСЛЕ переселений — для ручного выбора кабинета выезжающим урокам.
    const occupiedAfterPlan = (lesson: ScheduleItem): Set<string> => {
        const busy = new Set<string>();
        data.schedule
            .filter((l) => l.day === dayName && l.shift === lesson.shift && l.period === lesson.period)
            .forEach((l) => {
                const current = effectiveRoomId(l, data.substitutions.filter((s) => s.date === date && s.scheduleItemId === l.id));
                if (current === undefined) return; // урок снят
                const move = plan.moves.find((m) => m.lesson.id === l.id);
                const finalRoom = move ? move.toRoomId || manual[l.id] || null : current;
                if (finalRoom) busy.add(finalRoom);
            });
        return busy;
    };

    const rows = plan.moves.map((move) => ({
        move,
        chosen: move.toRoomId || manual[move.lesson.id] || '',
        source: (move.toRoomId ? 'auto' : 'manual') as 'auto' | 'manual'
    }));
    const classCount = rows.filter((r) => r.move.kind === 'class').length;
    const evictedRows = rows.filter((r) => r.move.kind === 'evicted');
    const skipped = evictedRows.filter((r) => !r.chosen).length;
    const applicable = rows.filter((r) => r.chosen);

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Карантин класса"
            maxWidth="max-w-3xl"
            footer={
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Уроков класса: {classCount} · Выезжают из кабинета: {evictedRows.length - skipped}
                        {skipped > 0 ? ` · Пропущено: ${skipped}` : ''}
                    </p>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                            Закрыть
                        </button>
                        <button
                            type="button"
                            disabled={applicable.length === 0}
                            onClick={() =>
                                onApply({
                                    classId,
                                    roomId,
                                    reason,
                                    comment,
                                    rows: applicable.map((r) => ({
                                        lesson: r.move.lesson,
                                        kind: r.move.kind,
                                        roomId: r.chosen,
                                        source: r.source,
                                        conflict: false
                                    }))
                                })
                            }
                            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-40"
                        >
                            Применить
                        </button>
                    </div>
                </div>
            }
        >
            <div className="space-y-3 text-sm">
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="font-semibold">Класс на карантине</span>
                        <select value={classId} onChange={(event) => setClassId(event.target.value)} className={`${inputClass} mt-1`}>
                            <option value="">Выберите класс</option>
                            {data.classes.map((cls) => (
                                <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="font-semibold">Кабинет на весь день</span>
                        <select value={roomId} onChange={(event) => setRoomId(event.target.value)} className={`${inputClass} mt-1`}>
                            <option value="">Выберите кабинет</option>
                            {data.rooms.map((room) => (
                                <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Дата: {date}. Все уроки класса переедут в выбранный кабинет, а чужие уроки из него — в кабинеты, которые класс освобождает.
                </p>
                {!dayName && <p className="text-amber-700">Выходной: уроков в расписании нет.</p>}
                {vacation && <p className="text-amber-700">Дата в каникулы или вне семестра. Список строится по расписанию этого времени года, если оно есть.</p>}
                <div className="grid sm:grid-cols-2 gap-2">
                    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина" className={inputClass} />
                    <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Комментарий" className={inputClass} />
                </div>
                {plan.warnings.map((warning, index) => (
                    <p key={index} className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-amber-700 dark:text-amber-300">
                        {warning}
                    </p>
                ))}
                {classId && roomId && plan.moves.length === 0 && (
                    <p className="text-slate-500">Нечего переселять: у класса нет уроков в других кабинетах, а в выбранном кабинете нет чужих уроков.</p>
                )}
                <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                    {rows.map(({ move, chosen }) => {
                        const meta = names(move.lesson, data);
                        const fromName = roomLabel(data.rooms, move.fromRoomId);
                        const freeRooms = move.needsManual
                            ? data.rooms.filter((room) => room.id !== roomId && !occupiedAfterPlan(move.lesson).has(room.id))
                            : [];
                        return (
                            <div
                                key={move.lesson.id}
                                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                                    move.kind === 'class'
                                        ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <span className="font-semibold">
                                        {move.kind === 'evicted' && <span className="mr-1 text-slate-400">↳</span>}
                                        {move.lesson.period} урок · {meta.className} · {meta.subjectName} · {meta.teacherName}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-400 line-through">{fromName}</span>
                                    <Icon name="ArrowRight" size={13} className="text-slate-400" />
                                    {move.needsManual ? (
                                        freeRooms.length > 0 ? (
                                            <select
                                                aria-label={`Кабинет для урока ${move.lesson.period}`}
                                                value={chosen}
                                                onChange={(event) => setManual((prev) => ({ ...prev, [move.lesson.id]: event.target.value }))}
                                                className="w-32 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
                                            >
                                                <option value="">Выбрать свободный</option>
                                                {freeRooms.map((room) => (
                                                    <option key={room.id} value={room.id}>{room.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="text-xs text-amber-700 dark:text-amber-300">свободных нет — пропустим</span>
                                        )
                                    ) : (
                                        <span className="font-bold text-indigo-700 dark:text-indigo-300">{roomLabel(data.rooms, chosen)}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Прямой обмен в том же уроке — в приоритете. Строки без выбранного кабинета не сохраняются.
                </p>
            </div>
        </Modal>
    );
};
