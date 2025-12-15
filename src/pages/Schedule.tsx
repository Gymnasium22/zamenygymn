
import { useState, useMemo, useEffect } from 'react';
import { useStaticData, useScheduleData } from '../context/DataContext'; 
import { Icon } from '../components/Icons';
import { Modal, SearchableSelect, ContextMenu } from '../components/UI';
import { Shift, DayOfWeek, DAYS, SHIFT_PERIODS, ScheduleItem } from '../types';
import useMedia from 'use-media';

interface SchedulePageProps {
    readOnly?: boolean;
    semester?: 1 | 2;
}

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    item: ScheduleItem | null;
    cell: { rowId: string; colKey: string | number } | null;
}

interface CellInfo {
    rowId: string;
    colKey: string | number;
}

export const SchedulePage = ({ readOnly = false, semester = 1 }: SchedulePageProps) => {
    const { subjects, teachers, classes, rooms } = useStaticData();
    const { schedule1, schedule2, saveSemesterSchedule, canUndo, canRedo, undo, redo } = useScheduleData();
    
    // Выбираем нужный массив данных в зависимости от пропса semester
    const schedule = semester === 2 ? schedule2 : schedule1;

    // Вспомогательная функция для сохранения, которая знает о текущем семестре
    const saveCurrentSchedule = async (newScheduleData: ScheduleItem[]) => {
        await saveSemesterSchedule(semester, newScheduleData);
    };
    
    const [selectedShift, setSelectedShift] = useState(Shift.First);
    const [selectedDay, setSelectedDay] = useState<DayOfWeek>(DayOfWeek.Monday);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [tempItem, setTempItem] = useState<Partial<ScheduleItem>>({});
    const [viewMode, setViewMode] = useState<'class'|'teacher'|'subject'|'week'>('class');
    const [filterId, setFilterId] = useState('');
    const [filterRoom, setFilterRoom] = useState('');
    const [filterDirection, setFilterDirection] = useState('');
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, item: null, cell: null });
    const [clipboard, setClipboard] = useState<ScheduleItem | null>(null);
    
    const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
    
    const [draggedItem, setDraggedItem] = useState<ScheduleItem | null>(null);
    const [dragOverCell, setDragOverCell] = useState<string|null>(null);

    const isMobile = useMedia({ maxWidth: 767 });
    const [mobileListView, setMobileListView] = useState(true); 

    const [isMassOperationsModalOpen, setIsMassOperationsModalOpen] = useState(false);
    const [massOpConfirm, setMassOpConfirm] = useState({ isOpen: false, type: '', day: '', classId: '' });
    
    // State for Mass Ops Modal Selections
    const [massOpSelectedDay, setMassOpSelectedDay] = useState<string>(DayOfWeek.Monday);
    const [massOpSelectedClass, setMassOpSelectedClass] = useState<string>('');

    const currentPeriods = SHIFT_PERIODS[selectedShift];
    
    const getRows = () => {
        if (viewMode === 'week') return SHIFT_PERIODS[selectedShift].map(p => ({ id: p.toString(), name: `${p} урок` }));
        if (viewMode === 'class') return filterId ? classes.filter(c => c.id === filterId && c.shift === selectedShift) : classes.filter(c => c.shift === selectedShift);
        if (viewMode === 'teacher') return filterId ? teachers.filter(t => t.id === filterId) : teachers;
        if (viewMode === 'subject') return filterId ? subjects.filter(s => s.id === filterId) : subjects;
        return [];
    };

    const getScheduleItems = (rowId: string, colKey: string | number): ScheduleItem[] => {
        let items: ScheduleItem[] = [];
        if (viewMode === 'week') {
             const period = parseInt(rowId);
             const day = colKey as string;
             items = schedule.filter(s => s.shift === selectedShift && s.period === period && s.day === day);
             if (filterId) items = items.filter(s => s.classId === filterId);
        } else {
            const period = colKey as number;
            if (viewMode === 'class') items = schedule.filter(s => s.classId === rowId && s.period === period && s.day === selectedDay && s.shift === selectedShift);
            if (viewMode === 'teacher') items = schedule.filter(s => s.teacherId === rowId && s.period === period && s.day === selectedDay && s.shift === selectedShift);
            if (viewMode === 'subject') items = schedule.filter(s => s.subjectId === rowId && s.period === period && s.day === selectedDay && s.shift === selectedShift);
        }

        if (filterRoom) {
            items = items.filter(s => {
                if (!s.roomId) return false;
                const room = rooms.find(r => r.id === s.roomId);
                const roomName = room ? room.name : s.roomId;
                return (roomName || '').toLowerCase().includes(filterRoom.toLowerCase());
            });
        }
        if (filterDirection) items = items.filter(s => s.direction?.toLowerCase().includes(filterDirection.toLowerCase()));
        
        return items;
    };

    const checkConflicts = (item: ScheduleItem): string[] => {
        const conflicts: string[] = [];
        const others = schedule.filter(s => s.id !== item.id && s.day === item.day && s.period === item.period && s.shift === item.shift);
        
        const teacherBusy = others.find(s => s.teacherId === item.teacherId);
        if (teacherBusy) conflicts.push('teacher');

        const classBusy = others.find(s => {
            if (s.classId !== item.classId) return false;
            if (s.direction && item.direction && s.direction !== item.direction) return false;
            return true; 
        });
        if (classBusy) conflicts.push('class');

        if (item.roomId) {
            const roomBusy = others.find(s => s.roomId === item.roomId);
            if (roomBusy) conflicts.push('room');
        }

        return conflicts;
    };

    const validateRoom = (classId: string, subjectId: string, roomId: string) => {
        const warnings: string[] = [];
        const cls = classes.find(c => c.id === classId);
        const subj = subjects.find(s => s.id === subjectId);
        const room = rooms.find(r => r.id === roomId);

        if (!room) return warnings;

        if (cls && room.capacity < cls.studentsCount) {
            warnings.push(`⚠️ Мало мест! В классе ${cls.studentsCount} уч., а в кабинете только ${room.capacity}.`);
        }

        if (subj && subj.requiredRoomType && subj.requiredRoomType !== 'Обычный' && room.type !== subj.requiredRoomType) {
            warnings.push(`🚫 Не тот тип! Предмет требует "${subj.requiredRoomType}", а кабинет "${room.type}".`);
        }

        return warnings;
    };

    const updateValidation = (item: Partial<ScheduleItem>) => {
        if (!item.classId || !item.subjectId || !item.roomId) {
            setValidationWarnings([]);
            return;
        }
        const warns = validateRoom(item.classId, item.subjectId, item.roomId);
        setValidationWarnings(warns);
    }

    const handleEditItem = (item: ScheduleItem) => { 
        if(readOnly) return; 
        setTempItem(item); 
        updateValidation(item);
        setIsEditorOpen(true); 
    };
    const handleAddItem = (rowId: string, period: number, day: DayOfWeek = selectedDay) => {
        if(readOnly) return;
        const base: Partial<ScheduleItem> = { period, day, shift: selectedShift, id: Math.random().toString(36).substr(2, 9) };
        if (viewMode === 'class') base.classId = rowId;
        if (viewMode === 'teacher') base.teacherId = rowId;
        if (viewMode === 'subject') base.subjectId = rowId;
        if (viewMode === 'week') { 
            base.period = parseInt(rowId); 
            base.day = day;
            if(filterId && classes.find(c => c.id === filterId)) base.classId = filterId; 
        }
        setTempItem(base); 
        setValidationWarnings([]);
        setIsEditorOpen(true); 
    };
    const handleSaveItem = async () => {
        if (!tempItem.subjectId || !tempItem.teacherId || !tempItem.classId) return;
        let newSchedule = [...schedule];
        const idx = newSchedule.findIndex(s => s.id === tempItem.id);
        if (idx >= 0) newSchedule[idx] = tempItem as ScheduleItem; else newSchedule.push(tempItem as ScheduleItem);
        await saveCurrentSchedule(newSchedule);
        setIsEditorOpen(false);
    };
    const handleDeleteItem = async (id?: string) => {
        const newSchedule = schedule.filter(s => s.id !== (id || tempItem.id));
        await saveCurrentSchedule(newSchedule);
        setIsEditorOpen(false);
    };

    const handleContextMenu = (e: React.MouseEvent, item: ScheduleItem | null, cellInfo: CellInfo | null) => {
        if(readOnly) return;
        e.preventDefault();
        e.stopPropagation(); 
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, item, cell: cellInfo });
    };

    const handleDragStart = (e: React.DragEvent, item: ScheduleItem) => {
        if(readOnly) return;
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = "move";
        const el = e.currentTarget as HTMLElement;
        setTimeout(() => el.classList.add('dragging'), 0);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        const el = e.currentTarget as HTMLElement;
        el.classList.remove('dragging');
        setDraggedItem(null);
        setDragOverCell(null);
    };

    const handleDragOver = (e: React.DragEvent, cellInfo: CellInfo) => {
        e.preventDefault();
        if(readOnly) return;
        setDragOverCell(`${cellInfo.rowId}-${cellInfo.colKey}`); 
    };

    const handleDrop = async (e: React.DragEvent, cellInfo: CellInfo) => {
        e.preventDefault();
        if (!draggedItem || readOnly) return;

        const newItem = { ...draggedItem };
        
        if (viewMode === 'week') {
            newItem.period = parseInt(cellInfo.rowId);
            newItem.day = cellInfo.colKey as string;
        } else {
            newItem.period = cellInfo.colKey as number;
            newItem.day = selectedDay;
            if (viewMode === 'class') newItem.classId = cellInfo.rowId;
            if (viewMode === 'teacher') newItem.teacherId = cellInfo.rowId; 
            if (viewMode === 'subject') newItem.subjectId = cellInfo.rowId;
        }

        let newSchedule = schedule.map(s => s.id === newItem.id ? newItem : s);
        await saveCurrentSchedule(newSchedule);
        setDraggedItem(null);
        setDragOverCell(null);
    };

    const contextActions = [];
    if (contextMenu.item) {
        contextActions.push(
            { label: 'Копировать', icon: 'Copy', onClick: () => setClipboard(contextMenu.item) },
            { label: 'Удалить', icon: 'Trash2', color: 'text-red-600', onClick: () => handleDeleteItem(contextMenu.item!.id) }
        );
    } else if (contextMenu.cell) {
        // Capture cell in a const to guarantee strict null check safety within closures
        const cell = contextMenu.cell;
        if (clipboard) {
            contextActions.push({ label: 'Вставить', icon: 'Clipboard', onClick: async () => {
                 const newItem = { ...clipboard, id: Math.random().toString(36).substr(2, 9), day: selectedDay, shift: selectedShift, period: cell.colKey } as ScheduleItem; 
                 if(viewMode === 'week') { newItem.day = cell.colKey as string; newItem.period = parseInt(cell.rowId); }
                 if(viewMode === 'class') newItem.classId = cell.rowId;
                 else if (viewMode === 'teacher') newItem.teacherId = cell.rowId;
                 else if (viewMode === 'subject') newItem.subjectId = cell.rowId;
                 
                 let newSchedule = [...schedule, newItem];
                 await saveCurrentSchedule(newSchedule);
                 setClipboard(null);
            }});
        }
        contextActions.push({ 
            label: 'Добавить урок', 
            icon: 'Plus', 
            onClick: () => handleAddItem(
                cell.rowId || '', 
                typeof cell.colKey === 'number' ? cell.colKey : parseInt(cell.rowId || '0'), 
                viewMode === 'week' ? cell.colKey as DayOfWeek : selectedDay
            ) 
        });
    }

    const recommendedTeachers = tempItem.subjectId ? teachers.filter(t => t.subjectIds.includes(tempItem.subjectId)) : [];
    const otherTeachers = tempItem.subjectId ? teachers.filter(t => !t.subjectIds.includes(tempItem.subjectId)) : teachers;

    const printTitle = useMemo(() => {
        const semesterSuffix = semester === 2 ? ' (2-е полугодие)' : '';
        if (filterId) { 
            if (viewMode === 'teacher') return teachers.find(t=>t.id===filterId)?.name + semesterSuffix; 
            if (viewMode === 'class') return classes.find(c=>c.id===filterId)?.name + semesterSuffix; 
            if (viewMode === 'subject') return subjects.find(s=>s.id===filterId)?.name + semesterSuffix;
            if (viewMode === 'week') return classes.find(c=>c.id===filterId)?.name + semesterSuffix;
        }
        return `Расписание на ${selectedDay}` + semesterSuffix;
    }, [filterId, viewMode, teachers, classes, subjects, selectedDay, semester]);
    
    // --- PRINT LOGIC START ---
    const isWeeklyPrint = !!filterId;

    const printCols = useMemo(() => {
        if (isWeeklyPrint) return DAYS; 
        return currentPeriods; 
    }, [isWeeklyPrint, currentPeriods]);

    const printRows = useMemo(() => {
        if (isWeeklyPrint) return SHIFT_PERIODS[selectedShift].map(p => ({ id: p.toString(), name: `${p} урок` })); 
        return getRows(); 
    }, [isWeeklyPrint, selectedShift, getRows]);

    const getPrintItems = (rowId: string, colKey: string | number): ScheduleItem[] => {
        if (isWeeklyPrint) {
            const period = parseInt(rowId);
            const day = colKey as string;
            let items = schedule.filter(s => s.shift === selectedShift && s.period === period && s.day === day);
            
            if (viewMode === 'class' || viewMode === 'week') items = items.filter(s => s.classId === filterId);
            else if (viewMode === 'teacher') items = items.filter(s => s.teacherId === filterId);
            else if (viewMode === 'subject') items = items.filter(s => s.subjectId === filterId);
            
            return items;
        } else {
            return getScheduleItems(rowId, colKey);
        }
    };
    // --- PRINT LOGIC END ---


    const rows = getRows();
    const cols = viewMode === 'week' ? DAYS : currentPeriods;

    const handleMassClear = (type: string, day?: string, classId?: string) => {
        setMassOpConfirm({ isOpen: true, type, day: day || '', classId: classId || '' });
    };

    const confirmMassClear = async () => {
        let newSchedule = [...schedule];
        if (massOpConfirm.type === 'clearAll') {
            newSchedule = [];
        } else if (massOpConfirm.type === 'clearDay' && massOpConfirm.day) {
            newSchedule = newSchedule.filter(item => item.day !== massOpConfirm.day);
        } else if (massOpConfirm.type === 'clearClass' && massOpConfirm.classId) {
            newSchedule = newSchedule.filter(item => item.classId !== massOpConfirm.classId);
        }
        await saveCurrentSchedule(newSchedule);
        setMassOpConfirm({ isOpen: false, type: '', day: '', classId: '' });
        setIsMassOperationsModalOpen(false); 
    };

    const renderScheduleItemsContent = (items: ScheduleItem[], colKey: string | number, rowId: string) => {
        if (readOnly && items.length === 0) return null; 

        return (
            <div className="h-full flex flex-col gap-1">
                {items.map((item) => {
                    const subj = subjects.find(s => s.id === item.subjectId);
                    const teacher = teachers.find(t => t.id === item.teacherId);
                    const cls = classes.find(c => c.id === item.classId);
                    const conflicts = checkConflicts(item);
                    const room = rooms.find(r => r.id === item.roomId);
                    const roomName = room ? room.name : item.roomId;

                    return (
                        <div 
                            key={item.id} 
                            draggable={!readOnly}
                            onDragStart={!readOnly ? (e) => handleDragStart(e, item) : undefined}
                            onDragEnd={!readOnly ? handleDragEnd : undefined}
                            onClick={!readOnly ? () => handleEditItem(item) : undefined} 
                            onContextMenu={!readOnly ? (e) => handleContextMenu(e, item, null) : undefined} 
                            className={`rounded-lg p-2 text-xs shadow-sm ${!readOnly ? 'hover:shadow-md cursor-grab active:cursor-grabbing' : ''} border flex flex-col gap-0.5 flex-1 relative group transition-transform ${conflicts.length > 0 ? 'border-red-300 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200' : 'border-slate-100 dark:border-slate-600'}`} 
                            style={conflicts.length === 0 && subj?.color ? { backgroundColor: `${subj.color}40` } : {}}
                        >
                            <div className="flex justify-between items-center gap-1">
                                <span className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{viewMode === 'subject' || viewMode === 'week' ? cls?.name : subj?.name}</span>
                                {item.direction && <span className="text-[9px] px-1 rounded bg-white/80 dark:bg-black/30 font-bold text-slate-600 dark:text-slate-300">{item.direction}</span>}
                            </div>
                            {viewMode === 'week' && <div className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{subj?.name}</div>}
                            <div className="flex justify-between items-center mt-auto">
                                <div className="text-slate-600 dark:text-slate-400 text-[10px] flex items-center gap-1 leading-tight overflow-hidden" title={teacher?.name}>
                                    <Icon name={viewMode === 'teacher' ? 'GraduationCap' : 'User'} size={10} className="shrink-0" /> 
                                    <span className="truncate">
                                        {viewMode === 'teacher' ? cls?.name : teacher?.name}
                                    </span>
                                </div>
                                {roomName && <div className="text-[9px] font-mono text-slate-400 bg-white/50 dark:bg-black/20 rounded px-1 flex items-center gap-0.5 shrink-0" title={room ? `Вмест: ${room.capacity}, Тип: ${room.type}` : ''}>{roomName}</div>}
                            </div>
                            {conflicts.length > 0 && <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold" title={`Конфликт: ${conflicts.join(', ')}`}>!</div>}
                        </div>
                    )
                })}
                {!readOnly && items.length < 3 && <button onClick={() => handleAddItem(rowId, typeof colKey === 'number' ? colKey : parseInt(rowId), viewMode === 'week' ? colKey as DayOfWeek : selectedDay)} className="w-full rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:border-indigo-300 hover:text-indigo-400 transition-colors mt-auto h-6"><Icon name="Plus" size={16} /></button>}
            </div>
        );
    };

    const renderMobileListView = () => {
        if (!filterId) {
            return (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                    Выберите класс, учителя или предмет для просмотра в списке.
                </div>
            );
        }

        const lessonsForDay = schedule.filter(s => 
            s.day === selectedDay && 
            s.shift === selectedShift && 
            (viewMode === 'class' && s.classId === filterId ||
             viewMode === 'teacher' && s.teacherId === filterId ||
             viewMode === 'subject' && s.subjectId === filterId)
        ).sort((a,b) => a.period - b.period);

        if (lessonsForDay.length === 0) {
            return (
                <div className="p-8 text-center text-slate-400 dark:text-slate-500">
                    Нет уроков на {selectedDay} в {selectedShift}.
                </div>
            );
        }

        return (
            <div className="p-4 space-y-4">
                {lessonsForDay.map(item => {
                    const subj = subjects.find(s => s.id === item.subjectId);
                    const teacher = teachers.find(t => t.id === item.teacherId);
                    const cls = classes.find(c => c.id === item.classId);
                    const room = rooms.find(r => r.id === item.roomId);
                    const roomName = room ? room.name : item.roomId;
                    const conflicts = checkConflicts(item);

                    return (
                        <div 
                            key={item.id} 
                            onClick={!readOnly ? () => handleEditItem(item) : undefined} 
                            className={`rounded-xl p-4 shadow-sm border ${conflicts.length > 0 ? 'border-red-300 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200' : 'border-slate-100 dark:border-slate-600 bg-white dark:bg-dark-800'} transition-colors ${!readOnly ? 'cursor-pointer' : ''}`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{item.period} урок</span>
                                {conflicts.length > 0 && <span className="bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold" title={`Конфликт: ${conflicts.join(', ')}`}>!</span>}
                            </div>
                            <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mb-1">{subj?.name} {item.direction && `(${item.direction})`}</div>
                            <div className="text-sm text-slate-700 dark:text-slate-300">{cls?.name} • {teacher?.name}</div>
                            {roomName && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Кабинет: {roomName}</div>}
                        </div>
                    );
                })}
            </div>
        );
    };


    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 px-4 pt-2">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                    {semester === 1 ? 'Расписание (1-е полугодие)' : 'Расписание (2-е полугодие)'}
                </h2>
            </div>
            
            {contextMenu.visible && <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={()=>setContextMenu({...contextMenu, visible:false})} actions={contextActions} />}
            <div className="bg-white dark:bg-dark-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 mb-6 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between no-print">
                 <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                        <button onClick={() => setSelectedShift(Shift.First)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedShift === Shift.First ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>1 смена</button>
                        <button onClick={() => setSelectedShift(Shift.Second)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedShift === Shift.Second ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>2 смена</button>
                    </div>
                    {viewMode !== 'week' && (
                        <div className="flex overflow-x-auto pb-1 gap-1 max-w-[40vw] hide-scrollbar">
                            {DAYS.map(day => <button key={day} onClick={() => setSelectedDay(day)} className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedDay === day ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{day}</button>)}
                        </div>
                    )}
                     {!readOnly && (
                        <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                            <button onClick={undo} disabled={!canUndo} className="p-2 text-slate-500 disabled:opacity-30 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition"><Icon name="RotateCcw" size={18}/></button>
                            <button onClick={redo} disabled={!canRedo} className="p-2 text-slate-500 disabled:opacity-30 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition"><Icon name="RotateCw" size={18}/></button>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                     <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                         <button onClick={()=>{setViewMode('class'); setFilterId('')}} className={`p-2 rounded-md ${viewMode==='class'?'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white':'text-slate-400'}`} title="По классам"><Icon name="GraduationCap" size={18}/></button>
                         <button onClick={()=>{setViewMode('teacher'); setFilterId('')}} className={`p-2 rounded-md ${viewMode==='teacher'?'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white':'text-slate-400'}`} title="По учителям"><Icon name="Users" size={18}/></button>
                         <button onClick={()=>{setViewMode('subject'); setFilterId('')}} className={`p-2 rounded-md ${viewMode==='subject'?'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white':'text-slate-400'}`} title="По предметам"><Icon name="BookOpen" size={18}/></button>
                         <button onClick={()=>{setViewMode('week'); setFilterId(classes[0]?.id || '')}} className={`p-2 rounded-md ${viewMode==='week'?'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white':'text-slate-400'}`} title="Неделя"><Icon name="Calendar" size={18}/></button>
                     </div>
                     
                     <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-1.5 pl-3 flex-1">
                        <Icon name="Filter" size={16} className="text-slate-400" />
                        <select value={filterId} onChange={(e) => setFilterId(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-200 outline-none w-full xl:w-32">
                            <option value="">Все {viewMode === 'class' ? 'классы' : viewMode === 'teacher' ? 'учителя' : viewMode === 'week' ? 'классы (неделя)' : 'предметы'}</option>
                            {(viewMode === 'class' || viewMode === 'week') && classes.filter(c=>c.shift===selectedShift).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            {viewMode === 'teacher' && teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            {viewMode === 'subject' && subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <input placeholder="Каб..." value={filterRoom} onChange={e=>setFilterRoom(e.target.value)} className="w-20 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-xs font-bold" />
                    <input placeholder="Проф..." value={filterDirection} onChange={e=>setFilterDirection(e.target.value)} className="w-20 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-2 text-xs font-bold" />

                    {!readOnly && (
                        <button onClick={() => setIsMassOperationsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-red-200 dark:shadow-none transition-all">
                            <Icon name="List" size={16}/> Масс. опер.
                        </button>
                    )}

                    {(filterId || viewMode === 'week') && (
                        <button onClick={() => setIsPrintModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all">
                            <Icon name="Printer" size={16}/>
                        </button>
                    )}
                </div>
            </div>
            
            {isMobile && !readOnly && filterId && (
                <div className="flex justify-center mb-4 no-print">
                    <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                        <button onClick={() => setMobileListView(false)} className={`flex-1 py-1 px-3 text-xs font-bold rounded-md ${!mobileListView ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`} title="Табличный вид">
                            <Icon name="Columns" size={16}/>
                        </button>
                        <button onClick={() => setMobileListView(true)} className={`flex-1 py-1 px-3 text-xs font-bold rounded-md ${mobileListView ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`} title="Списочный вид">
                            <Icon name="Rows" size={16}/>
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 bg-white dark:bg-dark-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col transition-colors duration-300 no-print">
                <div className="overflow-auto flex-1 custom-scrollbar">
                    {isMobile && mobileListView && !readOnly && filterId ? renderMobileListView() : (
                        <table className="w-full border-collapse min-w-[1000px]">
                            <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0 z-20">
                                <tr>
                                    <th className="p-4 border-b border-r border-slate-100 dark:border-slate-600 text-left text-xs font-extrabold text-slate-400 uppercase w-40 sticky left-0 bg-slate-50 dark:bg-slate-700 z-30">
                                        {viewMode === 'week' ? 'Урок' : viewMode === 'class' ? 'Класс' : viewMode === 'teacher' ? 'Учитель' : 'Предмет'}
                                    </th>
                                    {cols.map(col => <th key={col} className="p-4 border-b border-slate-100 dark:border-slate-600 text-center text-xs font-extrabold text-slate-400 uppercase min-w-[160px]">{viewMode === 'week' ? col : `${col} урок`}</th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                                {rows.length > 0 ? rows.map(row => (
                                    <tr key={row.id}>
                                        <td className="p-4 border-r border-slate-100 dark:border-slate-600 font-black text-lg text-slate-700 dark:text-slate-200 sticky left-0 bg-white dark:bg-dark-800 z-10 text-left">{row.name}</td>
                        {cols.map(colKey => {
                            const items = getScheduleItems(row.id, colKey);
                            const cellId = `${row.id}-${colKey}`;
                            const cellInfo: CellInfo = { rowId: row.id, colKey };
                            return (
                                <td 
                                    key={colKey} 
                                    className={`p-2 border-r border-slate-50 dark:border-slate-700 h-28 align-top transition-colors ${dragOverCell === cellId ? 'drag-over' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                                    onContextMenu={!readOnly ? (e) => handleContextMenu(e, null, cellInfo) : undefined}
                                    onDragOver={!readOnly ? (e) => handleDragOver(e, cellInfo) : undefined}
                                    onDrop={!readOnly ? (e) => handleDrop(e, cellInfo) : undefined}
                                >
                                    {renderScheduleItemsContent(items, colKey, row.id)}
                                </td>
                            );
                        })}
                                    </tr>
                                )) : <tr><td colSpan={8} className="p-8 text-center text-slate-400 dark:text-slate-500">Нет данных для отображения</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <Modal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} title={tempItem.id ? 'Редактирование урока' : 'Добавить урок'}>
                {/* ... (Modal content unchanged) ... */}
                <div className="space-y-4">
                    {/* Top Info Bar */}
                    <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl flex items-center gap-4 text-sm font-bold text-slate-600 dark:text-slate-300">
                        <span>День: {tempItem.day}</span>
                        <span>Урок: {tempItem.period}</span>
                        <span>Смена: {tempItem.shift === Shift.First ? '1 смена' : '2 смена'}</span>
                    </div>

                    {validationWarnings.length > 0 && (
                        <div className="bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 p-3 rounded-lg text-sm border border-orange-100 dark:border-orange-900">
                            {validationWarnings.map((w) => <div key={w} className="flex items-center gap-2"><Icon name="AlertTriangle" size={14}/>{w}</div>)}
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">КЛАСС</label>
                        <SearchableSelect 
                            options={classes.filter(c => c.shift === selectedShift).map(c => ({ value: c.id, label: c.name }))} 
                            value={tempItem.classId || null} 
                            onChange={(val) => { setTempItem({...tempItem, classId: val as string}); updateValidation({...tempItem, classId: val as string}); }} 
                            placeholder="Выберите класс" 
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">ПРЕДМЕТ</label>
                        <SearchableSelect 
                            options={subjects.map(s => ({ value: s.id, label: s.name }))} 
                            value={tempItem.subjectId || null} 
                            onChange={(val) => { setTempItem({...tempItem, subjectId: val as string}); updateValidation({...tempItem, subjectId: val as string}); }} 
                            placeholder="Выберите предмет" 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">УЧИТЕЛЬ</label>
                        <SearchableSelect 
                            options={[{ label: 'Рекомендуемые', options: recommendedTeachers.map(t => ({ value: t.id, label: t.name })) }, { label: 'Остальные', options: otherTeachers.map(t => ({ value: t.id, label: t.name })) }]} 
                            value={tempItem.teacherId || null} 
                            onChange={(val) => setTempItem({...tempItem, teacherId: val as string})} 
                            placeholder="Выберите учителя" 
                            groupBy 
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">ГРУППА / НАПРАВЛЕНИЕ</label>
                        <input className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm outline-none bg-white dark:bg-slate-700 dark:text-white focus:border-indigo-500" placeholder="Например: 1 гр. или Профиль" value={tempItem.direction || ''} onChange={e => setTempItem({...tempItem, direction: e.target.value})} />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">КАБИНЕТ</label>
                        <select className="w-full border border-slate-200 dark:border-slate-600 p-3 rounded-xl text-sm outline-none bg-white dark:bg-slate-700 dark:text-white focus:border-indigo-500" value={tempItem.roomId || ''} onChange={e => { setTempItem({...tempItem, roomId: e.target.value}); updateValidation({...tempItem, roomId: e.target.value}); }}>
                            <option value="">Без кабинета</option>
                            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.capacity} мест)</option>)}
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        {tempItem.id && <button onClick={() => handleDeleteItem()} className="px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg font-bold text-sm">Удалить</button>}
                        <button onClick={handleSaveItem} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition">Сохранить</button>
                    </div>
                </div>
            </Modal>
            
            {/* ... (Mass Ops Modal and Print Overlay unchanged) ... */}
            <Modal isOpen={isMassOperationsModalOpen} onClose={() => setIsMassOperationsModalOpen(false)} title="Массовые операции с расписанием">
                <div className="space-y-6">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Внимание: Эти операции необратимы без использования функции "Отменить" сразу после действия.
                    </p>

                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white mb-1">Очистить всё расписание</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Удаляет все уроки из расписания (все дни, все смены, все классы).</p>
                        <button onClick={() => handleMassClear('clearAll')} className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition text-sm">
                            Очистить полностью
                        </button>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white mb-1">Очистить расписание на день</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Удаляет все уроки для выбранного дня недели.</p>
                        <div className="flex gap-2">
                            <select 
                                value={massOpSelectedDay} 
                                onChange={(e) => setMassOpSelectedDay(e.target.value)} 
                                className="border border-slate-200 dark:border-slate-600 rounded-xl p-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none w-full"
                            >
                                {DAYS.map(day => <option key={day} value={day}>{day}</option>)}
                            </select>
                        </div>
                        <button onClick={() => handleMassClear('clearDay', massOpSelectedDay)} className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition text-sm w-full sm:w-auto">
                            Очистить {massOpSelectedDay}
                        </button>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-white mb-1">Очистить расписание для класса</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Удаляет все уроки для выбранного класса.</p>
                        <div className="flex gap-2">
                            <select 
                                value={massOpSelectedClass} 
                                onChange={(e) => setMassOpSelectedClass(e.target.value)} 
                                className="border border-slate-200 dark:border-slate-600 rounded-xl p-2 text-sm bg-white dark:bg-slate-700 dark:text-white outline-none w-full"
                            >
                                <option value="" disabled>Выберите класс</option>
                                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <button 
                            onClick={() => { if(massOpSelectedClass) handleMassClear('clearClass', undefined, massOpSelectedClass); }} 
                            disabled={!massOpSelectedClass}
                            className="mt-2 px-4 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Очистить для класса
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={massOpConfirm.isOpen} onClose={() => setMassOpConfirm({ ...massOpConfirm, isOpen: false })} title="Подтверждение">
                <p className="mb-6 text-slate-600 dark:text-slate-300">Вы уверены? Это действие нельзя будет отменить через историю изменений.</p>
                <div className="flex justify-end gap-3">
                    <button onClick={() => setMassOpConfirm({ ...massOpConfirm, isOpen: false })} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg font-bold text-slate-600 dark:text-slate-300">Отмена</button>
                    <button onClick={confirmMassClear} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold">Подтвердить</button>
                </div>
            </Modal>

            {/* Print Overlay */}
            {isPrintModalOpen && (
                <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50 no-print">
                         <h2 className="font-bold text-lg text-slate-800">Печать расписания</h2>
                         <div className="flex gap-2">
                             <button onClick={() => window.print()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700"><Icon name="Printer" size={16}/> Печать</button>
                             <button onClick={() => setIsPrintModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300">Закрыть</button>
                         </div>
                    </div>
                    <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                         <div className="max-w-[1100px] mx-auto">
                             <div className="text-center mb-6">
                                 <h1 className="text-2xl font-black text-slate-800 uppercase">{printTitle}</h1>
                                 <p className="text-slate-500 font-bold">{new Date().toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'})}</p>
                             </div>
                             
                             <table className="w-full border-collapse border border-slate-300 text-xs">
                                 <thead>
                                     <tr>
                                         <th className="border border-slate-300 p-2 bg-slate-100 w-24 font-bold text-slate-700">
                                            {isWeeklyPrint ? 'Урок' : (viewMode === 'week' ? 'Урок' : viewMode === 'class' ? 'Класс' : viewMode === 'teacher' ? 'Учитель' : 'Предмет')}
                                         </th>
                                         {printCols.map(c => <th key={c} className="border border-slate-300 p-2 bg-slate-100 text-center font-bold text-slate-700">{isWeeklyPrint ? c : (viewMode === 'week' ? c : `${c} урок`)}</th>)}
                                     </tr>
                                 </thead>
                                 <tbody>
                                     {printRows.map(row => (
                                         <tr key={row.id}>
                                             <td className="border border-slate-300 p-2 font-bold bg-slate-50 text-slate-800">{row.name}</td>
                                             {printCols.map(colKey => {
                                                 const items = getPrintItems(row.id, colKey);
                                                 return (
                                                     <td key={colKey} className="border border-slate-300 p-1 align-top h-20 bg-white">
                                                         {items.map(item => {
                                                             const subj = subjects.find(s => s.id === item.subjectId);
                                                             const teach = teachers.find(t => t.id === item.teacherId);
                                                             const cls = classes.find(c => c.id === item.classId);
                                                             const room = rooms.find(r => r.id === item.roomId);
                                                             const roomName = room ? room.name : item.roomId;
                                                             
                                                             const isTeacherView = viewMode === 'teacher';
                                                             const isWeeklyTeacher = isWeeklyPrint && isTeacherView;
                                                             const isSubjectOrWeek = viewMode === 'subject' || viewMode === 'week';

                                                             const mainText = (isSubjectOrWeek || isWeeklyTeacher) ? cls?.name : subj?.name;
                                                             const subText = isTeacherView ? cls?.name : teach?.name;

                                                             return (
                                                                 <div key={item.id} className="mb-1">
                                                                     <div className="font-bold text-slate-900 text-[11px] leading-tight">
                                                                        {mainText}
                                                                        {item.direction && ` (${item.direction})`}
                                                                     </div>
                                                                     <div className="text-[9px] text-slate-600 flex justify-between items-center mt-0.5">
                                                                         <span>
                                                                             {subText}
                                                                         </span>
                                                                         {roomName && <span className="border px-1 rounded bg-slate-50 border-slate-200">{roomName}</span>}
                                                                     </div>
                                                                 </div>
                                                             );
                                                         })}
                                                     </td>
                                                 );
                                             })}
                                         </tr>
                                     ))}
                                 </tbody>
                             </table>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
};
