import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { Modal, useToast } from '../UI';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { archiveService } from '../../services/archiveService';
import { logger } from '../../utils/logger';

const getCurrentAcademicYearEnd = (settingsCurrentYear?: number): number => {
    if (settingsCurrentYear) return settingsCurrentYear;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11
    // С 1 сентября (month >= 8) уже идёт новый учебный год, который закончится в мае year + 1
    return month >= 8 ? year + 1 : year;
};

const yearLabelFromEnd = (yearEnd: number): string => `${yearEnd - 1}/${yearEnd}`;

const defaultYearLabel = (currentYear?: number): string =>
    yearLabelFromEnd(getCurrentAcademicYearEnd(currentYear));

interface Counts {
    schedule1: number;
    schedule2: number;
    substitutions: number;
    dutySchedule: number;
    nutritionRecords: number;
    absenteeismRecords: number;
}

const COUNT_LABELS: { key: keyof Counts; label: string }[] = [
    { key: 'schedule1', label: 'Расписание 1 пол.' },
    { key: 'schedule2', label: 'Расписание 2 пол.' },
    { key: 'substitutions', label: 'Замены' },
    { key: 'dutySchedule', label: 'Дежурства' },
    { key: 'nutritionRecords', label: 'Записи питания' },
    { key: 'absenteeismRecords', label: 'Записи пропусков' }
];

export const ArchiveYearSection = () => {
    const { data, saveData } = useData();
    const { organizationId } = useAuth();
    const { addToast } = useToast();
    const [counts, setCounts] = useState<Counts | null>(null);
    const [loadingCounts, setLoadingCounts] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [yearLabel, setYearLabel] = useState(defaultYearLabel(data.settings.currentYear));
    const [fileSavedConfirmed, setFileSavedConfirmed] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const totalRecords = useMemo(
        () => (counts ? Object.values(counts).reduce((sum, c) => sum + c, 0) : 0),
        [counts]
    );

    const currentYearEnd = useMemo(
        () => getCurrentAcademicYearEnd(data.settings.currentYear),
        [data.settings.currentYear]
    );
    const nextYearEnd = useMemo(() => currentYearEnd + 1, [currentYearEnd]);

    const loadCounts = async () => {
        setLoadingCounts(true);
        try {
            const c = await archiveService.getCounts(organizationId);
            setCounts(c);
        } catch (error) {
            logger.error('Failed to load archive counts', error);
        } finally {
            setLoadingCounts(false);
        }
    };

    useEffect(() => {
        loadCounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationId]);

    const openModal = () => {
        setYearLabel(yearLabelFromEnd(currentYearEnd));
        setFileSavedConfirmed(false);
        setIsModalOpen(true);
        loadCounts();
    };

    const closeModal = () => {
        if (isProcessing) return;
        setIsModalOpen(false);
    };

    const handleCloseYear = async () => {
        if (!navigator.onLine) {
            addToast({
                type: 'warning',
                title: 'Нет соединения',
                message: 'Закрытие учебного года требует подключения к интернету.'
            });
            return;
        }

        setIsProcessing(true);
        try {
            const archive = await archiveService.buildArchive(data, yearLabel.trim(), organizationId);
            archiveService.downloadArchive(archive);
            await archiveService.clearAnnualCollections(organizationId);
            await saveData({
                schedule: [],
                schedule2: [],
                substitutions: [],
                dutySchedule: [],
                nutritionRecords: [],
                absenteeismRecords: [],
                settings: {
                    ...data.settings,
                    substitutionDayComments: {},
                    currentYear: nextYearEnd
                }
            });
            setCounts({
                schedule1: 0,
                schedule2: 0,
                substitutions: 0,
                dutySchedule: 0,
                nutritionRecords: 0,
                absenteeismRecords: 0
            });
            setIsModalOpen(false);
            addToast({
                type: 'success',
                title: 'Учебный год закрыт',
                message: `Архив ${archive.yearLabel} сохранён и загружен. Текущий учебный год изменён на ${yearLabelFromEnd(nextYearEnd)}.`
            });
        } catch (error) {
            logger.error('Failed to close academic year', error);
            addToast({
                type: 'danger',
                title: 'Ошибка',
                message:
                    (error as Error).message || 'Не удалось закрыть учебный год. Данные не были удалены.'
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Icon name="Archive" size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800 dark:text-white text-base">
                                Закрыть учебный год
                            </h3>
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
                                Только администратор
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Выгрузить годовые данные в файл и очистить их из базы. Справочники и
                            настройки останутся.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                {COUNT_LABELS.map(({ key, label }) => (
                    <div
                        key={key}
                        className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-3 border border-slate-100 dark:border-slate-700"
                    >
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {label}
                        </div>
                        <div className="text-lg font-black text-slate-800 dark:text-white">
                            {loadingCounts || !counts ? (
                                <span className="inline-block w-4 h-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
                            ) : (
                                counts[key]
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={openModal}
                    disabled={loadingCounts || totalRecords === 0}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                        totalRecords === 0 || loadingCounts
                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                    }`}
                >
                    <Icon name="Archive" size={16} />
                    Закрыть учебный год
                </button>
                {totalRecords === 0 && !loadingCounts && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        Нет данных для архивации.
                    </span>
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title="Закрыть учебный год"
                maxWidth="max-w-lg"
            >
                <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 text-sm text-amber-800 dark:text-amber-300">
                        <div className="flex items-start gap-2">
                            <Icon name="AlertTriangle" size={18} className="shrink-0 mt-0.5" />
                            <div>
                                Это необратимая операция. Перед очисткой базы будет автоматически
                                скачан JSON-файл архива.
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                            Учебный год для архива
                        </label>
                        <input
                            type="text"
                            value={yearLabel}
                            onChange={(e) => setYearLabel(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-amber-500 outline-none"
                            placeholder="2025/2026"
                        />
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            Закрывается{' '}
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {yearLabelFromEnd(currentYearEnd)}
                            </span>
                            . После закрытия текущий учебный год автоматически станет{' '}
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {yearLabelFromEnd(nextYearEnd)}
                            </span>
                            .
                        </p>
                    </div>

                    <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                        <p>Будет заархивировано:</p>
                        <ul className="list-disc list-inside text-slate-500 dark:text-slate-400">
                            {COUNT_LABELS.map(({ key, label }) => (
                                <li key={key}>
                                    {label}: {counts?.[key] ?? 0}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-dark-700/50 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={fileSavedConfirmed}
                            onChange={(e) => setFileSavedConfirmed(e.target.checked)}
                            className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                            Я сохранил скачанный архивный файл и подтверждаю необратимую очистку
                            годовых данных из базы.
                        </span>
                    </label>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={closeModal}
                            disabled={isProcessing}
                            className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            onClick={handleCloseYear}
                            disabled={isProcessing || !yearLabel.trim() || !fileSavedConfirmed}
                            className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isProcessing ? (
                                <>
                                    <span className="inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    Обработка...
                                </>
                            ) : (
                                <>
                                    <Icon name="Download" size={16} />
                                    Скачать и очистить
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};


