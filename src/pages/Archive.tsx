import { useMemo, useState } from 'react';
import { Icon } from '../components/Icons';
import {
    AcademicYearArchive,
    ArchivedScheduleItem,
    ArchivedSubstitution,
    ArchivedDutyRecord,
    ArchivedNutritionRecord,
    ArchivedAbsenteeismRecord
} from '../types';
import { DayOfWeek } from '../types';
import { formatDateEuropean } from '../utils/helpers';

type TabId = 'schedule1' | 'schedule2' | 'substitutions' | 'duty' | 'nutrition' | 'absenteeism';

const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'schedule1', label: 'Расписание 1 пол.', icon: 'Calendar' },
    { id: 'schedule2', label: 'Расписание 2 пол.', icon: 'Calendar' },
    { id: 'substitutions', label: 'Замены', icon: 'Repeat' },
    { id: 'duty', label: 'Дежурство', icon: 'Shield' },
    { id: 'nutrition', label: 'Питание', icon: 'Coffee' },
    { id: 'absenteeism', label: 'Пропуски', icon: 'UserX' }
];

const DAY_ORDER: Record<string, number> = {
    [DayOfWeek.Monday]: 1,
    [DayOfWeek.Tuesday]: 2,
    [DayOfWeek.Wednesday]: 3,
    [DayOfWeek.Thursday]: 4,
    [DayOfWeek.Friday]: 5
};

const sortByDayAndPeriod = (a: ArchivedScheduleItem, b: ArchivedScheduleItem) => {
    const dayDiff = (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9);
    if (dayDiff !== 0) return dayDiff;
    return a.period - b.period;
};

const matchesSearch = (item: unknown, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    return JSON.stringify(item).toLowerCase().includes(q);
};

const StatCard = ({ label, value, icon }: { label: string; value: number; icon: string }) => (
    <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Icon name={icon} size={20} />
        </div>
        <div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {label}
            </div>
            <div className="text-xl font-black text-slate-800 dark:text-white">{value}</div>
        </div>
    </div>
);

const SectionHeader = ({
    archive,
    activeTab,
    onTabChange,
    search,
    onSearchChange
}: {
    archive: AcademicYearArchive;
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    search: string;
    onSearchChange: (v: string) => void;
}) => (
    <div className="space-y-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">
                    Архив {archive.yearLabel}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Создан {formatDateEuropean(new Date(archive.archivedAt))}
                </p>
            </div>
            <div className="relative">
                <Icon
                    name="Search"
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Поиск..."
                    className="w-full lg:w-64 pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>
        </div>

        <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${
                        activeTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-white dark:bg-dark-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                >
                    <Icon name={tab.icon} size={16} />
                    {tab.label}
                </button>
            ))}
        </div>
    </div>
);

const ScheduleTable = ({ items }: { items: ArchivedScheduleItem[] }) => (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                <tr>
                    <th className="text-left px-4 py-3 font-bold">День</th>
                    <th className="text-left px-4 py-3 font-bold">Урок</th>
                    <th className="text-left px-4 py-3 font-bold">Класс</th>
                    <th className="text-left px-4 py-3 font-bold">Предмет</th>
                    <th className="text-left px-4 py-3 font-bold">Учитель</th>
                    <th className="text-left px-4 py-3 font-bold">Кабинет</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 && (
                    <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                            Нет данных
                        </td>
                    </tr>
                )}
                {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.day}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.period}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">
                            {item.className}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.subjectName}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.teacherName}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.roomName || '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const SubstitutionsTable = ({ items }: { items: ArchivedSubstitution[] }) => (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                <tr>
                    <th className="text-left px-4 py-3 font-bold">Дата</th>
                    <th className="text-left px-4 py-3 font-bold">Класс</th>
                    <th className="text-left px-4 py-3 font-bold">Предмет</th>
                    <th className="text-left px-4 py-3 font-bold">Кого заменяют</th>
                    <th className="text-left px-4 py-3 font-bold">Замена</th>
                    <th className="text-left px-4 py-3 font-bold">Комментарий</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 && (
                    <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                            Нет данных
                        </td>
                    </tr>
                )}
                {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatDateEuropean(new Date(item.date))}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">
                            {item.className}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.subjectName}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                            {item.originalTeacherName}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                            {item.replacementTeacherName}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.comment || '—'}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const DutyTable = ({ items }: { items: ArchivedDutyRecord[] }) => (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                <tr>
                    <th className="text-left px-4 py-3 font-bold">День</th>
                    <th className="text-left px-4 py-3 font-bold">Смена</th>
                    <th className="text-left px-4 py-3 font-bold">Зона</th>
                    <th className="text-left px-4 py-3 font-bold">Учитель</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 && (
                    <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                            Нет данных
                        </td>
                    </tr>
                )}
                {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.day}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.shift}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">{item.zoneName}</td>
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{item.teacherName}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const NutritionTable = ({ items }: { items: ArchivedNutritionRecord[] }) => {
    const totals = useMemo(
        () =>
            items.reduce(
                (acc, r) => {
                    acc.total += r.totalCount;
                    acc.benefit += r.benefitCount;
                    acc.regular += r.regularCount ?? r.totalCount - r.benefitCount;
                    return acc;
                },
                { total: 0, benefit: 0, regular: 0 }
            ),
        [items]
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 text-center">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Всего</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white">{totals.total}</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Льготные</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white">{totals.benefit}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-3 text-center">
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Обычные</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white">{totals.regular}</div>
                </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        <tr>
                            <th className="text-left px-4 py-3 font-bold">Дата</th>
                            <th className="text-left px-4 py-3 font-bold">Класс</th>
                            <th className="text-right px-4 py-3 font-bold">Всего</th>
                            <th className="text-right px-4 py-3 font-bold">Льгот</th>
                            <th className="text-right px-4 py-3 font-bold">Обычные</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                                    Нет данных
                                </td>
                            </tr>
                        )}
                        {items.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {formatDateEuropean(new Date(item.date))}
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">
                                    {item.className}
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                                    {item.totalCount}
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                                    {item.benefitCount}
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                                    {item.regularCount ?? item.totalCount - item.benefitCount}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AbsenteeismTable = ({ items }: { items: ArchivedAbsenteeismRecord[] }) => (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                <tr>
                    <th className="text-left px-4 py-3 font-bold">Дата</th>
                    <th className="text-left px-4 py-3 font-bold">Класс</th>
                    <th className="text-right px-4 py-3 font-bold">Отсутствующих</th>
                    <th className="text-left px-4 py-3 font-bold">Причины</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 && (
                    <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                            Нет данных
                        </td>
                    </tr>
                )}
                {items.map((item) => {
                    const reasons = item.absences.reduce<Record<string, number>>((acc, a) => {
                        const key = a.reason === 'other' && a.otherReason ? a.otherReason : a.reason;
                        acc[key] = (acc[key] || 0) + 1;
                        return acc;
                    }, {});
                    return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {formatDateEuropean(new Date(item.date))}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-white">
                                {item.className}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">
                                {item.absences.length}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">
                                {Object.entries(reasons)
                                    .map(([r, c]) => `${r}: ${c}`)
                                    .join(', ') || '—'}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

const validateArchive = (payload: unknown): AcademicYearArchive | null => {
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Partial<AcademicYearArchive>;
    if (p.version !== '1.0') return null;
    if (!p.yearLabel || typeof p.yearLabel !== 'string') return null;
    if (!Array.isArray(p.schedule1)) return null;
    return p as AcademicYearArchive;
};

export const ArchivePage = () => {
    const [archive, setArchive] = useState<AcademicYearArchive | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('schedule1');
    const [search, setSearch] = useState('');

    const handleFileChange = (file: File | null) => {
        setError(null);
        setArchive(null);
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result as string);
                const valid = validateArchive(parsed);
                if (!valid) {
                    setError('Выбранный файл не является корректным архивом учебного года.');
                    return;
                }
                setArchive(valid);
            } catch {
                setError('Не удалось распознать JSON-файл.');
            }
        };
        reader.onerror = () => setError('Ошибка чтения файла.');
        reader.readAsText(file);
    };

    const filteredItems = useMemo(() => {
        if (!archive) return [];
        const q = search.toLowerCase();
        switch (activeTab) {
            case 'schedule1':
                return archive.schedule1.filter((i) => matchesSearch(i, q)).sort(sortByDayAndPeriod);
            case 'schedule2':
                return archive.schedule2.filter((i) => matchesSearch(i, q)).sort(sortByDayAndPeriod);
            case 'substitutions':
                return archive.substitutions
                    .filter((i) => matchesSearch(i, q))
                    .sort((a, b) => b.date.localeCompare(a.date));
            case 'duty':
                return archive.dutySchedule.filter((i) => matchesSearch(i, q));
            case 'nutrition':
                return archive.nutritionRecords
                    .filter((i) => matchesSearch(i, q))
                    .sort((a, b) => b.date.localeCompare(a.date));
            case 'absenteeism':
                return archive.absenteeismRecords
                    .filter((i) => matchesSearch(i, q))
                    .sort((a, b) => b.date.localeCompare(a.date));
            default:
                return [];
        }
    }, [archive, activeTab, search]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white">Архив</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Загрузите сохранённый JSON-архив учебного года для просмотра
                    </p>
                </div>
                <label className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition">
                    <Icon name="Upload" size={16} />
                    Загрузить архив
                    <input
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                            handleFileChange(e.target.files?.[0] || null);
                            e.currentTarget.value = '';
                        }}
                    />
                </label>
            </div>

            {!archive && !error && (
                <div className="bg-white dark:bg-dark-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                        <Icon name="Archive" size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">
                        Архив не загружен
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Нажмите «Загрузить архив» и выберите файл вида{' '}
                        <code className="bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded">archive_YYYY-YYYY.json</code>
                    </p>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-300 flex items-start gap-3">
                    <Icon name="AlertTriangle" size={20} className="shrink-0 mt-0.5" />
                    <div>
                        <div className="font-bold">Ошибка</div>
                        <div className="text-sm">{error}</div>
                    </div>
                </div>
            )}

            {archive && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard label="Расписание 1 пол." value={archive.schedule1.length} icon="Calendar" />
                        <StatCard label="Расписание 2 пол." value={archive.schedule2.length} icon="Calendar" />
                        <StatCard label="Замены" value={archive.substitutions.length} icon="Repeat" />
                        <StatCard label="Дежурства" value={archive.dutySchedule.length} icon="Shield" />
                        <StatCard label="Питание" value={archive.nutritionRecords.length} icon="Coffee" />
                        <StatCard label="Пропуски" value={archive.absenteeismRecords.length} icon="UserX" />
                    </div>

                    <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-4 lg:p-6">
                        <SectionHeader
                            archive={archive}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            search={search}
                            onSearchChange={setSearch}
                        />

                        {activeTab === 'schedule1' && <ScheduleTable items={filteredItems as ArchivedScheduleItem[]} />}
                        {activeTab === 'schedule2' && <ScheduleTable items={filteredItems as ArchivedScheduleItem[]} />}
                        {activeTab === 'substitutions' && (
                            <SubstitutionsTable items={filteredItems as ArchivedSubstitution[]} />
                        )}
                        {activeTab === 'duty' && <DutyTable items={filteredItems as ArchivedDutyRecord[]} />}
                        {activeTab === 'nutrition' && (
                            <NutritionTable items={filteredItems as ArchivedNutritionRecord[]} />
                        )}
                        {activeTab === 'absenteeism' && (
                            <AbsenteeismTable items={filteredItems as ArchivedAbsenteeismRecord[]} />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
