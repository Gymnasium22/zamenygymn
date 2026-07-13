import { useState, useMemo, useEffect, useCallback } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { exportService } from '../services/exportService';
import { escapeCsv } from '../utils/csv';
import { BarChart } from '../components/UI';
import { DAYS, Substitution, Settings } from '../types';
import { getActiveSemester, formatDateEuropean } from '../utils/helpers';

const PLAN_WEEKS = 4;

type ReportTab = 'load' | 'sanpin' | 'rating' | 'builder';
type SortKey =
    | 'name'
    | 'weeklyHours'
    | 'plan4w'
    | 'subsTaken'
    | 'replacedAway'
    | 'cancelled'
    | 'netEstimate'
    | 'subjectsList';
type SortDir = 'asc' | 'desc';
type PeriodMode = 'semester' | 'month';

interface TariffRow {
    id: string;
    name: string;
    weeklyHours: number;
    plan4w: number;
    subsTaken: number;
    replacedAway: number;
    cancelled: number;
    netEstimate: number;
    subjectBreakdown: Record<string, number>;
    subjectsList: string;
}

interface PeriodRange {
    start: string; // YYYY-MM-DD
    end: string;
    label: string;
}

const DEFAULT_FIRST_MONTHS = [8, 9, 10, 11];
const DEFAULT_SECOND_MONTHS = [0, 1, 2, 3, 4];

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function daysInMonth(year: number, monthIndex: number): number {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function toISODate(year: number, monthIndex: number, day: number): string {
    return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function academicYearStart(ref: Date): number {
    // Учебный год начинается в сентябре: с сент. refYear → refYear; янв–авг → предыдущий календарный год
    return ref.getMonth() >= 8 ? ref.getFullYear() : ref.getFullYear() - 1;
}

function getSemesterMonths(settings: Settings | undefined, semester: 1 | 2): number[] {
    const cfg = settings?.semesterConfig;
    if (semester === 1) {
        return cfg?.firstSemesterMonths?.length ? cfg.firstSemesterMonths : DEFAULT_FIRST_MONTHS;
    }
    return cfg?.secondSemesterMonths?.length ? cfg.secondSemesterMonths : DEFAULT_SECOND_MONTHS;
}

/** Диапазон дат полугодия в рамках текущего учебного года */
function getSemesterRange(semester: 1 | 2, settings: Settings | undefined, ref: Date = new Date()): PeriodRange {
    const months = [...getSemesterMonths(settings, semester)].sort((a, b) => a - b);
    const ay = academicYearStart(ref);

    // Месяцы 0–7 относятся к календарному году ay+1, 8–11 — к ay
    const yearOfMonth = (m: number) => (m >= 8 ? ay : ay + 1);

    const firstM = months[0] ?? (semester === 1 ? 8 : 0);
    const lastM = months[months.length - 1] ?? (semester === 1 ? 11 : 4);
    const startYear = yearOfMonth(firstM);
    const endYear = yearOfMonth(lastM);

    const start = toISODate(startYear, firstM, 1);
    const end = toISODate(endYear, lastM, daysInMonth(endYear, lastM));

    // Явные даты из настроек, если заданы
    const explicitStart = semester === 1 ? settings?.semesterStart1 : settings?.semesterStart2;
    const explicitEnd = semester === 1 ? settings?.semesterEnd1 : settings?.semesterEnd2;
    const rangeStart = explicitStart && /^\d{4}-\d{2}-\d{2}$/.test(explicitStart) ? explicitStart : start;
    const rangeEnd = explicitEnd && /^\d{4}-\d{2}-\d{2}$/.test(explicitEnd) ? explicitEnd : end;

    const label =
        semester === 1
            ? `1-е полугодие (${formatDateEuropean(rangeStart)} – ${formatDateEuropean(rangeEnd)})`
            : `2-е полугодие (${formatDateEuropean(rangeStart)} – ${formatDateEuropean(rangeEnd)})`;

    return { start: rangeStart, end: rangeEnd, label };
}

function getMonthRange(yearMonth: string): PeriodRange {
    const [y, m] = yearMonth.split('-').map(Number);
    const monthIndex = m - 1;
    const start = toISODate(y, monthIndex, 1);
    const end = toISODate(y, monthIndex, daysInMonth(y, monthIndex));
    const label = new Date(y, monthIndex, 1).toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    return { start, end, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

function dateInRange(isoDate: string, range: PeriodRange): boolean {
    if (!isoDate || isoDate.length < 10) return false;
    const d = isoDate.slice(0, 10);
    return d >= range.start && d <= range.end;
}

function isRealTeacherId(id: string | undefined | null): boolean {
    return !!id && id !== 'conducted' && id !== 'cancelled';
}

/** Замена кабинета / сам провёл — не влияет на часы */
function isSelfOrRoomOnly(s: Substitution): boolean {
    return (
        s.replacementTeacherId === 'conducted' ||
        (isRealTeacherId(s.replacementTeacherId) && s.replacementTeacherId === s.originalTeacherId)
    );
}

function classifySubForTeacher(s: Substitution, teacherId: string) {
    if (isSelfOrRoomOnly(s)) {
        return { taken: false, replacedAway: false, cancelled: false };
    }
    const taken = s.replacementTeacherId === teacherId;
    const cancelled = s.originalTeacherId === teacherId && s.replacementTeacherId === 'cancelled';
    const replacedAway =
        s.originalTeacherId === teacherId &&
        isRealTeacherId(s.replacementTeacherId) &&
        s.replacementTeacherId !== teacherId;
    return { taken, replacedAway, cancelled };
}

type ColumnKey = Exclude<SortKey, never>;

const REPORT_COLUMNS: { key: ColumnKey; label: string }[] = [
    { key: 'name', label: 'ФИО учителя' },
    { key: 'weeklyHours', label: 'Нагрузка (нед)' },
    { key: 'plan4w', label: `План ~${PLAN_WEEKS} нед` },
    { key: 'subsTaken', label: 'Замены (+)' },
    { key: 'replacedAway', label: 'Снято (замена)' },
    { key: 'cancelled', label: 'Отмены' },
    { key: 'netEstimate', label: 'Оценка (4 нед ± замены)' },
    { key: 'subjectsList', label: 'Предметы' }
];

export const ReportsPage = () => {
    const { subjects, teachers, classes, settings } = useStaticData();
    const { schedule1, schedule2, substitutions } = useScheduleData();

    const [reportTab, setReportTab] = useState<ReportTab>('load');
    const reportableClasses = useMemo(() => classes.filter((c) => !c.excludeFromReports), [classes]);
    const [selectedClassId, setSelectedClassId] = useState(() => reportableClasses[0]?.id || classes[0]?.id || '');

    useEffect(() => {
        if (!selectedClassId && reportableClasses.length > 0) {
            setSelectedClassId(reportableClasses[0].id);
        } else if (selectedClassId && reportableClasses.length > 0 && !reportableClasses.some((c) => c.id === selectedClassId)) {
            setSelectedClassId(reportableClasses[0].id);
        }
    }, [reportableClasses, selectedClassId]);

    const [selectedSemester, setSelectedSemester] = useState<1 | 2>(() => getActiveSemester(new Date(), settings) ?? 1);

    const [periodMode, setPeriodMode] = useState<PeriodMode>('semester');
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [hideZeroLoad, setHideZeroLoad] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>('netEstimate');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>([
        'name',
        'weeklyHours',
        'plan4w',
        'subsTaken',
        'replacedAway',
        'cancelled',
        'netEstimate'
    ]);

    const activeSchedule = useMemo(() => {
        const raw = selectedSemester === 2 ? schedule2 : schedule1;
        const excluded = new Set(classes.filter((c) => c.excludeFromReports).map((c) => c.id));
        if (excluded.size === 0) return raw;
        return raw.filter((s) => !excluded.has(s.classId));
    }, [selectedSemester, schedule1, schedule2, classes]);

    const periodRange = useMemo(() => {
        if (periodMode === 'month') return getMonthRange(selectedMonth);
        return getSemesterRange(selectedSemester, settings);
    }, [periodMode, selectedMonth, selectedSemester, settings]);

    const periodSubs = useMemo(
        () => substitutions.filter((s) => dateInRange(s.date, periodRange)),
        [substitutions, periodRange]
    );

    const tariffData = useMemo<TariffRow[]>(() => {
        return teachers.map((t) => {
            const weeklyLessons = activeSchedule.filter((s) => s.teacherId === t.id);
            const weeklyHours = weeklyLessons.length;
            const plan4w = weeklyHours * PLAN_WEEKS;

            let subsTaken = 0;
            let replacedAway = 0;
            let cancelled = 0;
            for (const s of periodSubs) {
                const c = classifySubForTeacher(s, t.id);
                if (c.taken) subsTaken += 1;
                if (c.replacedAway) replacedAway += 1;
                if (c.cancelled) cancelled += 1;
            }

            // Оценка: 4 недельных нагрузки + проведённые замены − уроки, отданные другому.
            // Отмены не вычитаем из «оценки работы» — показываем отдельно.
            const netEstimate = plan4w + subsTaken - replacedAway;

            const subjectBreakdown: Record<string, number> = {};
            weeklyLessons.forEach((s) => {
                const subj = subjects.find((sub) => sub.id === s.subjectId);
                if (subj) subjectBreakdown[subj.name] = (subjectBreakdown[subj.name] || 0) + 1;
            });

            return {
                id: t.id,
                name: t.name,
                weeklyHours,
                plan4w,
                subsTaken,
                replacedAway,
                cancelled,
                netEstimate,
                subjectBreakdown,
                subjectsList: Object.keys(subjectBreakdown).join(', ')
            };
        });
    }, [teachers, activeSchedule, periodSubs, subjects]);

    const filteredSortedRows = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let rows = tariffData;
        if (hideZeroLoad) {
            rows = rows.filter(
                (r) => r.weeklyHours > 0 || r.subsTaken > 0 || r.replacedAway > 0 || r.cancelled > 0
            );
        }
        if (q) {
            rows = rows.filter((r) => r.name.toLowerCase().includes(q));
        }
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv), 'ru') * dir;
        });
    }, [tariffData, searchQuery, hideZeroLoad, sortKey, sortDir]);

    const summary = useMemo(() => {
        const withLoad = tariffData.filter((r) => r.weeklyHours > 0);
        const totalWeekly = withLoad.reduce((s, r) => s + r.weeklyHours, 0);
        const avgWeekly = withLoad.length ? Math.round((totalWeekly / withLoad.length) * 10) / 10 : 0;
        const totalTaken = periodSubs.filter(
            (s) => isRealTeacherId(s.replacementTeacherId) && s.replacementTeacherId !== s.originalTeacherId
        ).length;
        const totalCancelled = periodSubs.filter((s) => s.replacementTeacherId === 'cancelled').length;
        return {
            teachersWithLoad: withLoad.length,
            avgWeekly,
            totalTaken,
            totalCancelled,
            shown: filteredSortedRows.length
        };
    }, [tariffData, periodSubs, filteredSortedRows.length]);

    const sanPinData = useMemo(() => {
        if (!selectedClassId) return [];
        return DAYS.map((day) => {
            const lessons = activeSchedule.filter((s) => s.classId === selectedClassId && s.day === day);
            const score = lessons.reduce((acc, curr) => {
                const subj = subjects.find((s) => s.id === curr.subjectId);
                return acc + (subj?.difficulty || 5);
            }, 0);
            return { label: day, value: score };
        });
    }, [activeSchedule, subjects, selectedClassId]);

    const sanPinMax = useMemo(() => Math.max(...sanPinData.map((d) => d.value), 1), [sanPinData]);

    const ratings = useMemo(() => {
        const heroes = teachers
            .map((t) => {
                let count = 0;
                for (const s of periodSubs) {
                    if (classifySubForTeacher(s, t.id).taken) count += 1;
                }
                return { name: t.name, count };
            })
            .filter((h) => h.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // «Снятые уроки» — та же логика, что в тарификации (замена другим + отмена)
        const removed = teachers
            .map((t) => {
                let count = 0;
                for (const s of periodSubs) {
                    const c = classifySubForTeacher(s, t.id);
                    if (c.replacedAway || c.cancelled) count += 1;
                }
                return { name: t.name, count };
            })
            .filter((h) => h.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // Дни недоступности в том же периоде (справочно)
        const unavailableDays = teachers
            .map((t) => ({
                name: t.name,
                count: (t.unavailableDates || []).filter((d) => dateInRange(d, periodRange)).length
            }))
            .filter((h) => h.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return { heroes, removed, unavailableDays };
    }, [teachers, periodSubs, periodRange]);

    const toggleColumn = (key: ColumnKey) => {
        setSelectedColumns((prev) => {
            if (prev.includes(key)) {
                if (key === 'name') return prev; // имя всегда оставляем
                return prev.filter((k) => k !== key);
            }
            return [...prev, key];
        });
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'name' || key === 'subjectsList' ? 'asc' : 'desc');
        }
    };

    const sortIndicator = (key: SortKey) => {
        if (sortKey !== key) return '';
        return sortDir === 'asc' ? ' ↑' : ' ↓';
    };

    const downloadReport = useCallback(() => {
        const periodNote = `Период: ${periodRange.label}`;
        let content = '';

        if (reportTab === 'load') {
            content =
                `${periodNote}\n` +
                [
                    'ФИО учителя',
                    'Нагрузка (нед)',
                    `План ~${PLAN_WEEKS} нед`,
                    'Замены (+)',
                    'Снято (замена)',
                    'Отмены',
                    'Оценка (4 нед ± замены)',
                    'Предметы'
                ]
                    .map(escapeCsv)
                    .join(',') +
                '\n' +
                filteredSortedRows
                    .map((r) =>
                        [
                            r.name,
                            r.weeklyHours,
                            r.plan4w,
                            r.subsTaken,
                            r.replacedAway,
                            r.cancelled,
                            r.netEstimate,
                            Object.entries(r.subjectBreakdown)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join('; ')
                        ]
                            .map(escapeCsv)
                            .join(',')
                    )
                    .join('\n');
        } else if (reportTab === 'sanpin') {
            const clsName = classes.find((c) => c.id === selectedClassId)?.name || selectedClassId;
            content =
                `${periodNote}; Класс: ${clsName}\n` +
                'День,Балл сложности\n' +
                sanPinData.map((r) => `${escapeCsv(r.label)},${escapeCsv(r.value)}`).join('\n');
        } else if (reportTab === 'rating') {
            content =
                `${periodNote}\n` +
                'Тип,Место,ФИО,Количество\n' +
                ratings.heroes
                    .map((h, i) =>
                        [escapeCsv('Герои замен'), escapeCsv(i + 1), escapeCsv(h.name), escapeCsv(h.count)].join(',')
                    )
                    .join('\n') +
                (ratings.heroes.length ? '\n' : '') +
                ratings.removed
                    .map((h, i) =>
                        [escapeCsv('Снятые уроки'), escapeCsv(i + 1), escapeCsv(h.name), escapeCsv(h.count)].join(',')
                    )
                    .join('\n') +
                (ratings.removed.length ? '\n' : '') +
                ratings.unavailableDays
                    .map((h, i) =>
                        [
                            escapeCsv('Дни недоступности'),
                            escapeCsv(i + 1),
                            escapeCsv(h.name),
                            escapeCsv(h.count)
                        ].join(',')
                    )
                    .join('\n');
        } else if (reportTab === 'builder') {
            const cols = selectedColumns.length ? selectedColumns : (['name'] as ColumnKey[]);
            const header = cols.map((key) => escapeCsv(REPORT_COLUMNS.find((c) => c.key === key)?.label)).join(',');
            const rows = filteredSortedRows
                .map((r) =>
                    cols
                        .map((key) => {
                            const val = r[key];
                            return escapeCsv(typeof val === 'object' ? '' : val);
                        })
                        .join(',')
                )
                .join('\n');
            content = `${periodNote}\n${header}\n${rows}`;
        }

        const modeTag = periodMode === 'month' ? selectedMonth : `${selectedSemester}sem`;
        exportService.saveAsCSV(content, `otchet_${reportTab}_${modeTag}.csv`);
    }, [
        reportTab,
        periodRange,
        filteredSortedRows,
        sanPinData,
        ratings,
        selectedColumns,
        classes,
        selectedClassId,
        periodMode,
        selectedMonth,
        selectedSemester
    ]);

    const emptyTableMessage =
        activeSchedule.length === 0
            ? 'Нет расписания на выбранное полугодие'
            : filteredSortedRows.length === 0
              ? searchQuery
                  ? 'Никого не найдено по запросу'
                  : hideZeroLoad
                    ? 'Нет учителей с нагрузкой или заменами за период'
                    : 'Нет данных'
              : null;

    const thSortable = (key: SortKey, label: string, extraClass = '') => (
        <th
            className={`p-3 md:p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-300 ${extraClass}`}
            onClick={() => handleSort(key)}
            title="Нажмите для сортировки"
        >
            {label}
            {sortIndicator(key)}
        </th>
    );

    const filtersBar = (
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4 items-stretch sm:items-center">
            <div className="relative flex-1 min-w-[180px]">
                <Icon
                    name="Search"
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск учителя…"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-400"
                />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none px-1">
                <input
                    type="checkbox"
                    checked={hideZeroLoad}
                    onChange={(e) => setHideZeroLoad(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Только с нагрузкой / заменами
            </label>
        </div>
    );

    const legendBlock = (
        <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
            <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">Как считаются цифры</p>
            <ul className="list-disc pl-4 space-y-1">
                <li>
                    <b>Нагрузка (нед)</b> — число уроков в расписании выбранного полугодия (классы «вне отчётов» не
                    учитываются).
                </li>
                <li>
                    <b>План ~{PLAN_WEEKS} нед</b> — нагрузка × {PLAN_WEEKS} (условная оценка месяца, не календарный
                    месяц).
                </li>
                <li>
                    <b>Замены (+)</b> — уроки, которые учитель <b>провёл вместо коллеги</b> за выбранный период (
                    {periodRange.label}).
                </li>
                <li>
                    <b>Снято (замена)</b> — свои уроки, которые <b>провёл другой</b> учитель (не отмена и не «сам
                    провёл»).
                </li>
                <li>
                    <b>Отмены</b> — уроки со статусом «отменён»; в оценку ± не входят, показываются отдельно.
                </li>
                <li>
                    <b>Оценка (4 нед ± замены)</b> = План ~{PLAN_WEEKS} нед + Замены − Снято. Это ориентир, не
                    официальная тарификация.
                </li>
            </ul>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto w-full pb-20">
            <div className="bg-white dark:bg-dark-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <Icon name="BarChart2" className="text-indigo-600 dark:text-indigo-400" /> Отчёты
                    </h1>

                    <div className="flex flex-wrap gap-2 sm:gap-3 items-center w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Расписание:</span>
                            <select
                                value={selectedSemester}
                                onChange={(e) => setSelectedSemester(Number(e.target.value) as 1 | 2)}
                                className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                <option value={1}>1-е (Сен–Дек)</option>
                                <option value={2}>2-е (Янв–Май)</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Период замен:</span>
                            <select
                                value={periodMode}
                                onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
                                className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                <option value="semester">Полугодие</option>
                                <option value="month">Месяц</option>
                            </select>
                            {periodMode === 'month' && (
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none"
                                />
                            )}
                        </div>

                        <button
                            onClick={downloadReport}
                            className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                        >
                            <Icon name="FileSpreadsheet" size={16} /> Скачать CSV
                        </button>
                    </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Замены и рейтинг: <span className="font-semibold text-slate-700 dark:text-slate-300">{periodRange.label}</span>
                    {' · '}
                    Нагрузка из расписания: {selectedSemester === 1 ? '1-е' : '2-е'} полугодие
                </p>

                {/* Сводка */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-indigo-500">С нагрузкой</div>
                        <div className="text-lg font-black text-indigo-800 dark:text-indigo-200">
                            {summary.teachersWithLoad}
                        </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-slate-500">Ср. уроков/нед</div>
                        <div className="text-lg font-black text-slate-800 dark:text-slate-100">{summary.avgWeekly}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-emerald-600">Замен за период</div>
                        <div className="text-lg font-black text-emerald-800 dark:text-emerald-200">
                            {summary.totalTaken}
                        </div>
                    </div>
                    <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 px-3 py-2">
                        <div className="text-[10px] uppercase font-bold text-rose-500">Отмен за период</div>
                        <div className="text-lg font-black text-rose-800 dark:text-rose-200">
                            {summary.totalCancelled}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
                    {(
                        [
                            ['load', 'Тарификация'],
                            ['sanpin', 'СанПиН'],
                            ['rating', 'Рейтинг'],
                            ['builder', 'Конструктор']
                        ] as const
                    ).map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setReportTab(id)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                                reportTab === id
                                    ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {reportTab === 'load' && (
                <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 sm:p-6">
                    {filtersBar}
                    <div className="overflow-x-auto overflow-y-auto max-h-[70vh] max-w-full rounded-xl border border-slate-100 dark:border-slate-700">
                        <table className="w-full text-left border-collapse min-w-[720px]">
                            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                                <tr>
                                    {thSortable('name', 'Учитель')}
                                    {thSortable('weeklyHours', 'Нед', 'text-right')}
                                    {thSortable('plan4w', `~${PLAN_WEEKS} нед`, 'text-right')}
                                    {thSortable('subsTaken', '+ Замены', 'text-right text-emerald-600')}
                                    {thSortable('replacedAway', 'Снято', 'text-right text-amber-600')}
                                    {thSortable('cancelled', 'Отмены', 'text-right text-red-500')}
                                    {thSortable('netEstimate', 'Оценка', 'text-right')}
                                    <th className="p-3 md:p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase w-1/4">
                                        Детализация
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {emptyTableMessage ? (
                                    <tr>
                                        <td colSpan={8} className="p-10 text-center text-slate-500 dark:text-slate-400">
                                            {emptyTableMessage}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSortedRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="p-3 md:p-4 font-bold text-slate-800 dark:text-slate-200">
                                                {row.name}
                                            </td>
                                            <td className="p-3 md:p-4 text-right font-mono">{row.weeklyHours}</td>
                                            <td className="p-3 md:p-4 text-right font-mono text-slate-500">
                                                {row.plan4w}
                                            </td>
                                            <td className="p-3 md:p-4 text-right font-mono text-emerald-600 font-bold">
                                                {row.subsTaken > 0 ? `+${row.subsTaken}` : '0'}
                                            </td>
                                            <td className="p-3 md:p-4 text-right font-mono text-amber-600 font-bold">
                                                {row.replacedAway > 0 ? `−${row.replacedAway}` : '0'}
                                            </td>
                                            <td className="p-3 md:p-4 text-right font-mono text-red-500 font-bold">
                                                {row.cancelled > 0 ? row.cancelled : '0'}
                                            </td>
                                            <td className="p-3 md:p-4 text-right font-mono font-black text-lg">
                                                {row.netEstimate}
                                            </td>
                                            <td className="p-3 md:p-4 text-xs text-slate-500 dark:text-slate-400">
                                                <div className="flex flex-wrap gap-1">
                                                    {Object.entries(row.subjectBreakdown).map(([s, c]) => (
                                                        <span
                                                            key={s}
                                                            className="bg-slate-100 dark:bg-slate-600 px-1.5 py-0.5 rounded"
                                                        >
                                                            {s}: {c}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {!emptyTableMessage && (
                        <p className="mt-2 text-xs text-slate-400">
                            Показано: {summary.shown} из {tariffData.length} учителей
                        </p>
                    )}
                    {legendBlock}
                </div>
            )}

            {reportTab === 'sanpin' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                            <h3 className="font-bold text-lg dark:text-white">График сложности</h3>
                            <select
                                value={selectedClassId}
                                onChange={(e) => setSelectedClassId(e.target.value)}
                                className="border dark:border-slate-600 p-2 rounded-lg bg-transparent dark:text-white outline-none"
                            >
                                {(reportableClasses.length ? reportableClasses : classes).map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {sanPinData.every((d) => d.value === 0) ? (
                            <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                                Нет уроков у этого класса в выбранном полугодии
                            </div>
                        ) : (
                            <BarChart items={sanPinData} max={sanPinMax} barClassName="bg-indigo-500" />
                        )}
                        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                            Баллы — сумма трудности предметов за день (из справочника). Рекомендуемый пик: среда /
                            четверг. Подробный разбор нарушений — в разделе «Экспорт» → СанПиН.
                        </div>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900">
                        <h3 className="font-bold text-indigo-900 dark:text-indigo-300 mb-4">Нормы СанПиН</h3>
                        <ul className="space-y-3 text-sm text-indigo-800 dark:text-indigo-400">
                            <li className="flex gap-2">
                                <div className="w-1.5 h-1.5 mt-1.5 bg-indigo-500 rounded-full shrink-0" />
                                Равномерное распределение нагрузки
                            </li>
                            <li className="flex gap-2">
                                <div className="w-1.5 h-1.5 mt-1.5 bg-indigo-500 rounded-full shrink-0" />
                                Тяжёлые предметы не в 1-й и не в последний урок подряд
                            </li>
                            <li className="flex gap-2">
                                <div className="w-1.5 h-1.5 mt-1.5 bg-indigo-500 rounded-full shrink-0" />
                                Контрольные работы предпочтительно во вт/ср
                            </li>
                        </ul>
                    </div>
                </div>
            )}

            {reportTab === 'rating' && (
                <div className="space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 px-1">
                        За период: <b className="text-slate-700 dark:text-slate-200">{periodRange.label}</b>. Те же
                        правила, что в тарификации: замена другим ≠ отмена ≠ «сам провёл».
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <h3 className="font-bold text-lg text-emerald-600 mb-4 flex items-center gap-2">
                                <Icon name="TrendingUp" size={20} /> Герои замен (топ-5)
                            </h3>
                            {ratings.heroes.length === 0 ? (
                                <p className="text-sm text-slate-500 py-8 text-center">Нет замен за период</p>
                            ) : (
                                <BarChart
                                    items={ratings.heroes.map((h) => ({ label: h.name, value: h.count }))}
                                    max={Math.max(...ratings.heroes.map((h) => h.count), 1)}
                                    barClassName="bg-emerald-500"
                                />
                            )}
                            <p className="mt-3 text-xs text-slate-400">Уроки, проведённые вместо коллеги</p>
                        </div>
                        <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <h3 className="font-bold text-lg text-amber-600 mb-4 flex items-center gap-2">
                                <Icon name="Activity" size={20} /> Снятые уроки (топ-5)
                            </h3>
                            {ratings.removed.length === 0 ? (
                                <p className="text-sm text-slate-500 py-8 text-center">Нет снятых уроков за период</p>
                            ) : (
                                <BarChart
                                    items={ratings.removed.map((h) => ({ label: h.name, value: h.count }))}
                                    max={Math.max(...ratings.removed.map((h) => h.count), 1)}
                                    barClassName="bg-amber-500"
                                />
                            )}
                            <p className="mt-3 text-xs text-slate-400">Замена другим + отмены</p>
                        </div>
                        <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <h3 className="font-bold text-lg text-red-500 mb-4 flex items-center gap-2">
                                <Icon name="Calendar" size={20} /> Дни недоступности (топ-5)
                            </h3>
                            {ratings.unavailableDays.length === 0 ? (
                                <p className="text-sm text-slate-500 py-8 text-center">
                                    Нет отмеченных дней недоступности
                                </p>
                            ) : (
                                <BarChart
                                    items={ratings.unavailableDays.map((h) => ({ label: h.name, value: h.count }))}
                                    max={Math.max(...ratings.unavailableDays.map((h) => h.count), 1)}
                                    barClassName="bg-red-500"
                                />
                            )}
                            <p className="mt-3 text-xs text-slate-400">
                                Из карточки учителя (не то же самое, что «снятые уроки»)
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {reportTab === 'builder' && (
                <div className="bg-white dark:bg-dark-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    {filtersBar}
                    <div className="mb-6">
                        <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2">Колонки</h3>
                        <div className="flex flex-wrap gap-2">
                            {REPORT_COLUMNS.map((col) => (
                                <button
                                    key={col.key}
                                    onClick={() => toggleColumn(col.key)}
                                    disabled={col.key === 'name' && selectedColumns.includes('name')}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                                        selectedColumns.includes(col.key)
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-300'
                                            : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400'
                                    }`}
                                >
                                    {col.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-auto max-h-[70vh] rounded-xl border border-slate-200 dark:border-slate-600">
                        <table className="w-full text-left border-collapse min-w-[480px]">
                            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700">
                                <tr>
                                    {selectedColumns.map((colKey) => (
                                        <th
                                            key={colKey}
                                            className="p-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-600 cursor-pointer select-none hover:text-indigo-600"
                                            onClick={() => handleSort(colKey)}
                                        >
                                            {REPORT_COLUMNS.find((c) => c.key === colKey)?.label}
                                            {sortIndicator(colKey)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {emptyTableMessage ? (
                                    <tr>
                                        <td
                                            colSpan={Math.max(selectedColumns.length, 1)}
                                            className="p-10 text-center text-slate-500"
                                        >
                                            {emptyTableMessage}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSortedRows.map((row) => (
                                        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            {selectedColumns.map((colKey) => {
                                                const cellValue = row[colKey];
                                                return (
                                                    <td
                                                        key={`${row.id}-${colKey}`}
                                                        className="p-3 text-sm text-slate-700 dark:text-slate-300"
                                                    >
                                                        {typeof cellValue === 'object' ? '' : cellValue}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {legendBlock}
                </div>
            )}
        </div>
    );
};
