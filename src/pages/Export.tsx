
import { useState, useRef, useMemo } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { dbService } from '../services/db'; 
import { DAYS, Shift, SHIFT_PERIODS, AppData } from '../types';
import { INITIAL_DATA } from '../constants';
import html2canvas from 'html2canvas';

import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../components/UI';

export const ExportPage = () => {
    const { subjects, teachers, classes, rooms, settings, bellSchedule, saveStaticData } = useStaticData();
    const { schedule1, schedule2, substitutions, saveScheduleData } = useScheduleData();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const printRef = useRef<HTMLDivElement>(null);
    const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
    
    // Выбор полугодия для ручного экспорта (по умолчанию текущее)
    const [exportSemester, setExportSemester] = useState<1 | 2>(() => {
        const month = new Date().getMonth();
        return (month >= 0 && month <= 4) ? 2 : 1;
    });

    const [isGenerating, setIsGenerating] = useState(false);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [publicScheduleUrl, setPublicScheduleUrl] = useState('');
    const [publicScheduleId, setPublicScheduleId] = useState('');

    const fullAppData: AppData = useMemo(() => ({
        subjects, teachers, classes, rooms, settings, bellSchedule,
        schedule: schedule1,
        schedule2ndHalf: schedule2,
        substitutions
    }), [subjects, teachers, classes, rooms, settings, bellSchedule, schedule1, schedule2, substitutions]);

    // Получаем расписание для экспорта (Excel, Матрица) на основе селектора
    const getScheduleForExport = () => exportSemester === 2 ? schedule2 : schedule1;

    // Получаем расписание для PNG (Замены) на основе выбранной даты
    const getScheduleForDate = (date: string) => {
        const month = new Date(date).getMonth();
        return (month >= 0 && month <= 4) ? schedule2 : schedule1;
    };

    const handleImport = (e: any) => { 
        const file = e.target.files?.[0]; 
        if (!file) return; 
        const reader = new FileReader(); 
        reader.onload = async (ev: any) => { 
            try { 
                const json = JSON.parse(ev.target.result); 
                if (json.teachers && (json.schedule || json.schedule2ndHalf)) { 
                    if(window.confirm("Это перезапишет текущую базу данных. Продолжить?")) { 
                        const mergedData = {
                            ...INITIAL_DATA,
                            ...json,
                            rooms: json.rooms || INITIAL_DATA.rooms,
                            classes: json.classes || [],
                            schedule: json.schedule || [],
                            schedule2ndHalf: json.schedule2ndHalf || [],
                            teachers: json.teachers || [],
                            subjects: json.subjects || [],
                            substitutions: json.substitutions || [],
                            settings: { ...INITIAL_DATA.settings, ...json.settings }
                        };
                        await saveStaticData(mergedData as any);
                        await saveScheduleData(mergedData as any);
                        alert("База успешно восстановлена!"); 
                    } 
                } else alert("Неверный формат файла."); 
            } catch (err) { alert("Ошибка чтения файла."); } 
        }; 
        reader.readAsText(file); 
    };
    
    const exportStyledExcel = () => {
        const currentSchedule = getScheduleForExport();
        
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"><style>
                table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
                td, th { border: 1px solid #999; padding: 5px; vertical-align: top; }
                .header { background-color: #f3f4f6; font-weight: bold; text-align: center; }
                .class-cell { font-size: 14px; font-weight: bold; text-align: center; vertical-align: middle; }
                .subject { font-weight: bold; font-size: 11px; }
                .meta { font-size: 10px; color: #555; }
            </style></head><body><table>
        `;

        DAYS.forEach(day => {
            html += `<tr><td colspan="8" style="background-color:#4f46e5; color:white; font-size:16px; font-weight:bold; text-align:center;">${day}</td></tr>`;
            [Shift.First, Shift.Second].forEach(shift => {
                const filteredClasses = classes.filter(c => c.shift === shift);
                if (filteredClasses.length === 0) return;
                
                html += `<tr><td colspan="8" style="background-color:#e0e7ff; font-weight:bold;">${shift}</td></tr>`;
                html += `<tr><th class="header">Класс</th>`;
                SHIFT_PERIODS[shift].forEach(p => html += `<th class="header">${p} урок</th>`);
                html += `</tr>`;

                filteredClasses.forEach(c => {
                    html += `<tr><td class="class-cell">${c.name}</td>`;
                    SHIFT_PERIODS[shift].forEach(p => {
                        const items = currentSchedule.filter(s => s.classId === c.id && s.day === day && s.shift === shift && s.period === p);
                        html += `<td style="height: 60px;">`;
                        items.forEach(item => {
                            const sub = subjects.find(s => s.id === item.subjectId);
                            const teach = teachers.find(t => t.id === item.teacherId);
                            const room = rooms.find(r => r.id === item.roomId);
                            const roomName = room ? room.name : item.roomId;
                            html += `<div style="background-color: ${sub?.color || '#fff'}; padding: 2px; margin-bottom: 2px; border: 1px solid #eee;">
                                <div class="subject">${sub?.name || ''} ${item.direction || ''}</div>
                                <div class="meta">${teach?.name || ''} ${roomName ? `(Каб. ${roomName})` : ''}</div>
                            </div>`;
                        });
                        html += `</td>`;
                    });
                    html += `</tr>`;
                });
            });
        });
        
        html += `</table></body></html>`;
        const blob = new Blob([html], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Расписание_Гимназия22_${exportSemester}пол.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportMatrixExcel = () => {
        const currentSchedule = getScheduleForExport();
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"><style>
                table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; margin-bottom: 20px; }
                td, th { border: 1px solid #000; padding: 2px; vertical-align: middle; text-align: center; }
                .header { font-weight: bold; background-color: #f3f4f6; }
                .subject-cell { font-weight: bold; vertical-align: middle; background-color: #fff; }
                .teacher-cell { text-align: left; padding-left: 5px; }
                sub { font-size: 9px; vertical-align: sub; }
            </style></head><body>
        `;

        [Shift.First, Shift.Second].forEach(shift => {
            const periods = SHIFT_PERIODS[shift];
            
            html += `<table>`;
            html += `<tr>
                <th rowspan="3" class="header" style="border: 2px solid #000; width: 150px;">Учебный предмет</th>
                <th rowspan="3" class="header" style="border: 2px solid #000; width: 200px;">ФИО</th>
                <th colspan="${DAYS.length * periods.length}" class="header" style="border: 2px solid #000; font-size: 14px;">День недели</th>
            </tr>`;

            html += `<tr>`;
            DAYS.forEach(day => {
                html += `<th colspan="${periods.length}" class="header" style="border: 2px solid #000;">${day}</th>`;
            });
            html += `</tr>`;

            html += `<tr>`;
            DAYS.forEach(() => {
                periods.forEach(p => html += `<th class="header" style="border-bottom: 2px solid #000;">Урок</th>`);
            });
            html += `</tr>`;
            
            html += `<tr>
                <th class="header" style="border: 2px solid #000; background-color: #e0e7ff;">${shift}</th>
                <th class="header" style="border: 2px solid #000;"></th>
            `;
            DAYS.forEach(() => {
                periods.forEach(p => html += `<th class="header" style="width: 40px;">${p}</th>`);
            });
            html += `</tr>`;

            subjects.forEach(subject => {
                const filteredTeachers = teachers.filter(t => t.subjectIds.includes(subject.id));
                if (filteredTeachers.length === 0) return;

                const subjectColor = subject.color || '#ffffff';

                filteredTeachers.forEach((teacher, tIndex) => {
                    html += `<tr>`;
                    if (tIndex === 0) {
                        html += `<td rowspan="${filteredTeachers.length}" class="subject-cell" style="border: 2px solid #000; background-color: ${subjectColor};">${subject.name}</td>`;
                    }
                    html += `<td class="teacher-cell" style="border-right: 2px solid #000;">${teacher.name}</td>`;

                    DAYS.forEach(day => {
                        periods.forEach(p => {
                            const item = currentSchedule.find(s => 
                                s.teacherId === teacher.id && 
                                s.subjectId === subject.id && 
                                s.day === day && 
                                s.period === p &&
                                s.shift === shift
                            );

                            if (item) {
                                const cls = classes.find(c => c.id === item.classId);
                                const r = rooms.find(rm => rm.id === item.roomId);
                                const roomName = r ? r.name : item.roomId;
                                const room = roomName ? `<sub>${roomName}</sub>` : '';
                                const dir = item.direction ? ` <span style="font-size:9px">(${item.direction})</span>` : '';
                                const bgColor = subject.color || '#ffffff';
                                html += `<td style="border: 1px solid #000; font-weight: bold; background-color: ${bgColor};">${cls ? cls.name : ''}${dir}${room}</td>`;
                            } else {
                                html += `<td style="border: 1px solid #000;"></td>`;
                            }
                        });
                    });
                    html += `</tr>`;
                });
                html += `<tr><td colspan="${2 + DAYS.length * periods.length}" style="height: 2px; background-color: #000;"></td></tr>`;
            });
            html += `</table><br/><br/>`;
        });

        html += `</body></html>`;
        const blob = new Blob([html], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Матрица_Расписания_${exportSemester}пол.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportMonthlySubstitutionsExcel = () => {
        const targetDate = new Date(exportDate);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        // Фильтруем замены за выбранный месяц
        const monthlySubs = substitutions.filter(s => {
            const sDate = new Date(s.date);
            return sDate.getMonth() === targetMonth && sDate.getFullYear() === targetYear;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (monthlySubs.length === 0) {
            alert("Нет данных о заменах за выбранный месяц.");
            return;
        }

        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"><style>
                table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }
                td, th { border: 1px solid #999; padding: 4px; vertical-align: middle; text-align: left; }
                .header { background-color: #e0e7ff; font-weight: bold; text-align: center; }
                .date-row { background-color: #f3f4f6; font-weight: bold; }
            </style></head><body>
            <h3>Отчет по заменам за ${targetDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
            <table>
            <thead>
                <tr class="header">
                    <th>Дата</th>
                    <th>Урок</th>
                    <th>Смена</th>
                    <th>Класс</th>
                    <th>Предмет</th>
                    <th>Кого заменяют</th>
                    <th>Кто заменяет</th>
                    <th>Кабинет</th>
                    <th>Причина / Тип</th>
                </tr>
            </thead>
            <tbody>
        `;

        monthlySubs.forEach(sub => {
            // Ищем урок в обоих расписаниях, так как замена может быть в любом полугодии
            const scheduleItem = schedule1.find(s => s.id === sub.scheduleItemId) || schedule2.find(s => s.id === sub.scheduleItemId);
            
            if (!scheduleItem) return; // Пропускаем, если урок удален из расписания

            const dateStr = new Date(sub.date).toLocaleDateString('ru-RU');
            const cls = classes.find(c => c.id === scheduleItem.classId);
            const subj = subjects.find(s => s.id === scheduleItem.subjectId);
            const origTeacher = teachers.find(t => t.id === sub.originalTeacherId);
            
            let repTeacherName = '';
            if (sub.replacementTeacherId === 'conducted') repTeacherName = 'Урок проведен';
            else if (sub.replacementTeacherId === 'cancelled') repTeacherName = 'Урок снят';
            else {
                const t = teachers.find(x => x.id === sub.replacementTeacherId);
                repTeacherName = t ? t.name : 'Неизвестно';
                if (sub.isMerger) repTeacherName += ' (Объединение)';
            }

            // Кабинет
            const originalRoomId = scheduleItem.roomId;
            const replacementRoomId = sub.replacementRoomId;
            const actualRoomId = replacementRoomId || originalRoomId;
            const roomObj = rooms.find(r => r.id === actualRoomId);
            const roomName = roomObj ? roomObj.name : (actualRoomId || '-');
            const roomDisplay = replacementRoomId ? `${roomName} (Замена каб.)` : roomName;

            // Причина
            let reason = sub.lessonAbsenceReason || origTeacher?.absenceReasons?.[sub.date] || '';
            if (sub.replacementTeacherId === sub.originalTeacherId && replacementRoomId) reason = 'Смена кабинета';

            html += `
                <tr>
                    <td>${dateStr}</td>
                    <td>${scheduleItem.period}</td>
                    <td>${scheduleItem.shift}</td>
                    <td>${cls?.name || '?'}</td>
                    <td>${subj?.name || '?'}</td>
                    <td>${origTeacher?.name || '?'}</td>
                    <td>${repTeacherName}</td>
                    <td>${roomDisplay}</td>
                    <td>${reason}</td>
                </tr>
            `;
        });

        html += `</tbody></table></body></html>`;
        const blob = new Blob([html], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Отчет_Замены_${targetDate.getMonth()+1}_${targetDate.getFullYear()}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportRefusalsExcel = () => {
        const targetDate = new Date(exportDate);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        // Фильтруем замены за выбранный месяц, у которых есть отказы
        const refusalsData = substitutions.filter(s => {
            const sDate = new Date(s.date);
            const inMonth = sDate.getMonth() === targetMonth && sDate.getFullYear() === targetYear;
            const hasRefusals = s.refusals && s.refusals.length > 0;
            return inMonth && hasRefusals;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (refusalsData.length === 0) {
            alert("Нет данных об отказах за выбранный месяц.");
            return;
        }

        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"><style>
                table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }
                td, th { border: 1px solid #999; padding: 4px; vertical-align: middle; text-align: left; }
                .header { background-color: #fca5a5; font-weight: bold; text-align: center; } 
            </style></head><body>
            <h3>Отчет об отказах за ${targetDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
            <table>
            <thead>
                <tr class="header">
                    <th>Дата</th>
                    <th>Урок</th>
                    <th>Смена</th>
                    <th>Класс</th>
                    <th>Предмет</th>
                    <th>Основной учитель</th>
                    <th>Кто в итоге заменил</th>
                    <th>Учителя, которые отказались</th>
                </tr>
            </thead>
            <tbody>
        `;

        refusalsData.forEach(sub => {
            const scheduleItem = schedule1.find(s => s.id === sub.scheduleItemId) || schedule2.find(s => s.id === sub.scheduleItemId);
            if (!scheduleItem) return;

            const dateStr = new Date(sub.date).toLocaleDateString('ru-RU');
            const cls = classes.find(c => c.id === scheduleItem.classId);
            const subj = subjects.find(s => s.id === scheduleItem.subjectId);
            const origTeacher = teachers.find(t => t.id === sub.originalTeacherId);
            
            let repTeacherName = '';
            if (sub.replacementTeacherId === 'conducted') repTeacherName = 'Урок проведен';
            else if (sub.replacementTeacherId === 'cancelled') repTeacherName = 'Урок снят';
            else {
                const t = teachers.find(x => x.id === sub.replacementTeacherId);
                repTeacherName = t ? t.name : 'Неизвестно';
            }

            const refusedNames = (sub.refusals || []).map(id => {
                const t = teachers.find(x => x.id === id);
                return t ? t.name : 'Неизвестно';
            }).join(', ');

            html += `
                <tr>
                    <td>${dateStr}</td>
                    <td>${scheduleItem.period}</td>
                    <td>${scheduleItem.shift}</td>
                    <td>${cls?.name || '?'}</td>
                    <td>${subj?.name || '?'}</td>
                    <td>${origTeacher?.name || '?'}</td>
                    <td>${repTeacherName}</td>
                    <td>${refusedNames}</td>
                </tr>
            `;
        });

        html += `</tbody></table></body></html>`;
        const blob = new Blob([html], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Отчет_Отказы_${targetDate.getMonth()+1}_${targetDate.getFullYear()}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const copyForGoogleSheets = () => {
        const currentSchedule = getScheduleForExport();
        let tsv = "День\tСмена\tКласс\tУрок\tПредмет\tУчитель\tКабинет\tГруппа\n";
        DAYS.forEach(day => {
            [Shift.First, Shift.Second].forEach(shift => {
                const filteredClasses = classes.filter(c => c.shift === shift);
                filteredClasses.forEach(cls => {
                    SHIFT_PERIODS[shift].forEach(period => {
                        const items = currentSchedule.filter(s => s.classId === cls.id && s.day === day && s.shift === shift && s.period === period);
                        items.forEach(item => {
                            const sub = subjects.find(s => s.id === item.subjectId);
                            const teach = teachers.find(t => t.id === item.teacherId);
                            const r = rooms.find(rm => rm.id === item.roomId);
                            const roomName = r ? r.name : (item.roomId || '');
                            tsv += `${day}\t${shift}\t${cls.name}\t${period}\t${sub?.name || ''}\t${teach?.name || ''}\t${roomName}\t${item.direction || ''}\n`;
                        });
                    });
                });
            });
        });
        navigator.clipboard.writeText(tsv).then(() => {
            alert("Данные скопированы! Откройте Google Sheets и нажмите Ctrl+V (Cmd+V).");
        });
    };

    const handleDownloadPng = async () => { 
        if (!printRef.current) return; 
        setIsGenerating(true); 
        try { 
            const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff', logging: false }); 
            const link = document.createElement('a'); 
            link.download = `Замены_${exportDate}.png`; 
            link.href = canvas.toDataURL('image/png'); 
            link.click(); 
        } catch (e) { console.error(e); alert("Ошибка при создании изображения"); } 
        setIsGenerating(false); 
    };

    const subsForDate = useMemo(() => substitutions.filter(s => s.date === exportDate), [substitutions, exportDate]);
    
    const renderTableForShift = (shift: string) => {
        const currentSchedule = getScheduleForDate(exportDate);

        const shiftSubs = subsForDate.filter(sub => {
            const s = currentSchedule.find(x => x.id === sub.scheduleItemId);
            return s && s.shift === shift;
        }).filter(sub => sub.replacementTeacherId !== 'conducted');
        
        if (shiftSubs.length === 0) return null;

        return (
            <div className="mb-8">
                <div className="text-xl font-bold bg-slate-100 text-slate-700 p-2 mb-2 uppercase tracking-wide border-l-4 border-indigo-500">{shift}</div>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-16 text-center">Урок</th>
                            <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-24">Класс</th>
                            <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider">Предмет</th>
                            <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-1/4">Отсутствует</th>
                            <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-1/4">Заменяет</th>
                            <th className="py-3 px-2 font-black text-slate-400 text-xs uppercase tracking-wider w-20 text-right">Каб.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {shiftSubs.map(sub => { 
                            const s: any = currentSchedule.find(x => x.id === sub.scheduleItemId); 
                            if (!s) return null;
                            const cls = classes.find(c => c.id === s.classId); 
                            const subj = subjects.find(x => x.id === s.subjectId); 
                            const t1: any = teachers.find(t => t.id === sub.originalTeacherId); 
                            
                            const newRoomId = sub.replacementRoomId;
                            const oldRoomObj = s.roomId ? rooms.find(r => r.id === s.roomId) : null;
                            const oldRoomName = oldRoomObj ? oldRoomObj.name : (s.roomId || '—');
                            const newRoomObj = newRoomId ? rooms.find(r => r.id === newRoomId) : null;
                            const newRoomName = newRoomObj ? newRoomObj.name : (newRoomId || '—');
                            
                            const isCancelled = sub.replacementTeacherId === 'cancelled';
                            const t2 = isCancelled ? { name: 'УРОК СНЯТ' } : teachers.find(t => t.id === sub.replacementTeacherId); 
                            
                            const dayReason = t1?.absenceReasons?.[exportDate];
                            const lessonReason = sub.lessonAbsenceReason;
                            // Only display if the reason is explicitly 'Без записи'. 
                            // Prioritize lesson reason if it exists and is 'Без записи', otherwise fall back to day reason if 'Без записи'.
                            const displayReason = (lessonReason === 'Без записи') ? lessonReason : ((dayReason === 'Без записи') ? dayReason : '');
                            
                            const isRoomChangeOnly = sub.replacementTeacherId === sub.originalTeacherId && newRoomId;

                            return (
                                <tr key={sub.id}>
                                    <td className="py-3 px-2 text-center font-bold text-slate-800 text-lg">{s.period}</td>
                                    <td className="py-3 px-2 font-bold text-slate-700">{cls?.name}</td>
                                    <td className="py-3 px-2"><div className="font-semibold text-slate-800">{subj?.name}</div>{s.direction && <div className="text-[10px] text-slate-500 bg-slate-100 inline-block px-1 rounded mt-0.5">{s.direction}</div>}</td>
                                    <td className="py-3 px-2">
                                        {!isRoomChangeOnly && (
                                            <>
                                                {/* FIX: Use relative div with absolute line for reliable strikethrough in html2canvas */}
                                                <div className="relative inline-block text-red-400 text-sm font-medium">
                                                    {t1?.name}
                                                    {/* Adjusted top position to fix html2canvas rendering issue where line appears too high. top-[60%] pushes it down. */}
                                                    <div className="absolute left-0 top-[85%] w-full h-px bg-red-300"></div>
                                                </div>
                                                {displayReason && <span className="text-[10px] text-slate-500 block font-bold uppercase mt-0.5">{displayReason}</span>}
                                            </>
                                        )}
                                    </td>
                                    <td className={`py-3 px-2 font-bold text-sm ${isCancelled ? 'text-red-600 uppercase font-black' : 'text-emerald-700'}`}>
                                        {isRoomChangeOnly ? (
                                            <div className="flex flex-col">
                                                <span className="text-slate-800">{t1?.name}</span>
                                                <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide mt-0.5">Смена кабинета</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                <span>{t2?.name}</span>
                                                {sub.isMerger && <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest mt-0.5">ОБЪЕДИНЕНИЕ</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td className={`py-3 px-2 text-right font-mono font-black ${newRoomId ? 'text-indigo-600' : 'text-slate-700'}`}>
                                        {newRoomId && newRoomId !== s.roomId ? (
                                            <div className="flex items-center justify-end gap-2 text-xl whitespace-nowrap">
                                                {/* Re-applying room change styles as requested in previous turns, ensuring font-black and text-xl */}
                                                <span className="text-slate-400 decoration-4 text-xl">{oldRoomName}</span>
                                                <span className="text-indigo-600 font-black text-2xl">&rarr;</span>
                                                <span className="text-indigo-600 font-black text-2xl">{newRoomName}</span>
                                            </div>
                                        ) : <span className="text-xl">{oldRoomName}</span>}
                                    </td>
                                </tr>
                            ) 
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const handlePublishSchedule = async () => {
        const newPublicId = Math.random().toString(36).substr(2, 9);
        await dbService.setPublicData(newPublicId, fullAppData);
        
        await saveStaticData({ settings: { ...settings, publicScheduleId: newPublicId } });

        const publicUrl = `${window.location.origin}${window.location.pathname}#/public?id=${newPublicId}`;
        setPublicScheduleUrl(publicUrl);
        setPublicScheduleId(newPublicId);
        setIsPublishModalOpen(true);
    };

    const clearPublicSchedule = async () => {
        if (!settings.publicScheduleId || !window.confirm('Вы уверены, что хотите удалить публичное расписание? Оно станет недоступно по текущей ссылке.')) {
            return;
        }
        await dbService.deletePublicData(settings.publicScheduleId);
        await saveStaticData({ settings: { ...settings, publicScheduleId: null } });
        alert('Публичное расписание удалено.');
        setPublicScheduleUrl('');
        setPublicScheduleId('');
    };
    
    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            <section className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Icon name="Download" className="text-indigo-600 dark:text-indigo-400"/> Резервное копирование
                </h2>
                <div className="flex flex-wrap gap-4">
                    <button onClick={() => dbService.exportJson(fullAppData)} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2">
                        <Icon name="Download" size={20}/> Скачать JSON
                    </button>
                    <div className="relative">
                        <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition flex items-center gap-2">
                            <Icon name="Upload" size={20}/> Загрузить JSON
                        </button>
                    </div>
                </div>
            </section>

            <section className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-6 mb-6">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Icon name="Image" className="text-indigo-600 dark:text-indigo-400"/> Экспорт замен (PNG)
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-center">Общее расписание можно экспортировать через меню "Расписание" &rarr; "Печать" на самой странице расписания.</p>
                    </div>
                    <div className="flex gap-4 items-center">
                        <input type="date" value={exportDate} onChange={e => setExportDate(e.target.value)} className="border border-slate-200 dark:border-slate-600 p-2 rounded-lg font-bold outline-none focus:border-indigo-500 bg-transparent dark:text-white"/>
                        <button onClick={handleDownloadPng} disabled={isGenerating} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50">
                            {isGenerating ? <><Icon name="Loader" size={20} className="animate-spin"/> Создание...</> : <><Icon name="Download" size={20}/> Скачать PNG</>}
                        </button>
                    </div>
                </div>
                <div className="overflow-auto bg-slate-100 dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-center">
                    <div ref={printRef} className="bg-white p-8 min-w-[800px] max-w-[1000px] shadow-xl text-slate-900">
                        <div className="flex justify-between items-end border-b-2 border-slate-800 pb-4 mb-6">
                            <div>
                                <h1 className="text-3xl font-black uppercase tracking-tight mb-1 text-slate-800">Замена Учителей</h1>
                                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Гимназия №22 • Официальный документ</p>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Дата</div>
                                <div className="text-xl font-bold text-slate-800">{new Date(exportDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            </div>
                        </div>
                        {subsForDate.length === 0 ? (
                            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                <p className="text-slate-400 font-medium italic">Замен на этот день нет</p>
                            </div>
                        ) : (
                            <>
                                {renderTableForShift(Shift.First)}
                                {renderTableForShift(Shift.Second)}
                            </>
                        )}
                        <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-end text-[10px] text-slate-400">
                            <div>Сформировано автоматически</div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="h-px w-32 bg-slate-300"></div>
                                <div>Подпись администрации</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Icon name="FileSpreadsheet" className="text-emerald-600 dark:text-emerald-400"/> Экспорт данных
                </h2>
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Полугодие:</span>
                        <select
                            value={exportSemester}
                            onChange={(e) => setExportSemester(Number(e.target.value) as 1 | 2)}
                            className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                        >
                            <option value={1}>1-е (Сен-Дек)</option>
                            <option value={2}>2-е (Янв-Май)</option>
                        </select>
                    </div>
                    <button onClick={exportStyledExcel} className="px-6 py-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 rounded-xl font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition flex items-center gap-2">
                        <Icon name="FileSpreadsheet" size={20}/> Скачать Excel (XLS)
                    </button>
                    <button onClick={exportMatrixExcel} className="px-6 py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900 rounded-xl font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition flex items-center gap-2">
                        <Icon name="Table" size={20}/> Скачать Матрицу (XLS)
                    </button>
                    <button onClick={copyForGoogleSheets} className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition shadow-lg shadow-green-200 dark:shadow-none flex items-center gap-2">
                        <Icon name="Clipboard" size={20}/> Копировать для Google Sheets
                    </button>
                    <button onClick={exportMonthlySubstitutionsExcel} className="px-6 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-900 rounded-xl font-bold hover:bg-purple-100 dark:hover:bg-purple-900/50 transition flex items-center gap-2">
                        <Icon name="List" size={20}/> Отчет по заменам (XLS)
                    </button>
                    <button onClick={exportRefusalsExcel} className="px-6 py-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition flex items-center gap-2">
                        <Icon name="UserX" size={20}/> Отчет об отказах (XLS)
                    </button>
                </div>
            </section>

            <section className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Icon name="QrCode" className="text-purple-600 dark:text-purple-400"/> Публичное расписание
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Опубликуйте актуальное расписание для учеников и родителей. Будет сгенерирована уникальная ссылка с QR-кодом.
                </p>
                {settings.publicScheduleId ? (
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="flex-1">
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">
                                Расписание опубликовано! ID: <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{settings.publicScheduleId}</span>
                            </p>
                            <button onClick={() => setIsPublishModalOpen(true)} className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition flex items-center gap-2">
                                <Icon name="Share2" size={16}/> Показать QR-код и ссылку
                            </button>
                            <button onClick={clearPublicSchedule} className="ml-3 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition flex items-center gap-2">
                                <Icon name="Trash2" size={16}/> Отменить публикацию
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={handlePublishSchedule} disabled={isGenerating} className="px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition shadow-lg shadow-purple-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50">
                        <Icon name="Share2" size={20}/> Опубликовать расписание
                    </button>
                )}
            </section>

            <Modal isOpen={isPublishModalOpen} onClose={() => setIsPublishModalOpen(false)} title="Публичное расписание">
                <div className="flex flex-col items-center justify-center p-4 text-center space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Отсканируйте QR-код или перейдите по ссылке, чтобы увидеть публичное расписание.
                    </p>
                    {publicScheduleUrl && (
                        <>
                            <QRCodeSVG value={publicScheduleUrl} size={256} level="H" includeMargin={true} className="p-2 bg-white border border-slate-200 rounded-lg shadow-md" />
                            <a href={publicScheduleUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-sm font-medium break-all">
                                {publicScheduleUrl}
                            </a>
                            <button onClick={() => navigator.clipboard.writeText(publicScheduleUrl)} className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition flex items-center gap-2">
                                <Icon name="Copy" size={16}/> Копировать ссылку
                            </button>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
};