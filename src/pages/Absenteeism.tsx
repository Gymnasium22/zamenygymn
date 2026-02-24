import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { dbService } from '../services/db';
import { Icon } from '../components/Icons';
import { Modal, useToast } from '../components/UI';
import { AbsenteeismRecord, StudentAbsence } from '../types';
import { formatDateISO, generateId } from '../utils/helpers';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export const AbsenteeismPage = () => {
    const { classes, teachers } = useStaticData();
    const { absenteeismRecords, saveScheduleData } = useScheduleData();
    const { role, user } = useAuth();
    const { addToast } = useToast();

    // Force sync cache on mount to ensure fresh data
    useEffect(() => {
        dbService.syncCacheWithDatabase('absenteeism_records');
    }, []);

    // Check permissions - only teacher and admin can access
    const isAdmin = role === 'admin';
    const isTeacher = role === 'teacher';

    const [selectedDate, setSelectedDate] = useState(formatDateISO());
    const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<AbsenteeismRecord | null>(null);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    
    // New absence entry state
    const [absences, setAbsences] = useState<StudentAbsence[]>([]);
    const [newStudentName, setNewStudentName] = useState('');
    const [newAbsenceReason, setNewAbsenceReason] = useState<StudentAbsence['reason']>('illness');
    const [newOtherReason, setNewOtherReason] = useState('');

    const printRef = useRef<HTMLDivElement>(null);

    // Get records for selected date
    const recordsForDate = useMemo(() => {
        return absenteeismRecords.filter(r => r.date === selectedDate);
    }, [absenteeismRecords, selectedDate]);

    // Get records for selected month
    const recordsForMonth = useMemo(() => {
        const [year, month] = selectedMonth.split('-').map(Number);
        return absenteeismRecords.filter(r => {
            const recordDate = new Date(r.date);
            return recordDate.getFullYear() === year && recordDate.getMonth() + 1 === month;
        });
    }, [absenteeismRecords, selectedMonth]);

    // Get classes that have NOT submitted info for the selected date
    const pendingClasses = useMemo(() => {
        const submittedClassIds = recordsForDate.map(r => r.classId);
        // Сначала фильтруем, потом сортируем по order, затем по имени для надежности
        return classes
            .filter(c => !submittedClassIds.includes(c.id))
            .sort((a, b) => {
                const orderA = typeof a.order === 'number' ? a.order : 999999;
                const orderB = typeof b.order === 'number' ? b.order : 999999;
                if (orderA !== orderB) return orderA - orderB;
                return a.name.localeCompare(b.name, 'ru', { numeric: true });
            });
    }, [classes, recordsForDate]);

    // Get classes that HAVE submitted info for the selected date
    const submittedRecords = useMemo(() => {
        return recordsForDate.sort((a, b) => {
            const classA = classes.find(c => c.id === a.classId);
            const classB = classes.find(c => c.id === b.classId);
            const orderA = typeof classA?.order === 'number' ? classA.order : 999999;
            const orderB = typeof classB?.order === 'number' ? classB.order : 999999;
            if (orderA !== orderB) return orderA - orderB;
            return (classA?.name || '').localeCompare(classB?.name || '', 'ru', { numeric: true });
        });
    }, [recordsForDate, classes]);


    // Helpers
    const getClassName = (classId: string) => {
        return classes.find(c => c.id === classId)?.name || classId;
    };

    const getEnteredByName = (userId?: string) => {
        if (!userId) return 'Неизвестно';
        return teachers.find(t => t.id === userId)?.name || 'Администратор';
    };

    const getReasonLabel = (reason: StudentAbsence['reason'], other?: string) => {
        switch (reason) {
            case 'statement': return 'Заявление';
            case 'illness': return 'Болезнь';
            case 'abroad': return 'За пределами РБ';
            case 'disrespectful': return 'Неуважительная';
            case 'other': return other || 'Другое';
            default: return reason;
        }
    };

    // Calculate monthly statistics
    const monthlyStats = useMemo(() => {
        const stats: Record<string, { total: number, reasons: Record<string, number> }> = {};
        
        // Initialize all classes
        classes.forEach(c => {
            stats[c.id] = { total: 0, reasons: {} };
        });

        recordsForMonth.forEach(record => {
            if (!stats[record.classId]) {
                stats[record.classId] = { total: 0, reasons: {} };
            }
            
            record.absences.forEach(abs => {
                stats[record.classId].total++;
                const reasonKey = abs.reason === 'other' ? 'Другое' : getReasonLabel(abs.reason);
                stats[record.classId].reasons[reasonKey] = (stats[record.classId].reasons[reasonKey] || 0) + 1;
            });
        });

        return Object.entries(stats)
            .map(([classId, data]) => ({
                classId,
                ...data
            }))
            .sort((a, b) => {
                const classA = classes.find(c => c.id === a.classId);
                const classB = classes.find(c => c.id === b.classId);
                const orderA = typeof classA?.order === 'number' ? classA.order : 999999;
                const orderB = typeof classB?.order === 'number' ? classB.order : 999999;
                if (orderA !== orderB) return orderA - orderB;
                return (classA?.name || '').localeCompare(classB?.name || '', 'ru', { numeric: true });
            });
    }, [recordsForMonth, classes]);

    // Calculate daily statistics for print
    const dailyStats = useMemo(() => {
        const stats: Record<string, { total: number, reasons: Record<string, number> }> = {};
        
        // Initialize all classes
        classes.forEach(c => {
            stats[c.id] = { total: 0, reasons: {} };
        });

        recordsForDate.forEach(record => {
            if (!stats[record.classId]) {
                stats[record.classId] = { total: 0, reasons: {} };
            }
            
            record.absences.forEach(abs => {
                stats[record.classId].total++;
                const reasonKey = abs.reason === 'other' ? 'Другое' : getReasonLabel(abs.reason);
                stats[record.classId].reasons[reasonKey] = (stats[record.classId].reasons[reasonKey] || 0) + 1;
            });
        });

        return Object.entries(stats)
            .map(([classId, data]) => ({
                classId,
                ...data
            }))
            .sort((a, b) => {
                const classA = classes.find(c => c.id === a.classId);
                const classB = classes.find(c => c.id === b.classId);
                const orderA = typeof classA?.order === 'number' ? classA.order : 999999;
                const orderB = typeof classB?.order === 'number' ? classB.order : 999999;
                if (orderA !== orderB) return orderA - orderB;
                return (classA?.name || '').localeCompare(classB?.name || '', 'ru', { numeric: true });
            });
    }, [recordsForDate, classes]);

    // Open modal for editing/creating
    const openModal = (classId?: string, record?: AbsenteeismRecord) => {
        if (record) {
            setEditingRecord(record);
            setSelectedClassId(record.classId);
            setAbsences([...record.absences]);
        } else {
            setEditingRecord(null);
            setSelectedClassId(classId || '');
            setAbsences([]);
        }
        setNewStudentName('');
        setNewAbsenceReason('illness');
        setNewOtherReason('');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingRecord(null);
        setSelectedClassId('');
        setAbsences([]);
    };

    const addStudent = () => {
        if (!newStudentName.trim()) {
            addToast({ type: 'warning', title: 'Введите ФИО учащегося' });
            return;
        }

        if (absences.length >= 25) {
            addToast({ type: 'warning', title: 'Максимально 25 отсутствующих' });
            return;
        }

        if (newAbsenceReason === 'other' && !newOtherReason.trim()) {
            addToast({ type: 'warning', title: 'Укажите причину' });
            return;
        }

        setAbsences([...absences, {
            studentName: newStudentName.trim(),
            reason: newAbsenceReason,
            otherReason: newAbsenceReason === 'other' ? newOtherReason.trim() : undefined
        }]);

        setNewStudentName('');
        setNewAbsenceReason('illness');
        setNewOtherReason('');
    };

    const removeStudent = (index: number) => {
        const newAbsences = [...absences];
        newAbsences.splice(index, 1);
        setAbsences(newAbsences);
    };

    const saveRecord = useCallback(async () => {
        if (!selectedClassId) {
            addToast({ type: 'warning', title: 'Выберите класс' });
            return;
        }

        const record: AbsenteeismRecord = {
            id: editingRecord ? editingRecord.id : generateId(),
            date: selectedDate,
            classId: selectedClassId,
            absences,
            enteredBy: editingRecord?.enteredBy || user?.uid,
            enteredAt: editingRecord?.enteredAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(), // Ensure update timestamp for syncing
            updatedBy: user?.email || 'unknown' // Track who updated
        };

        const updatedRecords = editingRecord
            ? absenteeismRecords.map(r => r.id === record.id ? record : r)
            : [...absenteeismRecords, record];

        await saveScheduleData({ absenteeismRecords: updatedRecords });
        
        addToast({ type: 'success', title: editingRecord ? 'Запись обновлена' : 'Запись сохранена' });
        closeModal();
    }, [selectedClassId, absences, editingRecord, absenteeismRecords, saveScheduleData, selectedDate, user, addToast]);

    const deleteRecord = async () => {
        if (!editingRecord) return;
        
        if (window.confirm('Вы уверены, что хотите удалить запись? Класс вернется в список "Не заполнено".')) {
            const updatedRecords = absenteeismRecords.filter(r => r.id !== editingRecord.id);
            
            // Update local state and sync via standard method (just like Substitutions)
            // This will trigger dbService.save -> syncCollection which handles both cache and Firestore
            await saveScheduleData({ absenteeismRecords: updatedRecords });

            addToast({ type: 'success', title: 'Запись удалена' });
            closeModal();
        }
    };

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
                <title>Отчёт по пропускам</title>
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

    if (!isAdmin && !isTeacher) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Icon name="Shield" size={48} className="mb-4" />
                <p className="text-lg font-medium">Доступ запрещен</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg text-rose-600 dark:text-rose-400">
                            <Icon name="UserX" size={24} />
                        </div>
                        Пропуски занятий
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Учет отсутствующих учащихся</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-slate-100 dark:bg-dark-700 p-1 rounded-xl">
                        <button
                            onClick={() => setViewMode('day')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                viewMode === 'day'
                                    ? 'bg-white dark:bg-dark-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            День
                        </button>
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                viewMode === 'month'
                                    ? 'bg-white dark:bg-dark-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            Месяц
                        </button>
                    </div>
                    
                    {viewMode === 'day' ? (
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    ) : (
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    )}

                    <button
                        onClick={exportToPDF}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
                    >
                        <Icon name="Printer" size={18} />
                        <span className="hidden sm:inline">Отчет</span>
                    </button>
                </div>
            </div>

            {viewMode === 'day' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Pending Classes */}
                    <div className="lg:col-span-1 space-y-4">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                            <Icon name="AlertCircle" className="text-amber-500" size={20} />
                            Не заполнено ({pendingClasses.length})
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
                            {pendingClasses.map(cls => (
                                <button
                                    key={cls.id}
                                    onClick={() => openModal(cls.id)}
                                    className="p-3 bg-white dark:bg-dark-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all text-left group"
                                >
                                    <div className="font-bold text-lg text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                        {cls.name}
                                    </div>
                                    <div className="text-xs text-slate-400">Нажмите для заполнения</div>
                                </button>
                            ))}
                            {pendingClasses.length === 0 && (
                                <div className="col-span-full p-6 text-center text-slate-400 bg-slate-50 dark:bg-dark-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                    Все классы заполнили информацию
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Submitted Records */}
                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                            <Icon name="CheckCircle" className="text-green-500" size={20} />
                            Заполнено ({submittedRecords.length})
                        </h2>
                        
                        <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-dark-700/30 flex justify-between items-center">
                                <h3 className="font-medium text-slate-700 dark:text-slate-200">
                                    Сводка пропусков за {new Date(selectedDate).toLocaleDateString('ru-RU')}
                                </h3>
                            </div>
                            
                            <div className="divide-y divide-slate-100 dark:divide-slate-700">
                                {submittedRecords.map(record => (
                                    <div 
                                        key={record.id} 
                                        onClick={() => openModal(undefined, record)}
                                        className="p-4 hover:bg-slate-50 dark:hover:bg-dark-700/50 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xl border border-indigo-100 dark:border-indigo-900/50">
                                                    {getClassName(record.classId)}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-slate-800 dark:text-white">
                                                        {record.absences.length > 0 
                                                            ? `Отсутствует: ${record.absences.length} чел.` 
                                                            : 'Все присутствуют'}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {record.absences.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {record.absences.slice(0, 3).map((abs, idx) => (
                                                        <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30">
                                                            {abs.studentName}
                                                        </span>
                                                    ))}
                                                    {record.absences.length > 3 && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                            +{record.absences.length - 3} еще
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                
                                {submittedRecords.length === 0 && (
                                    <div className="p-8 text-center text-slate-400">
                                        Нет данных за выбранную дату
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
                            Статистика за {new Date(selectedMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                        </h2>
                        <p className="text-slate-500 mt-1">Сводная таблица по всем классам</p>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-dark-700/50 text-left">
                                    <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Класс</th>
                                    <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Всего пропусков</th>
                                    <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">По причинам</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {monthlyStats.map(stat => (
                                    <tr key={stat.classId} className="hover:bg-slate-50 dark:hover:bg-dark-700/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-800 dark:text-white">
                                            {getClassName(stat.classId)}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                stat.total > 0 
                                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400'
                                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                            }`}>
                                                {stat.total}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                                            {stat.total > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {Object.entries(stat.reasons).map(([reason, count]) => (
                                                        <span key={reason} className="inline-flex items-center gap-1 bg-slate-100 dark:bg-dark-700 px-2 py-1 rounded text-xs">
                                                            <span>{reason}:</span>
                                                            <span className="font-semibold">{count}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {monthlyStats.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                                            Нет данных за выбранный месяц
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={closeModal}
                title={`Пропуски: ${getClassName(selectedClassId)}`}
            >
                <div className="space-y-6">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Добавить отсутствующего</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newStudentName}
                                    onChange={(e) => setNewStudentName(e.target.value)}
                                    placeholder="ФИО учащегося"
                                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <select
                                    value={newAbsenceReason}
                                    onChange={(e) => setNewAbsenceReason(e.target.value as any)}
                                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="illness">Болезнь</option>
                                    <option value="statement">Заявление</option>
                                    <option value="abroad">За границей</option>
                                    <option value="disrespectful">Неуважительная</option>
                                    <option value="other">Другое</option>
                                </select>
                                <button
                                    onClick={addStudent}
                                    className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    <Icon name="Plus" size={20} />
                                </button>
                            </div>
                            {newAbsenceReason === 'other' && (
                                <input
                                    type="text"
                                    value={newOtherReason}
                                    onChange={(e) => setNewOtherReason(e.target.value)}
                                    placeholder="Укажите причину"
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            )}
                        </div>

                        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Список отсутствующих ({absences.length})</h3>
                            {absences.length === 0 ? (
                                <div className="text-center py-4 text-slate-400 bg-slate-50 dark:bg-dark-800/50 rounded-lg">
                                    Нет отсутствующих
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {absences.map((abs, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-dark-700/50 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <div>
                                                <div className="font-medium text-slate-800 dark:text-white">{abs.studentName}</div>
                                                <div className="text-xs text-slate-500">
                                                    {getReasonLabel(abs.reason, abs.otherReason)}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeStudent(idx)}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <Icon name="Trash2" size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-700">
                        {editingRecord && (
                            <button
                                onClick={deleteRecord}
                                className="px-4 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <Icon name="Trash2" size={18} />
                                <span className="hidden sm:inline">Удалить</span>
                            </button>
                        )}
                        <div className="flex gap-3 ml-auto">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-dark-700 rounded-lg transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={saveRecord}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                Сохранить
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Print View */}
            <div ref={printRef} className="hidden print:block">
                <div className="p-8">
                    <h1 className="text-2xl font-black mb-4 text-center">
                        {viewMode === 'day' 
                            ? `Отчёт по пропускам за ${new Date(selectedDate).toLocaleDateString('ru-RU')}`
                            : `Отчёт по пропускам за ${new Date(selectedMonth).toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}`
                        }
                    </h1>
                    
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="border border-slate-300 px-4 py-2 text-left">Класс</th>
                                <th className="border border-slate-300 px-4 py-2 text-center">Всего</th>
                                <th className="border border-slate-300 px-4 py-2 text-center">Болезнь</th>
                                <th className="border border-slate-300 px-4 py-2 text-center">Заявление</th>
                                <th className="border border-slate-300 px-4 py-2 text-center">Неуваж.</th>
                                <th className="border border-slate-300 px-4 py-2 text-center">За гран.</th>
                                <th className="border border-slate-300 px-4 py-2 text-center">Другое</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(viewMode === 'day' ? dailyStats : monthlyStats).map(stat => (
                                <tr key={stat.classId}>
                                    <td className="border border-slate-300 px-4 py-2">{getClassName(stat.classId)}</td>
                                    <td className="border border-slate-300 px-4 py-2 text-center font-bold">{stat.total}</td>
                                    <td className="border border-slate-300 px-4 py-2 text-center">{stat.reasons['Болезнь'] || 0}</td>
                                    <td className="border border-slate-300 px-4 py-2 text-center">{stat.reasons['Заявление'] || 0}</td>
                                    <td className="border border-slate-300 px-4 py-2 text-center">{stat.reasons['Неуважительная'] || 0}</td>
                                    <td className="border border-slate-300 px-4 py-2 text-center">{stat.reasons['За пределами РБ'] || 0}</td>
                                    <td className="border border-slate-300 px-4 py-2 text-center">{stat.reasons['Другое'] || 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
