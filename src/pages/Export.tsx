
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { dbService } from '../services/db'; 
import { DAYS, Shift, SHIFT_PERIODS, AppData, Substitution, ScheduleItem, ClassEntity, Subject, Teacher, DayOfWeek } from '../types';
import { INITIAL_DATA } from '../constants';
import html2canvas from 'html2canvas';

import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '../components/UI';

export const ExportPage = () => {
    const { subjects, teachers, classes, rooms, settings, bellSchedule, saveStaticData } = useStaticData();
    const { schedule1, schedule2, substitutions, saveScheduleData } = useScheduleData();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const printRef1 = useRef<HTMLDivElement>(null);
    const printRef2 = useRef<HTMLDivElement>(null);
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

    // Matrix Print State
    const [isMatrixPrintOpen, setIsMatrixPrintOpen] = useState(false);
    const [matrixGrade, setMatrixGrade] = useState<string>("");

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

    // Extract available grades (parallels)
    const availableGrades = useMemo<string[]>(() => {
        const grades = new Set<string>();
        classes.forEach(c => {
            const match = c.name.match(/^(\d+)/);
            if (match) grades.add(match[1]);
        });
        return Array.from(grades).sort((a,b) => parseInt(a)-parseInt(b));
    }, [classes]);

    useEffect(() => {
        if (availableGrades.length > 0 && !matrixGrade) {
            setMatrixGrade(availableGrades[0]);
        }
    }, [availableGrades]);

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => { 
        const file = e.target.files?.[0]; 
        if (!file) return; 
        const reader = new FileReader(); 
        reader.onload = async (ev: ProgressEvent<FileReader>) => { 
            try { 
                const json = JSON.parse(ev.target?.result as string); 
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
                table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12pt; margin-bottom: 20px; }
                td, th { border: 1px solid #000; padding: 2px; vertical-align: middle; text-align: center; }
                .header { font-weight: bold; background-color: #f3f4f6; }
                .subject-cell { font-weight: bold; vertical-align: middle; background-color: #fff; }
                .teacher-cell { text-align: left; padding-left: 5px; }
                sub { font-size: 10px; vertical-align: sub; }
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
                                const dir = item.direction ? ` <span style="font-size:10px">(${item.direction})</span>` : '';
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

        interface SubstitutionDetail {
            subs: Substitution[]; // Array of subs for grouped display
            scheduleItem: ScheduleItem;
            cls: ClassEntity | undefined;
            subj: Subject | undefined;
            origTeacher: Teacher | undefined;
            reason: string;
        }

        // Group by scheduleItemId to handle merges
        const groupedSubs = new Map<string, Substitution[]>();
        monthlySubs.forEach(sub => {
            // Group by item AND date to separate same lesson on different days
            const key = `${sub.scheduleItemId}_${sub.date}`;
            const existing = groupedSubs.get(key) || [];
            existing.push(sub);
            groupedSubs.set(key, existing);
        });

        const mainSubs: SubstitutionDetail[] = [];
        const noRecordSubs: SubstitutionDetail[] = [];

        groupedSubs.forEach(subsGroup => {
            const firstSub = subsGroup[0];
            // Ищем урок в обоих расписаниях
            const scheduleItem = schedule1.find(s => s.id === firstSub.scheduleItemId) || schedule2.find(s => s.id === firstSub.scheduleItemId);
            if (!scheduleItem) return;

            const cls = classes.find(c => c.id === scheduleItem.classId);
            const subj = subjects.find(s => s.id === scheduleItem.subjectId);
            const origTeacher = teachers.find(t => t.id === firstSub.originalTeacherId);

            let reason = firstSub.lessonAbsenceReason || origTeacher?.absenceReasons?.[firstSub.date] || '';
            
            // Logic overrides for display
            if (firstSub.replacementTeacherId === firstSub.originalTeacherId && firstSub.replacementRoomId && !firstSub.replacementClassId) reason = 'Смена кабинета';
            if (firstSub.replacementClassId && firstSub.replacementSubjectId && !firstSub.isMerger) reason = 'Обмен уроками';

            const detail: SubstitutionDetail = { subs: subsGroup, scheduleItem, cls, subj, origTeacher, reason };

            if (reason === 'Без записи') {
                noRecordSubs.push(detail);
            } else {
                mainSubs.push(detail);
            }
        });

        // HTML Header and Style
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"><style>
                body { font-family: Arial, sans-serif; font-size: 12px; }
                table { border-collapse: collapse; width: 100%; }
                td, th { border: 1px solid #999; padding: 4px; vertical-align: middle; text-align: left; }
                .header { background-color: #e0e7ff; font-weight: bold; text-align: center; }
                .header-warning { background-color: #fee2e2; font-weight: bold; text-align: center; }
                .date-row { background-color: #f3f4f6; font-weight: bold; }
            </style></head><body>
            <h3>Отчет по заменам за ${targetDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
        `;

        const renderRows = (items: SubstitutionDetail[]) => {
            return items.map(item => {
                const { subs, scheduleItem, cls, subj, origTeacher, reason } = item;
                const firstSub = subs[0];
                const dateStr = new Date(firstSub.date).toLocaleDateString('ru-RU');
                
                let repTeacherName = '';
                
                if (firstSub.replacementTeacherId === 'conducted') repTeacherName = 'Урок проведен';
                else if (firstSub.replacementTeacherId === 'cancelled') repTeacherName = 'Урок снят';
                else {
                    // Combine names for merged/split subs
                    const names = subs.map(s => {
                        const t = teachers.find(x => x.id === s.replacementTeacherId);
                        return t ? t.name : 'Неизвестно';
                    }).join(', ');
                    
                    repTeacherName = names;
                    
                    if (firstSub.isMerger) {
                        let suffix = ' (Объединение)';
                        if (firstSub.replacementClassId) {
                             const swappedClass = classes.find(c => c.id === firstSub.replacementClassId);
                             if (swappedClass) suffix = ` (Объединение с ${swappedClass.name})`;
                        }
                        repTeacherName += suffix;
                    } else if (firstSub.replacementClassId && firstSub.replacementSubjectId) {
                        const swappedClass = classes.find(c => c.id === firstSub.replacementClassId);
                        const swappedSubj = subjects.find(s => s.id === firstSub.replacementSubjectId);
                        repTeacherName += ` (Урок ${swappedClass?.name || '?'} ${swappedSubj?.name || '?'})`;
                    }
                }

                const originalRoomId = scheduleItem.roomId;
                const replacementRoomId = firstSub.replacementRoomId;
                const actualRoomId = replacementRoomId || originalRoomId;
                const roomObj = rooms.find(r => r.id === actualRoomId);
                const roomName = roomObj ? roomObj.name : (actualRoomId || '-');
                const roomDisplay = replacementRoomId ? `${roomName} (Замена каб.)` : roomName;

                return `
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
            }).join('');
        };

        const renderTable = (items: SubstitutionDetail[], isWarning = false) => `
            <table>
            <thead>
                <tr class="${isWarning ? 'header-warning' : 'header'}">
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
                ${renderRows(items)}
            </tbody>
            </table>
        `;

        // Render Main Table
        if (mainSubs.length > 0) {
            html += renderTable(mainSubs);
        } else {
             html += `<p>Замен с подтвержденной причиной не найдено.</p>`;
        }

        // Render No Record Table (if any)
        if (noRecordSubs.length > 0) {
            html += `<br/><br/>`;
            html += `<h3 style="color: #b91c1c;">Замены без записи (Не подтверждена причина)</h3>`;
            html += renderTable(noRecordSubs, true);
        }

        html += `</body></html>`;
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

    const handleDownloadPngShift1 = async () => {
        setIsGenerating(true);
        try {
            if (!printRef1.current) {
                alert('Нет замен для 1-й смены.');
                return;
            }

            const canvas1 = await html2canvas(printRef1.current, { scale: 2, backgroundColor: '#ffffff', logging: false });
            const link = document.createElement('a');
            link.href = canvas1.toDataURL('image/png');
            link.download = `Замены_${exportDate}_1смена.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error(e);
            alert("Ошибка при создании изображения");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPngShift2 = async () => {
        setIsGenerating(true);
        try {
            if (!printRef2.current) {
                alert('Нет замен для 2-й смены.');
                return;
            }

            const canvas2 = await html2canvas(printRef2.current, { scale: 2, backgroundColor: '#ffffff', logging: false });
            const link = document.createElement('a');
            link.href = canvas2.toDataURL('image/png');
            link.download = `Замены_${exportDate}_2смена.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error(e);
            alert("Ошибка при создании изображения");
        } finally {
            setIsGenerating(false);
        }
    };

    const subsForDate = useMemo(() => substitutions.filter(s => s.date === exportDate), [substitutions, exportDate]);
    
    const subsForShift1 = useMemo(() => {
        const currentSchedule = getScheduleForDate(exportDate);
        return subsForDate.filter(sub => {
            const s = currentSchedule.find(x => x.id === sub.scheduleItemId);
            return s && s.shift === Shift.First;
        }).filter(sub => sub.replacementTeacherId !== 'conducted').length > 0;
    }, [subsForDate, getScheduleForDate, exportDate]);

    const subsForShift2 = useMemo(() => {
        const currentSchedule = getScheduleForDate(exportDate);
        return subsForDate.filter(sub => {
            const s = currentSchedule.find(x => x.id === sub.scheduleItemId);
            return s && s.shift === Shift.Second;
        }).filter(sub => sub.replacementTeacherId !== 'conducted').length > 0;
    }, [subsForDate, getScheduleForDate, exportDate]);


    const renderTableForShift = (shift: string) => {
        const currentSchedule = getScheduleForDate(exportDate);

        // Group subs by scheduleItemId to handle merges
        const shiftSubs = subsForDate.filter(sub => {
            const s = currentSchedule.find(x => x.id === sub.scheduleItemId);
            return s && s.shift === shift;
        }).filter(sub => sub.replacementTeacherId !== 'conducted');
        
        if (shiftSubs.length === 0) return null;

        const uniqueLessonIds = Array.from(new Set(shiftSubs.map(s => s.scheduleItemId)))
            .sort((idA, idB) => {
                const itemA = currentSchedule.find(x => x.id === idA);
                const itemB = currentSchedule.find(x => x.id === idB);
                return (itemA?.period ?? 0) - (itemB?.period ?? 0);
            });

        return (
            <div>
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
                        {uniqueLessonIds.map(lessonId => { 
                            const lessonSubs = shiftSubs.filter(s => s.scheduleItemId === lessonId);
                            const sub = lessonSubs[0];
                            const s = currentSchedule.find(x => x.id === lessonId); 
                            if (!s) return null;
                            const cls = classes.find(c => c.id === s.classId); 
                            const subj = subjects.find(x => x.id === s.subjectId); 
                            const t1 = teachers.find(t => t.id === sub.originalTeacherId); 
                            
                            const newRoomId = sub.replacementRoomId;
                            const oldRoomObj = s.roomId ? rooms.find(r => r.id === s.roomId) : null;
                            const oldRoomName = oldRoomObj ? oldRoomObj.name : (s.roomId || '—');
                            const newRoomObj = newRoomId ? rooms.find(r => r.id === newRoomId) : null;
                            const newRoomName = newRoomObj ? newRoomObj.name : (newRoomId || '—');
                            
                            const isCancelled = sub.replacementTeacherId === 'cancelled';
                            
                            const dayReason = t1?.absenceReasons?.[exportDate];
                            const lessonReason = sub.lessonAbsenceReason;
                            const displayReason = (lessonReason === 'Без записи') ? lessonReason : ((dayReason === 'Без записи') ? dayReason : '');
                            
                            const swappedClass = sub.replacementClassId ? classes.find(c => c.id === sub.replacementClassId) : null;
                            const swappedSubj = sub.replacementSubjectId ? subjects.find(s => s.id === sub.replacementSubjectId) : null;

                            const isRoomChangeOnly = sub.replacementTeacherId === sub.originalTeacherId && newRoomId && !swappedClass;
                            const isSwap = swappedClass && swappedSubj && !sub.isMerger;
                            const isTeacherPresent = sub.replacementTeacherId === sub.originalTeacherId;

                            return (
                                <tr key={lessonId}>
                                    <td className="py-3 px-2 text-center font-bold text-slate-800 text-lg">{s.period}</td>
                                    <td className="py-3 px-2 font-bold text-slate-700">{cls?.name}</td>
                                    <td className="py-3 px-2"><div className="font-semibold text-slate-800">{subj?.name}</div>{s.direction && <div className="text-[10px] text-slate-500 bg-slate-100 inline-block px-1 rounded mt-0.5">{s.direction}</div>}</td>
                                    <td className="py-3 px-2">
                                        {!isTeacherPresent && !isRoomChangeOnly && !isSwap && (
                                            <>
                                                <div className="relative inline-block text-red-400 text-sm font-medium">
                                                    {t1?.name}
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
                                        ) : isSwap ? (
                                            <div className="flex flex-col">
                                                <span className="text-slate-800">{t1?.name}</span>
                                                <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wide mt-0.5">Обмен уроками: {swappedClass?.name}</span>
                                            </div>
                                        ) : isCancelled ? (
                                            <div className="flex flex-col">
                                                <span>УРОК СНЯТ</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                {lessonSubs.length > 1 || sub.isMerger ? (
                                                    <>
                                                        <span className="text-slate-800 text-xs">
                                                            {lessonSubs.map(ls => {
                                                                const tr = teachers.find(x => x.id === ls.replacementTeacherId);
                                                                return tr ? tr.name : 'Неизвестно';
                                                            }).join(', ')}
                                                        </span>
                                                        <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest mt-0.5">
                                                            ОБЪЕДИНЕНИЕ {sub.replacementClassId ? `(${classes.find(c => c.id === sub.replacementClassId)?.name})` : ''}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span>{teachers.find(t => t.id === sub.replacementTeacherId)?.name}</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className={`py-3 px-2 text-right font-mono font-black ${newRoomId ? 'text-indigo-600' : 'text-slate-700'}`}>
                                        {newRoomId && newRoomId !== s.roomId ? (
                                            <div className="flex items-center justify-end gap-2 text-xl whitespace-nowrap">
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

    const ReportHeader = () => (
        <div className="flex justify-between items-end border-b-2 border-slate-800 pb-4 mb-6">
            <div>
                <h1 className="text-3xl font-black uppercase tracking-tight mb-1 text-slate-800">Замена Учителей</h1>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                    Гимназия №22 • Официальный документ
                </p>
            </div>
            <div className="text-right">
                <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Дата</div>
                <div className="text-xl font-bold text-slate-800">{new Date(exportDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
        </div>
    );

    const ReportFooter = () => (
        <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-end text-[10px] text-slate-400">
            <div>Сформировано автоматически</div>
            <div className="flex flex-col items-end gap-2">
                <div className="h-px w-32 bg-slate-300"></div>
                <div>Подпись администрации</div>
            </div>
        </div>
    );
    
    // --- Matrix Print Content Component ---
    const MatrixPrintContent = () => {
        const currentSchedule = getScheduleForExport();
        // Shift 1 by default for this view as per request image, but logic can handle both if user selects
        // The user selects the shift in the UI before opening modal, but let's assume we iterate all shifts if needed or just one.
        // The image shows just "1 СМЕНА". So we iterate shifts present in filtered classes or just use Shift.First / Shift.Second.
        // Actually, classes might be mixed in a grade level (rare but possible). 
        // We will group by shift.
        
        const targetClasses = classes.filter(c => c.name.startsWith(matrixGrade)).sort((a,b) => a.name.localeCompare(b.name));
        const shifts = Array.from(new Set(targetClasses.map(c => c.shift))).sort();

        // New distinct colors for each day rows
        const dayStyles: Record<string, { label: string, cell: string }> = {
            [DayOfWeek.Monday]:    { label: 'bg-red-200',    cell: 'bg-red-100' },
            [DayOfWeek.Tuesday]:   { label: 'bg-orange-200', cell: 'bg-orange-100' },
            [DayOfWeek.Wednesday]: { label: 'bg-yellow-200', cell: 'bg-yellow-100' },
            [DayOfWeek.Thursday]:  { label: 'bg-green-200',  cell: 'bg-green-100' },
            [DayOfWeek.Friday]:    { label: 'bg-blue-200',   cell: 'bg-blue-100' },
        };

        if (targetClasses.length === 0) return <div className="text-center p-10">Нет классов для выбранной параллели</div>;

        return (
            <div className="font-sans text-black">
                {shifts.map((shift: string) => {
                    const shiftClasses = targetClasses.filter(c => c.shift === shift);
                    const periods = SHIFT_PERIODS[shift as Shift];
                    if (shiftClasses.length === 0) return null;

                    return (
                        <div key={shift} className="mb-10 page-break-inside-avoid">
                            <table className="w-full border-collapse border-2 border-black text-center text-sm">
                                <thead>
                                    <tr>
                                        <th className="border-2 border-black w-8"></th>
                                        <th className="border-2 border-black w-8"></th>
                                        <th colSpan={shiftClasses.length} className="border-2 border-black py-2 text-xl uppercase font-black tracking-widest bg-white">
                                            {shift}
                                        </th>
                                    </tr>
                                    <tr>
                                        <th className="border-2 border-black w-8"></th>
                                        <th className="border-2 border-black w-8"></th>
                                        {shiftClasses.map(c => (
                                            <th key={c.id} className="border-2 border-black py-2 font-bold text-lg bg-white w-32">
                                                {c.name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {DAYS.map((day) => {
                                        const styles = dayStyles[day as string] || { label: 'bg-gray-200', cell: 'bg-gray-100' };
                                        return (
                                            <React.Fragment key={day as string}>
                                                {periods.map((period, pIndex) => (
                                                    <tr key={`${day}-${period}`}>
                                                        {/* Day Name Merged Cell */}
                                                        {pIndex === 0 && (
                                                            <td 
                                                                rowSpan={periods.length} 
                                                                className={`border-2 border-black font-bold uppercase text-xs writing-vertical-lr rotate-180 p-1 ${styles.label}`}
                                                                style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
                                                            >
                                                                {day === DayOfWeek.Monday ? 'ПОНЕДЕЛЬНИК' :
                                                                 day === DayOfWeek.Tuesday ? 'ВТОРНИК' :
                                                                 day === DayOfWeek.Wednesday ? 'СРЕДА' :
                                                                 day === DayOfWeek.Thursday ? 'ЧЕТВЕРГ' :
                                                                 day === DayOfWeek.Friday ? 'ПЯТНИЦА' : day}
                                                            </td>
                                                        )}
                                                        
                                                        {/* Period Number */}
                                                        <td className={`border-2 border-black font-bold text-base ${styles.label}`}>
                                                            {period}
                                                        </td>

                                                        {/* Classes Cells */}
                                                        {shiftClasses.map(cls => {
                                                            // Find lessons. Could be multiple (groups)
                                                            const lessons = currentSchedule.filter(s => 
                                                                s.classId === cls.id && 
                                                                s.day === day && 
                                                                s.shift === shift && 
                                                                s.period === period
                                                            );
                                                            
                                                            return (
                                                                <td key={cls.id} className={`border-2 border-black p-1 h-12 ${styles.cell}`}>
                                                                    {lessons.map(lesson => {
                                                                        const subj = subjects.find(s => s.id === lesson.subjectId);
                                                                        const room = rooms.find(r => r.id === lesson.roomId);
                                                                        const roomName = room ? room.name : lesson.roomId;
                                                                        
                                                                        return (
                                                                            <div key={lesson.id} className="flex justify-center items-center gap-1 leading-tight text-sm font-bold">
                                                                                <span>{subj?.name}</span>
                                                                                {roomName && <span className="font-black">{roomName}</span>}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                                {/* Separator row (thick border handled by CSS usually, but explicit works too) */}
                                                <tr className="h-2 bg-black border-2 border-black"><td colSpan={2 + shiftClasses.length}></td></tr>
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
            </div>
        );
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
                        <button
                            onClick={handleDownloadPngShift1}
                            disabled={isGenerating || !subsForShift1}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50"
                        >
                            {isGenerating ? <><Icon name="Loader" size={20} className="animate-spin"/> Создание...</> : <><Icon name="Download" size={20}/> 1-я смена</>}
                        </button>
                        <button
                            onClick={handleDownloadPngShift2}
                            disabled={isGenerating || !subsForShift2}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50"
                        >
                            {isGenerating ? <><Icon name="Loader" size={20} className="animate-spin"/> Создание...</> : <><Icon name="Download" size={20}/> 2-я смена</>}
                        </button>
                    </div>
                </div>
                <div className="overflow-auto bg-slate-100 dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-start">
                    {subsForDate.length === 0 ? (
                        <div className="bg-white p-8 min-w-[800px] max-w-[1000px] shadow-xl text-slate-900">
                            <ReportHeader />
                            <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                <p className="text-slate-400 font-medium italic">Замен на этот день нет</p>
                            </div>
                            <ReportFooter />
                        </div>
                    ) : (
                        <div className="flex flex-col lg:flex-row gap-8">
                            {subsForShift1 && (
                                <div ref={printRef1} className="bg-white p-8 min-w-[800px] max-w-[1000px] shadow-xl text-slate-900">
                                    <ReportHeader />
                                    {renderTableForShift(Shift.First)}
                                    <ReportFooter />
                                </div>
                            )}
                            {subsForShift2 && (
                                <div ref={printRef2} className="bg-white p-8 min-w-[800px] max-w-[1000px] shadow-xl text-slate-900">
                                    <ReportHeader />
                                    {renderTableForShift(Shift.Second)}
                                    <ReportFooter />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>

            <section className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Icon name="Printer" className="text-blue-600 dark:text-blue-400"/> Печать сетки (как на фото)
                </h2>
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Параллель:</span>
                        <select
                            value={matrixGrade}
                            onChange={(e) => setMatrixGrade(e.target.value)}
                            className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                        >
                            {availableGrades.map((g: string) => <option key={g} value={g}>{g}-е классы</option>)}
                        </select>
                    </div>
                    <button onClick={() => setIsMatrixPrintOpen(true)} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 dark:shadow-none flex items-center gap-2">
                        <Icon name="Printer" size={20}/> Открыть версию для печати
                    </button>
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

            {isMatrixPrintOpen && (
                <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                    {/* Toolbar */}
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50 no-print">
                         <h2 className="font-bold text-lg text-slate-800">Печать сетки ({matrixGrade}-е классы)</h2>
                         <div className="flex gap-2">
                             <button onClick={() => window.print()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700"><Icon name="Printer" size={16}/> Печать</button>
                             <button onClick={() => setIsMatrixPrintOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300">Закрыть</button>
                         </div>
                    </div>
                    {/* Printable Area */}
                    <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-white">
                         <MatrixPrintContent />
                    </div>
                </div>
            )}
        </div>
    );
};
