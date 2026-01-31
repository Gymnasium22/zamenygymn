
import React, { useState, useRef, useMemo } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { Modal, SearchableSelect } from '../components/UI';
import { DAYS, Shift, DutyZone } from '../types';
import { generateId } from '../utils/helpers';
import html2canvas from 'html2canvas';

export const DutyPage = () => {
    const { teachers, dutyZones, rooms, saveStaticData } = useStaticData();
    const { dutySchedule, saveScheduleData, schedule1, schedule2 } = useScheduleData();
    
    // --- РУЧНАЯ РЕГУЛИРОВКА ВЫСОТЫ ДЛЯ PNG ЭКСПОРТА ---
    const manualOffsets = {
        approvalBlock: 0,    // Блок "УТВЕРЖДАЮ"
        mainTitle: 0,        // Заголовки (График дежурства...)
        tableHeaders: -40,     // Текст в шапке (Этажи, Зоны)
        footerBlock: 0,      // Весь подвал (Секретарь...)
        signatureLine: -4,   // Только линия подписи
    };

    const [semester, setSemester] = useState<1 | 2>(() => {
        const month = new Date().getMonth();
        return (month >= 0 && month <= 4) ? 2 : 1;
    });

    const [selectedShift, setSelectedShift] = useState<Shift>(Shift.First);

    const activeSchedule = semester === 1 ? schedule1 : schedule2;
    const printRef = useRef<HTMLDivElement>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
    const [selectedCell, setSelectedCell] = useState<{ zoneId: string, day: string } | null>(null);
    const [editingZone, setEditingZone] = useState<Partial<DutyZone>>({});
    const [zoneStringInput, setZoneStringInput] = useState("");
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

    // --- LOGIC ---

    const getTeacher = (zoneId: string, day: string, shift: string) => {
        const record = dutySchedule.find(d => d.zoneId === zoneId && d.day === day && d.shift === shift);
        if (!record) return null;
        return teachers.find(t => t.id === record.teacherId);
    };

    const getConflict = (zoneId: string, day: string, shift: string, teacherId?: string) => {
        if (!teacherId) return false;
        const conflict = dutySchedule.find(d => 
            d.teacherId === teacherId && 
            d.day === day && 
            d.shift === shift && 
            d.zoneId !== zoneId
        );
        return !!conflict;
    };

    const handleCellClick = (zoneId: string, day: string) => {
        setSelectedCell({ zoneId, day });
        const current = getTeacher(zoneId, day, selectedShift);
        setSelectedTeacherId(current?.id || null);
        setIsModalOpen(true);
    };

    const handleTeacherSelect = async () => {
        if (!selectedCell) return;
        
        let newSchedule = [...dutySchedule];
        newSchedule = newSchedule.filter(d => !(d.zoneId === selectedCell.zoneId && d.day === selectedCell.day && d.shift === selectedShift));
        
        if (selectedTeacherId) {
            newSchedule.push({
                id: generateId(),
                zoneId: selectedCell.zoneId,
                day: selectedCell.day,
                shift: selectedShift,
                teacherId: selectedTeacherId
            });
        }
        
        await saveScheduleData({ dutySchedule: newSchedule });
        setIsModalOpen(false);
        setSelectedTeacherId(null);
    };

    const handleRemoveDuty = async () => {
        if (!selectedCell) return;
        let newSchedule = [...dutySchedule];
        newSchedule = newSchedule.filter(d => !(d.zoneId === selectedCell.zoneId && d.day === selectedCell.day && d.shift === selectedShift));
        await saveScheduleData({ dutySchedule: newSchedule });
        setIsModalOpen(false);
        setSelectedTeacherId(null);
    };

    const isRoomInZone = (roomName: string, zone: DutyZone) => {
        if (!roomName || !zone.includedRooms) return false;
        const num = roomName.replace(/\D/g, '');
        if (num && zone.includedRooms.includes(num)) return true;
        return zone.includedRooms.includes(roomName);
    };

    const autoGenerate = async () => {
        if (!window.confirm("Это перезапишет текущий график дежурств. Продолжить?")) return;

        let newSchedule: any[] = [];
        const shifts = [Shift.First, Shift.Second];
        const usedTeachersPerDay: Record<string, Set<string>> = {};
        
        DAYS.forEach(d => usedTeachersPerDay[d] = new Set());

        for (const day of DAYS) {
            for (const shift of shifts) {
                const candidates = teachers.filter(t => {
                    const lessonsCount = activeSchedule.filter(s => s.teacherId === t.id && s.day === day && s.shift === shift).length;
                    return lessonsCount >= 1; 
                });

                for (const zone of dutyZones) {
                    const scoredCandidates = candidates.map(t => {
                        let score = 0;
                        if (usedTeachersPerDay[day].has(t.id)) score -= 2000;

                        const lessonsInZone = activeSchedule.filter(s => 
                            s.teacherId === t.id && 
                            s.day === day && 
                            s.shift === shift && 
                            s.roomId && 
                            isRoomInZone(rooms.find(r => r.id === s.roomId)?.name || s.roomId, zone)
                        ).length;
                        
                        if (lessonsInZone === 0) return { teacher: t, score: -9999 };
                        
                        score += lessonsInZone * 10;
                        const totalLessons = activeSchedule.filter(s => s.teacherId === t.id && s.day === day && s.shift === shift).length;
                        if (totalLessons >= 4) score += 5;

                        return { teacher: t, score };
                    });

                    scoredCandidates.sort((a, b) => b.score - a.score);

                    const best = scoredCandidates[0];
                    if (best && best.score > -500) { 
                        newSchedule.push({
                            id: generateId(),
                            zoneId: zone.id,
                            day: day,
                            shift: shift,
                            teacherId: best.teacher.id
                        });
                        usedTeachersPerDay[day].add(best.teacher.id);
                    }
                }
            }
        }
        await saveScheduleData({ dutySchedule: newSchedule });
    };

    const clearSchedule = async () => {
        if(window.confirm("Очистить график дежурств (для всех смен)?")) {
            await saveScheduleData({ dutySchedule: [] });
        }
    };

    const exportToPng = async () => {
        if (!printRef.current) return;
        const canvas = await html2canvas(printRef.current, { 
            scale: 2, 
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Duty_Schedule_${semester}_sem.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportToExcel = () => {
        const zonesCount = allZonesSorted.length;
        const totalColspan = zonesCount + 1;

        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8">
            <style>
                table { border-collapse: collapse; width: 100%; font-family: 'Times New Roman', serif; }
                td, th { border: 1px solid #000; padding: 6px; vertical-align: middle; text-align: center; font-size: 11pt; }
                .title-row td { border: none !important; font-weight: bold; text-align: center; }
                .title-main { font-size: 14pt; text-transform: uppercase; }
                .title-sub { font-size: 12pt; }
                .approval-cell { text-align: left; border: none !important; font-size: 11pt; line-height: 1.2; }
                .header-cell { background-color: #F3F4F6; font-weight: bold; border: 2px solid #000; }
                .floor-cell { background-color: #E5E7EB; font-weight: bold; text-transform: uppercase; font-size: 10pt; border: 2px solid #000; }
                .shift-header { font-size: 13pt; font-weight: bold; text-decoration: underline; border: none !important; text-align: center; padding: 20px 0 10px 0; }
                .day-label { font-weight: bold; background-color: #FAFAFA; text-align: left; border: 2px solid #000; }
                .footer-cell { border: none !important; font-weight: bold; text-align: left; padding-top: 30px; font-size: 11pt; }
                .empty-spacer { border: none !important; height: 15px; }
            </style>
            </head>
            <body>
        `;

        html += `
            <table>
                <tr>
                    <td colspan="${Math.max(1, totalColspan - 3)}" style="border:none"></td>
                    <td colspan="3" class="approval-cell">
                        <b>УТВЕРЖДАЮ</b><br>
                        Директор государственного<br>
                        учреждения образования<br>
                        «Гимназия № 22 г. Минска»<br><br>
                        ____________________ Н.В.Кисель<br>
                        "____" __________ 2025г.
                    </td>
                </tr>
                <tr class="empty-spacer"><td colspan="${totalColspan}" style="border:none"></td></tr>
                <tr class="title-row"><td colspan="${totalColspan}" class="title-main">ГРАФИК ДЕЖУРСТВА</td></tr>
                <tr class="title-row"><td colspan="${totalColspan}" class="title-sub">учителей по государственному учреждению образования «Гимназия № 22 г. Минска»</td></tr>
                <tr class="title-row"><td colspan="${totalColspan}" class="title-sub">на ${semester}-е полугодие ${new Date().getFullYear()}/${new Date().getFullYear()+1} учебного года</td></tr>
                <tr class="empty-spacer"><td colspan="${totalColspan}" style="border:none"></td></tr>
            </table>
        `;

        [Shift.First, Shift.Second].forEach(shift => {
            html += `<table>`;
            html += `<tr><td colspan="${totalColspan}" class="shift-header">${shift.toUpperCase()}</td></tr>`;
            
            html += `<tr>`;
            html += `<th rowspan="2" class="header-cell" style="width: 120px;">День недели</th>`;
            zonesByFloor.forEach(group => {
                html += `<th colspan="${group.zones.length}" class="floor-cell">${group.floor}</th>`;
            });
            html += `</tr>`;

            html += `<tr>`;
            allZonesSorted.forEach(zone => {
                html += `<th class="header-cell" style="width: 150px;">${zone.name}</th>`;
            });
            html += `</tr>`;

            DAYS.forEach(day => {
                html += `<tr>`;
                html += `<td class="day-label">${day}</td>`;
                allZonesSorted.forEach(zone => {
                    const teacher = getTeacher(zone.id, day, shift);
                    html += `<td>${teacher ? teacher.name : '-'}</td>`;
                });
                html += `</tr>`;
            });
            html += `</table><br>`;
        });

        html += `
            <table>
                <tr class="empty-spacer"><td colspan="${totalColspan}" style="border:none"></td></tr>
                <tr>
                    <td colspan="${Math.floor(totalColspan/2)}" class="footer-cell">Секретарь учебной части гимназии №22 г.Минска</td>
                    <td colspan="${Math.ceil(totalColspan/4)}" style="border-bottom: 1px solid #000; border-top:none; border-left:none; border-right:none;"></td>
                    <td colspan="${Math.ceil(totalColspan/4)}" class="footer-cell" style="text-align: right;">Е.К.Шунто</td>
                </tr>
            </table>
        `;

        html += `</body></html>`;
        
        const blob = new Blob([html], { type: "application/vnd.ms-excel" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `График_дежурств_${semester}_полугодие.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleZoneSave = async () => {
        if (!editingZone.name) return;
        const roomsArray = zoneStringInput.split(',').map(s => s.trim()).filter(Boolean);
        const zoneToSave = { ...editingZone, includedRooms: roomsArray };
        let newZones = [...dutyZones];
        if (editingZone.id) {
            newZones = newZones.map(z => z.id === editingZone.id ? { ...z, ...zoneToSave } as DutyZone : z);
        } else {
            newZones.push({ ...zoneToSave, id: generateId() } as DutyZone);
        }
        await saveStaticData({ dutyZones: newZones });
        setIsZoneModalOpen(false);
    };

    const deleteZone = async (id: string) => {
        if (!window.confirm("Удалить зону?")) return;
        const newZones = dutyZones.filter(z => z.id !== id);
        await saveStaticData({ dutyZones: newZones });
    };
    
    const openZoneModal = (zone?: DutyZone) => {
        if (zone) {
            setEditingZone(zone);
            setZoneStringInput(zone.includedRooms?.join(', ') || '');
        } else {
            setEditingZone({});
            setZoneStringInput('');
        }
        setIsZoneModalOpen(true);
    };

    const getRecommendations = () => {
        if (!selectedCell) return { recommended: [], others: [] };
        
        const day = selectedCell.day;
        const zone = dutyZones.find(z => z.id === selectedCell.zoneId);
        
        const candidates = teachers.map(t => {
            const lessonsCount = activeSchedule.filter(s => s.teacherId === t.id && s.day === day && s.shift === selectedShift).length;
            const isBusy = dutySchedule.some(d => d.day === day && d.teacherId === t.id && d.zoneId !== selectedCell.zoneId && d.shift === selectedShift);
            
             const lessonsInZone = zone && zone.includedRooms ? activeSchedule.filter(s => 
                s.teacherId === t.id && 
                s.day === day && 
                s.shift === selectedShift &&
                s.roomId && 
                isRoomInZone(rooms.find(r => r.id === s.roomId)?.name || s.roomId, zone)
            ).length : 0;

            return { t, lessonsCount, isBusy, lessonsInZone };
        });

        const recommended = candidates
            .filter(c => c.lessonsInZone > 0 && !c.isBusy)
            .sort((a,b) => b.lessonsInZone - a.lessonsInZone)
            .map(c => ({ value: c.t.id, label: `${c.t.name} (${c.lessonsInZone} ур. в зоне)` }));
            
        const others = candidates
            .filter(c => (c.lessonsInZone === 0 || c.isBusy) && c.lessonsCount > 0)
            .map(c => ({ value: c.t.id, label: c.t.name + (c.isBusy ? ' (Занят)' : '') + (c.lessonsInZone === 0 ? ' (Нет уроков в зоне)' : '') }));

        return { recommended, others };
    };

    const { recommended, others } = getRecommendations();

    const zonesByFloor = useMemo(() => {
        const grouped: Record<string, DutyZone[]> = {};
        dutyZones.forEach(z => {
            const floor = z.floor || 'Без этажа';
            if (!grouped[floor]) grouped[floor] = [];
            grouped[floor].push(z);
        });
        const sortedFloors = Object.keys(grouped).sort();
        return sortedFloors.map(floor => ({
            floor,
            zones: grouped[floor].sort((a,b) => (a.order || 0) - (b.order || 0))
        }));
    }, [dutyZones]);

    const allZonesSorted = useMemo(() => {
        return zonesByFloor.flatMap(g => g.zones);
    }, [zonesByFloor]);

    return (
        <div className="max-w-7xl mx-auto w-full pb-20">
            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6 no-print">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                            <Icon name="Shield" className="text-indigo-600 dark:text-indigo-400" />
                            График дежурств
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            {semester}-е полугодие
                        </p>
                    </div>
                    
                    <div className="flex flex-wrap gap-3">
                         <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                            <button onClick={() => setSelectedShift(Shift.First)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedShift === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>1 смена</button>
                            <button onClick={() => setSelectedShift(Shift.Second)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedShift === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>2 смена</button>
                        </div>

                         <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl p-1.5 pl-3">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Полугодие:</span>
                            <select
                                value={semester}
                                onChange={(e) => setSemester(Number(e.target.value) as 1 | 2)}
                                className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                <option value={1}>1-е</option>
                                <option value={2}>2-е</option>
                            </select>
                        </div>
                        <button onClick={autoGenerate} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none text-sm flex items-center gap-2">
                            <Icon name="Zap" size={16}/> Авто
                        </button>
                        <button onClick={clearSchedule} className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition text-sm">
                            <Icon name="Trash2" size={16}/>
                        </button>
                        <button onClick={exportToPng} className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 rounded-xl font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition text-sm flex items-center gap-2">
                            <Icon name="Image" size={16}/> PNG
                        </button>
                        <button onClick={exportToExcel} className="px-4 py-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900 rounded-xl font-bold hover:bg-green-100 dark:hover:bg-green-900/50 transition text-sm flex items-center gap-2">
                            <Icon name="FileSpreadsheet" size={16}/> Excel
                        </button>
                    </div>
                </div>

                <div className="mb-4 flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                    {dutyZones.map(z => (
                        <div key={z.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 shrink-0">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{z.name} <span className="text-slate-400 text-xs">({z.floor || '?'})</span></span>
                            <button onClick={() => openZoneModal(z)} className="text-slate-400 hover:text-indigo-600"><Icon name="Edit2" size={12}/></button>
                        </div>
                    ))}
                    <button onClick={() => openZoneModal()} className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-500 text-slate-400 hover:text-indigo-600 hover:border-indigo-600 text-sm font-bold flex items-center gap-1 transition-colors">
                        <Icon name="Plus" size={14}/> Зона
                    </button>
                </div>

                <div className="overflow-x-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-xl">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-700/50">
                                <th className="p-3 text-left text-sm font-bold text-slate-500 dark:text-slate-400 w-64 border-b border-r border-slate-200 dark:border-slate-700">Зона / День</th>
                                {DAYS.map(day => (
                                    <th key={day} className="p-3 text-center text-sm font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 min-w-[120px]">{day}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dutyZones.map(zone => (
                                <tr key={zone.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="p-3 border-r border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-200">
                                        <div>{zone.name}</div>
                                        <div className="text-[10px] text-indigo-500 font-medium">{zone.floor}</div>
                                        <div className="text-xs font-normal text-slate-400 mt-1">{zone.includedRooms?.join(', ')}</div>
                                    </td>
                                    {DAYS.map(day => {
                                        const teacher = getTeacher(zone.id, day, selectedShift);
                                        const hasConflict = teacher ? getConflict(zone.id, day, selectedShift, teacher.id) : false;
                                        return (
                                            <td 
                                                key={`${zone.id}-${day}`} 
                                                onClick={() => handleCellClick(zone.id, day)}
                                                className={`p-2 text-center border-l border-slate-100 dark:border-slate-700 cursor-pointer ${teacher ? (hasConflict ? 'bg-red-100 dark:bg-red-900/30' : 'bg-indigo-50/50 dark:bg-indigo-900/10') : ''} hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors relative group`}
                                            >
                                                {teacher ? (
                                                    <div className={`font-bold text-sm ${hasConflict ? 'text-red-600 dark:text-red-400' : 'text-indigo-700 dark:text-indigo-400'}`}>
                                                        {teacher.name}
                                                        {hasConflict && <div className="text-[9px] uppercase">Конфликт</div>}
                                                    </div>
                                                ) : (
                                                    <div className="text-slate-300 dark:text-slate-600 text-lg opacity-0 group-hover:opacity-100">+</div>
                                                )}
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-8 bg-slate-100 dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest text-xs mb-4 flex items-center gap-2">
                    <Icon name="Image" size={16}/> Предпросмотр документа
                </h3>
                <div className="overflow-auto custom-scrollbar">
                    <div ref={printRef} id="print-content-root" className="bg-white p-12 min-w-[1200px] text-black font-serif shadow-lg">
                        
                        <div className="flex justify-end items-start mb-8 text-sm leading-snug" style={{ marginTop: manualOffsets.approvalBlock }}>
                            <div className="w-[350px]" contentEditable suppressContentEditableWarning>
                                <div className="font-bold mb-1">УТВЕРЖДАЮ</div>
                                <div>Директор государственного</div>
                                <div>учреждения образования</div>
                                <div>«Гимназия № 22 г. Минска»</div>
                                <div className="mt-8 flex items-end">
                                    <div className="border-b border-black flex-grow h-4" style={{ marginBottom: manualOffsets.signatureLine }}></div>
                                    <div className="ml-2 whitespace-nowrap">Н.В.Кисель</div>
                                </div>
                            </div>
                        </div>

                        <div className="text-center mb-6" contentEditable suppressContentEditableWarning style={{ marginTop: manualOffsets.mainTitle }}>
                            <h1 className="text-xl font-bold uppercase">ГРАФИК ДЕЖУРСТВА</h1>
                            <h2 className="text-lg">учителей по государственному учреждению образования «Гимназия № 22 г. Минска»</h2>
                            <h3 className="text-lg font-bold mt-1">на {semester}-е полугодие {new Date().getFullYear()}/{new Date().getFullYear()+1} учебного года</h3>
                        </div>

                        {[Shift.First, Shift.Second].map((shift, idx) => (
                            <div key={shift} className="mb-8">
                                <div className="text-center font-bold text-lg mb-2 underline" contentEditable suppressContentEditableWarning>{shift}</div>
                                <table className="w-full border-collapse border border-black text-sm text-center">
                                    <thead>
                                        <tr>
                                            <th rowSpan={2} className="border border-black p-1 bg-gray-100 w-32 font-bold align-middle" contentEditable suppressContentEditableWarning style={{ paddingTop: manualOffsets.tableHeaders }}>День недели</th>
                                            {zonesByFloor.map(group => (
                                                <th key={group.floor} colSpan={group.zones.length} className="border border-black p-1 bg-gray-200 font-bold uppercase text-xs align-middle" contentEditable suppressContentEditableWarning style={{ paddingTop: manualOffsets.tableHeaders }}>
                                                    {group.floor}
                                                </th>
                                            ))}
                                        </tr>
                                        <tr>
                                            {allZonesSorted.map(zone => (
                                                <th key={zone.id} className="border border-black p-1 bg-gray-100 font-bold align-middle" contentEditable suppressContentEditableWarning style={{ paddingTop: manualOffsets.tableHeaders }}>
                                                    {zone.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DAYS.map(day => (
                                            <tr key={day}>
                                                <th className="border border-black p-2 font-bold bg-gray-50 text-left align-middle" contentEditable suppressContentEditableWarning>{day}</th>
                                                {allZonesSorted.map(zone => {
                                                    const teacher = getTeacher(zone.id, day, shift);
                                                    return (
                                                        <td 
                                                            key={zone.id} 
                                                            className="border border-black p-1 h-12 align-middle text-center" 
                                                            contentEditable 
                                                            suppressContentEditableWarning
                                                        >
                                                            {teacher ? teacher.name : '-'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                        
                        <div className="mt-8 flex items-end justify-between text-sm font-bold" contentEditable suppressContentEditableWarning style={{ marginTop: manualOffsets.footerBlock }}>
                            <div>Секретарь учебной части гимназии №22 г.Минска</div>
                            <div className="border-b border-black flex-grow mx-4 mb-1" style={{ marginBottom: manualOffsets.signatureLine }}></div>
                            <div>Е.К.Шунто</div>
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Назначить дежурного" maxWidth="max-w-2xl">
                <div className="space-y-6 min-h-[550px] flex flex-col">
                    {selectedCell && (
                        <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl mb-2 text-base border border-slate-100 dark:border-slate-600 shadow-sm">
                            <span className="font-bold text-slate-800 dark:text-white text-lg">{dutyZones.find(z=>z.id===selectedCell.zoneId)?.name}</span>
                            <div className="flex items-center gap-3 mt-1 text-sm">
                                <span className="font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">{selectedCell.day}</span>
                                <span className="text-slate-400">|</span>
                                <span className="text-slate-500 dark:text-slate-400 font-medium">{selectedShift}</span>
                            </div>
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 tracking-wider">Учитель</label>
                        <SearchableSelect 
                            options={[
                                { label: 'Рекомендуемые (Есть уроки в зоне)', options: recommended },
                                { label: 'Остальные', options: others }
                            ]}
                            value={selectedTeacherId}
                            onChange={(val) => setSelectedTeacherId(String(val))}
                            placeholder="Выберите учителя для назначения"
                            groupBy
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 mt-auto">
                        <button onClick={handleRemoveDuty} className="px-5 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-bold text-sm transition-colors">Снять дежурство</button>
                        <button onClick={handleTeacherSelect} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none">Сохранить</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isZoneModalOpen} onClose={() => setIsZoneModalOpen(false)} title={editingZone.id ? 'Редактировать зону' : 'Добавить зону'}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Название зоны</label>
                        <input 
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                            placeholder="Название (напр. Левое крыло)" 
                            value={editingZone.name || ''} 
                            onChange={e => setEditingZone({...editingZone, name: e.target.value})} 
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Этаж</label>
                        <input 
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                            placeholder="Напр. 2 этаж" 
                            value={editingZone.floor || ''} 
                            onChange={e => setEditingZone({...editingZone, floor: e.target.value})} 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Кабинеты (для автозаполнения)</label>
                        <input 
                            className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                            placeholder="28, 29, 30..." 
                            value={zoneStringInput} 
                            onChange={e => setZoneStringInput(e.target.value)} 
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Введите номера кабинетов через запятую</p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        {editingZone.id && <button onClick={() => { deleteZone(editingZone.id!); setIsZoneModalOpen(false); }} className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-bold text-sm">Удалить</button>}
                        <button onClick={handleZoneSave} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">Сохранить</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
