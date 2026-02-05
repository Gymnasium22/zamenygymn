
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStaticData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { Modal, StaggerContainer } from '../components/UI';
import { Shift, ROOM_TYPES, SHIFT_PERIODS, Teacher, Subject, ClassEntity, Room, BellPreset, Bell } from '../types';
import { DEFAULT_BELLS, SHORT_BELLS } from '../constants';
import { generateId } from '../utils/helpers';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

// Helper functions for time manipulation (pure functions can stay outside)
const timeToMin = (t: string) => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const minToTime = (m: number) => {
    let h = Math.floor(m / 60);
    let min = m % 60;
    if (h >= 24) h -= 24;
    if (h < 0) h += 24;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

export const DirectoryPage = () => {
    const { subjects, teachers, classes, rooms, bellSchedule, settings, saveStaticData } = useStaticData();

    const [activeTab, setActiveTab] = useState('teachers');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    
    // Forms
    const [teacherForm, setTeacherForm] = useState<Partial<Teacher>>({});
    const [subjectForm, setSubjectForm] = useState<Partial<Subject>>({});
    const [classForm, setClassForm] = useState<Partial<ClassEntity>>({});
    const [roomForm, setRoomForm] = useState<Partial<Room>>({});
    
    // Bells State
    const [selectedPresetId, setSelectedPresetId] = useState<string>('preset_normal');
    const [currentPresetBells, setCurrentPresetBells] = useState<Bell[]>([]);
    const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [activeBellShift, setActiveBellShift] = useState<Shift>(Shift.First); // For mobile view
    
    // Export State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportDate, setExportDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const exportRef = useRef<HTMLDivElement>(null); // For preview generation inside modal

    const [draggedIdx, setDraggedIdx] = useState<number|null>(null);

    // Initialize bells on load
    useEffect(() => {
        if (settings.bellPresets && settings.bellPresets.length > 0) {
            const preset = settings.bellPresets.find(p => p.id === selectedPresetId);
            if (preset) {
                setCurrentPresetBells(preset.bells);
                return;
            }
        }
        // Fallback
        setCurrentPresetBells(DEFAULT_BELLS);
    }, [selectedPresetId, settings.bellPresets]);

    const openModal = (id?: string) => {
        setEditingId(id || null);
        if (activeTab === 'teachers') setTeacherForm(id ? teachers.find(x => x.id === id) ?? {} : { subjectIds: [], unavailableDates: [], shifts: [Shift.First, Shift.Second], telegramChatId: '' });
        else if (activeTab === 'subjects') setSubjectForm(id ? subjects.find(x => x.id === id) ?? {} : { color: '#e0e7ff', difficulty: 5, requiredRoomType: 'Обычный' });
        else if (activeTab === 'classes') setClassForm(id ? classes.find(x => x.id === id) ?? {} : { shift: Shift.First, studentsCount: 25, excludeFromReports: false });
        else if (activeTab === 'rooms') setRoomForm(id ? rooms.find(x => x.id === id) ?? {} : { capacity: 30, type: 'Обычный' });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        const configMap = {
            teachers: { list: teachers, form: teacherForm, key: 'teachers' as const },
            subjects: { list: subjects, form: subjectForm, key: 'subjects' as const },
            classes: { list: classes, form: classForm, key: 'classes' as const },
            rooms: { list: rooms, form: roomForm, key: 'rooms' as const },
        };

        if (activeTab === 'bells' || !(activeTab in configMap)) {
            return;
        }

        const activeConfig = configMap[activeTab as keyof typeof configMap];
        const { list, form, key } = activeConfig;
        
        if (!form.name) return;

        let newList: (Teacher | Subject | ClassEntity | Room)[] = [...list];
        if (editingId) {
            newList = newList.map(item => (item.id === editingId ? { ...item, ...form } : item));
        } else {
            const maxOrder = list.reduce((max, item) => {
                const itemWithOrder = item as { order?: number };
                return Math.max(max, itemWithOrder.order || 0);
            }, 0);
            const newItem = { ...form, id: generateId(), order: maxOrder + 1 };
            newList.push(newItem as any);
        }
        
        await saveStaticData({ [key]: newList });
        setIsModalOpen(false);
    };

    const handleDelete = async (id: string) => { 
        if (!window.confirm("Удалить запись?")) return; 
        
        switch(activeTab) {
            case 'teachers': await saveStaticData({ teachers: teachers.filter(t => t.id !== id) }); break;
            case 'subjects': await saveStaticData({ subjects: subjects.filter(s => s.id !== id) }); break;
            case 'classes': await saveStaticData({ classes: classes.filter(c => c.id !== id) }); break;
            case 'rooms': await saveStaticData({ rooms: rooms.filter(r => r.id !== id) }); break;
        }
    };
    
    // Drag & Drop
    const onDragStart = (e: React.DragEvent, index: number) => { setDraggedIdx(index); e.dataTransfer.effectAllowed = "move"; };
    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
    const onDrop = async (e: React.DragEvent, index: number) => { 
        if (draggedIdx === null || draggedIdx === index) return; 

        const reorderWithUpdate = (items: any[]) => {
            const newList = [...items];
            const [movedItem] = newList.splice(draggedIdx, 1);
            newList.splice(index, 0, movedItem);
            return newList.map((item, idx) => ({ ...item, order: idx }));
        };
        
        switch (activeTab) {
            case 'teachers': {
                await saveStaticData({ teachers: reorderWithUpdate(teachers) });
                break;
            }
            case 'subjects': {
                await saveStaticData({ subjects: reorderWithUpdate(subjects) });
                break;
            }
            case 'classes': {
                await saveStaticData({ classes: reorderWithUpdate(classes) });
                break;
            }
            case 'rooms': {
                await saveStaticData({ rooms: reorderWithUpdate(rooms) });
                break;
            }
        }
        
        setDraggedIdx(null); 
    };

    // --- Bell Schedule Logic ---

    // Smart Time Change: Update duration or shift subsequent times
    const handleBellChange = (shift: string, period: number, field: 'start' | 'end', value: string) => {
        let newBells = [...currentPresetBells];
        let idx = newBells.findIndex(b => b.shift === shift && b.period === period && b.day === 'default');
        
        if (idx === -1) {
            newBells.push({ shift, period, [field]: value, start: '00:00', end: '00:00', day: 'default' } as Bell);
            idx = newBells.length - 1;
        }

        const currentBell = newBells[idx];
        
        // Smart Logic: If changing start, keep duration.
        if (field === 'start') {
            const oldStart = timeToMin(currentBell.start);
            const oldEnd = timeToMin(currentBell.end);
            const duration = oldEnd - oldStart;
            
            const newStartMin = timeToMin(value);
            const newEndMin = newStartMin + (duration > 0 ? duration : 45); // Default 45 if invalid
            
            newBells[idx] = { ...currentBell, start: value, end: minToTime(newEndMin) };
        } else {
            // If changing end, just update end
            newBells[idx] = { ...currentBell, end: value };
        }
        
        setCurrentPresetBells(newBells);
    };

    const toggleBellCancellation = (shift: string, period: number) => {
        const newBells = [...currentPresetBells];
        const idx = newBells.findIndex(b => b.shift === shift && b.period === period && b.day === 'default');
        
        if (idx >= 0) {
            newBells[idx] = { ...newBells[idx], cancelled: !newBells[idx].cancelled };
        } else {
            newBells.push({ shift, period, start: '00:00', end: '00:00', day: 'default', cancelled: true } as Bell);
        }
        setCurrentPresetBells(newBells);
    };

    // Bulk Actions
    const bulkShiftSchedule = (shift: string, minutes: number) => {
        const newBells = currentPresetBells.map(b => {
            if (b.shift !== shift) return b;
            const start = timeToMin(b.start) + minutes;
            const end = timeToMin(b.end) + minutes;
            return { ...b, start: minToTime(start), end: minToTime(end) };
        });
        setCurrentPresetBells(newBells);
    };

    const bulkSetDuration = (shift: string, duration: number) => {
        const newBells = currentPresetBells.map(b => {
            if (b.shift !== shift) return b;
            const start = timeToMin(b.start);
            return { ...b, end: minToTime(start + duration) };
        });
        setCurrentPresetBells(newBells);
    };

    const savePreset = async () => {
        let presets = [...(settings.bellPresets || [])];
        const index = presets.findIndex(p => p.id === selectedPresetId);
        
        if (index >= 0) {
            presets[index] = { ...presets[index], bells: currentPresetBells };
        } else {
            // Create new
             presets.push({
                id: selectedPresetId,
                name: newPresetName || 'Новый режим',
                bells: currentPresetBells
            });
        }
        
        await saveStaticData({ settings: { ...settings, bellPresets: presets } });
        alert("Пресет сохранен!");
    };

    const createNewPreset = () => {
        setNewPresetName('');
        setIsPresetModalOpen(true);
    };

    const duplicatePreset = () => {
        const currentPreset = settings.bellPresets?.find(p => p.id === selectedPresetId);
        setNewPresetName((currentPreset?.name || 'Копия') + ' (Копия)');
        setIsPresetModalOpen(true);
    };

    const confirmCreatePreset = async () => {
        if (!newPresetName) return;
        const newId = `preset_${generateId()}`;
        const presets = [...(settings.bellPresets || [])];
        
        // Clone current bells as base
        presets.push({
            id: newId,
            name: newPresetName,
            bells: JSON.parse(JSON.stringify(currentPresetBells))
        });
        
        await saveStaticData({ settings: { ...settings, bellPresets: presets } });
        setSelectedPresetId(newId);
        setIsPresetModalOpen(false);
    };

    const deletePreset = async () => {
        if (selectedPresetId === 'preset_normal') {
            alert("Нельзя удалить базовый пресет.");
            return;
        }
        if (!window.confirm("Удалить этот режим звонков?")) return;
        
        const presets = (settings.bellPresets || []).filter(p => p.id !== selectedPresetId);
        // Switch to normal before deleting
        const nextId = presets[0]?.id || 'preset_normal';
        setSelectedPresetId(nextId);
        
        await saveStaticData({ settings: { ...settings, bellPresets: presets } });
    };

    const applyPreset = async () => {
        if (window.confirm(`Применить режим звонков "${settings.bellPresets?.find(p=>p.id===selectedPresetId)?.name}" для всего расписания?`)) {
            await saveStaticData({ bellSchedule: currentPresetBells });
            alert("Режим звонков применен!");
        }
    };

    // --- Export Functionality (Moved to Modal Logic) ---

    // Generate HTML for export/preview
    // Fixed: Reduced top padding and margins to prevent vertical offset/cutoff in PDF/PNG
    // Fixed: Added line-height and text-align to circle numbers to ensure centering
    const getExportContent = () => {
        const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);
        
        return `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 10px 40px 20px 40px; background: white; width: 1000px; max-width: 1000px; margin: 0 auto; color: #1e293b; box-sizing: border-box;">
                <div style="text-align: center; margin-bottom: 25px; padding-top: 10px;">
                    <h1 style="font-size: 32px; font-weight: 900; text-transform: uppercase; color: #1e293b; margin: 0 0 5px 0; letter-spacing: -0.5px;">
                        Расписание звонков
                    </h1>
                    <p style="font-size: 16px; color: #64748b; font-weight: 600; margin: 0;">
                        Режим: <span style="color: #4f46e5;">${preset?.name || 'Обычное'}</span>
                        ${exportDate ? `<br>на ${new Date(exportDate).toLocaleDateString('ru-RU')}` : ''}
                    </p>
                    <div style="height: 6px; width: 80px; background: #4f46e5; margin: 15px auto 0; border-radius: 4px;"></div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                    ${[Shift.First, Shift.Second].map(shift => {
                        const shiftBells = currentPresetBells.filter(b => b.shift === shift);
                        return `
                            <div style="background: #fff; border: 2px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                                <div style="background: ${shift === Shift.First ? '#4f46e5' : '#7c3aed'}; color: white; padding: 12px; text-align: center; font-weight: 800; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">
                                    ${shift}
                                </div>
                                <div style="padding: 20px;">
                                    ${SHIFT_PERIODS[shift].map(period => {
                                        const bell = shiftBells.find(b => b.period === period && b.day === 'default') || { start: '00:00', end: '00:00', cancelled: false };
                                        
                                        if (bell.cancelled) {
                                            return `
                                                <div style="display: flex; align-items: center; margin-bottom: 10px; padding: 8px 12px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px;">
                                                    <div style="width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 50%; background: #fee2e2; color: #991b1b; font-weight: bold; margin-right: 12px; font-size: 14px; flex-shrink: 0;">${period}</div>
                                                    <div style="font-weight: 800; color: #dc2626; text-transform: uppercase; font-size: 13px; letter-spacing: 0.5px;">УРОК СНЯТ</div>
                                                </div>
                                            `;
                                        }

                                        return `
                                            <div style="display: flex; align-items: center; margin-bottom: 10px; padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
                                                <div style="width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 50%; background: #e2e8f0; color: #475569; font-weight: bold; margin-right: 12px; font-size: 14px; flex-shrink: 0;">${period}</div>
                                                <div style="flex: 1; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 18px; color: #0f172a; font-variant-numeric: tabular-nums;">
                                                    <span>${bell.start}</span>
                                                    <span style="color: #cbd5e1; font-weight: normal; margin: 0 5px;">&mdash;</span>
                                                    <span>${bell.end}</span>
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div style="margin-top: 40px; padding-top: 15px; border-top: 2px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="font-size: 12px; font-weight: bold; color: #64748b;">
                        <div style="text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px;">УТВЕРЖДАЮ</div>
                        <div style="color: #0f172a;">Директор гимназии</div>
                    </div>
                    <div style="text-align: right;">
                         <div style="border-bottom: 2px solid #94a3b8; width: 180px; margin-bottom: 4px;"></div>
                         <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase;">подпись</div>
                    </div>
                </div>
            </div>
        `;
    };

    const exportBellsToPng = async () => {
        if (!exportRef.current) return;
        const canvas = await html2canvas(exportRef.current, { scale: 2, backgroundColor: '#ffffff' });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);
        link.download = `Звонки_${preset?.name || 'Расписание'}.png`;
        link.click();
    };

    const exportBellsToPdf = async () => {
         if (!exportRef.current) return;
        const canvas = await html2canvas(exportRef.current, { scale: 2, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const width = pdf.internal.pageSize.getWidth();
        const height = (canvas.height * width) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, width, height);
        const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);
        pdf.save(`Звонки_${preset?.name || 'Расписание'}.pdf`);
    };

    const exportBellsToExcel = () => {
        const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);

        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <style>
                    table { border-collapse: collapse; font-family: Arial, sans-serif; width: 100%; text-align: center; }
                    td, th { border: 2px solid #000000; padding: 8px; vertical-align: middle; text-align: center; }
                    .title-main { font-size: 18pt; font-weight: bold; border: none; text-align: center; }
                    .title-sub { font-size: 12pt; border: none; text-align: center; }
                    .shift-header { font-size: 14pt; font-weight: bold; background-color: #312e81; color: white; border: 2px solid #000; }
                    .lesson-header { font-size: 12pt; font-weight: bold; background-color: #e5e7eb; border: 2px solid #000; }
                    .time-cell { font-size: 11pt; font-weight: bold; background-color: #fff; width: 120px; }
                    .cancelled-cell { font-size: 14pt; font-weight: bold; background-color: #fef2f2; color: #dc2626; text-transform: uppercase; letter-spacing: 0.1em; }
                    .approval-block { text-align: left; border: none !important; font-family: "Times New Roman", serif; font-size: 11pt; }
                    .footer-block { border: none !important; font-weight: bold; text-align: left; padding-top: 20px; font-size: 11pt; font-family: "Times New Roman", serif; }
                    .empty-row { border: none !important; height: 15px; }
                </style>
            </head>
            <body>
        `;

        html += `
            <table>
                <tr>
                    <td colspan="2" style="border:none"></td>
                    <td colspan="2" class="approval-block">
                        <b>УТВЕРЖДАЮ</b><br>
                        Директор государственного<br>
                        учреждения образования<br>
                        «Гимназия № 22 г. Минска»<br><br>
                        __________ Н.В.Кисель<br>
                        "__" ______ 2025г.
                    </td>
                </tr>
                <tr class="empty-row"><td colspan="4" style="border:none"></td></tr>
            </table>
        `;

        html += `
            <table>
                <tr><td colspan="4" class="title-main">РАСПИСАНИЕ ЗВОНКОВ</td></tr>
                ${exportDate ? `<tr><td colspan="4" class="title-sub">на ${new Date(exportDate).toLocaleDateString('ru-RU')}</td></tr>` : ''}
                <tr><td colspan="4" class="title-sub">Режим: ${preset?.name || 'Обычный'}</td></tr>
                <tr class="empty-row"><td colspan="4" style="border:none"></td></tr>
                <tr>
                    <th class="lesson-header">Смена</th>
                    <th class="lesson-header">Урок №</th>
                    <th class="lesson-header">Время начала</th>
                    <th class="lesson-header">Время окончания</th>
                </tr>
        `;

        [Shift.First, Shift.Second].forEach(shift => {
            const shiftName = shift === Shift.First ? '1-я смена' : '2-я смена';

            SHIFT_PERIODS[shift].forEach((period, index) => {
                const bell = currentPresetBells.find(b => b.shift === shift && b.period === period && b.day === 'default')
                    || { start: '00:00', end: '00:00', cancelled: false };

                html += `
                    <tr>
                        ${index === 0 ? `<td rowspan="${SHIFT_PERIODS[shift].length}" class="shift-header">${shiftName}</td>` : ''}
                        <td class="lesson-header">${period}</td>
                        ${bell.cancelled 
                            ? `<td colspan="2" class="cancelled-cell">УРОК СНЯТ</td>`
                            : `<td class="time-cell">${bell.start}</td><td class="time-cell">${bell.end}</td>`
                        }
                    </tr>
                `;
            });

            html += '<tr class="empty-row"><td colspan="4" style="border:none"></td></tr>';
        });

        html += `
                <tr class="empty-row"><td colspan="4" style="border:none"></td></tr>
                <tr>
                    <td colspan="4" class="footer-block">
                        Экспортировано: ${new Date().toLocaleDateString('ru-RU')} в ${new Date().toLocaleTimeString('ru-RU')}
                    </td>
                </tr>
            </table>
            </body>
            </html>
        `;

        const blob = new Blob([html], { type: "application/vnd.ms-excel" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const dateStr = exportDate ? `_${new Date(exportDate).toLocaleDateString('ru-RU').replace(/\./g, '-')}` : '';
        link.download = `Расписание_звонков_${preset?.name || 'Обычное'}${dateStr}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const ShiftTimeline = ({ shift }: { shift: Shift }) => {
        const periods = SHIFT_PERIODS[shift];
        const shiftBells = currentPresetBells.filter(b => b.shift === shift && b.day === 'default');
        
        return (
            <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full">
                {/* Header */}
                <div className={`p-4 font-bold text-lg text-white text-center bg-gradient-to-r ${shift === Shift.First ? 'from-indigo-600 to-indigo-700' : 'from-purple-600 to-purple-700'}`}>
                    {shift}
                </div>
                
                {/* Tools */}
                <div className="bg-slate-50 dark:bg-slate-700/50 p-2 flex justify-center gap-2 border-b border-slate-200 dark:border-slate-600">
                    <button onClick={() => bulkShiftSchedule(shift, -5)} className="px-2 py-1 text-xs font-bold text-slate-500 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm border border-slate-200 dark:border-slate-500">-5 мин</button>
                    <button onClick={() => bulkShiftSchedule(shift, 5)} className="px-2 py-1 text-xs font-bold text-slate-500 hover:bg-white dark:hover:bg-slate-600 rounded shadow-sm border border-slate-200 dark:border-slate-500">+5 мин</button>
                    <div className="w-px h-6 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                    <button onClick={() => bulkSetDuration(shift, 45)} className="px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded border border-indigo-200 dark:border-indigo-800">45 мин</button>
                    <button onClick={() => bulkSetDuration(shift, 40)} className="px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded border border-indigo-200 dark:border-indigo-800">40 мин</button>
                </div>

                {/* Timeline */}
                <div className="p-4 space-y-2 relative flex-1 overflow-y-auto custom-scrollbar">
                    {/* Vertical Line */}
                    <div className="absolute left-[2.85rem] top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-700 z-0"></div>

                    {periods.map((period, index) => {
                        const bell = shiftBells.find(b => b.period === period) || { start: '00:00', end: '00:00', cancelled: false } as Bell;
                        const prevBell = index > 0 ? shiftBells.find(b => b.period === periods[index-1]) : null;
                        
                        // Overlap Check
                        const hasOverlap = prevBell && timeToMin(bell.start) < timeToMin(prevBell.end);
                        const isInvalid = timeToMin(bell.end) <= timeToMin(bell.start);
                        
                        // Break Duration
                        let breakDuration = 0;
                        if (prevBell) {
                            breakDuration = timeToMin(bell.start) - timeToMin(prevBell.end);
                        }

                        return (
                            <React.Fragment key={period}>
                                {index > 0 && (
                                    <div className="flex items-center gap-4 relative z-10 my-1">
                                        <div className="w-12 flex justify-center"><div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-500"></div></div>
                                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${breakDuration < 5 ? 'bg-red-100 text-red-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                            <Icon name="Coffee" size={10} />
                                            {breakDuration} мин
                                        </div>
                                    </div>
                                )}
                                
                                <div className={`relative z-10 flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${bell.cancelled 
                                    ? 'bg-[linear-gradient(45deg,#fef2f2_25%,#fee2e2_25%,#fee2e2_50%,#fef2f2_50%,#fef2f2_75%,#fee2e2_75%,#fee2e2_100%)] bg-[length:20px_20px] border-red-200 dark:border-red-900/50' 
                                    : 'bg-white dark:bg-slate-700/30 border-slate-100 dark:border-slate-600 hover:border-indigo-200 dark:hover:border-indigo-500'}`}>
                                    
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shadow-sm border-2 ${bell.cancelled ? 'bg-white text-red-400 border-red-100' : 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-600 dark:to-slate-700 text-slate-600 dark:text-slate-300 border-white dark:border-slate-500'}`}>
                                        {period}
                                    </div>

                                    {bell.cancelled ? (
                                        <div className="flex-1 flex items-center justify-between">
                                            <span className="text-red-500 font-bold uppercase text-xs tracking-wider bg-white/80 px-2 py-1 rounded">Урок снят</span>
                                            <button onClick={() => toggleBellCancellation(shift, period)} className="p-2 bg-white text-emerald-600 hover:bg-emerald-50 rounded-lg transition shadow-sm"><Icon name="RotateCcw" size={16}/></button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                                <div className="relative">
                                                    <input 
                                                        type="time" 
                                                        value={bell.start} 
                                                        onChange={(e) => handleBellChange(shift, period, 'start', e.target.value)}
                                                        className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-lg px-2 py-1 text-center font-mono font-bold text-lg outline-none focus:ring-2 focus:ring-indigo-500 ${hasOverlap ? 'border-red-500 text-red-600' : 'border-slate-200 dark:border-slate-600 dark:text-white'}`}
                                                    />
                                                    {hasOverlap && <div className="absolute -top-2 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
                                                </div>
                                                <span className="text-slate-300 dark:text-slate-600 font-bold">-</span>
                                                <div className="relative">
                                                    <input 
                                                        type="time" 
                                                        value={bell.end} 
                                                        onChange={(e) => handleBellChange(shift, period, 'end', e.target.value)}
                                                        className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-lg px-2 py-1 text-center font-mono font-bold text-lg outline-none focus:ring-2 focus:ring-indigo-500 ${isInvalid ? 'border-red-500 text-red-600' : 'border-slate-200 dark:border-slate-600 dark:text-white'}`}
                                                    />
                                                </div>
                                            </div>
                                            <button onClick={() => toggleBellCancellation(shift, period)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-lg transition"><Icon name="X" size={16}/></button>
                                        </>
                                    )}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 shrink-0">
                <div className="flex p-1 bg-white dark:bg-dark-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-x-auto">
                    {[
                        { id: 'teachers', icon: 'Users', label: 'Учителя' },
                        { id: 'subjects', icon: 'BookOpen', label: 'Предметы' },
                        { id: 'classes', icon: 'GraduationCap', label: 'Классы' },
                        { id: 'rooms', icon: 'DoorOpen', label: 'Кабинеты' },
                        { id: 'bells', icon: 'Bell', label: 'Звонки' },
                    ].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                            <Icon name={tab.icon} size={18} /> {tab.label}
                        </button>
                    ))}
                </div>
                {activeTab !== 'bells' && <button onClick={() => openModal()} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none font-semibold"><Icon name="Plus" size={20} /> Добавить</button>}
            </div>

            <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar pr-2">
                {activeTab === 'teachers' && (
                    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {teachers.map((t, i) => (
                            <div key={t.id} draggable onDragStart={(e)=>onDragStart(e,i)} onDragOver={onDragOver} onDrop={(e)=>onDrop(e,i)} className="bg-white dark:bg-dark-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group flex flex-col cursor-grab active:cursor-grabbing">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                        <Icon name="GripVertical" className="text-slate-300 dark:text-slate-600" size={16} />
                                        <div className="font-bold text-slate-800 dark:text-slate-100 text-lg">{t.name}</div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => openModal(t.id)} className="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 bg-slate-50 dark:bg-slate-700 rounded-full"><Icon name="Edit2" size={16}/></button>
                                        <button onClick={() => handleDelete(t.id)} className="p-2 text-slate-600 dark:text-slate-300 hover:text-red-600 bg-slate-50 dark:bg-slate-700 rounded-full"><Icon name="Trash2" size={16}/></button>
                                    </div>
                                </div>
                                <div className="text-xs text-slate-500 mb-2">{t.birthDate ? `ДР: ${new Date(t.birthDate).toLocaleDateString('ru-RU')}` : ''}</div>
                                <div className="flex gap-2 mb-3">
                                    {t.shifts.includes(Shift.First) && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">1 см</span>}
                                    {t.shifts.includes(Shift.Second) && <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold">2 см</span>}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-auto pl-7">
                                    {t.subjectIds.map(sid => {
                                        const s = subjects.find(sub => sub.id === sid);
                                        return s ? <span key={sid} className="text-xs px-2 py-1 rounded-md font-medium" style={{backgroundColor: s.color, color: '#334155'}}>{s.name}</span> : null;
                                    })}
                                </div>
                            </div>
                        ))}
                    </StaggerContainer>
                )}

                {activeTab === 'subjects' && (
                    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {subjects.map((s, i) => (
                            <div key={s.id} draggable onDragStart={(e)=>onDragStart(e,i)} onDragOver={onDragOver} onDrop={(e)=>onDrop(e,i)} className="bg-white dark:bg-dark-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between group cursor-grab active:cursor-grabbing border-l-4" style={{borderLeftColor: s.color}}>
                                <div className="flex items-center gap-3">
                                    <Icon name="GripVertical" className="text-slate-300 dark:text-slate-600" size={16} />
                                    <div>
                                        <div className="font-bold text-slate-700 dark:text-slate-200">{s.name}</div>
                                        <div className="text-xs text-slate-400">Сложность {s.difficulty} • {s.requiredRoomType}</div>
                                    </div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal(s.id)} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600"><Icon name="Edit2" size={16}/></button>
                                    <button onClick={() => handleDelete(s.id)} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-red-600"><Icon name="Trash2" size={16}/></button>
                                </div>
                            </div>
                        ))}
                    </StaggerContainer>
                )}

                {activeTab === 'classes' && (
                    <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {classes.map((c, i) => (
                            <div key={c.id} draggable onDragStart={(e)=>onDragStart(e,i)} onDragOver={onDragOver} onDrop={(e)=>onDrop(e,i)} className={`bg-white dark:bg-dark-800 p-4 rounded-2xl border ${c.excludeFromReports ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-100'} dark:border-slate-700 shadow-sm text-center group hover:shadow-md transition-all relative cursor-grab active:cursor-grabbing`}>
                                <div className="absolute left-2 top-2 text-slate-300 dark:text-slate-600"><Icon name="GripVertical" size={14} /></div>
                                <div className={`text-2xl font-black ${c.excludeFromReports ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100'} mb-1`}>{c.name}</div>
                                <div className="text-xs text-slate-500 mb-1">{c.studentsCount || 0} учеников</div>
                                <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${c.shift === Shift.First ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{c.shift === Shift.First ? 'I' : 'II'} смена</div>
                                {c.excludeFromReports && <div className="mt-2 text-[10px] text-slate-400 font-bold uppercase border border-slate-200 rounded px-1 inline-block">Исключен</div>}
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal(c.id)} className="p-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600"><Icon name="Edit2" size={14}/></button>
                                    <button onClick={() => handleDelete(c.id)} className="p-1 text-slate-600 dark:text-slate-300 hover:text-red-600"><Icon name="Trash2" size={14}/></button>
                                </div>
                            </div>
                        ))}
                    </StaggerContainer>
                )}

                {activeTab === 'rooms' && (
                    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {rooms.map((r, i) => (
                            <div key={r.id} draggable onDragStart={(e)=>onDragStart(e,i)} onDragOver={onDragOver} onDrop={(e)=>onDrop(e,i)} className="bg-white dark:bg-dark-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between group cursor-grab active:cursor-grabbing">
                                <div className="flex items-center gap-3">
                                    <Icon name="GripVertical" className="text-slate-300 dark:text-slate-600" size={16} />
                                    <div className="bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600"><Icon name="DoorOpen" size={20}/></div>
                                    <div>
                                        <div className="font-bold text-slate-700 dark:text-slate-200">{r.name}</div>
                                        <div className="text-xs text-slate-400">Вмест: {r.capacity} • {r.type}</div>
                                    </div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openModal(r.id)} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600"><Icon name="Edit2" size={16}/></button>
                                    <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-red-600"><Icon name="Trash2" size={16}/></button>
                                </div>
                            </div>
                        ))}
                    </StaggerContainer>
                )}
                
                {/* REDESIGNED BELLS UI */}
                {activeTab === 'bells' && (
                    <div className="flex flex-col gap-6">
                        {/* 1. Control Bar: Presets & Main Actions */}
                        <div className="bg-white dark:bg-dark-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between sticky top-0 z-20">
                            {/* Preset Selector */}
                            <div className="flex flex-col gap-2 w-full md:w-auto">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Режим звонков</span>
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
                                    {(settings.bellPresets || []).map(p => (
                                        <div key={p.id} onClick={() => setSelectedPresetId(p.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap group ${selectedPresetId === p.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                            <span className="text-sm font-bold">{p.name}</span>
                                            {selectedPresetId === p.id && (
                                                <div className="flex items-center gap-1 ml-2 border-l border-indigo-400 pl-2">
                                                    <button onClick={(e) => {e.stopPropagation(); duplicatePreset()}} className="text-indigo-100 hover:text-white p-1 rounded hover:bg-indigo-500/50 transition-colors" title="Дублировать"><Icon name="Copy" size={14}/></button>
                                                    <button onClick={(e) => {e.stopPropagation(); deletePreset()}} className="text-indigo-200 hover:text-red-200 p-1 rounded hover:bg-red-500/20 transition-colors" title="Удалить"><Icon name="Trash2" size={14}/></button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={createNewPreset} className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 rounded-xl" title="Создать"><Icon name="Plus" size={20}/></button>
                                </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-3 flex-wrap items-end w-full md:w-auto justify-end">
                                <button onClick={savePreset} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900 rounded-xl font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition text-sm flex items-center gap-2">
                                    <Icon name="Save" size={18}/> Сохранить
                                </button>
                                <button onClick={applyPreset} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 dark:shadow-none text-sm flex items-center gap-2">
                                    <Icon name="CheckCircle" size={18}/> Применить
                                </button>
                                <button onClick={() => setIsExportModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none text-sm flex items-center gap-2">
                                    <Icon name="Printer" size={18}/> Экспорт / Печать
                                </button>
                            </div>
                        </div>

                        {/* Mobile Shift Toggle */}
                        <div className="lg:hidden flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                            <button onClick={() => setActiveBellShift(Shift.First)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeBellShift === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>1 смена</button>
                            <button onClick={() => setActiveBellShift(Shift.Second)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeBellShift === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>2 смена</button>
                        </div>

                        {/* 2. Main Editor Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                            {/* Shift 1 */}
                            <div className={`${activeBellShift === Shift.First ? 'block' : 'hidden lg:block'}`}>
                                <ShiftTimeline shift={Shift.First} />
                            </div>
                            
                            {/* Shift 2 */}
                            <div className={`${activeBellShift === Shift.Second ? 'block' : 'hidden lg:block'}`}>
                                <ShiftTimeline shift={Shift.Second} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Standard Modal for Forms */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Редактировать' : 'Добавить'}>
                <div className="space-y-4">
                    {activeTab === 'teachers' && (
                        <>
                            <input className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" placeholder="ФИО Учителя" value={teacherForm.name || ''} onChange={e => setTeacherForm({...teacherForm, name: e.target.value})} />
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Дата рождения</label><input type="date" className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" value={teacherForm.birthDate || ''} onChange={e => setTeacherForm({...teacherForm, birthDate: e.target.value})} /></div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Telegram Chat ID</label>
                                <input type="text" className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" value={teacherForm.telegramChatId || ''} onChange={e => setTeacherForm({...teacherForm, telegramChatId: e.target.value})} placeholder="12345678" />
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Смены</div>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" checked={teacherForm.shifts?.includes(Shift.First)} onChange={() => { const current = teacherForm.shifts || []; setTeacherForm({...teacherForm, shifts: current.includes(Shift.First) ? current.filter(s => s !== Shift.First) : [...current, Shift.First]}); }} /> <span className="text-sm font-medium dark:text-slate-300">1 смена</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-purple-600 focus:ring-purple-500" checked={teacherForm.shifts?.includes(Shift.Second)} onChange={() => { const current = teacherForm.shifts || []; setTeacherForm({...teacherForm, shifts: current.includes(Shift.Second) ? current.filter(s => s !== Shift.Second) : [...current, Shift.Second]}); }} /> <span className="text-sm font-medium dark:text-slate-300">2 смена</span></label>
                                </div>
                            </div>
                            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mt-2">Предметы</div>
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar border border-slate-100 dark:border-slate-700 p-2 rounded-xl">{subjects.map(s => (<label key={s.id} className="flex items-center gap-2 p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"><input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" checked={teacherForm.subjectIds?.includes(s.id)} onChange={e => { const current = teacherForm.subjectIds || []; setTeacherForm({...teacherForm, subjectIds: e.target.checked ? [...current, s.id] : current.filter((x: string) => x !== s.id)}); }} /> <span className="text-sm dark:text-slate-300">{s.name}</span></label>))}</div>
                        </>
                    )}
                    
                    {activeTab === 'subjects' && (
                        <>
                            <input className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" placeholder="Название предмета" value={subjectForm.name || ''} onChange={e => setSubjectForm({...subjectForm, name: e.target.value})} />
                            <div className="flex items-center gap-4"><span className="text-sm font-bold text-slate-600 dark:text-slate-300">Цвет</span><input type="color" className="w-20 h-10 cursor-pointer bg-transparent" value={subjectForm.color || '#ffffff'} onChange={e => setSubjectForm({...subjectForm, color: e.target.value})} /></div>
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Сложность (СанПиН 1-12)</label><input type="number" inputMode="numeric" min="1" max="12" className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" value={subjectForm.difficulty || 5} onChange={e => setSubjectForm({...subjectForm, difficulty: parseInt(e.target.value)})} /></div>
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Требуемый тип кабинета</label><select className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" value={subjectForm.requiredRoomType} onChange={e => setSubjectForm({...subjectForm, requiredRoomType: e.target.value})}>{ROOM_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
                        </>
                    )}

                    {activeTab === 'classes' && (
                        <>
                            <input className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" placeholder="Название класса (5А)" value={classForm.name || ''} onChange={e => setClassForm({...classForm, name: e.target.value})} />
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Количество учеников</label><input type="number" inputMode="numeric" className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" value={classForm.studentsCount || 25} onChange={e => setClassForm({...classForm, studentsCount: parseInt(e.target.value)})} /></div>
                            <div className="grid grid-cols-2 gap-3"><button onClick={() => setClassForm({...classForm, shift: Shift.First})} className={`p-3 rounded-xl border text-sm font-bold transition-all ${classForm.shift === Shift.First ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>1 смена</button><button onClick={() => setClassForm({...classForm, shift: Shift.Second})} className={`p-3 rounded-xl border text-sm font-bold transition-all ${classForm.shift === Shift.Second ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}>2 смена</button></div>
                            
                            <label className="flex items-center gap-2 mt-4 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="rounded text-indigo-600 focus:ring-indigo-500" 
                                    checked={classForm.excludeFromReports || false} 
                                    onChange={e => setClassForm({...classForm, excludeFromReports: e.target.checked})} 
                                /> 
                                <span className="text-sm font-medium dark:text-slate-300">Исключить из проверки конфликтов</span>
                            </label>
                            <p className="text-[10px] text-slate-500 mt-1">Класс не будет отображаться в виджете конфликтов, если у него нет уроков.</p>
                        </>
                    )}

                    {activeTab === 'rooms' && (
                        <>
                            <input className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" placeholder="Номер/Название (напр. 101)" value={roomForm.name || ''} onChange={e => setRoomForm({...roomForm, name: e.target.value})} />
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Вместимость (мест)</label><input type="number" inputMode="numeric" className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" value={roomForm.capacity || 30} onChange={e => setRoomForm({...roomForm, capacity: parseInt(e.target.value)})} /></div>
                            <div><label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Тип кабинета</label><select className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" value={roomForm.type} onChange={e => setRoomForm({...roomForm, type: e.target.value})}>{ROOM_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
                        </>
                    )}

                    <div className="flex justify-end pt-4"><button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold shadow-lg shadow-indigo-200 dark:shadow-none">Сохранить</button></div>
                </div>
            </Modal>
            
            {/* New Preset Modal */}
            <Modal isOpen={isPresetModalOpen} onClose={() => setIsPresetModalOpen(false)} title="Новый режим звонков">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Название режима</label>
                        <input
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                            placeholder="Например: Праздничный (30 мин)"
                            value={newPresetName}
                            onChange={e => setNewPresetName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end pt-2">
                        <button onClick={confirmCreatePreset} className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold">Создать</button>
                    </div>
                </div>
            </Modal>
            
            {/* EXPORT PREVIEW MODAL */}
            <Modal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} title="Экспорт расписания звонков" maxWidth="max-w-6xl">
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-600">
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">Дата для документа:</label>
                            <input 
                                type="date" 
                                value={exportDate} 
                                onChange={(e) => setExportDate(e.target.value)} 
                                className="border border-slate-200 dark:border-slate-600 p-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-800 dark:text-white"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={exportBellsToPng} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition flex items-center gap-2 text-sm shadow-lg shadow-emerald-200 dark:shadow-none">
                                <Icon name="Image" size={18}/> Скачать PNG
                            </button>
                            <button onClick={exportBellsToPdf} className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition flex items-center gap-2 text-sm shadow-lg shadow-red-200 dark:shadow-none">
                                <Icon name="FileSpreadsheet" size={18}/> Скачать PDF
                            </button>
                            <button onClick={exportBellsToExcel} className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition flex items-center gap-2 text-sm shadow-lg shadow-green-200 dark:shadow-none">
                                <Icon name="Table" size={18}/> Скачать Excel
                            </button>
                        </div>
                    </div>

                    <div className="overflow-auto bg-slate-200 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-300 dark:border-slate-700 flex justify-center">
                        {/* HTML Preview Content */}
                        <div ref={exportRef} dangerouslySetInnerHTML={{ __html: getExportContent() }} />
                    </div>
                </div>
            </Modal>
        </div>
    );
};
