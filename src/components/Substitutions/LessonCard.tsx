
import React from 'react';
import { Icon } from '../Icons';
import { ScheduleItem, Substitution, Teacher, Subject, ClassEntity, Room, Shift } from '../../types';

interface LessonCardProps {
    lesson: ScheduleItem;
    isResolved: boolean;
    substitutions: Substitution[];
    selectedDate: string;
    teachers: Teacher[];
    subjects: Subject[];
    classes: ClassEntity[];
    rooms: Room[];
    isCompactMode: boolean;
    draggedTeacherId: string | null;
    dragOverLessonId: string | null;
    onDragOver: (e: React.DragEvent, id: string) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, lesson: ScheduleItem) => void;
    onEdit: (lesson: ScheduleItem, sub: Substitution) => void;
    onAssign: (params: any) => void;
    onRemove: (id: string) => void;
    onTelegramClick: (params: any) => void;
}

export const LessonCard: React.FC<LessonCardProps> = ({
    lesson: l,
    isResolved,
    substitutions,
    selectedDate,
    teachers,
    subjects,
    classes,
    rooms,
    isCompactMode,
    draggedTeacherId,
    dragOverLessonId,
    onDragOver,
    onDragLeave,
    onDrop,
    onEdit,
    onAssign,
    onRemove,
    onTelegramClick
}) => {
    const subs = substitutions.filter(s => s.scheduleItemId === l.id && s.date === selectedDate);
    const hasSubs = subs.length > 0;
    const firstSub = hasSubs ? subs[0] : null;
    
    const rep = firstSub && !['conducted','cancelled'].includes(firstSub.replacementTeacherId) ? teachers.find(t => t.id === firstSub.replacementTeacherId) : null;
    const orig = teachers.find(t => t.id === l.teacherId);
    const subj = subjects.find(s => s.id === l.subjectId); 
    const cls = classes.find(c => c.id === l.classId);
    
    const originalRoomName = rooms.find(r => r.id === l.roomId)?.name || l.roomId || '—';
    const replacementRoomId = firstSub?.replacementRoomId;
    const replacementRoomName = replacementRoomId ? (rooms.find(r => r.id === replacementRoomId)?.name || replacementRoomId) : null;
    const isRoomChanged = replacementRoomId && replacementRoomId !== l.roomId;

    const isCancelled = firstSub?.replacementTeacherId === 'cancelled';
    const isConducted = firstSub?.replacementTeacherId === 'conducted';
    const comment = firstSub?.comment;

    if (isCompactMode) {
        return (
            <div 
                onDragOver={(e) => onDragOver(e, l.id)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, l)}
                className={`relative flex items-center gap-3 p-2 rounded-lg border transition-all 
                    ${dragOverLessonId === l.id ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-500 z-10' : 'bg-white dark:bg-dark-800 border-slate-100 dark:border-slate-700'} 
                    ${draggedTeacherId && !isResolved && dragOverLessonId !== l.id ? 'border-dashed border-indigo-300' : ''} overflow-hidden`}
            >
                {draggedTeacherId && !isResolved && dragOverLessonId !== l.id && (
                    <div className="absolute inset-0 bg-indigo-50/10 pointer-events-none" />
                )}
                
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${isResolved ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{l.period}</div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{cls?.name}</span>
                        <span className="text-xs text-slate-400 truncate">{subj?.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                         <span className={`font-medium ${isResolved ? 'text-slate-400 line-through' : 'text-red-500'}`}>{orig?.name}</span>
                         {isResolved && <Icon name="ArrowRight" size={10} className="text-slate-300"/>}
                         {isResolved && (
                             <span className={`font-bold ${isCancelled ? 'text-red-600' : isConducted ? 'text-blue-600' : 'text-emerald-600'}`}>
                                 {isCancelled ? 'СНЯТ' : isConducted ? 'ПРОВЕДЕН' : rep?.name}
                             </span>
                         )}
                    </div>
                        {comment && (
                            <div className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-2">
                                {comment}
                            </div>
                        )}
                </div>
                
                <div className="flex items-center gap-2">
                     {isRoomChanged ? (
                         <div className="flex items-center gap-1 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                             <span className="line-through text-slate-400">{originalRoomName}</span>
                             <Icon name="ArrowRight" size={8} className="text-indigo-400"/>
                             <span className="font-bold text-indigo-700">{replacementRoomName}</span>
                         </div>
                     ) : (
                         <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-500">{originalRoomName}</div>
                     )}

                     {!isResolved ? (
                        <button onClick={() => onAssign({ scheduleItemId: l.id, subjectId: l.subjectId, period: l.period, shift: l.shift, classId: l.classId, teacherId: l.teacherId, roomId: l.roomId, day: l.day })} className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200">
                            <Icon name="Edit" size={14}/>
                        </button>
                     ) : (
                        <div className="flex gap-1">
                            {firstSub && (
                                <button onClick={() => onEdit(l, firstSub)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100">
                                    <Icon name="Edit" size={14}/>
                                </button>
                            )}
                            <button onClick={() => onRemove(l.id)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                                <Icon name="X" size={14}/>
                            </button>
                        </div>
                     )}
                </div>
            </div>
        );
    }

    return (
        <div 
            onDragOver={(e) => onDragOver(e, l.id)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, l)}
            className={`relative p-5 rounded-2xl border transition-all overflow-hidden
                ${dragOverLessonId === l.id ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-500 z-10 scale-[1.02] shadow-md' : 'bg-white dark:bg-dark-800 border-slate-100 dark:border-slate-700 shadow-sm'} 
                ${draggedTeacherId && !isResolved && dragOverLessonId !== l.id ? 'border-dashed border-indigo-300' : ''}`}
        >
            {draggedTeacherId && !isResolved && dragOverLessonId !== l.id && (
                <div className="absolute inset-0 bg-indigo-50/10 pointer-events-none z-10" />
            )}
            
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl ${isResolved ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{l.period}</div>
                    <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-lg">{cls?.name}</div>
                        <div className="text-sm text-slate-500">{subj?.name}</div>
                    </div>
                </div>
                <div className="text-right">
                     <div className="text-xs font-bold text-slate-400 uppercase">{l.shift === Shift.First ? '1 смена' : '2 смена'}</div>
                     <div className="mt-1">
                        {isRoomChanged ? (
                            <div className="flex items-center justify-end gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-800">
                                <span className="text-xs font-mono font-bold text-slate-400 line-through decoration-red-400">{originalRoomName}</span>
                                <Icon name="ArrowRight" size={10} className="text-indigo-400"/>
                                <span className="text-xs font-mono font-black text-indigo-700 dark:text-indigo-300">{replacementRoomName}</span>
                            </div>
                        ) : (
                            <div className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded inline-block font-bold">{originalRoomName}</div>
                        )}
                     </div>
                </div>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                 <div className={`text-base font-medium ${isResolved ? 'text-slate-400 line-through' : 'text-red-500'}`}>
                    {orig?.name}
                 </div>
                 {!isResolved ? (
                    <button onClick={() => onAssign({ scheduleItemId: l.id, subjectId: l.subjectId, period: l.period, shift: l.shift, classId: l.classId, teacherId: l.teacherId, roomId: l.roomId, day: l.day })} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
                        Заменить
                    </button>
                 ) : (
                    <div className="flex items-center gap-3 justify-end">
                         {isCancelled ? <span className="text-red-600 font-black text-sm uppercase">УРОК СНЯТ</span> :
                          isConducted ? <span className="text-blue-600 font-bold text-sm">ПРОВЕДЕН</span> :
                          <div className="flex flex-col items-end">
                              <span className="text-emerald-600 font-bold text-base">{rep?.name || 'Замена'}</span>
                              {firstSub?.isMerger && <span className="text-[10px] text-purple-500 font-bold">ОБЪЕДИНЕНИЕ</span>}
                          </div>
                         }

                         {comment && (
                            <span className="text-[11px] text-slate-500 italic mt-1 max-w-xs text-right">
                                {comment}
                            </span>
                         )}
                         
                         {rep && rep.telegramChatId && !isCancelled && !isConducted && (
                            <button 
                                onClick={() => {
                                    const roomInfo = isRoomChanged ? `${originalRoomName} -> ${replacementRoomName}` : originalRoomName;
                                    onTelegramClick({
                                        teacherId: rep.id, 
                                        lessonId: l.id, 
                                        roomName: roomInfo, 
                                        className: cls?.name || '?', 
                                        subjectName: subj?.name || '?', 
                                        period: l.period, 
                                        roomChanged: !!isRoomChanged
                                    });
                                }}
                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                title="Отправить учителю в Telegram"
                            >
                                <Icon name="Send" size={16} />
                            </button>
                         )}

                         {firstSub && (
                            <button onClick={() => onEdit(l, firstSub)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors" title="Редактировать замену">
                                <Icon name="Edit" size={18} />
                            </button>
                         )}

                         <button onClick={() => onRemove(l.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Icon name="X" size={18}/></button>
                    </div>
                 )}
            </div>
        </div>
    );
};
