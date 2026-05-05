import React from 'react';
import { Icon } from '../Icons';
import { Shift, Subject } from '../../types';

interface TeacherFilterProps {
    shiftFilter: string;
    onShiftChange: (shift: string) => void;
    subjectFilter: string;
    onSubjectChange: (id: string) => void;
    subjects: Subject[];
    searchQuery: string;
    onSearchChange: (query: string) => void;
}

export const TeacherFilter: React.FC<TeacherFilterProps> = ({
    shiftFilter,
    onShiftChange,
    subjectFilter,
    onSubjectChange,
    subjects,
    searchQuery,
    onSearchChange
}) => (
    <div className="mb-3 space-y-2">
        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
            <button
                onClick={() => onShiftChange('all')}
                className={`flex-1 py-2 text-xs font-bold rounded-md ${shiftFilter === 'all' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
                Все
            </button>
            <button
                onClick={() => onShiftChange(Shift.First)}
                className={`flex-1 py-2 text-xs font-bold rounded-md ${shiftFilter === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
                1 см
            </button>
            <button
                onClick={() => onShiftChange(Shift.Second)}
                className={`flex-1 py-2 text-xs font-bold rounded-md ${shiftFilter === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
                2 см
            </button>
        </div>
        <select
            value={subjectFilter}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
        >
            <option value="">Все предметы</option>
            {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                    {s.name}
                </option>
            ))}
        </select>
        <div className="relative">
            <Icon name="Search" className="absolute left-3 top-3 text-slate-400" size={16} />
            <input
                placeholder="Найти учителя..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 rounded-xl text-sm outline-none focus:ring-1 ring-indigo-500 dark:text-white"
            />
        </div>
    </div>
);
