
import React, { useState, useRef, useEffect } from 'react';
import { useStaticData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { Modal, StaggerContainer } from '../components/UI';
import { Shift, ROOM_TYPES, SHIFT_PERIODS, Teacher, Subject, ClassEntity, Room, BellPreset, Bell } from '../types';
import { DEFAULT_BELLS, SHORT_BELLS } from '../constants';
import { generateId } from '../utils/helpers';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

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
    const bellsPrintRef = useRef<HTMLDivElement>(null); // редактор
    const exportRef = useRef<HTMLDivElement>(null); // чистый вариант для экспорта/предпросмотра

    // Export State
    const [exportDate, setExportDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [previewTitle, setPreviewTitle] = useState<string>('Расписание звонков');
    const [previewSubtitle, setPreviewSubtitle] = useState<string>('');
    const [previewApproverTitle, setPreviewApproverTitle] = useState<string>('УТВЕРЖДАЮ');
    const [previewApproverText, setPreviewApproverText] = useState<string>('Директор гимназии');
    const [previewFooterText, setPreviewFooterText] = useState<string>('Создано с помощью системы управления гимназией');

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

    const handleBellChange = (shift: string, period: number, field: string, value: string) => {
        const newBells = [...currentPresetBells];
        const idx = newBells.findIndex(b => b.shift === shift && b.period === period && b.day === 'default');
        
        if (idx >= 0) {
            newBells[idx] = { ...newBells[idx], [field]: value };
        } else {
            // Need to create it if missing for some reason (rare for default day)
            newBells.push({ shift, period, [field]: value, start: '00:00', end: '00:00', day: 'default' } as Bell);
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
        await saveStaticData({ settings: { ...settings, bellPresets: presets } });
        setSelectedPresetId('preset_normal');
    };

    const applyPreset = async () => {
        if (window.confirm(`Применить режим звонков "${settings.bellPresets?.find(p=>p.id===selectedPresetId)?.name}" для всего расписания?`)) {
            await saveStaticData({ bellSchedule: currentPresetBells });
            alert("Режим звонков применен!");
        }
    };

    const openExportPreview = () => {
        const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);
        setPreviewTitle(`Расписание звонков: ${preset?.name || 'Обычное'}`);
        setPreviewSubtitle(exportDate ? `на ${new Date(exportDate).toLocaleDateString('ru-RU')}` : '');
        setPreviewApproverTitle('УТВЕРЖДАЮ');
        setPreviewApproverText('Директор гимназии');
        setPreviewFooterText('Создано с помощью системы управления гимназией');
        setIsPreviewMode(true);
    };

    const createExportElement = () => {
        const exportElement = document.createElement('div');
        exportElement.style.width = '1200px';
        exportElement.style.minHeight = '1000px';
        exportElement.style.backgroundColor = '#ffffff';
        exportElement.style.padding = '60px';
        exportElement.style.fontFamily = 'Arial, sans-serif';
        exportElement.style.position = 'absolute';
        exportElement.style.left = '-9999px';
        exportElement.style.top = '-9999px';
        exportElement.style.boxSizing = 'border-box';
        exportElement.style.display = 'flex';
        exportElement.style.flexDirection = 'column';

        const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);

        exportElement.innerHTML = `
            <div style="text-align: center; margin-bottom: 40px;">
                <h1 style="font-size: 28px; font-weight: 900; text-transform: uppercase; color: #1e293b; margin-bottom: 8px;">
                    ${previewTitle}
                </h1>
                ${previewSubtitle ? `<p style="font-size: 20px; color: #64748b; font-weight: 600;">${previewSubtitle}</p>` : ''}
                <div style="height: 4px; width: 200px; background: linear-gradient(to right, #6366f1, #8b5cf6); margin: 20px auto; border-radius: 2px;"></div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                ${[Shift.First, Shift.Second].map(shift => {
                    // Получаем все уроки для данной смены
                    const shiftBells = currentPresetBells.filter(b => b.shift === shift);
                    return `
                        <div style="border-radius: 12px; overflow: hidden; border: 2px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                            <div style="padding: 24px; font-weight: 700; font-size: 20px; color: white; text-align: center; background: linear-gradient(to right, ${shift === Shift.First ? '#6366f1, #4f46e5' : '#8b5cf6, #7c3aed'});">
                                ${shift}
                            </div>
                            <div style="padding: 24px; background: white; display: flex; flex-direction: column; gap: 16px;">
                                ${SHIFT_PERIODS[shift].map(period => {
                                    const bell = shiftBells.find(b => b.period === period && b.day === 'default') || { start: '00:00', end: '00:00', cancelled: false };
                                    return bell.cancelled ? `
                                        <div style="display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 8px; border: 2px solid #fca5a5; background: #fef2f2; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
                                            <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #e5e7eb, #f3f4f6); display: flex; align-items: center; justify-content: center; font-weight: 900; color: #6b7280; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); border: 2px solid white; font-size: 18px; flex-shrink: 0;">
                                                ${period}
                                            </div>
                                            <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 8px;">
                                                <span style="color: #dc2626; font-weight: 900; font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 16px; background: #fee2e2; border-radius: 20px; border: 2px solid #fca5a5;">УРОК СНЯТ</span>
                                            </div>
                                        </div>
                                    ` : `
                                        <div style="display: flex; align-items: center; gap: 16px; padding: 12px; border-radius: 8px; border: 2px solid #e2e8f0; background: #f8fafc; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
                                            <div style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #e5e7eb, #f3f4f6); display: flex; align-items: center; justify-content: center; font-weight: 900; color: #6b7280; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); border: 2px solid white; font-size: 18px; flex-shrink: 0;">
                                                ${period}
                                            </div>
                                            <div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 16px; min-width: 0;">
                                                <div style="text-align: center; flex-shrink: 0; width: 120px;">
                                                    <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Начало</div>
                                                    <div style="border: 2px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: white; font-weight: 900; color: #1e293b; text-align: center; font-size: 16px; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">${bell.start}</div>
                                                </div>
                                                <div style="display: flex; align-items: center; padding: 0 8px;">
                                                    <div style="width: 32px; height: 1px; background: #cbd5e1;"></div>
                                                </div>
                                                <div style="text-align: center; flex-shrink: 0; width: 120px;">
                                                    <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Конец</div>
                                                    <div style="border: 2px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; background: white; font-weight: 900; color: #1e293b; text-align: center; font-size: 16px; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">${bell.end}</div>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div style="margin-top: 48px; padding-top: 24px; border-top: 4px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; font-weight: 700; color: #64748b;">
                <div style="text-align: left;">
                    <div style="color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; margin-bottom: 4px;">${previewApproverTitle}</div>
                    <div style="color: #1e293b;">${previewApproverText}</div>
                </div>
                <div style="text-align: right;">
                    <div style="border-bottom: 4px solid #cbd5e1; width: 240px; margin-bottom: 4px;"></div>
                    <div style="color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px;">подпись</div>
                </div>
            </div>
            <div style="margin-top: 16px; text-align: center; font-size: 10px; color: #94a3b8;">
                ${previewFooterText} • ${new Date().toLocaleDateString('ru-RU')}
            </div>
        `;

        return exportElement;
    };

    const exportBellsToPng = async () => {
        const exportElement = createExportElement();
        document.body.appendChild(exportElement);

        try {
            // Даем время на рендеринг
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(exportElement, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                allowTaint: true,
                width: exportElement.offsetWidth,
                height: exportElement.offsetHeight
            });

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);
            const dateStr = exportDate ? `_${new Date(exportDate).toLocaleDateString('ru-RU').replace(/\./g, '-')}` : '';
            link.download = `Звонки_${preset?.name || 'Обычное'}${dateStr}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } finally {
            document.body.removeChild(exportElement);
        }
        setIsPreviewMode(false);
    };

    const exportBellsToPdf = async () => {
        const exportElement = createExportElement();
        document.body.appendChild(exportElement);

        try {
            // Даем время на рендеринг
            await new Promise(resolve => setTimeout(resolve, 100));

            // Создаем canvas с правильными размерами
            const canvas = await html2canvas(exportElement, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                allowTaint: true,
                width: exportElement.offsetWidth,
                height: exportElement.offsetHeight
            });

            const imgData = canvas.toDataURL('image/png', 1.0);

            // A4 dimensions in mm
            const pdfWidth = 210;
            const pdfHeight = 297;

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            // Вычисляем соотношение сторон для правильного размещения
            const imgAspectRatio = canvas.width / canvas.height;
            const pdfAspectRatio = pdfWidth / pdfHeight;

            let finalWidth, finalHeight;
            if (imgAspectRatio > pdfAspectRatio) {
                // Изображение шире - подгоняем по ширине
                finalWidth = pdfWidth;
                finalHeight = pdfWidth / imgAspectRatio;
            } else {
                // Изображение выше - подгоняем по высоте
                finalHeight = pdfHeight;
                finalWidth = pdfHeight * imgAspectRatio;
            }

            // Центрируем на странице
            const x = (pdfWidth - finalWidth) / 2;
            const y = (pdfHeight - finalHeight) / 2;

            pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight, '', 'FAST');

            const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);
            const dateStr = exportDate ? `_${new Date(exportDate).toLocaleDateString('ru-RU').replace(/\./g, '-')}` : '';
            pdf.save(`Звонки_${preset?.name || 'Обычное'}${dateStr}.pdf`);
        } catch (error) {
            console.error('PDF export error:', error);
            alert('Ошибка при экспорте в PDF');
        } finally {
            document.body.removeChild(exportElement);
        }
        setIsPreviewMode(false);
    };

    const exportBellsToExcel = () => {
        const preset = settings.bellPresets?.find(p=>p.id===selectedPresetId);

        // Создаем HTML таблицу как в дежурствах
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
                    .status-cell { font-size: 11pt; font-weight: bold; width: 100px; }
                    .cancelled { background-color: #fecaca; color: #dc2626; }
                    .active { background-color: #d1fae5; color: #059669; }
                    .approval-block { text-align: left; border: none !important; font-family: "Times New Roman", serif; font-size: 11pt; }
                    .footer-block { border: none !important; font-weight: bold; text-align: left; padding-top: 20px; font-size: 11pt; font-family: "Times New Roman", serif; }
                    .empty-row { border: none !important; height: 15px; }
                </style>
            </head>
            <body>
        `;

        // Утверждение (справа)
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

        // Заголовок
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

        // Данные по сменам
        [Shift.First, Shift.Second].forEach(shift => {
            const shiftName = shift === Shift.First ? '1-я смена' : '2-я смена';

            SHIFT_PERIODS[shift].forEach((period, index) => {
                const bell = currentPresetBells.find(b => b.shift === shift && b.period === period && b.day === 'default')
                    || { start: '00:00', end: '00:00', cancelled: false };

                if (bell.cancelled) {
                    // Если урок снят - показываем "УРОК СНЯТ" во всех колонках времени
                    html += `
                        <tr>
                            ${index === 0 ? `<td rowspan="${SHIFT_PERIODS[shift].length}" class="shift-header">${shiftName}</td>` : ''}
                            <td class="lesson-header">${period}</td>
                            <td colspan="2" class="status-cell cancelled" style="text-align: center; font-weight: bold;">УРОК СНЯТ</td>
                        </tr>
                    `;
                } else {
                    // Обычное отображение времени
                    html += `
                        <tr>
                            ${index === 0 ? `<td rowspan="${SHIFT_PERIODS[shift].length}" class="shift-header">${shiftName}</td>` : ''}
                            <td class="lesson-header">${period}</td>
                            <td class="time-cell">${bell.start}</td>
                            <td class="time-cell">${bell.end}</td>
                        </tr>
                    `;
                }
            });

            // Пустая строка между сменами
            html += '<tr class="empty-row"><td colspan="4" style="border:none"></td></tr>';
        });

        // Подвал
        html += `
                <tr class="empty-row"><td colspan="4" style="border:none"></td></tr>
                <tr>
                    <td colspan="2" class="footer-block">
                        Экспортировано: ${new Date().toLocaleDateString('ru-RU')} в ${new Date().toLocaleTimeString('ru-RU')}
                    </td>
                    <td colspan="2" style="border:none"></td>
                </tr>
            </table>
            </body>
            </html>
        `;

        // Создаем и скачиваем файл
        const blob = new Blob([html], { type: "application/vnd.ms-excel" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const dateStr = exportDate ? `_${new Date(exportDate).toLocaleDateString('ru-RU').replace(/\./g, '-')}` : '';
        link.download = `Расписание_звонков_${preset?.name || 'Обычное'}${dateStr}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setIsPreviewMode(false);
    };

    const toggleShift = (shift: string) => {
        const currentShifts = teacherForm.shifts || [];
        if (currentShifts.includes(shift)) {
            setTeacherForm({ ...teacherForm, shifts: currentShifts.filter((s: string) => s !== shift) });
        } else {
            setTeacherForm({ ...teacherForm, shifts: [...currentShifts, shift] });
        }
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
                
                {activeTab === 'bells' && (
                    <div className="flex flex-col gap-6">
                        {/* Control Bar */}
                        <div className="bg-white dark:bg-dark-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">Режим:</span>
                                <div className="relative">
                                    <select 
                                        value={selectedPresetId} 
                                        onChange={(e) => setSelectedPresetId(e.target.value)} 
                                        className="appearance-none bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 py-2 pl-4 pr-10 rounded-xl font-bold text-sm outline-none focus:ring-2 ring-indigo-500 cursor-pointer"
                                    >
                                        {(settings.bellPresets || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"><Icon name="Filter" size={14}/></div>
                                </div>
                                <button onClick={createNewPreset} className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition" title="Создать новый режим"><Icon name="Plus" size={18}/></button>
                                <button onClick={deletePreset} className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition" title="Удалить режим"><Icon name="Trash2" size={18}/></button>
                            </div>
                            
                            <div className="flex gap-3 flex-wrap items-end">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Дата экспорта</label>
                                    <input
                                        type="date"
                                        value={exportDate}
                                        onChange={e => setExportDate(e.target.value)}
                                        className="px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 ring-indigo-500"
                                    />
                                </div>
                                <button onClick={savePreset} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900 rounded-xl font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition text-sm flex items-center gap-2">
                                    <Icon name="Save" size={18}/> Сохранить изменения
                                </button>
                                <button onClick={applyPreset} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 dark:shadow-none text-sm flex items-center gap-2">
                                    <Icon name="CheckCircle" size={18}/> Применить режим
                                </button>
                                <button onClick={openExportPreview} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none text-sm flex items-center gap-2">
                                    <Icon name="Eye" size={18}/> Предпросмотр экспорта
                                </button>
                            </div>
                        </div>

                        {/* Export buttons - visible without scrolling */}
                        <div className="bg-white dark:bg-dark-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mt-4">
                            <div className="flex items-center justify-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                                    <Icon name="Download" size={16}/>
                                    Экспорт расписания:
                                </div>
                                <button onClick={exportBellsToExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-bold shadow-lg shadow-green-200 dark:shadow-none flex items-center gap-2 transition">
                                    <Icon name="FileSpreadsheet" size={16}/> Excel
                                </button>
                                <button onClick={exportBellsToPdf} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold shadow-lg shadow-red-200 dark:shadow-none flex items-center gap-2 transition">
                                    <Icon name="FileText" size={16}/> PDF (A4)
                                </button>
                                <button onClick={exportBellsToPng} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-bold shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2 transition">
                                    <Icon name="Image" size={16}/> PNG
                                </button>
                            </div>
                        </div>

                        {/* Preview section - always visible like in schedules */}
                        {isPreviewMode && (
                            <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mt-6">
                                <div className="p-6 border-b border-slate-100 dark:border-slate-700">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Предпросмотр экспорта</h3>
                                        <button onClick={() => setIsPreviewMode(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                                            <Icon name="X" size={20}/>
                                        </button>
                                    </div>
                                </div>
                                <div className="p-6">
                                    {/* Edit fields */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Заголовок</label>
                                            <input
                                                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                                value={previewTitle}
                                                onChange={e => setPreviewTitle(e.target.value)}
                                                placeholder="РАСПИСАНИЕ ЗВОНКОВ"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Подзаголовок</label>
                                            <input
                                                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                                value={previewSubtitle}
                                                onChange={e => setPreviewSubtitle(e.target.value)}
                                                placeholder="на 15 марта 2024"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Текст подвала</label>
                                            <input
                                                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500"
                                                value={previewFooterText}
                                                onChange={e => setPreviewFooterText(e.target.value)}
                                                placeholder="Создано с помощью..."
                                            />
                                        </div>
                                    </div>

                                    {/* Preview content */}
                                    <div className="flex justify-center mb-4">
                                        <div className="bg-white rounded-lg shadow-xl border-2 border-slate-300 overflow-hidden" style={{width: '900px'}}>
                                <div ref={exportRef} className="bg-white p-8 text-slate-900" style={{width: '100%', minHeight: '650px'}}>
                                     <div className="text-center mb-8">
                                        <input
                                            type="text"
                                            className="text-3xl font-black uppercase text-slate-800 mb-2 text-center bg-transparent border-0 outline-none w-full"
                                            value={previewTitle}
                                            onChange={e => setPreviewTitle(e.target.value)}
                                            placeholder="РАСПИСАНИЕ ЗВОНКОВ"
                                        />
                                        <input
                                            type="text"
                                            className="text-lg text-slate-600 font-medium text-center bg-transparent border-0 outline-none w-full"
                                            value={previewSubtitle}
                                            onChange={e => setPreviewSubtitle(e.target.value)}
                                            placeholder="на 15 марта 2024"
                                        />
                                        <div className="mt-4 flex justify-center">
                                            <div className="h-1 w-32 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"></div>
                                        </div>
                                     </div>
                                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    {[Shift.First, Shift.Second].map(shift => (
                                                        <div key={shift} className="rounded-xl overflow-hidden border-2 border-slate-200 shadow-lg">
                                                            <div className={`p-6 font-bold text-xl text-white text-center bg-gradient-to-r ${shift === Shift.First ? 'from-indigo-600 to-indigo-700' : 'from-purple-600 to-purple-700'}`}>
                                                                {shift}
                                                            </div>
                                                            <div className="p-6 space-y-4 bg-white">
                                                                {SHIFT_PERIODS[shift].map(period => {
                                                                    const bell = currentPresetBells.find(b => b.shift === shift && b.period === period && b.day === 'default')
                                                                        || { start: '00:00', end: '00:00', cancelled: false };
                                                                    return (
                                                                        <div key={period} className={`flex items-center gap-4 p-4 rounded-lg border-2 ${bell.cancelled ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                                                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center font-black text-slate-600 shadow-md border-2 border-white text-lg flex-shrink-0">{period}</div>

                                                                            {bell.cancelled ? (
                                                                                <div className="flex-1 flex justify-center items-center py-2">
                                                                                    <span className="text-red-600 font-black uppercase tracking-wider text-base px-4 py-2 bg-red-100 rounded-full border border-red-200">УРОК СНЯТ</span>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="flex-1 flex items-center justify-center gap-4 min-w-0">
                                                                                    <div className="text-center flex-shrink-0 w-32">
                                                                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Начало</div>
                                                                                        <input
                                                                                            type="time"
                                                                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-black text-slate-800 text-center text-lg focus:ring-2 ring-indigo-300 outline-none shadow-sm"
                                                                                            value={bell.start}
                                                                                            onChange={e => handleBellChange(shift, period, 'start', e.target.value)}
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex items-center px-2">
                                                                                        <div className="w-8 h-0.5 bg-slate-400"></div>
                                                                                    </div>
                                                                                    <div className="text-center flex-shrink-0 w-32">
                                                                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Конец</div>
                                                                                        <input
                                                                                            type="time"
                                                                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white font-black text-slate-800 text-center text-lg focus:ring-2 ring-indigo-300 outline-none shadow-sm"
                                                                                            value={bell.end}
                                                                                            onChange={e => handleBellChange(shift, period, 'end', e.target.value)}
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            )}

                                                                            <button
                                                                                onClick={() => toggleBellCancellation(shift, period)}
                                                                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-md flex-shrink-0 ${bell.cancelled ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 border-2 border-slate-200'}`}
                                                                                title={bell.cancelled ? "Вернуть урок" : "Снять урок"}
                                                                            >
                                                                                <Icon name={bell.cancelled ? "RotateCcw" : "X"} size={18} />
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="mt-12 pt-6 border-t-2 border-slate-300 flex justify-between items-end text-sm font-bold text-slate-600">
                                                    <div className="text-left">
                                                        <input
                                                            type="text"
                                                            className="text-slate-500 uppercase tracking-wider text-xs mb-1 bg-transparent border-0 outline-none w-full text-left"
                                                            value={previewApproverTitle}
                                                            onChange={e => setPreviewApproverTitle(e.target.value)}
                                                            placeholder="УТВЕРЖДАЮ"
                                                        />
                                                        <input
                                                            type="text"
                                                            className="text-slate-800 bg-transparent border-0 outline-none w-full"
                                                            value={previewApproverText}
                                                            onChange={e => setPreviewApproverText(e.target.value)}
                                                            placeholder="Директор гимназии"
                                                        />
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="border-b-2 border-slate-400 w-48 mb-1"></div>
                                                        <input
                                                            type="text"
                                                            className="text-slate-500 text-xs uppercase tracking-wider bg-transparent border-0 outline-none w-full text-right"
                                                            value="подпись"
                                                            readOnly
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-4 text-center text-xs text-slate-400">
                                                    <input
                                                        type="text"
                                                        className="text-center bg-transparent border-0 outline-none w-full"
                                                        value={previewFooterText}
                                                        onChange={e => setPreviewFooterText(e.target.value)}
                                                        placeholder="Создано с помощью..."
                                                    />
                                                    {' • ' + new Date().toLocaleDateString('ru-RU')}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bell Editor */}
                        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 w-full max-w-6xl mx-auto overflow-hidden">
                            <div ref={bellsPrintRef} className="p-8 text-slate-900">
                                <div className="text-center mb-8">
                                    <h1 className="text-3xl font-black uppercase text-slate-800 mb-2">{previewTitle}</h1>
                                    {previewSubtitle && <p className="text-lg text-slate-600 font-medium">{previewSubtitle}</p>}
                                    <div className="mt-4 flex justify-center">
                                        <div className="h-1 w-32 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"></div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {[Shift.First, Shift.Second].map(shift => (
                                        <div key={shift} className="rounded-xl overflow-hidden border border-slate-200 shadow">
                                            <div className={`p-5 font-bold text-lg text-white text-center bg-gradient-to-r ${shift === Shift.First ? 'from-indigo-600 to-indigo-700' : 'from-purple-600 to-purple-700'}`}>
                                                {shift}
                                            </div>
                                            <div className="p-5 space-y-3 bg-white">
                                                {SHIFT_PERIODS[shift].map(period => {
                                                    const bell = currentPresetBells.find(b => b.shift === shift && b.period === period && b.day === 'default')
                                                        || { start: '00:00', end: '00:00', cancelled: false } as Bell;
                                                    return (
                                                        <div key={period} className={`flex items-center gap-3 p-3 rounded-lg border ${bell.cancelled ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center font-black text-slate-600 shadow-sm border border-white text-lg flex-shrink-0">
                                                                {period}
                                                            </div>

                                                            {bell.cancelled ? (
                                                                <div className="flex-1 flex justify-center items-center py-2">
                                                                    <span className="text-red-600 font-black uppercase tracking-wider text-sm px-4 py-2 bg-red-100 rounded-full border border-red-200 text-center">УРОК СНЯТ</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                                                                    <div className="flex flex-col items-center gap-1 w-full">
                                                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Начало</div>
                                                                        <input
                                                                            type="time"
                                                                            className="w-full max-w-[130px] border-2 border-slate-300 rounded-lg px-3 py-2 bg-white font-black text-slate-800 text-center text-lg focus:ring-2 ring-indigo-300 outline-none shadow-sm"
                                                                            value={bell.start}
                                                                            onChange={e => handleBellChange(shift, period, 'start', e.target.value)}
                                                                            data-html2canvas-ignore="true"
                                                                        />
                                                                    </div>
                                                                    <div className="flex items-center justify-center">
                                                                        <div className="w-8 h-0.5 bg-slate-400"></div>
                                                                    </div>
                                                                    <div className="flex flex-col items-center gap-1 w-full">
                                                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Конец</div>
                                                                        <input
                                                                            type="time"
                                                                            className="w-full max-w-[130px] border-2 border-slate-300 rounded-lg px-3 py-2 bg-white font-black text-slate-800 text-center text-lg focus:ring-2 ring-indigo-300 outline-none shadow-sm"
                                                                            value={bell.end}
                                                                            onChange={e => handleBellChange(shift, period, 'end', e.target.value)}
                                                                            data-html2canvas-ignore="true"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <button
                                                                onClick={() => toggleBellCancellation(shift, period)}
                                                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm flex-shrink-0 ${bell.cancelled ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200'}`}
                                                                title={bell.cancelled ? "Вернуть урок" : "Снять урок"}
                                                                data-html2canvas-ignore="true"
                                                            >
                                                                <Icon name={bell.cancelled ? "RotateCcw" : "X"} size={18} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-10 pt-5 border-t border-slate-200 flex justify-between items-end text-sm font-bold text-slate-600">
                                    <div className="text-left">
                                        <div className="text-slate-500 uppercase tracking-wider text-xs mb-1">УТВЕРЖДАЮ</div>
                                        <div className="text-slate-800">Директор гимназии</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="border-b border-slate-400 w-48 mb-1"></div>
                                        <div className="text-slate-500 text-xs uppercase tracking-wider">подпись</div>
                                    </div>
                                </div>
                                <div className="mt-3 text-center text-xs text-slate-400">
                                    Создано с помощью системы управления гимназией • {new Date().toLocaleDateString('ru-RU')}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

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
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" checked={teacherForm.shifts?.includes(Shift.First)} onChange={() => toggleShift(Shift.First)} /> <span className="text-sm font-medium dark:text-slate-300">1 смена</span></label>
                                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-purple-600 focus:ring-purple-500" checked={teacherForm.shifts?.includes(Shift.Second)} onChange={() => toggleShift(Shift.Second)} /> <span className="text-sm font-medium dark:text-slate-300">2 смена</span></label>
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

        </div>
    );
};
