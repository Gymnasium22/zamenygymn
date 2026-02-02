
import React, { useState, useRef, useEffect } from 'react';
import { useStaticData } from '../context/DataContext'; 
import { Icon } from '../components/Icons';
import { Modal, StaggerContainer } from '../components/UI';
import { Shift, ROOM_TYPES, SHIFT_PERIODS, Teacher, Subject, ClassEntity, Room, BellPreset, Bell } from '../types';
import { DEFAULT_BELLS, SHORT_BELLS } from '../constants';
import { generateId } from '../utils/helpers';
import html2canvas from 'html2canvas';

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
    const bellsPrintRef = useRef<HTMLDivElement>(null);
    
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
        else if (activeTab === 'classes') setClassForm(id ? classes.find(x => x.id === id) ?? {} : { shift: Shift.First, studentsCount: 25 });
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
            newList.push(newItem);
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

    const exportBellsToPng = async () => {
        if (!bellsPrintRef.current) return;
        const canvas = await html2canvas(bellsPrintRef.current, { scale: 2, backgroundColor: '#ffffff' });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Звонки_${settings.bellPresets?.find(p=>p.id===selectedPresetId)?.name}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                            <div key={c.id} draggable onDragStart={(e)=>onDragStart(e,i)} onDragOver={onDragOver} onDrop={(e)=>onDrop(e,i)} className="bg-white dark:bg-dark-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm text-center group hover:shadow-md transition-all relative cursor-grab active:cursor-grabbing">
                                <div className="absolute left-2 top-2 text-slate-300 dark:text-slate-600"><Icon name="GripVertical" size={14} /></div>
                                <div className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">{c.name}</div>
                                <div className="text-xs text-slate-500 mb-1">{c.studentsCount || 0} учеников</div>
                                <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${c.shift === Shift.First ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{c.shift === Shift.First ? 'I' : 'II'} смена</div>
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
                            
                            <div className="flex gap-2">
                                <button onClick={savePreset} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900 rounded-xl font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition text-sm flex items-center gap-2">
                                    <Icon name="Save" size={18}/> Сохранить изменения
                                </button>
                                <button onClick={applyPreset} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 dark:shadow-none text-sm flex items-center gap-2">
                                    <Icon name="CheckCircle" size={18}/> Применить режим
                                </button>
                                <button onClick={exportBellsToPng} className="px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition text-sm flex items-center gap-2">
                                    <Icon name="Image" size={18}/> PNG
                                </button>
                            </div>
                        </div>

                        {/* Bell Editor */}
                        <div ref={bellsPrintRef} className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 text-slate-900">
                             <h3 className="text-2xl font-black text-center mb-6 uppercase text-slate-800">
                                Расписание звонков: {settings.bellPresets?.find(p=>p.id===selectedPresetId)?.name}
                             </h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {[Shift.First, Shift.Second].map(shift => (
                                    <div key={shift} className="rounded-xl overflow-hidden border border-slate-200">
                                        <div className={`p-4 font-bold text-lg text-white text-center ${shift === Shift.First ? 'bg-indigo-600' : 'bg-purple-600'}`}>{shift}</div>
                                        <div className="p-4 space-y-2 bg-white">
                                            {SHIFT_PERIODS[shift].map(period => {
                                                const bell = currentPresetBells.find(b => b.shift === shift && b.period === period && b.day === 'default') 
                                                    || { start: '00:00', end: '00:00', cancelled: false } as Bell;
                                                return (
                                                    <div key={period} className={`flex items-center gap-4 p-2 rounded-lg border ${bell.cancelled ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                                                        <div className="w-10 h-10 rounded bg-white flex items-center justify-center font-black text-slate-500 shadow-sm border border-slate-200">{period}</div>
                                                        
                                                        {bell.cancelled ? (
                                                            <div className="flex-1 flex justify-center items-center">
                                                                <span className="text-red-500 font-bold uppercase tracking-wider text-sm">УРОК СНЯТ</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 flex items-center justify-center gap-2">
                                                                <input 
                                                                    type="time" 
                                                                    className="border border-slate-200 rounded px-2 py-1 bg-white font-bold text-slate-800 text-center flex-1 min-w-[5rem] text-lg focus:ring-2 ring-indigo-200 outline-none" 
                                                                    value={bell.start} 
                                                                    onChange={e => handleBellChange(shift, period, 'start', e.target.value)} 
                                                                />
                                                                <span className="text-slate-400 font-bold">—</span>
                                                                <input 
                                                                    type="time" 
                                                                    className="border border-slate-200 rounded px-2 py-1 bg-white font-bold text-slate-800 text-center flex-1 min-w-[5rem] text-lg focus:ring-2 ring-indigo-200 outline-none" 
                                                                    value={bell.end} 
                                                                    onChange={e => handleBellChange(shift, period, 'end', e.target.value)} 
                                                                />
                                                            </div>
                                                        )}

                                                        <button 
                                                            onClick={() => toggleBellCancellation(shift, period)} 
                                                            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${bell.cancelled ? 'bg-white text-emerald-500 hover:text-emerald-700' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                                                            title={bell.cancelled ? "Вернуть урок" : "Снять урок"}
                                                            data-html2canvas-ignore="true"
                                                        >
                                                            <Icon name={bell.cancelled ? "RotateCcw" : "X"} size={16} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-end text-sm font-bold text-slate-500">
                                <div>УТВЕРЖДАЮ<br/>Директор гимназии</div>
                                <div>____________</div>
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
