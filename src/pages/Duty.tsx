
import React, { useState, useMemo, useRef } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext';
import { Icon } from '../components/Icons';
import { Modal, SearchableSelect } from '../components/UI';
import { DAYS, DayOfWeek, DutyZone, Teacher, Shift } from '../types';
import html2canvas from 'html2canvas';

export const DutyPage = () => {
    const { teachers, dutyZones, rooms, saveStaticData } = useStaticData();
    const { dutySchedule, schedule1, schedule2, saveScheduleData } = useScheduleData();
    
    // Choose semester for logic (defaults to current)
    const [semester, setSemester] = useState<1 | 2>(() => {
        const month = new Date().getMonth();
        return (month >= 0 && month <= 4) ? 2 : 1;
    });

    // Add Shift State
    const [selectedShift, setSelectedShift] = useState<Shift>(Shift.First);

    const activeSchedule = semester === 1 ? schedule1 : schedule2;
    const printRef = useRef<HTMLDivElement>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
    const [selectedCell, setSelectedCell] = useState<{ zoneId: string, day: string } | null>(null);
    const [editingZone, setEditingZone] = useState<Partial<DutyZone>>({});
    
    // Fix: Local state for room string input to allow typing commas freely
    const [zoneStringInput, setZoneStringInput] = useState("");

    // Filter teacher for modal
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

    // --- LOGIC ---

    const handleCellClick = (zoneId: string, day: string) => {
        setSelectedCell({ zoneId, day });
        // Pre-select current teacher if any (Filtering by shift now!)
        const current = dutySchedule.find(d => d.zoneId === zoneId && d.day === day && d.shift === selectedShift);
        setSelectedTeacherId(current?.teacherId || null);
        setIsModalOpen(true);
    };

    const handleTeacherSelect = async () => {
        if (!selectedCell) return;
        
        let newSchedule = [...dutySchedule];
        // Remove existing for this cell AND Shift
        newSchedule = newSchedule.filter(d => !(d.zoneId === selectedCell.zoneId && d.day === selectedCell.day && d.shift === selectedShift));
        
        if (selectedTeacherId) {
            newSchedule.push({
                id: Math.random().toString(36).substr(2, 9),
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
        // Remove existing for this cell AND Shift
        newSchedule = newSchedule.filter(d => !(d.zoneId === selectedCell.zoneId && d.day === selectedCell.day && d.shift === selectedShift));
        
        await saveScheduleData({ dutySchedule: newSchedule });
        setIsModalOpen(false);
        setSelectedTeacherId(null);
    };

    // Helper to check if room number is in range/list
    const isRoomInZone = (roomName: string, zone: DutyZone) => {
        if (!roomName || !zone.includedRooms) return false;
        // Normalize room name (remove non-digits if mostly numeric)
        const num = parseInt(roomName.replace(/\D/g, ''));
        if (!isNaN(num)) {
            // Check if includedRooms contains this number
            return zone.includedRooms.includes(String(num));
        }
        return zone.includedRooms.includes(roomName);
    };

    const autoGenerate = async () => {
        if (!window.confirm("Это перезапишет текущий график дежурств. Продолжить?")) return;

        // Clear existing duties (or maybe keep manual ones? For simplicity, we regenerate all or just overwrite collisions)
        // Let's clear to avoid stale data mess
        let newSchedule: any[] = [];
        
        const shifts = [Shift.First, Shift.Second];
        
        // Track usage to minimize repetition per day (across all shifts or per shift? Usually per day is hard enough)
        // Let's track per day to avoid a teacher having duty in shift 1 AND shift 2 if they work both
        const usedTeachersPerDay: Record<string, Set<string>> = {};
        DAYS.forEach(d => usedTeachersPerDay[d] = new Set());

        for (const day of DAYS) {
            for (const shift of shifts) {
                // 1. Find candidates: Teachers active in THIS shift on THIS day
                const candidates = teachers.filter(t => {
                    const lessonsCount = activeSchedule.filter(s => s.teacherId === t.id && s.day === day && s.shift === shift).length;
                    return lessonsCount >= 1; // At least 1 lesson to be in school
                });

                for (const zone of dutyZones) {
                    // Score candidates for this zone
                    const scoredCandidates = candidates.map(t => {
                        let score = 0;
                        
                        // Already used today? Big penalty
                        if (usedTeachersPerDay[day].has(t.id)) score -= 2000;

                        // Check lessons in this specific zone for this shift
                        const lessonsInZone = activeSchedule.filter(s => 
                            s.teacherId === t.id && 
                            s.day === day && 
                            s.shift === shift &&
                            s.roomId && 
                            isRoomInZone(rooms.find(r => r.id === s.roomId)?.name || s.roomId, zone)
                        ).length;
                        
                        // Rule: Teacher MUST have lessons in this zone to be assigned
                        if (lessonsInZone === 0) {
                            return { teacher: t, score: -9999 }; // Disqualified
                        }
                        
                        score += lessonsInZone * 10;
                        
                        // Bonus for having enough lessons total (e.g. not just coming for 1 lesson)
                        const totalLessons = activeSchedule.filter(s => s.teacherId === t.id && s.day === day && s.shift === shift).length;
                        if (totalLessons >= 4) score += 5;

                        return { teacher: t, score };
                    });

                    // Sort by score desc
                    scoredCandidates.sort((a, b) => b.score - a.score);

                    const best = scoredCandidates[0];
                    if (best && best.score > -500) { // If valid candidate found
                        newSchedule.push({
                            id: Math.random().toString(36).substr(2, 9),
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
        const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff' });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Duty_Schedule_${semester}_sem_${selectedShift}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Zone Management ---
    const handleZoneSave = async () => {
        if (!editingZone.name) return;
        
        // Parse the comma-separated string back to array
        const roomsArray = zoneStringInput.split(',').map(s => s.trim()).filter(Boolean);
        const zoneToSave = { ...editingZone, includedRooms: roomsArray };

        let newZones = [...dutyZones];
        if (editingZone.id) {
            newZones = newZones.map(z => z.id === editingZone.id ? { ...z, ...zoneToSave } as DutyZone : z);
        } else {
            newZones.push({ ...zoneToSave, id: Math.random().toString(36).substr(2, 9) } as DutyZone);
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

    // --- Render Helpers ---
    const getTeacherForCell = (zoneId: string, day: string) => {
        // Filter by shift
        const record = dutySchedule.find(d => d.zoneId === zoneId && d.day === day && d.shift === selectedShift);
        if (!record) return null;
        return teachers.find(t => t.id === record.teacherId);
    };

    // Calculate recommended teachers for the modal
    const getRecommendations = () => {
        if (!selectedCell) return { recommended: [], others: [] };
        
        const day = selectedCell.day;
        const zone = dutyZones.find(z => z.id === selectedCell.zoneId);
        
        const candidates = teachers.map(t => {
            const lessonsCount = activeSchedule.filter(s => s.teacherId === t.id && s.day === day && s.shift === selectedShift).length;
            // Check busy in THIS shift
            const isBusy = dutySchedule.some(d => d.day === day && d.teacherId === t.id && d.zoneId !== selectedCell.zoneId && d.shift === selectedShift);
            
            // Check if teacher fits zone (simple check based on lessons location)
             const lessonsInZone = zone && zone.includedRooms ? activeSchedule.filter(s => 
                s.teacherId === t.id && 
                s.day === day && 
                s.shift === selectedShift &&
                s.roomId && 
                zone.includedRooms.includes(String(parseInt(rooms.find(r => r.id === s.roomId)?.name.replace(/\D/g, '') || '0')))
            ).length : 0;

            return { t, lessonsCount, isBusy, lessonsInZone };
        });

        // Recommended: Has lessons in zone AND is not busy
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


    return (
        <div className="max-w-7xl mx-auto w-full pb-20">
            <div className="bg-white dark:bg-dark-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6">
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
                            <Icon name="Zap" size={16}/> Автозаполнение
                        </button>
                        <button onClick={clearSchedule} className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/50 transition text-sm">
                            <Icon name="Trash2" size={16}/>
                        </button>
                        <button onClick={exportToPng} className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 rounded-xl font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition text-sm flex items-center gap-2">
                            <Icon name="Image" size={16}/> PNG
                        </button>
                    </div>
                </div>

                <div className="mb-4 flex gap-2 overflow-x-auto">
                    {dutyZones.map(z => (
                        <div key={z.id} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 shrink-0">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{z.name}</span>
                            <button onClick={() => openZoneModal(z)} className="text-slate-400 hover:text-indigo-600"><Icon name="Edit2" size={12}/></button>
                        </div>
                    ))}
                    <button onClick={() => openZoneModal()} className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-500 text-slate-400 hover:text-indigo-600 hover:border-indigo-600 text-sm font-bold flex items-center gap-1 transition-colors">
                        <Icon name="Plus" size={14}/> Зона
                    </button>
                </div>
            </div>

            <div className="overflow-auto custom-scrollbar bg-slate-100 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div ref={printRef} className="bg-white p-8 min-w-[800px] shadow-xl text-slate-900">
                    <div className="text-center mb-6">
                        <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800">График дежурства учителей</h2>
                        <h3 className="text-lg font-bold text-slate-500 uppercase">{selectedShift}</h3>
                    </div>
                    
                    <table className="w-full border-collapse border-2 border-slate-800">
                        <thead>
                            <tr>
                                <th className="border-2 border-slate-800 p-3 bg-slate-100 w-48 text-left">Зона / Пост</th>
                                {DAYS.map(day => (
                                    <th key={day} className="border-2 border-slate-800 p-3 bg-slate-100 w-32">{day}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {dutyZones.map(zone => (
                                <tr key={zone.id}>
                                    <td className="border-2 border-slate-800 p-3 font-bold bg-slate-50">
                                        {zone.name}
                                        <div className="text-[10px] font-normal text-slate-500 mt-1">
                                            Каб: {zone.includedRooms?.join(', ')}
                                        </div>
                                    </td>
                                    {DAYS.map(day => {
                                        const teacher = getTeacherForCell(zone.id, day);
                                        // Auto-color based on "floor" logic (just simple heuristic here)
                                        const is2ndFloor = zone.name.includes('2 этаж');
                                        const is3rdFloor = zone.name.includes('3 этаж');
                                        const cellBg = teacher 
                                            ? (is2ndFloor ? 'bg-emerald-50' : is3rdFloor ? 'bg-blue-50' : 'bg-white') 
                                            : 'bg-white';

                                        return (
                                            <td 
                                                key={`${zone.id}-${day}`} 
                                                onClick={() => handleCellClick(zone.id, day)}
                                                className={`border-2 border-slate-800 p-2 text-center cursor-pointer hover:bg-slate-100 transition-colors ${cellBg}`}
                                            >
                                                {teacher ? (
                                                    <div className="font-bold text-sm text-slate-800">{teacher.name}</div>
                                                ) : (
                                                    <div className="text-slate-300 text-xl font-bold">+</div>
                                                )}
                                                {/* Warning marker if teacher has NO lessons in this zone this shift */}
                                                {teacher && activeSchedule.filter(s=>s.teacherId===teacher.id && s.day===day && s.shift === selectedShift && s.roomId && isRoomInZone(rooms.find(r => r.id === s.roomId)?.name || s.roomId, zone)).length === 0 && (
                                                     <div className="text-[9px] text-red-600 font-bold" title="Нет уроков в этой зоне">⚠️ Нет ур.</div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    <div className="mt-8 pt-4 flex justify-between items-end text-sm font-bold text-slate-600">
                        <div>УТВЕРЖДАЮ<br/>Директор гимназии</div>
                        <div>____________</div>
                    </div>
                </div>
            </div>

            {/* Modal for Selecting Teacher */}
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

            {/* Modal for Zone Editing */}
            <Modal isOpen={isZoneModalOpen} onClose={() => setIsZoneModalOpen(false)} title={editingZone.id ? 'Редактировать зону' : 'Добавить зону'}>
                <div className="space-y-4">
                    <input 
                        className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none focus:border-indigo-500" 
                        placeholder="Название (напр. 2 этаж левое крыло)" 
                        value={editingZone.name || ''} 
                        onChange={e => setEditingZone({...editingZone, name: e.target.value})} 
                    />
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Кабинеты (через запятую)</label>
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
