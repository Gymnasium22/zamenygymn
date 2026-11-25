import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../UI';
import { Icon } from '../Icons';
import { ClassEntity, Room, ScheduleItem, Subject, Substitution, Teacher } from '../../types';
import {
    DayRoomLesson,
    describeRoomConflict,
    formatRoomArrow,
    lessonsTouchingRoom,
    listRoomOptions,
    roomLabel,
    suggestFreeRoom
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
    const [suggested, setSuggested] = useState<string | null>(null);

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

    const pickAuto = () => {
        const room = suggestFreeRoom(lesson, data.classes, data.rooms, options);
        setSuggested(room ? room.id : '');
        if (room) {
            setRoomId(room.id);
            setClearRoom(false);
            setSource('auto');
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Изменить кабинет"
            maxWidth="max-w-xl"
            footer={
                <div className="flex flex-wrap gap-2 justify-end">
                    <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600">
                        Закрыть
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            onSave({
                                replacementRoomId: undefined,
                                reason,
                                comment,
                                source,
                                conflict: false,
                                cancelLesson: true,
                                clearRoom: false
                            })
                        }
                        className="px-3 py-2 rounded-lg text-sm font-bold bg-rose-50 text-rose-700"
                    >
                        Отменить урок
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
                        Сохранить замену кабинета
                    </button>
                </div>
            }
        >
            <div className="space-y-3 text-sm">
                <p className="text-slate-600 dark:text-slate-300">
                    {meta.className}, {lesson.period} урок, {meta.subjectName}, {meta.teacherName}. Учитель, класс, предмет и время не меняются.
                </p>
                <p>
                    Текущий кабинет: <b>{fromName}</b>
                </p>
                {(vacation || dayNameMissing) && (
                    <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        {dayNameMissing
                            ? 'Это выходной: в расписании нет уроков этого дня недели. Замену можно сохранить только если урок уже выбран из истории.'
                            : 'Дата попадает на каникулы или вне семестра. Замена кабинета всё равно сохранится на эту дату.'}
                    </p>
                )}
                <button type="button" onClick={pickAuto} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 font-bold">
                    Подобрать свободный кабинет
                </button>
                {suggested === '' && <p className="text-amber-700">Свободного кабинета нет. Можно оставить урок без кабинета, отменить урок или выбрать кабинет вручную.</p>}
                {suggested && (
                    <p className="text-indigo-700">
                        Предложение: {formatRoomArrow(fromName, roomLabel(data.rooms, suggested))}. Можно принять его или выбрать другой кабинет.
                    </p>
                )}
                <label className="block font-semibold">Новый кабинет</label>
                <select
                    value={clearRoom ? '' : roomId}
                    onChange={(event) => {
                        setRoomId(event.target.value);
                        setClearRoom(false);
                        setSource('manual');
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                >
                    <option value="">Выберите кабинет</option>
                    {options.map((option) => (
                        <option key={option.room.id} value={option.room.id}>
                            {option.room.name}
                            {option.busy ? ' — занят' : ' — свободен'}
                        </option>
                    ))}
                </select>
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={clearRoom}
                        onChange={(event) => {
                            setClearRoom(event.target.checked);
                            if (event.target.checked) setSource('manual');
                        }}
                    />
                    Оставить урок без кабинета
                </label>
                {selectedConflict && (
                    <p className="text-rose-700 bg-rose-50 rounded-lg px-3 py-2">
                        {selectedConflict} Сохранение возможно, запись будет помечена «конфликт кабинета».
                    </p>
                )}
                <label className="block font-semibold">Причина замены кабинета</label>
                <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                    placeholder="Мероприятие в кабинете"
                />
                <label className="block font-semibold">Комментарий</label>
                <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                />
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

    useEffect(() => {
        setRows(
            touching.map((row) => ({
                lessonId: row.lesson.id,
                action: row.cancelled ? 'later' : 'later',
                roomId: '',
                source: 'manual'
            }))
        );
    }, [roomId, touching.map((row) => row.lesson.id).join('|')]);

    const update = (lessonId: string, patch: Partial<DayRowState>) => {
        setRows((prev) => prev.map((row) => (row.lessonId === lessonId ? { ...row, ...patch } : row)));
    };

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

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Освободить кабинет на весь день"
            maxWidth="max-w-3xl"
            footer={
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-semibold text-slate-600">
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
            }
        >
            <div className="space-y-3 text-sm">
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block">
                        <span className="font-semibold">Кабинет</span>
                        <select
                            value={roomId}
                            onChange={(event) => setRoomId(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                        >
                            <option value="">Выберите кабинет</option>
                            {data.rooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                    {room.name}
                                </option>
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
                <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Причина"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                />
                <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Комментарий"
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
                />
                <button type="button" onClick={suggestAll} disabled={!roomId} className="px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 font-bold disabled:opacity-40">
                    Подобрать кабинеты
                </button>
                <p className="text-slate-500">Подбор только предлагает кабинет. Сохранение происходит по кнопке «Применить ко всем урокам». Для каждого урока создаётся отдельная запись.</p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                    {prepared.map(({ row, action, chosen, conflict }) => (
                        <DayLessonRow
                            key={row.lesson.id}
                            row={row}
                            data={data}
                            action={action}
                            chosen={chosen}
                            conflict={conflict}
                            date={date}
                            onChange={update}
                        />
                    ))}
                    {roomId && prepared.length === 0 && <p>В этом кабинете на выбранную дату уроков нет.</p>}
                </div>
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
    const meta = names(row.lesson, data);
    const options = listRoomOptions(
        data.rooms,
        data.schedule,
        data.substitutions,
        date,
        row.lesson,
        data.classes,
        data.teachers,
        data.subjects
    );
    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3">
            <div className="font-semibold">
                {row.lesson.period} урок · {row.lesson.shift} · {meta.className} · {meta.subjectName} · {meta.teacherName}
            </div>
            {row.cancelled && <p className="text-rose-600 mt-1">Урок уже снят. Новый кабинет не нужен, кабинет на этот урок свободен.</p>}
            {!row.cancelled && (
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <select
                        value={action === 'manual' || action === 'suggest' ? chosen : ''}
                        onChange={(event) =>
                            onChange(row.lesson.id, {
                                action: 'manual',
                                roomId: event.target.value,
                                source: 'manual'
                            })
                        }
                        className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1"
                    >
                        <option value="">Кабинет вручную</option>
                        {options.map((option) => (
                            <option key={option.room.id} value={option.room.id}>
                                {option.room.name}
                                {option.busy ? ' — занят' : ' — свободен'}
                            </option>
                        ))}
                    </select>
                    <button type="button" className="px-2 py-1 rounded-lg bg-slate-100" onClick={() => onChange(row.lesson.id, { action: 'clear', roomId: '', source: 'manual' })}>
                        Без кабинета
                    </button>
                    <button type="button" className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700" onClick={() => onChange(row.lesson.id, { action: 'cancel', roomId: '', source: 'manual' })}>
                        Отменить урок
                    </button>
                    <button type="button" className="px-2 py-1 rounded-lg bg-slate-50" onClick={() => onChange(row.lesson.id, { action: 'later', roomId: '', source: 'manual' })}>
                        Выбрать позже
                    </button>
                    {action === 'suggest' && chosen && (
                        <span className="text-indigo-700">Предложение: {roomLabel(data.rooms, chosen)}</span>
                    )}
                    {action === 'clear' && <span>Урок останется без кабинета</span>}
                    {action === 'cancel' && <span className="text-rose-700">Урок будет снят</span>}
                    {!chosen && action === 'later' && <span className="text-amber-700">Свободный кабинет не выбран</span>}
                    {conflict && <span className="text-rose-700">Конфликт кабинета — можно сохранить с пометкой</span>}
                </div>
            )}
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
}) => (
    <Modal isOpen onClose={onClose} title="Урок для смены кабинета" maxWidth="max-w-lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {lessons.length === 0 && <p className="text-sm text-slate-500">На эту дату уроков нет.</p>}
            {lessons.map((lesson) => {
                const meta = names(lesson, data);
                return (
                    <button
                        key={lesson.id}
                        type="button"
                        onClick={() => onPick(lesson)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-indigo-50"
                    >
                        <Icon name="DoorOpen" size={14} /> {lesson.period} урок · {meta.className} · {meta.subjectName} · {roomLabel(data.rooms, lesson.roomId)}
                    </button>
                );
            })}
        </div>
    </Modal>
);
