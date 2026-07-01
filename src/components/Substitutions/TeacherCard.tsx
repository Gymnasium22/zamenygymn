import React from 'react';
import { Icon } from '../Icons';
import { Shift, Teacher } from '../../types';

interface TeacherCardProps {
    teacher: Teacher;
    isAbsent: boolean;
    absenceReason?: string;
    selectedDate: string;
    onOpenAbsenceModal: (id: string) => void;
    onRemoveAbsence: (id: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
}

export const TeacherCard: React.FC<TeacherCardProps> = ({
    teacher,
    isAbsent,
    absenceReason,
    onOpenAbsenceModal,
    onRemoveAbsence,
    onDragStart
}) => {
    return (
        <div
            draggable={true}
            onDragStart={(e) => onDragStart(e, teacher.id)}
            className={`flex flex-col p-4 rounded-xl border transition-all ${isAbsent ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900 opacity-90' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-600 cursor-grab active:cursor-grabbing hover:border-indigo-300'}`}
        >
            <div className="flex items-center justify-between mb-1">
                <span
                    className={`text-base font-bold ${isAbsent ? 'text-red-700 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                    {teacher.name}
                </span>
                <div className="flex gap-1">
                    {isAbsent && (
                        <button
                            onClick={() => onOpenAbsenceModal(teacher.id)}
                            className="p-1.5 bg-white text-slate-500 rounded-lg hover:text-indigo-600 shadow-sm"
                            title="Изменить причину"
                        >
                            <Icon name="Edit" size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => (isAbsent ? onRemoveAbsence(teacher.id) : onOpenAbsenceModal(teacher.id))}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition-colors ${isAbsent ? 'bg-white dark:bg-dark-800 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                    >
                        {isAbsent ? 'Вернуть' : 'Нет'}
                    </button>
                </div>
            </div>
            <div className="flex justify-between items-end">
                <div className="flex gap-1">
                    {teacher.shifts.map((s) => (
                        <span
                            key={s}
                            className="text-[10px] bg-white dark:bg-slate-600 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-500 text-slate-500 font-medium"
                        >
                            {s === Shift.First ? '1' : '2'}
                        </span>
                    ))}
                </div>
                {isAbsent && absenceReason && (
                    <div className="text-xs text-red-500 dark:text-red-400 italic font-medium truncate max-w-[140px]" title={absenceReason}>
                        {absenceReason}
                    </div>
                )}
            </div>
        </div>
    );
};
