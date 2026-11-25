import React, { useMemo } from 'react';
import { useStaticData } from '../context/DataContext';
import {
    ClassEntity,
    Room,
    ScheduleItem,
    Subject,
    Substitution,
    Teacher
} from '../types';
import { getDateOrToday } from '../utils/helpers';
import { formatRoomArrow, isRoomSubstitution, roomLabel } from '../utils/roomSubstitution';

interface ReportHeaderProps {
    exportDate: string;
    dayComment?: string;
    title?: string;
}

export const SubstitutionReportHeader = ({
    exportDate,
    dayComment,
    title = 'Замена Учителей'
}: ReportHeaderProps) => {
    const { settings } = useStaticData();
    return (
        <div className="border-b-2 border-slate-800 pb-4 mb-6">
            <div className="flex justify-between items-end gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tight mb-1 text-slate-800">
                        {title}
                    </h1>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                        {settings?.schoolName || 'Учреждение образования'} • Официальный документ
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Дата</div>
                    <div className="text-xl font-bold text-slate-800">
                        {getDateOrToday(exportDate).toLocaleDateString('ru-BY', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        })}
                    </div>
                </div>
            </div>
            {dayComment && <div className="mt-3 text-xs text-slate-600 max-w-3xl">{dayComment}</div>}
        </div>
    );
};

export const SubstitutionReportFooter = () => (
    <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-end text-[10px] text-slate-400">
        <div>Сформировано автоматически</div>
        <div className="flex flex-col items-end gap-2">
            <div className="h-px w-32 bg-slate-300"></div>
            <div>Подпись администрации</div>
        </div>
    </div>
);

export interface SubstitutionExportSheetProps {
    exportDate: string;
    dayComment?: string;
    shift: string;
    substitutions: Substitution[];
    getScheduleItemById: (id: string) => ScheduleItem | undefined;
    classesById: Map<string, ClassEntity>;
    subjectsById: Map<string, Subject>;
    teachersById: Map<string, Teacher>;
    roomsById: Map<string, Room>;
    includeRoomOnly?: boolean;
}

export const SubstitutionExportSheet = React.forwardRef<HTMLDivElement, SubstitutionExportSheetProps>(
    function SubstitutionExportSheet(
        {
            exportDate,
            dayComment,
            shift,
            substitutions,
            getScheduleItemById,
            classesById,
            subjectsById,
            teachersById,
            roomsById,
            includeRoomOnly = true
        },
        ref
    ) {
        const shiftSubs = useMemo(
            () =>
                substitutions
                    .filter((sub) => {
                        const s = getScheduleItemById(sub.scheduleItemId);
                        return s && s.shift === shift;
                    })
                    .filter((sub) => sub.replacementTeacherId !== 'conducted')
                    .filter((sub) => includeRoomOnly || !isRoomSubstitution(sub)),
            [substitutions, getScheduleItemById, shift, includeRoomOnly]
        );

        const uniqueLessonIds = useMemo(
            () =>
                Array.from(new Set(shiftSubs.map((s) => s.scheduleItemId))).sort((idA, idB) => {
                    const itemA = getScheduleItemById(idA);
                    const itemB = getScheduleItemById(idB);
                    return (itemA?.period ?? 0) - (itemB?.period ?? 0);
                }),
            [shiftSubs, getScheduleItemById]
        );

        if (shiftSubs.length === 0) return null;

        return (
            <div ref={ref} className="bg-white p-8 min-w-[800px] max-w-[1000px] shadow-xl text-slate-900">
                <SubstitutionReportHeader exportDate={exportDate} dayComment={dayComment} />
                <div>
                    <div className="text-xl font-bold bg-slate-100 text-slate-700 p-2 mb-2 uppercase tracking-wide border-l-4 border-indigo-500">
                        {shift}
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-16 text-center">
                                    Урок
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-24">
                                    Класс
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider">
                                    Предмет
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-1/4">
                                    Отсутствует
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-1/4">
                                    Заменяет
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-20 text-right">
                                    Каб.
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {uniqueLessonIds.map((lessonId) => {
                                const lessonSubs = shiftSubs.filter((s) => s.scheduleItemId === lessonId);
                                const sub = lessonSubs.find((row) => !isRoomSubstitution(row)) || lessonSubs[0];
                                const roomSub = lessonSubs.find(isRoomSubstitution);
                                const s = getScheduleItemById(lessonId);
                                if (!s) return null;
                                const cls = classesById.get(s.classId);
                                const subj = subjectsById.get(s.subjectId);
                                const t1 = teachersById.get(sub.originalTeacherId);

                                // При объединении с классом на подгруппах кабинеты у подгрупп разные —
                                // показываем все кабинеты замены.
                                const roomNamesOf = (ids: (string | undefined)[]) =>
                                    ids
                                        .filter((id): id is string => Boolean(id))
                                        .map((id) => roomsById.get(id)?.name || id)
                                        .filter((name, idx, arr) => arr.indexOf(name) === idx);

                                const newRoomId = sub.replacementRoomId;
                                const oldRoomObj = s.roomId ? roomsById.get(s.roomId) : null;
                                const oldRoomName = oldRoomObj ? oldRoomObj.name : s.roomId || '—';
                                const replacementRoomNames = roomNamesOf(lessonSubs.map((ls) => ls.replacementRoomId));
                                const newRoomObj = newRoomId ? roomsById.get(newRoomId) : null;
                                const newRoomName =
                                    replacementRoomNames.length > 0
                                        ? replacementRoomNames.join(', ')
                                        : newRoomObj
                                          ? newRoomObj.name
                                          : newRoomId || '—';
                                const isRoomChangedMulti =
                                    replacementRoomNames.length > 0 &&
                                    replacementRoomNames.some((name) => name !== oldRoomName);

                                const isCancelled = sub.replacementTeacherId === 'cancelled';
                                const dayReason = t1?.absenceReasons?.[exportDate];
                                const lessonReason = sub.lessonAbsenceReason;
                                const displayReason =
                                    lessonReason === 'Без записи'
                                        ? lessonReason
                                        : dayReason === 'Без записи'
                                          ? dayReason
                                          : '';

                                const swappedClass = sub.replacementClassId
                                    ? classesById.get(sub.replacementClassId)
                                    : null;
                                const swappedSubj = sub.replacementSubjectId
                                    ? subjectsById.get(sub.replacementSubjectId)
                                    : null;

                                const isRoomChangeOnly = Boolean(roomSub) || (
                                    sub.replacementTeacherId === sub.originalTeacherId &&
                                    newRoomId &&
                                    !swappedClass
                                );
                                const isSwap = swappedClass && swappedSubj && !sub.isMerger;
                                const isTeacherPresent = sub.replacementTeacherId === sub.originalTeacherId;
                                const rowComment = sub.comment;

                                return (
                                    <tr key={String(lessonId)}>
                                        <td className="py-3 px-2 text-center font-bold text-slate-800 text-lg">
                                            {s.period}
                                        </td>
                                        <td className="py-3 px-2 font-bold text-slate-700">{cls?.name}</td>
                                        <td className="py-3 px-2">
                                            <div className="font-semibold text-slate-800">{subj?.name}</div>
                                            {s.direction && (
                                                <div className="text-[10px] text-slate-500 bg-slate-100 inline-block px-1 rounded mt-0.5">
                                                    {s.direction}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-2">
                                            {!isTeacherPresent && !isRoomChangeOnly && !isSwap && (
                                                <>
                                                    <div className="relative inline-block text-red-400 text-sm font-medium">
                                                        {t1?.name}
                                                        <div className="absolute left-0 top-[85%] w-full h-px bg-red-300"></div>
                                                    </div>
                                                    {displayReason && (
                                                        <span className="text-[10px] text-slate-500 block font-bold uppercase mt-0.5">
                                                            {displayReason}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                        <td
                                            className={`py-3 px-2 font-bold text-sm ${isCancelled ? 'text-red-600 uppercase font-black' : 'text-emerald-700'}`}
                                        >
                                            {isRoomChangeOnly ? (
                                                <div className="flex flex-col">
                                                    <span className="text-slate-800">{t1?.name}</span>
                                                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide mt-0.5">
                                                        Смена кабинета
                                                    </span>
                                                </div>
                                            ) : isSwap ? (
                                                <div className="flex flex-col">
                                                    <span className="text-slate-800">{t1?.name}</span>
                                                    <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wide mt-0.5">
                                                        Обмен уроками: {swappedClass?.name}
                                                    </span>
                                                </div>
                                            ) : isCancelled ? (
                                                <div className="flex flex-col">
                                                    <span>УРОК СНЯТ</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col">
                                                    {lessonSubs.length > 1 || sub.isMerger ? (
                                                        <>
                                                            <span className="text-slate-800 text-xs">
                                                                {lessonSubs
                                                                    .map((ls) => {
                                                                        const tr = teachersById.get(
                                                                            ls.replacementTeacherId
                                                                        );
                                                                        return tr ? tr.name : 'Неизвестно';
                                                                    })
                                                                    .join(', ')}
                                                            </span>
                                                            <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest mt-0.5">
                                                                ОБЪЕДИНЕНИЕ{' '}
                                                                {sub.replacementClassId
                                                                    ? `(${classesById.get(sub.replacementClassId)?.name})`
                                                                    : ''}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span>
                                                            {teachersById.get(sub.replacementTeacherId)?.name}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {rowComment && (
                                                <div className="mt-1 text-[10px] text-slate-500 italic max-w-xs">
                                                    {rowComment}
                                                </div>
                                            )}
                                        </td>
                                        <td
                                            className={`py-3 px-2 text-right font-mono font-black ${isRoomChangedMulti ? 'text-indigo-600' : 'text-slate-700'}`}
                                        >
                                            {roomSub ? (
                                                <div className="text-right text-indigo-700 font-black">
                                                    {formatRoomArrow(
                                                        roomLabel(Array.from(roomsById.values()), roomSub.originalRoomId || s.roomId),
                                                        roomLabel(Array.from(roomsById.values()), roomSub.replacementRoomId)
                                                    )}
                                                    {roomSub.roomConflict ? ' · конфликт кабинета' : ''}
                                                </div>
                                            ) : isRoomChangedMulti ? (
                                                <div className="flex items-center justify-end gap-2 text-xl whitespace-nowrap">
                                                    <span className="text-slate-400 decoration-4 text-xl">
                                                        {oldRoomName}
                                                    </span>
                                                    <span className="text-indigo-600 font-black text-2xl">&rarr;</span>
                                                    <span className="text-indigo-600 font-black text-2xl">
                                                        {newRoomName}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xl">
                                                    {replacementRoomNames.length > 0 ? newRoomName : oldRoomName}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <SubstitutionReportFooter />
            </div>
        );
    }
);

export type RoomChangeExportSheetProps = Omit<SubstitutionExportSheetProps, 'dayComment' | 'includeRoomOnly'>;

export const RoomChangeExportSheet = React.forwardRef<HTMLDivElement, RoomChangeExportSheetProps>(
    function RoomChangeExportSheet(
        {
            exportDate,
            shift,
            substitutions,
            getScheduleItemById,
            classesById,
            subjectsById,
            teachersById,
            roomsById
        },
        ref
    ) {
        const shiftSubs = useMemo(
            () =>
                substitutions.filter((sub) => {
                    if (!isRoomSubstitution(sub)) return false;
                    const s = getScheduleItemById(sub.scheduleItemId);
                    return s && s.shift === shift;
                }),
            [substitutions, getScheduleItemById, shift]
        );

        const uniqueLessonIds = useMemo(
            () =>
                Array.from(new Set(shiftSubs.map((s) => s.scheduleItemId))).sort((idA, idB) => {
                    const itemA = getScheduleItemById(idA);
                    const itemB = getScheduleItemById(idB);
                    return (itemA?.period ?? 0) - (itemB?.period ?? 0);
                }),
            [shiftSubs, getScheduleItemById]
        );

        if (shiftSubs.length === 0) return null;

        const rooms = Array.from(roomsById.values());

        return (
            <div ref={ref} className="bg-white p-8 min-w-[800px] max-w-[1000px] shadow-xl text-slate-900">
                <SubstitutionReportHeader exportDate={exportDate} title="Замена кабинетов" />
                <div>
                    <div className="text-xl font-bold bg-slate-100 text-slate-700 p-2 mb-2 uppercase tracking-wide border-l-4 border-indigo-500">
                        {shift}
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-16 text-center">
                                    Урок
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-24">
                                    Класс
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider">
                                    Предмет
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-1/5">
                                    Учитель
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-1/4">
                                    Кабинет
                                </th>
                                <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-1/5">
                                    Причина
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {uniqueLessonIds.map((lessonId) => {
                                const lessonSubs = shiftSubs.filter((s) => s.scheduleItemId === lessonId);
                                const sub = lessonSubs[0];
                                const s = getScheduleItemById(lessonId);
                                if (!s) return null;
                                const cls = classesById.get(s.classId);
                                const subj = subjectsById.get(s.subjectId);
                                const teacher = teachersById.get(sub.originalTeacherId);
                                const fromRoom = roomLabel(rooms, sub.originalRoomId || s.roomId);
                                const toRooms = lessonSubs
                                    .map((row) => roomLabel(rooms, row.replacementRoomId))
                                    .filter((name, idx, arr) => arr.indexOf(name) === idx);

                                return (
                                    <tr key={String(lessonId)}>
                                        <td className="py-3 px-2 text-center font-bold text-slate-800 text-lg">
                                            {s.period}
                                        </td>
                                        <td className="py-3 px-2 font-bold text-slate-700">{cls?.name}</td>
                                        <td className="py-3 px-2">
                                            <div className="font-semibold text-slate-800">{subj?.name}</div>
                                            {s.direction && (
                                                <div className="text-[10px] text-slate-500 bg-slate-100 inline-block px-1 rounded mt-0.5">
                                                    {s.direction}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-sm font-semibold text-slate-800">{teacher?.name}</td>
                                        <td className="py-3 px-2 text-indigo-700 font-black">
                                            {formatRoomArrow(fromRoom, toRooms.join(', '))}
                                            {lessonSubs.some((row) => row.roomConflict) && (
                                                <div className="text-[10px] font-bold uppercase mt-0.5">конфликт</div>
                                            )}
                                        </td>
                                        <td className="py-3 px-2 text-sm text-slate-700">
                                            {sub.roomChangeReason}
                                            {sub.comment && (
                                                <div className="mt-1 text-[10px] text-slate-500 italic max-w-xs">
                                                    {sub.comment}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <SubstitutionReportFooter />
            </div>
        );
    }
);

export function shiftHasExportableSubs(
    substitutions: Substitution[],
    shift: string,
    getScheduleItemById: (id: string) => ScheduleItem | undefined,
    includeRoomOnly = true
) {
    return substitutions.some((sub) => {
        if (sub.replacementTeacherId === 'conducted') return false;
        if (!includeRoomOnly && isRoomSubstitution(sub)) return false;
        const s = getScheduleItemById(sub.scheduleItemId);
        return s && s.shift === shift;
    });
}
