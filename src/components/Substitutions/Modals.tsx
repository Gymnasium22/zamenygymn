import React from 'react';
import { Modal } from '../UI';
import { Icon } from '../Icons';
import { Teacher, Room, ScheduleItem, ClassEntity, Subject } from '../../types';

interface AbsenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    reason: string;
    onReasonChange: (reason: string) => void;
    onConfirm: () => void;
    onOpenBatch: () => void;
}

export const AbsenceModal: React.FC<AbsenceModalProps> = ({
    isOpen,
    onClose,
    reason,
    onReasonChange,
    onConfirm,
    onOpenBatch
}) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Причина отсутствия">
        <div className="space-y-4">
            <select
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                className="w-full border p-3 rounded-xl outline-none font-bold text-slate-700 dark:text-white dark:bg-slate-700 dark:border-slate-600"
            >
                <option>Болезнь</option>
                <option>Курсы</option>
                <option>Отгул</option>
                <option>Семейные обстоятельства</option>
                <option>Командировка</option>
                <option>Без записи</option>
                <option>Другое</option>
            </select>
            <div className="flex flex-col gap-2">
                <button
                    onClick={onConfirm}
                    className="w-full px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition"
                >
                    Только отметить отсутствие
                </button>
                <button
                    onClick={onOpenBatch}
                    className="w-full px-6 py-3 bg-purple-50 text-purple-700 border border-purple-100 rounded-xl font-bold hover:bg-purple-100 transition flex items-center justify-center gap-2"
                >
                    <Icon name="Layers" size={18} /> Пакетная обработка уроков
                </button>
            </div>
        </div>
    </Modal>
);

interface BatchActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate: string;
    batchActionType: 'cancel' | 'replace' | null;
    onTypeChange: (type: 'cancel' | 'replace' | null) => void;
    batchReplacementId: string;
    onReplacementChange: (id: string) => void;
    teachers: Teacher[];
    selectedTeacherId: string | null;
    onConfirm: () => void;
}

export const BatchActionModal: React.FC<BatchActionModalProps> = ({
    isOpen,
    onClose,
    selectedDate,
    batchActionType,
    onTypeChange,
    batchReplacementId,
    onReplacementChange,
    teachers,
    selectedTeacherId,
    onConfirm
}) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Пакетная обработка">
        <div className="space-y-6">
            <p className="text-slate-600 dark:text-slate-300">
                Выберите действие для <strong>всех уроков</strong> выбранного учителя на{' '}
                {new Date(selectedDate).toLocaleDateString('ru-RU')}.
            </p>

            <div className="grid grid-cols-1 gap-3">
                <button
                    onClick={() => onTypeChange('cancel')}
                    className={`p-4 rounded-xl border text-left transition-all ${batchActionType === 'cancel' ? 'bg-red-50 border-red-200 ring-2 ring-red-500' : 'bg-white border-slate-200 hover:border-red-300'}`}
                >
                    <div className="font-bold text-red-600 mb-1 flex items-center gap-2">
                        <Icon name="X" size={18} /> Снять все уроки
                    </div>
                    <div className="text-xs text-slate-500">Все уроки будут отмечены как отмененные.</div>
                </button>

                <button
                    onClick={() => onTypeChange('replace')}
                    className={`p-4 rounded-xl border text-left transition-all ${batchActionType === 'replace' ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                >
                    <div className="font-bold text-indigo-600 mb-1 flex items-center gap-2">
                        <Icon name="UserCheck" size={18} /> Назначить одного учителя
                    </div>
                    <div className="text-xs text-slate-500">Все уроки проведет один выбранный учитель.</div>
                </button>
            </div>

            {batchActionType === 'replace' && (
                <div className="animate-fadeIn">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                        Выберите заменяющего учителя
                    </label>
                    <select
                        value={batchReplacementId}
                        onChange={(e) => onReplacementChange(e.target.value)}
                        className="w-full p-3 border border-slate-200 rounded-xl bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white outline-none focus:ring-2 ring-indigo-500"
                    >
                        <option value="">-- Выберите учителя --</option>
                        {teachers
                            .filter((t) => t.id !== selectedTeacherId && !t.unavailableDates.includes(selectedDate))
                            .map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                    </select>
                </div>
            )}

            <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">
                    Отмена
                </button>
                <button
                    onClick={onConfirm}
                    disabled={!batchActionType || (batchActionType === 'replace' && !batchReplacementId)}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Применить
                </button>
            </div>
        </div>
    </Modal>
);

interface ManualSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    searchValue: string;
    onSearchChange: (val: string) => void;
    results: Array<{
        id: string;
        entityName: string;
        subInfo: string;
        period: number;
        subjectName: string;
        roomId?: string;
    }>;
    rooms: Room[];
    selectedDate: string;
    onSelect: (item: any) => void;
}

export const ManualSearchModal: React.FC<ManualSearchModalProps> = ({
    isOpen,
    onClose,
    searchValue,
    onSearchChange,
    results,
    rooms,
    selectedDate,
    onSelect
}) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Ручной поиск урока">
        <div className="mb-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Введите имя учителя или название класса.</p>
            <div className="relative">
                <Icon name="Search" className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input
                    autoFocus
                    placeholder="Например: 6А или Иванова..."
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm outline-none focus:border-indigo-500 dark:text-white"
                />
            </div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {results.map((item) => (
                <button
                    key={item.id}
                    onClick={() => onSelect(item)}
                    className="w-full p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-left group"
                >
                    <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                            {item.entityName} <span className="font-normal text-slate-500">({item.subInfo})</span>
                        </span>
                        <span className="text-xs font-bold bg-slate-100 dark:bg-slate-600 px-2 py-0.5 rounded">
                            {item.period} урок
                        </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-2">
                        <span>{item.subjectName}</span>
                        {item.roomId && (
                            <span className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-1 rounded">
                                Каб. {rooms.find((r) => r.id === item.roomId)?.name || item.roomId}
                            </span>
                        )}
                    </div>
                </button>
            ))}
            {searchValue.length > 1 && results.length === 0 && (
                <div className="text-center text-slate-400 text-xs py-4">
                    Уроки не найдены на выбранную дату ({selectedDate})
                </div>
            )}
        </div>
    </Modal>
);

interface TelegramChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (mode: 'single' | 'all') => void;
}

export const TelegramChoiceModal: React.FC<TelegramChoiceModalProps> = ({ isOpen, onClose, onConfirm }) => (
    <Modal isOpen={isOpen} onClose={onClose} title="Отправка уведомления">
        <div className="space-y-6">
            <p className="text-base text-slate-600 dark:text-slate-300">
                Вы хотите отправить учителю информацию только об этой замене или сводку всех его замен на сегодня?
            </p>
            <div className="flex flex-col gap-3">
                <button
                    onClick={() => onConfirm('single')}
                    className="w-full p-4 bg-white border border-slate-200 dark:bg-slate-700 dark:border-slate-600 rounded-xl flex items-center gap-4 hover:shadow-md transition-all group"
                >
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Icon name="Bell" size={20} />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-slate-800 dark:text-white">Только этот урок</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            Уведомление о конкретной замене
                        </div>
                    </div>
                </button>

                <button
                    onClick={() => onConfirm('all')}
                    className="w-full p-4 bg-white border border-slate-200 dark:bg-slate-700 dark:border-slate-600 rounded-xl flex items-center gap-4 hover:shadow-md transition-all group"
                >
                    <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <Icon name="List" size={20} />
                    </div>
                    <div className="text-left">
                        <div className="font-bold text-slate-800 dark:text-white">Все замены (Сводка)</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            Полный список замен учителя на сегодня
                        </div>
                    </div>
                </button>
            </div>
        </div>
    </Modal>
);

interface QuickViewScheduleModalProps {
    teacherId: string | null;
    onClose: () => void;
    activeSchedule: ScheduleItem[];
    selectedDayOfWeek: string | null;
    classes: ClassEntity[];
    subjects: Subject[];
    rooms: Room[];
}

export const QuickViewScheduleModal: React.FC<QuickViewScheduleModalProps> = ({
    teacherId,
    onClose,
    activeSchedule,
    selectedDayOfWeek,
    classes,
    subjects,
    rooms
}) => (
    <Modal isOpen={!!teacherId} onClose={onClose} title="Расписание учителя" maxWidth="max-w-md">
        <div className="space-y-3">
            {teacherId &&
                (() => {
                    const schedule = activeSchedule
                        .filter((s) => s.teacherId === teacherId && s.day === selectedDayOfWeek)
                        .sort((a, b) => a.period - b.period);
                    if (schedule.length === 0) return <div className="text-center text-slate-400 py-8">Уроков нет</div>;
                    return schedule.map((s) => {
                        const c = classes.find((x) => x.id === s.classId)?.name;
                        const subj = subjects.find((x) => x.id === s.subjectId)?.name;
                        const r = rooms.find((x) => x.id === s.roomId)?.name || s.roomId;
                        return (
                            <div
                                key={s.id}
                                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-xl"
                            >
                                <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-600 flex items-center justify-center font-bold text-slate-500">
                                    {s.period}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 dark:text-white">{c}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        {subj}, каб. {r}
                                    </div>
                                </div>
                            </div>
                        );
                    });
                })()}
        </div>
    </Modal>
);
