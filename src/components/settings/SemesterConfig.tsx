import React, { useMemo } from 'react';

const MONTHS = [
    'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
    'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'
];

interface SemesterConfigProps {
    firstSemesterMonths: number[];
    secondSemesterMonths: number[];
    onChange: (first: number[], second: number[]) => void;
}

export const SemesterConfig: React.FC<SemesterConfigProps> = ({
    firstSemesterMonths,
    secondSemesterMonths,
    onChange
}) => {
    const toggleMonth = (monthIndex: number) => {
        const inFirst = firstSemesterMonths.includes(monthIndex);
        const inSecond = secondSemesterMonths.includes(monthIndex);

        let newFirst = [...firstSemesterMonths];
        let newSecond = [...secondSemesterMonths];

        if (inFirst) {
            newFirst = newFirst.filter((m) => m !== monthIndex);
        } else if (inSecond) {
            newSecond = newSecond.filter((m) => m !== monthIndex);
        } else {
            // По умолчанию добавляем в первый семестр, если он "осенний" (авг-дек)
            // или во второй, если "весенний" (янв-май)
            if (monthIndex >= 7) {
                newFirst = [...newFirst, monthIndex].sort((a, b) => a - b);
            } else {
                newSecond = [...newSecond, monthIndex].sort((a, b) => a - b);
            }
            onChange(newFirst, newSecond);
            return;
        }

        onChange(newFirst, newSecond);
    };

    const setSemester = (monthIndex: number, semester: 1 | 2 | null) => {
        let newFirst = firstSemesterMonths.filter((m) => m !== monthIndex);
        let newSecond = secondSemesterMonths.filter((m) => m !== monthIndex);

        if (semester === 1) {
            newFirst = [...newFirst, monthIndex].sort((a, b) => a - b);
        } else if (semester === 2) {
            newSecond = [...newSecond, monthIndex].sort((a, b) => a - b);
        }

        onChange(newFirst, newSecond);
    };

    const getMonthStatus = (idx: number): 'first' | 'second' | 'none' => {
        if (firstSemesterMonths.includes(idx)) return 'first';
        if (secondSemesterMonths.includes(idx)) return 'second';
        return 'none';
    };

    const stats = useMemo(() => {
        return {
            first: firstSemesterMonths.length,
            second: secondSemesterMonths.length,
            none: 12 - firstSemesterMonths.length - secondSemesterMonths.length
        };
    }, [firstSemesterMonths, secondSemesterMonths]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {MONTHS.map((name, idx) => {
                    const status = getMonthStatus(idx);
                    const base =
                        'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer select-none';
                    const activeFirst =
                        'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 shadow-sm';
                    const activeSecond =
                        'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-sm';
                    const inactive =
                        'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600';

                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => toggleMonth(idx)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                const status = getMonthStatus(idx);
                                if (status === 'first') setSemester(idx, 2);
                                else if (status === 'second') setSemester(idx, null);
                                else setSemester(idx, 1);
                            }}
                            title={`${MONTHS[idx]} — ЛКМ: переключить, ПКМ: сменить семестр/сброс`}
                            className={`${base} ${
                                status === 'first'
                                    ? activeFirst
                                    : status === 'second'
                                      ? activeSecond
                                      : inactive
                            }`}
                        >
                            {name}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700" />
                    <span className="text-slate-600 dark:text-slate-400">
                        1-й семестр ({stats.first})
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700" />
                    <span className="text-slate-600 dark:text-slate-400">
                        2-й семестр ({stats.second})
                    </span>
                </div>
                {stats.none > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                        <span className="text-slate-600 dark:text-slate-400">
                            Не выбрано ({stats.none})
                        </span>
                    </div>
                )}
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                ЛКМ — переключить семестр, ПКМ — сменить семестр/сбросить. Месяцы без семестра
                исключаются из расчёта активного расписания.
            </p>
        </div>
    );
};
