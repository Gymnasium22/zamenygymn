
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icons';
import { Modal, useToast, SearchableSelect } from '../components/UI';
import { ClassEntity, NutritionRecord } from '../types';
import { formatDateISO, generateId } from '../utils/helpers';
import html2canvas from 'html2canvas';

export const NutritionPage = () => {
    const { classes, teachers } = useStaticData();
    const { nutritionRecords, saveScheduleData } = useScheduleData();
    const { role, user } = useAuth();
    const { addToast } = useToast();

    const isAdmin = role === 'admin';
    const isTeacher = role === 'teacher';
    const isCanteen = role === 'canteen';

    const [selectedDate, setSelectedDate] = useState(formatDateISO());
    const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<NutritionRecord | null>(null);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [totalCount, setTotalCount] = useState<number>(0);
    const [benefitCount, setBenefitCount] = useState<number>(0);

    const printRef = useRef<HTMLDivElement>(null);

    // Get records for selected date
    const recordsForDate = useMemo(() => {
        return nutritionRecords.filter(r => r.date === selectedDate);
    }, [nutritionRecords, selectedDate]);

    // Get records for selected month
    const recordsForMonth = useMemo(() => {
        const [year, month] = selectedMonth.split('-').map(Number);
        return nutritionRecords.filter(r => {
            const recordDate = new Date(r.date);
            return recordDate.getFullYear() === year && recordDate.getMonth() + 1 === month;
        });
    }, [nutritionRecords, selectedMonth]);

    // Statistics for selected date
    const dayStats = useMemo(() => {
        const stats = {
            totalStudents: 0,
            totalBenefit: 0,
            totalRegular: 0,
            classCount: recordsForDate.length,
            records: recordsForDate
        };
        recordsForDate.forEach(r => {
            stats.totalStudents += r.totalCount;
            stats.totalBenefit += r.benefitCount;
            stats.totalRegular += r.regularCount;
        });
        return stats;
    }, [recordsForDate]);

    // Statistics for selected month
    const monthStats = useMemo(() => {
        const statsByDate = new Map<string, { total: number; benefit: number; regular: number; classCount: number }>();
        
        recordsForMonth.forEach(r => {
            const existing = statsByDate.get(r.date) || { total: 0, benefit: 0, regular: 0, classCount: 0 };
            existing.total += r.totalCount;
            existing.benefit += r.benefitCount;
            existing.regular += r.regularCount;
            existing.classCount += 1;
            statsByDate.set(r.date, existing);
        });

        const total = Array.from(statsByDate.values()).reduce((acc, day) => ({
            total: acc.total + day.total,
            benefit: acc.benefit + day.benefit,
            regular: acc.regular + day.regular,
            classCount: Math.max(acc.classCount, day.classCount)
        }), { total: 0, benefit: 0, regular: 0, classCount: 0 });

        const avgPerDay = statsByDate.size > 0 ? {
            total: Math.round(total.total / statsByDate.size),
            benefit: Math.round(total.benefit / statsByDate.size),
            regular: Math.round(total.regular / statsByDate.size)
        } : { total: 0, benefit: 0, regular: 0 };

        return {
            total,
            avgPerDay,
            daysCount: statsByDate.size,
            statsByDate: Array.from(statsByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        };
    }, [recordsForMonth]);

    // Get class name and order helpers to respect directory ordering
    const getClassName = (classId: string) => {
        return classes.find(c => c.id === classId)?.name || classId;
    };

    const getClassOrder = (classId: string) => {
        const cls = classes.find(c => c.id === classId);
        if (!cls) return Number.MAX_SAFE_INTEGER;
        return typeof cls.order === 'number' ? cls.order : Number.MAX_SAFE_INTEGER;
    };

    // Get teacher name who entered
    const getEnteredByName = (record: NutritionRecord) => {
        if (!record.enteredBy) return 'Неизвестно';
        return teachers.find(t => t.id === record.enteredBy)?.name || 'Неизвестно';
    };

    // Open modal for editing/creating
    const openModal = (classId?: string, record?: NutritionRecord) => {
        if (record) {
            setEditingRecord(record);
            setSelectedClassId(record.classId);
            setTotalCount(record.totalCount);
            setBenefitCount(record.benefitCount);
        } else {
            setEditingRecord(null);
            setSelectedClassId(classId || '');
            setTotalCount(0);
            setBenefitCount(0);
        }
        setIsModalOpen(true);
    };

    // Close modal
    const closeModal = () => {
        setIsModalOpen(false);
        setEditingRecord(null);
        setSelectedClassId('');
        setTotalCount(0);
        setBenefitCount(0);
    };

    // Save record
    const saveRecord = useCallback(async () => {
        if (!selectedClassId) {
            addToast({ type: 'warning', title: 'Выберите класс' });
            return;
        }

        if (totalCount < 0 || benefitCount < 0) {
            addToast({ type: 'warning', title: 'Количество не может быть отрицательным' });
            return;
        }

        if (benefitCount > totalCount) {
            addToast({ type: 'warning', title: 'Льготников не может быть больше общего количества' });
            return;
        }

        const regularCount = totalCount - benefitCount;
        const now = new Date().toISOString();

        let updatedRecords: NutritionRecord[];

        if (editingRecord) {
            // Update existing
            updatedRecords = nutritionRecords.map(r =>
                r.id === editingRecord.id
                    ? {
                          ...r,
                          classId: selectedClassId,
                          totalCount,
                          benefitCount,
                          regularCount,
                          enteredBy: user?.uid || r.enteredBy,
                          enteredAt: now
                      }
                    : r
            );
        } else {
            // Check if record already exists for this date and class
            const existing = nutritionRecords.find(
                r => r.date === selectedDate && r.classId === selectedClassId
            );

            if (existing) {
                // Update existing
                updatedRecords = nutritionRecords.map(r =>
                    r.id === existing.id
                        ? {
                              ...r,
                              totalCount,
                              benefitCount,
                              regularCount,
                              enteredBy: user?.uid || r.enteredBy,
                              enteredAt: now
                          }
                        : r
                );
            } else {
                // Create new
                const newRecord: NutritionRecord = {
                    id: generateId(),
                    date: selectedDate,
                    classId: selectedClassId,
                    totalCount,
                    benefitCount,
                    regularCount,
                    enteredBy: user?.uid,
                    enteredAt: now
                };
                updatedRecords = [...nutritionRecords, newRecord];
            }
        }

        await saveScheduleData({ nutritionRecords: updatedRecords } as any);
        addToast({ type: 'success', title: 'Данные сохранены' });
        closeModal();
    }, [selectedClassId, totalCount, benefitCount, editingRecord, selectedDate, nutritionRecords, saveScheduleData, user, addToast]);

    // Delete record (admin can delete any, teachers can delete their own)
    const deleteRecord = useCallback(async (recordId: string) => {
        const record = nutritionRecords.find(r => r.id === recordId);
        if (!record) return;

        // Teachers can only delete their own records
        if (!isAdmin && record.enteredBy !== user?.uid) {
            addToast({ type: 'warning', title: 'Вы можете удалять только свои записи' });
            return;
        }

        if (!window.confirm('Удалить запись?')) return;

        const updatedRecords = nutritionRecords.filter(r => r.id !== recordId);
        await saveScheduleData({ nutritionRecords: updatedRecords } as any);
        addToast({ type: 'success', title: 'Запись удалена' });
    }, [nutritionRecords, saveScheduleData, isAdmin, user, addToast]);

    // Export to PDF (using print)
    const exportToPDF = () => {
        if (!printRef.current) return;
        
        // Show print dialog
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            addToast({ type: 'warning', title: 'Разрешите всплывающие окна для экспорта' });
            return;
        }

        const printContent = printRef.current.innerHTML;
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Отчёт по питанию</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                    th { background-color: #f0f0f0; font-weight: bold; }
                    .text-center { text-align: center; }
                    h1 { text-align: center; margin-bottom: 20px; }
                    @media print {
                        @page { margin: 1cm; }
                    }
                </style>
            </head>
            <body>
                ${printContent}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    // Get classes for teacher (classes they teach)
    const teacherClasses = useMemo(() => {
        if (isAdmin) return classes;
        if (!user) return [];

        // For teachers, show all classes (can be filtered later if needed)
        return classes;
    }, [classes, isAdmin, user]);

    // Get classes without data for today (respect directory order)
    const classesWithoutData = useMemo(() => {
        if (viewMode !== 'day') return [];
        
        const todayRecords = recordsForDate.map(r => r.classId);
        return classes
            .filter(cls => !todayRecords.includes(cls.id))
            .sort((a, b) => {
                const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
                const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
                if (orderA !== orderB) return orderA - orderB;
                return a.name.localeCompare(b.name);
            });
    }, [classes, recordsForDate, viewMode]);

    return (
        <div className="max-w-7xl mx-auto w-full pb-20">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white mb-2">Питание</h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        {isAdmin ? 'Управление питанием и статистика' :
                         isCanteen ? 'Просмотр данных о питании' :
                         'Ввод данных о питании'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode(viewMode === 'day' ? 'month' : 'day')}
                        className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-semibold"
                    >
                        {viewMode === 'day' ? 'За месяц' : 'За день'}
                    </button>
                    {(isAdmin || isCanteen) && (
                        <button
                            onClick={exportToPDF}
                            className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-semibold flex items-center gap-2"
                        >
                            <Icon name="Download" size={18} />
                            Экспорт PDF
                        </button>
                    )}
                </div>
            </div>

            {/* Date/Month Selector */}
            <div className="mb-6 flex flex-wrap items-center gap-4">
                {viewMode === 'day' ? (
                    <>
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Дата:
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                    </>
                ) : (
                    <>
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            Месяц:
                        </label>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                    </>
                )}
            </div>

            {/* Widget: Classes without data for today */}
            {viewMode === 'day' && classesWithoutData.length > 0 && (
                <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-amber-500 text-white p-2.5 rounded-xl">
                            <Icon name="AlertTriangle" size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800 dark:text-white">
                                Классы без данных за сегодня
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {classesWithoutData.length} {classesWithoutData.length === 1 ? 'класс' : classesWithoutData.length < 5 ? 'класса' : 'классов'} не внесли данные
                            </p>
                        </div>
                    </div>
                    {(isTeacher || isAdmin) ? (
                        <div className="flex flex-wrap gap-2">
                            {classesWithoutData.map((cls) => (
                                <button
                                    key={cls.id}
                                    onClick={() => {
                                        setSelectedDate(formatDateISO());
                                        openModal(cls.id);
                                    }}
                                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                >
                                    {cls.name}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {classesWithoutData.map((cls) => (
                                <span
                                    key={cls.id}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-amber-300 dark:border-amber-700 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400"
                                >
                                    {cls.name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Statistics Cards */}
            {viewMode === 'day' ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Всего питающихся</div>
                        <div className="text-3xl font-black text-slate-800 dark:text-white">{dayStats.totalStudents}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Льготники</div>
                        <div className="text-3xl font-black text-indigo-600">{dayStats.totalBenefit}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Обычные</div>
                        <div className="text-3xl font-black text-green-600">{dayStats.totalRegular}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Классов</div>
                        <div className="text-3xl font-black text-slate-800 dark:text-white">{dayStats.classCount}</div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Всего за месяц</div>
                        <div className="text-3xl font-black text-slate-800 dark:text-white">{monthStats.total.total}</div>
                        <div className="text-xs text-slate-400 mt-1">Среднее: {monthStats.avgPerDay.total}/день</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Льготники</div>
                        <div className="text-3xl font-black text-indigo-600">{monthStats.total.benefit}</div>
                        <div className="text-xs text-slate-400 mt-1">Среднее: {monthStats.avgPerDay.benefit}/день</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Обычные</div>
                        <div className="text-3xl font-black text-green-600">{monthStats.total.regular}</div>
                        <div className="text-xs text-slate-400 mt-1">Среднее: {monthStats.avgPerDay.regular}/день</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Дней с данными</div>
                        <div className="text-3xl font-black text-slate-800 dark:text-white">{monthStats.daysCount}</div>
                    </div>
                </div>
            )}

            {/* Records Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white">
                        {viewMode === 'day' ? `Данные за ${new Date(selectedDate).toLocaleDateString('ru-RU')}` : `Данные за ${new Date(selectedMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`}
                    </h2>
                    {(isTeacher || isAdmin) && viewMode === 'day' && (
                        <button
                            onClick={() => openModal()}
                            className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-semibold flex items-center gap-2"
                        >
                            <Icon name="Plus" size={18} />
                            Добавить
                        </button>
                    )}
                </div>

                {viewMode === 'day' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 dark:bg-slate-900">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Класс</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Всего</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Льготники</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Обычные</th>
                                    {isAdmin && <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Действия</th>}
                                    {isTeacher && <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Действия</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {recordsForDate.length === 0 ? (
                                    <tr>
                                        <td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                                            Нет данных за выбранную дату
                                        </td>
                                    </tr>
                                ) : (
                                    recordsForDate
                                        .slice()
                                        .sort((a, b) => {
                                            const orderA = getClassOrder(a.classId);
                                            const orderB = getClassOrder(b.classId);
                                            if (orderA !== orderB) return orderA - orderB;
                                            return getClassName(a.classId).localeCompare(getClassName(b.classId));
                                        })
                                        .map((record) => (
                                            <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                                                    {getClassName(record.classId)}
                                                </td>
                                                <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">
                                                    {record.totalCount}
                                                </td>
                                                <td className="px-4 py-3 text-center text-indigo-600 font-semibold">
                                                    {record.benefitCount}
                                                </td>
                                                <td className="px-4 py-3 text-center text-green-600 font-semibold">
                                                    {record.regularCount}
                                                </td>
                                                {!isCanteen && (
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            {(isTeacher || isAdmin) && (
                                                                <button
                                                                    onClick={() => openModal(undefined, record)}
                                                                    className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 rounded-lg transition-colors"
                                                                    title="Редактировать"
                                                                >
                                                                    <Icon name="Edit" size={18} />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => deleteRecord(record.id)}
                                                                className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 rounded-lg transition-colors"
                                                                title="Удалить"
                                                            >
                                                                <Icon name="Trash2" size={18} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 dark:bg-slate-900">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-300">Дата</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Всего</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Льготники</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Обычные</th>
                                    <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">Классов</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {monthStats.statsByDate.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                                            Нет данных за выбранный месяц
                                        </td>
                                    </tr>
                                ) : (
                                    monthStats.statsByDate.map(([date, stats]) => (
                                        <tr key={date} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                                                {new Date(date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-300">
                                                {stats.total}
                                            </td>
                                            <td className="px-4 py-3 text-center text-indigo-600 font-semibold">
                                                {stats.benefit}
                                            </td>
                                            <td className="px-4 py-3 text-center text-green-600 font-semibold">
                                                {stats.regular}
                                            </td>
                                            <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">
                                                {stats.classCount}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Print/PDF View */}
            <div ref={printRef} className="hidden print:block">
                <div className="p-8">
                    <h1 className="text-2xl font-black mb-4 text-center">Отчёт по питанию</h1>
                    {viewMode === 'day' ? (
                        <>
                            <p className="text-center mb-6 text-slate-600">
                                Дата: {new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-100">
                                        <th className="border border-slate-300 px-4 py-2 text-left">Класс</th>
                                        <th className="border border-slate-300 px-4 py-2">Всего</th>
                                        <th className="border border-slate-300 px-4 py-2">Льготники</th>
                                        <th className="border border-slate-300 px-4 py-2">Обычные</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recordsForDate
                                        .slice()
                                        .sort((a, b) => {
                                            const orderA = getClassOrder(a.classId);
                                            const orderB = getClassOrder(b.classId);
                                            if (orderA !== orderB) return orderA - orderB;
                                            return getClassName(a.classId).localeCompare(getClassName(b.classId));
                                        })
                                        .map((record) => (
                                            <tr key={record.id}>
                                                <td className="border border-slate-300 px-4 py-2">{getClassName(record.classId)}</td>
                                                <td className="border border-slate-300 px-4 py-2 text-center">{record.totalCount}</td>
                                                <td className="border border-slate-300 px-4 py-2 text-center">{record.benefitCount}</td>
                                                <td className="border border-slate-300 px-4 py-2 text-center">{record.regularCount}</td>
                                            </tr>
                                        ))}
                                </tbody>
                                <tfoot className="bg-slate-100 font-bold">
                                    <tr>
                                        <td className="border border-slate-300 px-4 py-2">Итого</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{dayStats.totalStudents}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{dayStats.totalBenefit}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{dayStats.totalRegular}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </>
                    ) : (
                        <>
                            <p className="text-center mb-6 text-slate-600">
                                Месяц: {new Date(selectedMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                            </p>
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-100">
                                        <th className="border border-slate-300 px-4 py-2 text-left">Дата</th>
                                        <th className="border border-slate-300 px-4 py-2">Всего</th>
                                        <th className="border border-slate-300 px-4 py-2">Льготники</th>
                                        <th className="border border-slate-300 px-4 py-2">Обычные</th>
                                        <th className="border border-slate-300 px-4 py-2">Классов</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {monthStats.statsByDate.map(([date, stats]) => (
                                        <tr key={date}>
                                            <td className="border border-slate-300 px-4 py-2">
                                                {new Date(date).toLocaleDateString('ru-RU')}
                                            </td>
                                            <td className="border border-slate-300 px-4 py-2 text-center">{stats.total}</td>
                                            <td className="border border-slate-300 px-4 py-2 text-center">{stats.benefit}</td>
                                            <td className="border border-slate-300 px-4 py-2 text-center">{stats.regular}</td>
                                            <td className="border border-slate-300 px-4 py-2 text-center">{stats.classCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-100 font-bold">
                                    <tr>
                                        <td className="border border-slate-300 px-4 py-2">Итого</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{monthStats.total.total}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{monthStats.total.benefit}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{monthStats.total.regular}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">-</td>
                                    </tr>
                                    <tr>
                                        <td className="border border-slate-300 px-4 py-2">Среднее за день</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{monthStats.avgPerDay.total}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{monthStats.avgPerDay.benefit}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">{monthStats.avgPerDay.regular}</td>
                                        <td className="border border-slate-300 px-4 py-2 text-center">-</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </>
                    )}
                </div>
            </div>

            {/* Edit/Create Modal */}
            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingRecord ? 'Редактировать запись' : 'Добавить запись'}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Класс
                        </label>
                        <SearchableSelect
                            options={teacherClasses
                                .slice()
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((cls) => ({
                                    value: cls.id,
                                    label: cls.name
                                }))}
                            value={selectedClassId || null}
                            onChange={(value) => setSelectedClassId(String(value))}
                            placeholder="Выберите класс"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Общее количество питающихся
                        </label>
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={totalCount}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setTotalCount(val);
                                if (val < benefitCount) {
                                    setBenefitCount(val);
                                }
                            }}
                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Из них льготников
                        </label>
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={totalCount}
                            value={benefitCount}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setBenefitCount(Math.min(val, totalCount));
                            }}
                            className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                        <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Обычных (автоматически)</div>
                        <div className="text-2xl font-bold text-green-600">{totalCount - benefitCount}</div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={saveRecord}
                            className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-semibold"
                        >
                            Сохранить
                        </button>
                        <button
                            onClick={closeModal}
                            className="px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-semibold"
                        >
                            Отмена
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
