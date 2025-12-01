import { useState, useMemo } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { BarChart } from '../components/UI';
import { DAYS } from '../types';

export const ReportsPage = () => {
    const { subjects, teachers, classes } = useStaticData();
    // Получаем оба расписания
    const { schedule1, schedule2, substitutions } = useScheduleData();
    
    const [reportTab, setReportTab] = useState('load');
    const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || '');
    
    // Состояние для выбора полугодия (по умолчанию текущее)
    const [selectedSemester, setSelectedSemester] = useState<1 | 2>(() => {
        const month = new Date().getMonth();
        return (month >= 0 && month <= 4) ? 2 : 1;
    });

    // Выбираем расписание на основе селектора
    const activeSchedule = useMemo(() => {
        return selectedSemester === 2 ? schedule2 : schedule1;
    }, [selectedSemester, schedule1, schedule2]);
    
    const tariffData = useMemo(() => { 
        const weeks = 4; 
        return teachers.map(t => { 
            // Используем activeSchedule вместо schedule
            const weeklyLessons = activeSchedule.filter(s => s.teacherId === t.id); 
            const weeklyHours = weeklyLessons.length; 
            const monthlyPlan = weeklyHours * weeks; 
            const subsTaken = substitutions.filter(s => s.replacementTeacherId === t.id).length; 
            const subsMissed = substitutions.filter(s => s.originalTeacherId === t.id).length; 
            const actualHours = monthlyPlan + subsTaken - subsMissed; 
            const subjectBreakdown: Record<string, number> = {}; 
            weeklyLessons.forEach(s => { 
                const subj = subjects.find(sub => sub.id === s.subjectId); 
                if(subj) subjectBreakdown[subj.name] = (subjectBreakdown[subj.name] || 0) + 1; 
            }); 
            return { id: t.id, name: t.name, weeklyHours, subsTaken, subsMissed, actualHours, subjectBreakdown }; 
        }).sort((a,b) => b.actualHours - a.actualHours); 
    }, [teachers, activeSchedule, substitutions, subjects]);

    const sanPinData = useMemo(() => { 
        if(!selectedClassId) return []; 
        return DAYS.map(day => { 
            // Используем activeSchedule вместо schedule
            const lessons = activeSchedule.filter(s => s.classId === selectedClassId && s.day === day); 
            const score = lessons.reduce((acc, curr) => { 
                const subj = subjects.find(s => s.id === curr.subjectId); 
                return acc + (subj?.difficulty || 5); 
            }, 0); 
            return { label: day, value: score }; 
        }); 
    }, [activeSchedule, subjects, selectedClassId]);

    const ratings = useMemo(() => { 
        const heroes = teachers.map(t => ({ 
            name: t.name, 
            count: substitutions.filter(s => s.replacementTeacherId === t.id).length 
        })).sort((a,b) => b.count - a.count).slice(0, 5); 
        
        const absentees = teachers.map(t => ({ 
            name: t.name, 
            count: t.unavailableDates.length 
        })).sort((a,b) => b.count - a.count).slice(0, 5); 
        
        return { heroes, absentees }; 
    }, [teachers, substitutions]);

    const downloadReport = () => { 
        let csv = ""; 
        if (reportTab === 'load') { 
            csv = "Teacher,Planned Weekly,Subs Taken,Absences (Lessons),Est. Monthly Actual,Details\n" + tariffData.map(r => `"${r.name}",${r.weeklyHours},${r.subsTaken},${r.subsMissed},${r.actualHours},"${Object.entries(r.subjectBreakdown).map(([k,v]) => k+': '+v).join(', ')}"`).join('\n'); 
        } else if (reportTab === 'sanpin') { 
            csv = "Day,Score\n" + sanPinData.map(r => `${r.label},${r.value}`).join('\n'); 
        } 
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a"); 
        link.href = URL.createObjectURL(blob);
        link.download = `report_${reportTab}_${selectedSemester}sem.csv`; 
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link); 
    };

    return (
        <div className="max-w-6xl mx-auto w-full pb-20">
            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <Icon name="BarChart2" className="text-indigo-600 dark:text-indigo-400" /> Аналитика
                    </h1>
                    
                    <div className="flex gap-4 items-center">
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Полугодие:</span>
                            <select
                                value={selectedSemester}
                                onChange={(e) => setSelectedSemester(Number(e.target.value) as 1 | 2)}
                                className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                <option value={1}>1-е (Сен-Дек)</option>
                                <option value={2}>2-е (Янв-Май)</option>
                            </select>
                        </div>

                        <button onClick={downloadReport} className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900/50">
                            <Icon name="FileSpreadsheet" size={16}/> Скачать CSV
                        </button>
                    </div>
                </div>
                <div className="flex gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-xl w-fit overflow-x-auto max-w-full">
                    <button onClick={() => setReportTab('load')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${reportTab === 'load' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Тарификация (Нагрузка)</button>
                    <button onClick={() => setReportTab('sanpin')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${reportTab === 'sanpin' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>СанПиН (Сложность)</button>
                    <button onClick={() => setReportTab('rating')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${reportTab === 'rating' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>Рейтинг замен</button>
                </div>
            </div>
            {reportTab === 'load' && (
                <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                            <tr>
                                <th className="p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase">Учитель</th>
                                <th className="p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase text-right">План (Нед)</th>
                                <th className="p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase text-right text-emerald-600">+ Замены</th>
                                <th className="p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase text-right text-red-500">- Пропуски</th>
                                <th className="p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase text-right">Итого (Мес)</th>
                                <th className="p-4 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase w-1/3">Детализация</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {tariffData.map(row => (
                                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{row.name}</td>
                                    <td className="p-4 text-right font-mono">{row.weeklyHours}</td>
                                    <td className="p-4 text-right font-mono text-emerald-600 font-bold">+{row.subsTaken}</td>
                                    <td className="p-4 text-right font-mono text-red-500 font-bold">-{row.subsMissed}</td>
                                    <td className="p-4 text-right font-mono font-black text-lg">{row.actualHours}</td>
                                    <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(row.subjectBreakdown).map(([s,c]) => (
                                                <span key={s} className="bg-slate-100 dark:bg-slate-600 px-1.5 py-0.5 rounded">{s}: {c}</span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {reportTab === 'sanpin' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg dark:text-white">График сложности</h3>
                            <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="border dark:border-slate-600 p-2 rounded-lg bg-transparent dark:text-white outline-none">
                                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <BarChart items={sanPinData} max={60} barClassName="bg-indigo-500"/>
                        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">* Баллы рассчитываются на основе шкалы трудности предметов (Математика=11, и т.д.). Рекомендуемый пик нагрузки: Среда/Четверг.</div>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900">
                        <h3 className="font-bold text-indigo-900 dark:text-indigo-300 mb-4">Нормы СанПиН</h3>
                        <ul className="space-y-3 text-sm text-indigo-800 dark:text-indigo-400">
                            <li className="flex gap-2"><div className="w-1.5 h-1.5 mt-1.5 bg-indigo-500 rounded-full"></div>Равномерное распределение нагрузки</li>
                            <li className="flex gap-2"><div className="w-1.5 h-1.5 mt-1.5 bg-indigo-500 rounded-full"></div>Один сложный предмет в день</li>
                            <li className="flex gap-2"><div className="w-1.5 h-1.5 mt-1.5 bg-indigo-500 rounded-full"></div>Контрольные работы в Вт/Ср</li>
                        </ul>
                    </div>
                </div>
            )}
            {reportTab === 'rating' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-lg text-emerald-600 mb-4 flex items-center gap-2"><Icon name="TrendingUp" size={20}/> Герои замен (Топ 5)</h3>
                        <BarChart items={ratings.heroes.map(h => ({ label: h.name, value: h.count }))} max={Math.max(...ratings.heroes.map(h=>h.count), 1)} barClassName="bg-emerald-500"/>
                    </div>
                    <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                        <h3 className="font-bold text-lg text-red-500 mb-4 flex items-center gap-2"><Icon name="Activity" size={20}/> Пропуски (Топ 5)</h3>
                        <BarChart items={ratings.absentees.map(h => ({ label: h.name, value: h.count }))} max={Math.max(...ratings.absentees.map(h=>h.count), 1)} barClassName="bg-red-500"/>
                    </div>
                </div>
            )}
        </div>
    );
};