
import React, { useEffect, useState, useRef } from 'react';
import { Icon } from './Icons';
import { useStaticData } from '../context/DataContext'; 
import { DayOfWeek, Shift } from '../types';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }: any) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in no-print">
            <div className={`bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full ${maxWidth} flex flex-col max-h-[90vh] transition-colors duration-300`}>
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Icon name="X" size={24} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
            </div>
        </div>
    );
};

export const ContextMenu = ({ x, y, onClose, actions }: any) => {
    useEffect(() => {
        const handleClick = () => onClose();
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [onClose]);

    if (x === null || y === null) return null;

    const style: any = { top: y, left: x };
    if (window.innerWidth - x < 200) style.left = x - 200;

    return (
        <div className="fixed z-[100] bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-100 dark:border-slate-700 py-2 w-56 context-menu no-print" style={style}>
            {actions.map((action: any, i: number) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); action.onClick(); onClose(); }} className={`w-full text-left px-4 py-2.5 text-sm font-bold flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${action.color || 'text-slate-700 dark:text-slate-200'}`}>
                    {action.icon && <Icon name={action.icon} size={16} />}
                    {action.label}
                </button>
            ))}
        </div>
    );
};

export const StatusWidget = () => {
    const { bellSchedule } = useStaticData();
    const [status, setStatus] = useState("Загрузка...");
    const [details, setDetails] = useState("");
    const [progress, setProgress] = useState(0);
    const [color, setColor] = useState("bg-slate-500");
    const [currentDayName, setCurrentDayName] = useState("");

    useEffect(() => {
        const updateStatus = () => {
            const now = new Date();
            const dayIndex = now.getDay();
            const dayMap = [null, DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday, null];
            const todayName = dayMap[dayIndex];
            setCurrentDayName(todayName || "Выходной");

            if (!todayName) {
                setStatus("Сегодня выходной");
                setDetails("Уроков нет");
                setColor("bg-slate-400");
                setProgress(0);
                return;
            }

            const timeToMin = (t: string) => {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + m;
            };
            const minutesNow = now.getHours() * 60 + now.getMinutes();
            let dailyBells = bellSchedule.filter(b => b.day === todayName);
            if (dailyBells.length === 0) dailyBells = bellSchedule.filter(b => b.day === 'default');
            
            // Sort bells by start time to make finding prev/next reliable
            dailyBells.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

            let activeLesson = null;
            let breakInfo = null;

            for (let i = 0; i < dailyBells.length; i++) {
                const currentBell = dailyBells[i];
                const start = timeToMin(currentBell.start);
                const end = timeToMin(currentBell.end);

                // Check if it's currently lesson time
                if (minutesNow >= start && minutesNow < end) {
                    activeLesson = { ...currentBell, duration: end - start, passed: minutesNow - start };
                    break;
                }

                // Check if it's currently break time (between this lesson and the next)
                if (i < dailyBells.length - 1) {
                    const nextBell = dailyBells[i+1];
                    const nextStart = timeToMin(nextBell.start);
                    // Don't treat long gaps between shifts as a break (e.g. > 60 mins)
                    if (minutesNow >= end && minutesNow < nextStart) {
                        const breakDuration = nextStart - end;
                        if (breakDuration > 0 && breakDuration < 60) {
                             const breakPassed = minutesNow - end;
                             const breakRemaining = nextStart - minutesNow;
                             breakInfo = {
                                 nextLesson: nextBell,
                                 duration: breakDuration,
                                 passed: breakPassed,
                                 remaining: breakRemaining,
                             };
                             break;
                        }
                    }
                }
            }

            if (activeLesson) {
                setStatus(`${activeLesson.period} урок`);
                setDetails(`${activeLesson.shift === Shift.First ? '1 смена' : '2 смена'} • ост. ${activeLesson.duration - activeLesson.passed} мин`);
                setProgress((activeLesson.passed / activeLesson.duration) * 100);
                setColor("bg-indigo-600");
            } else if (breakInfo) {
                setStatus("Перемена");
                setDetails(`через ${breakInfo.remaining} мин ${breakInfo.nextLesson.period} урок`);
                setColor("bg-amber-500");
                setProgress((breakInfo.passed / breakInfo.duration) * 100);
            } else {
                // Before first lesson or after last lesson or in a long gap
                setStatus("Уроков нет");
                setDetails("Свободное время");
                setColor("bg-slate-400");
                setProgress(0);
            }
        };
        updateStatus();
        const interval = setInterval(updateStatus, 60000);
        return () => clearInterval(interval);
    }, [bellSchedule]); 

    return (
        <div className="mx-4 mt-auto mb-4 p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 flex flex-col gap-3 relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1 h-full ${color}`}></div>
            <div className="flex justify-between items-start z-10">
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">{currentDayName}</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white leading-none mb-1">{status}</div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{details}</div>
                </div>
                <div className={`w-8 h-8 rounded-full ${color} bg-opacity-10 dark:bg-opacity-20 flex items-center justify-center text-${color.replace('bg-', '')}`}>
                    <Icon name="Clock" size={16} className={color.replace('bg-', 'text-')} />
                </div>
            </div>
            {progress > 0 && (
                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                    <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${progress}%` }}></div>
                </div>
            )}
        </div>
    );
};

export const SearchableSelect = ({ options, value, onChange, placeholder, groupBy }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false); };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const flatOptions = groupBy ? options.flatMap((g: any) => g.options) : options;
    const selectedLabel = flatOptions.find((o: any) => o.value === value)?.label || placeholder;
    
    // eslint-disable-next-line
    const filteredOptions = groupBy 
        ? options.map((g: any) => ({ ...g, options: g.options.filter((o: any) => o.label.toLowerCase().includes(search.toLowerCase())) })).filter((g: any) => g.options.length > 0)
        : options.filter((o: any) => o.label.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative w-full" ref={ref}>
            <div onClick={() => setIsOpen(!isOpen)} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white cursor-pointer flex justify-between items-center">
                <span className={!value ? "text-slate-400" : ""}>{selectedLabel}</span>
                <Icon name="Filter" size={14} className="text-slate-400" />
            </div>
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-600 rounded-xl shadow-xl max-h-60 overflow-auto">
                    <div className="p-2 sticky top-0 bg-white dark:bg-slate-800">
                        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." className="w-full bg-slate-100 dark:bg-slate-700 rounded-lg p-2 text-sm outline-none dark:text-white" />
                    </div>
                    {groupBy ? filteredOptions.map((g: any, i: number) => (
                        <div key={i}>
                            <div className="px-3 py-1 text-xs font-bold text-slate-400 bg-slate-50 dark:bg-slate-700/50">{g.label}</div>
                            {g.options.map((opt: any) => (
                                <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(""); }} className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:text-slate-200 ${value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : ''}`}>
                                    {opt.label}
                                </div>
                            ))}
                        </div>
                    )) : filteredOptions.map((opt: any) => (
                        <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(""); }} className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:text-slate-200 ${value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : ''}`}>
                            {opt.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const StaggerContainer = ({ children, className = "" }: any) => {
    const childrenArray = React.Children.toArray(children);
    return (
        <div className={className}>
            {childrenArray.map((child, i) => (
                <div key={i} style={{ animation: `fadeIn 0.3s ease-out forwards ${i * 0.05}s`, opacity: 0 }}>
                    {child}
                </div>
            ))}
        </div>
    );
};

export const BarChart = ({ items, max, barClassName = "bg-indigo-500" }: any) => (
    <div className="space-y-3">
        {items.map((item: any, idx: number) => (
            <div key={idx} className="flex items-center gap-3 text-sm">
                <div className="w-32 truncate font-medium text-slate-700 dark:text-slate-300" title={item.label}>{item.label}</div>
                <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barClassName} transition-all duration-500`} style={{ width: `${(item.value / max) * 100}%` }}></div>
                </div>
                <div className="w-12 text-right font-bold text-slate-800 dark:text-slate-200">{item.value}</div>
            </div>
        ))}
    </div>
);
