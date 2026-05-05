import React from 'react';
import { Modal } from '../UI';
import { Icon } from '../Icons';
import { Room, ClassEntity } from '../../types';

interface AssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    modalContext: any;
    subMode: 'teacher' | 'cancel' | 'advanced';
    setSubMode: (mode: 'teacher' | 'cancel' | 'advanced') => void;
    candidates: { recommended: any[]; others: any[] };
    candidateSearch: string;
    setCandidateSearch: (val: string) => void;
    onViewSchedule: (id: string) => void;
    onAssign: (id: string, isMerger?: boolean) => void;
    onToggleRefusal: (id: string, e: React.MouseEvent) => void;
    refusedTeacherIds: string[];
    handleCandidateClick: (id: string, isBusy: boolean, isAbsent: boolean) => void;
    mergeCandidates: any[];
    onBatchClassMerge: (id: string) => void;
    otherLessonsForTeacher: any[];
    onSwapLessons: (id: string) => void;
    selectedRoomId: string;
    setSelectedRoomId: (id: string) => void;
    rooms: Room[];
    lessonAbsenceReason: string;
    setLessonAbsenceReason: (val: string) => void;
    substitutionComment: string;
    setSubstitutionComment: (val: string) => void;
    activeReplacementId: string | null;
    classes: ClassEntity[];
}

export const AssignmentModal: React.FC<AssignmentModalProps> = ({
    isOpen,
    onClose,
    modalContext,
    subMode,
    setSubMode,
    candidates,
    candidateSearch,
    setCandidateSearch,
    onViewSchedule,
    onAssign,
    onToggleRefusal,
    refusedTeacherIds,
    handleCandidateClick,
    mergeCandidates,
    onBatchClassMerge,
    otherLessonsForTeacher,
    onSwapLessons,
    selectedRoomId,
    setSelectedRoomId,
    rooms,
    lessonAbsenceReason,
    setLessonAbsenceReason,
    substitutionComment,
    setSubstitutionComment,
    activeReplacementId,
    classes
}) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Управление заменой" maxWidth="max-w-2xl">
        <div className="flex flex-col h-[90vh] md:h-[850px] -m-6">
            <div className="p-6 pb-2 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-dark-800 z-10">
                {modalContext && (
                    <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-xl mb-4 text-sm border border-slate-100 dark:border-slate-600 flex justify-between items-center">
                        <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 text-xl">
                                {modalContext.className}
                            </div>
                            <div className="text-slate-500 dark:text-slate-400 font-medium">
                                {modalContext.period} урок • {modalContext.subjectName}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-slate-400 text-xs uppercase font-bold">Учитель</div>
                            <div
                                className={`text-base ${modalContext.isTeacherAbsent ? 'line-through decoration-red-400 text-red-400' : 'font-bold dark:text-white'}`}
                            >
                                {modalContext.teacherName}
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 border-b border-slate-100 dark:border-slate-700">
                    <button
                        onClick={() => setSubMode('teacher')}
                        className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all ${subMode === 'teacher' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Замена учителем
                    </button>
                    <button
                        onClick={() => setSubMode('cancel')}
                        className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all ${subMode === 'cancel' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Отмена урока
                    </button>
                    <button
                        onClick={() => setSubMode('advanced')}
                        className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all ${subMode === 'advanced' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        Спец. действия
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white dark:bg-dark-800">
                {subMode === 'teacher' && (
                    <div className="space-y-6">
                        {candidates.recommended.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <Icon name="Star" size={14} /> Рекомендуемые
                                </h4>
                                <div className="space-y-2">
                                    {candidates.recommended.map(({ teacher, isSpecialist }) => (
                                        <div
                                            key={teacher.id}
                                            className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl hover:bg-emerald-100/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-emerald-200 text-emerald-700 flex items-center justify-center text-sm font-bold">
                                                    {teacher.name[0]}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-base">
                                                        {teacher.name}
                                                    </div>
                                                    <div className="text-xs text-emerald-600 font-bold uppercase">
                                                        {isSpecialist ? 'Профиль' : 'Есть окно'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => onViewSchedule(teacher.id)}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg"
                                                    title="Посмотреть расписание"
                                                >
                                                    <Icon name="Eye" size={16} />
                                                </button>
                                                <button
                                                    onClick={() => onAssign(teacher.id)}
                                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700"
                                                >
                                                    Выбрать
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Все учителя</label>
                            <div className="relative mb-2">
                                <Icon name="Search" className="absolute left-3 top-3 text-slate-400" size={16} />
                                <input
                                    placeholder="Найти учителя..."
                                    value={candidateSearch}
                                    onChange={(e) => setCandidateSearch(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-1">
                                {candidates.others.map(({ teacher, isBusy, busyReason, isAbsent }) => {
                                    const isRefused = refusedTeacherIds.includes(teacher.id);
                                    return (
                                        <div
                                            key={teacher.id}
                                            className={`flex items-center justify-between p-3 rounded-lg text-sm ${isAbsent ? 'opacity-70 bg-red-50/50' : 'hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-2 h-2 rounded-full ${isBusy ? 'bg-orange-400' : isAbsent ? 'bg-red-400' : 'bg-slate-300'}`}
                                                ></div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-base text-slate-700">
                                                        {teacher.name}
                                                    </span>
                                                    {isBusy && busyReason && (
                                                        <span className="text-[10px] text-orange-500 font-bold">
                                                            {busyReason.details}
                                                        </span>
                                                    )}
                                                    {isRefused && (
                                                        <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-bold text-slate-500 w-fit">
                                                            Отказ
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => onViewSchedule(teacher.id)}
                                                    className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-slate-100 rounded"
                                                    title="Посмотреть расписание"
                                                >
                                                    <Icon name="Eye" size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => onToggleRefusal(teacher.id, e)}
                                                    className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded"
                                                >
                                                    <Icon name="X" size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleCandidateClick(teacher.id, isBusy, isAbsent)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${isBusy ? 'text-orange-600 bg-orange-50' : isAbsent ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                                                    title={
                                                        isAbsent
                                                            ? 'Назначить несмотря на отсутствие'
                                                            : 'Назначить замену'
                                                    }
                                                >
                                                    {isBusy ? 'Объед?' : isAbsent ? 'Выбрать' : 'Выбрать'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {subMode === 'cancel' && (
                    <div className="text-center py-12 flex flex-col items-center justify-center h-full">
                        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
                            <Icon name="X" size={40} />
                        </div>
                        <h3 className="font-black text-2xl mb-2 text-slate-800">Снять урок?</h3>
                        <p className="text-slate-500 text-base mb-8 max-w-sm">
                            Урок будет отмечен как отмененный в расписании и отобразится красным цветом.
                        </p>
                        <button
                            onClick={() => onAssign('cancelled')}
                            className="px-8 py-4 bg-red-600 text-white rounded-xl font-bold text-lg hover:bg-red-700 shadow-lg shadow-red-200 hover:shadow-xl transition-all"
                        >
                            Подтвердить отмену
                        </button>
                    </div>
                )}

                {subMode === 'advanced' && (
                    <div className="space-y-6 pt-4">
                        <button
                            onClick={() => onAssign('conducted')}
                            className="w-full p-4 rounded-xl bg-blue-50 text-blue-700 font-bold text-base hover:bg-blue-100 flex items-center justify-center gap-3 border border-blue-100 transition-all hover:shadow-md"
                        >
                            <Icon name="CheckCircle" size={20} /> Урок проведен (без замены)
                        </button>

                        <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100">
                            <h4 className="font-bold text-amber-800 text-base mb-2 flex items-center gap-2">
                                <Icon name="Users" size={18} /> Объединение
                            </h4>
                            <p className="text-sm text-amber-700 mb-4">Присоединить этот класс к другому уроку.</p>
                            <div className="space-y-2">
                                {mergeCandidates.length === 0 ? (
                                    <div className="text-sm text-amber-500 italic text-center py-4">
                                        Нет подходящих классов
                                    </div>
                                ) : (
                                    mergeCandidates.map((c) => (
                                        <button
                                            key={c.classEntity.id}
                                            onClick={() => onBatchClassMerge(c.classEntity.id)}
                                            className="w-full p-3 bg-white rounded-xl border border-amber-200 text-left text-sm hover:border-amber-400 hover:shadow-sm transition-all"
                                        >
                                            <span className="font-bold text-base">{c.classEntity.name}</span>{' '}
                                            <span className="text-slate-400 mx-2">|</span>{' '}
                                            <span className="font-medium">{c.subjects.join(', ')}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {otherLessonsForTeacher.length > 0 && (
                            <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                                <h4 className="font-bold text-purple-800 text-base mb-2 flex items-center gap-2">
                                    <Icon name="RotateCw" size={18} /> Обмен
                                </h4>
                                <p className="text-sm text-purple-700 mb-4">
                                    Поменять местами с другим уроком этого учителя.
                                </p>
                                <div className="space-y-2">
                                    {otherLessonsForTeacher.map((l) => (
                                        <button
                                            key={l.id}
                                            onClick={() => onSwapLessons(l.id)}
                                            className="w-full p-3 bg-white rounded-xl border border-purple-200 text-left text-sm hover:border-purple-400 hover:shadow-sm transition-all"
                                        >
                                            <span className="font-bold text-base">{l.period} урок</span>:{' '}
                                            <span className="font-medium">
                                                {classes.find((c) => c.id === l.classId)?.name}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {subMode === 'teacher' && (
                <div className="p-6 pt-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-dark-800 flex flex-col gap-4 rounded-b-3xl">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                Кабинет (Опционально)
                            </label>
                            <select
                                value={selectedRoomId}
                                onChange={(e) => setSelectedRoomId(e.target.value)}
                                className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white font-medium outline-none focus:ring-2 ring-indigo-500"
                            >
                                <option value="">Авто / Без изменений</option>
                                {rooms.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                Причина (Опционально)
                            </label>
                            <select
                                value={lessonAbsenceReason}
                                onChange={(e) => setLessonAbsenceReason(e.target.value)}
                                className="w-full border border-slate-200 p-3 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white font-medium outline-none focus:ring-2 ring-indigo-500"
                            >
                                <option value="">Не указана</option>
                                <option value="Болезнь">Болезнь</option>
                                <option value="Курсы">Курсы</option>
                                <option value="Отгул">Отгул</option>
                                <option value="Семейные обстоятельства">Семейные обстоятельства</option>
                                <option value="Командировка">Командировка</option>
                                <option value="Без записи">Без записи</option>
                                <option value="Другое">Другое</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                            Комментарий к этой замене (Опционально)
                        </label>
                        <textarea
                            value={substitutionComment}
                            onChange={(e) => setSubstitutionComment(e.target.value)}
                            className="w-full border border-slate-200 p-2.5 rounded-xl text-sm bg-white dark:bg-slate-700 dark:text-white font-medium outline-none focus:ring-2 ring-indigo-500"
                            rows={2}
                            placeholder="Краткий комментарий, который будет виден в списке замен и на PNG."
                        />
                    </div>

                    {(activeReplacementId || (modalContext?.teacherId && selectedRoomId)) && (
                        <button
                            onClick={() => onAssign(activeReplacementId || modalContext?.teacherId || '')}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl text-base font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
                        >
                            Сохранить изменения
                        </button>
                    )}
                </div>
            )}
        </div>
    </Modal>
);
