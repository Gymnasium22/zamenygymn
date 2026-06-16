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

    const vacationMonths = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => i).filter(
            (m) => !firstSemesterMonths.includes(m) && !secondSemesterMonths.includes(m)
        );
    }, [firstSemesterMonths, secondSemesterMonths]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {MONTHS.map((name, idx) => {
                    const status = getMonthStatus(idx);
                    const base =
                        'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer select-none relative group';
                    const activeFirst =
                        'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 shadow-sm';
                    const activeSecond =
                        'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-sm';
                    const inactive =
                        'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600';

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
                            {status === 'none' && (
                                <span className="absolute -top-2 -right-1 text-[8px] font-black bg-amber-400 dark:bg-amber-600 text-white px-1 rounded-full leading-4">
                                    К
                                </span>
                            )}
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
                        <span className="w-3 h-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" />
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            Каникулы ({stats.none}): {vacationMonths.map(m => MONTHS[m]).join(', ')}
                        </span>
                    </div>
                )}
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                ЛКМ — переключить семестр, ПКМ — сменить семестр/сбросить. Месяцы <span className="font-bold text-amber-500">«К»</span> — каникулярные,
                расписание уроков в эти месяцы неактивно.
            </p>
        </div>
    );
};
