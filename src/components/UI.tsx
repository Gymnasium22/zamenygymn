
import React, { useEffect, useState, useRef, useMemo, createContext, useContext, ReactNode } from 'react';
import { Icon } from './Icons';
import { useStaticData } from '../context/DataContext';
import { DayOfWeek, Shift } from '../types';
import { generateId } from '../utils/helpers';
import { NavLink, useNavigate } from 'react-router-dom';

interface ToastData {
    id: string;
    type: 'success' | 'warning' | 'danger' | 'info';
    title: string;
    message?: string;
    duration?: number;
}

interface ToastContextType {
    toasts: ToastData[];
    addToast: (toast: Omit<ToastData, 'id'>) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const addToast = (toast: Omit<ToastData, 'id'>) => {
        const id = generateId();
        setToasts(prev => [...prev, { ...toast, id }]);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    };

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

interface ToastContainerProps {
    toasts: Array<{
        id: string;
        type: 'success' | 'warning' | 'danger' | 'info';
        title: string;
        message?: string;
        duration?: number;
    }>;
    onRemoveToast: (id: string) => void;
}

export const ToastContainer = ({ toasts, onRemoveToast }: ToastContainerProps) => {
    const clearAllToasts = () => {
        toasts.forEach(toast => onRemoveToast(toast.id));
    };

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[60] space-y-2">
            {toasts.length > 1 && (
                <div className="flex justify-end mb-2">
                    <button
                        onClick={clearAllToasts}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 underline transition-colors"
                    >
                        Скрыть все ({toasts.length})
                    </button>
                </div>
            )}
            {toasts.map((toast) => (
                <Toast
                    key={toast.id}
                    id={toast.id}
                    type={toast.type}
                    title={toast.title}
                    message={toast.message}
                    duration={toast.duration}
                    onClose={onRemoveToast}
                />
            ))}
        </div>
    );
};

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'rectangular' | 'circular';
    width?: string | number;
    height?: string | number;
    animation?: boolean;
}

export const Skeleton = ({
    className = '',
    variant = 'text',
    width,
    height,
    animation = true
}: SkeletonProps) => {
    const baseClasses = 'skeleton';
    const variantClasses = {
        text: 'h-4 rounded',
        rectangular: 'rounded-lg',
        circular: 'rounded-full'
    };

    const style: React.CSSProperties = {};
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;

    return (
        <div
            className={`${baseClasses} ${variantClasses[variant]} ${className} ${animation ? '' : 'animate-none'}`}
            style={style}
        />
    );
};

interface SkeletonTextProps {
    lines?: number;
    className?: string;
}

export const SkeletonText = ({ lines = 3, className = '' }: SkeletonTextProps) => (
    <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }, (_, i) => (
            <Skeleton
                key={i}
                variant="text"
                width={i === lines - 1 ? '60%' : '100%'} // Last line shorter
            />
        ))}
    </div>
);

interface SkeletonCardProps {
    className?: string;
    showAvatar?: boolean;
    lines?: number;
}

export const SkeletonCard = ({ className = '', showAvatar = false, lines = 2 }: SkeletonCardProps) => (
    <div className={`modern-card p-4 ${className}`}>
        <div className="flex items-center space-x-4">
            {showAvatar && <Skeleton variant="circular" width={40} height={40} />}
            <div className="flex-1">
                <Skeleton variant="text" width="60%" className="mb-2" />
                <SkeletonText lines={lines} />
            </div>
        </div>
    </div>
);

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children?: React.ReactNode;
    maxWidth?: string;
}

interface ToastProps {
    id: string;
    type: 'success' | 'warning' | 'danger' | 'info';
    title: string;
    message?: string;
    duration?: number;
    onClose: (id: string) => void;
}

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) => {
    useEffect(() => {
        if (!isOpen) return;
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in no-print" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className={`bg-white/90 dark:bg-dark-800/90 rounded-3xl shadow-2xl w-full ${maxWidth} flex flex-col max-h-[90vh] transition-colors duration-300`}>
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200/50 dark:border-slate-700/50">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Закрыть">
                        <Icon name="X" size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
            </div>
        </div>
    );
};

export const Toast = ({ id, type, title, message, duration = 5000, onClose }: ToastProps) => {
    const [isVisible, setIsVisible] = useState(true);
    const [isExiting, setIsExiting] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Устанавливаем таймер только один раз при монтировании
        timerRef.current = setTimeout(() => {
            handleClose();
        }, duration);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []); // Пустой массив зависимостей

    const handleClose = () => {
        // Очищаем таймер при ручном закрытии
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        setIsExiting(true);
        setTimeout(() => {
            setIsVisible(false);
            onClose(id);
        }, 300);
    };

    if (!isVisible) return null;

    const getTypeStyles = () => {
        switch (type) {
            case 'success':
                return {
                    bg: 'bg-success-50 dark:bg-success-900/20 border-success-200 dark:border-success-800',
                    icon: 'text-success-600 dark:text-success-400',
                    title: 'text-success-800 dark:text-success-200',
                    message: 'text-success-700 dark:text-success-300'
                };
            case 'warning':
                return {
                    bg: 'bg-warning-50 dark:bg-warning-900/20 border-warning-200 dark:border-warning-800',
                    icon: 'text-warning-600 dark:text-warning-400',
                    title: 'text-warning-800 dark:text-warning-200',
                    message: 'text-warning-700 dark:text-warning-300'
                };
            case 'danger':
                return {
                    bg: 'bg-danger-50 dark:bg-danger-900/20 border-danger-200 dark:border-danger-800',
                    icon: 'text-danger-600 dark:text-danger-400',
                    title: 'text-danger-800 dark:text-danger-200',
                    message: 'text-danger-700 dark:text-danger-300'
                };
            case 'info':
            default:
                return {
                    bg: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800',
                    icon: 'text-primary-600 dark:text-primary-400',
                    title: 'text-primary-800 dark:text-primary-200',
                    message: 'text-primary-700 dark:text-primary-300'
                };
        }
    };

    const styles = getTypeStyles();
    const iconName = type === 'success' ? 'CheckCircle' :
                    type === 'warning' ? 'AlertTriangle' :
                    type === 'danger' ? 'XCircle' : 'Info';

    return (
        <div
            className={`max-w-sm w-full animate-slide-in ${
                isExiting ? 'animate-fade-out' : ''
            }`}
        >
            <div className={`modern-card border p-4 ${styles.bg}`}>
                <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 ${styles.icon}`}>
                        <Icon name={iconName} size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className={`text-sm font-semibold ${styles.title}`}>
                            {title}
                        </h4>
                        {message && (
                            <p className={`text-sm mt-1 ${styles.message}`}>
                                {message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleClose}
                        className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                        aria-label="Закрыть уведомление"
                    >
                        <Icon name="X" size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

interface ToastContainerProps {
    toasts: Array<{
        id: string;
        type: 'success' | 'warning' | 'danger' | 'info';
        title: string;
        message?: string;
        duration?: number;
    }>;
    onRemoveToast: (id: string) => void;
}


interface ContextMenuAction {
    label: string;
    icon?: string;
    onClick: () => void;
    color?: string;
    id?: string;
}

interface ContextMenuProps {
    x: number | null;
    y: number | null;
    onClose: () => void;
    actions: ContextMenuAction[];
}

export const ContextMenu = ({ x, y, onClose, actions }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (x === null || y === null) return;
        
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        
        window.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleEscape);
        
        return () => {
            window.removeEventListener('click', handleClick, true);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [x, y, onClose]);

    if (x === null || y === null) return null;

    const left = (window.innerWidth - x < 200) ? x - 200 : x;
    const style: React.CSSProperties = { top: y, left };

    return (
        <div ref={ref} className="fixed z-[100] bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-xl rounded-2xl border border-slate-100 dark:border-slate-700 py-2 w-56 context-menu no-print" style={style}>
            {actions.map((action) => (
                <button 
                    key={action.id || action.label} 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        action.onClick(); 
                        onClose(); 
                    }} 
                    className={`w-full text-left px-4 py-2.5 text-sm font-bold flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${action.color || 'text-slate-700 dark:text-slate-200'}`}
                >
                    {action.icon && <Icon name={action.icon} size={16} />}
                    {action.label}
                </button>
            ))}
        </div>
    );
};

export const StatusWidget = () => {
    const { bellSchedule, isSaving } = useStaticData();
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
            
            dailyBells.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));

            let activeLesson = null;
            let breakInfo = null;

            for (let i = 0; i < dailyBells.length; i++) {
                const currentBell = dailyBells[i];
                const start = timeToMin(currentBell.start);
                const end = timeToMin(currentBell.end);

                if (minutesNow >= start && minutesNow < end) {
                    activeLesson = { ...currentBell, duration: end - start, passed: minutesNow - start };
                    break;
                }

                if (i < dailyBells.length - 1) {
                    const nextBell = dailyBells[i+1];
                    const nextStart = timeToMin(nextBell.start);
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
                const remaining = Math.max(0, activeLesson.duration - activeLesson.passed);
                setDetails(`${activeLesson.shift === Shift.First ? '1 смена' : '2 смена'} • ост. ${remaining} мин`);
                const progressValue = activeLesson.duration > 0 ? (activeLesson.passed / activeLesson.duration) * 100 : 0;
                setProgress(Math.min(100, Math.max(0, progressValue)));
                setColor("bg-indigo-600");
            } else if (breakInfo) {
                setStatus("Перемена");
                setDetails(`через ${breakInfo.remaining} мин ${breakInfo.nextLesson.period} урок`);
                setColor("bg-amber-500");
                const breakProgress = breakInfo.duration > 0 ? (breakInfo.passed / breakInfo.duration) * 100 : 0;
                setProgress(Math.min(100, Math.max(0, breakProgress)));
            } else {
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
        <div className="mx-4 mt-auto mb-20 md:mb-4 p-4 rounded-2xl flex flex-col gap-3 relative overflow-hidden group">
            <div className={`absolute top-0 left-0 w-1 h-full ${color}`}></div>
            <div className="flex justify-between items-start z-10">
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">{currentDayName}</div>
                    <div className="text-lg font-black text-slate-800 dark:text-white leading-none mb-1">{status}</div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{details}</div>
                </div>
                <div className={`w-8 h-8 rounded-full ${color} bg-opacity-10 dark:bg-opacity-20 flex items-center justify-center relative`}>
                    {isSaving && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Icon name="Loader" size={16} className="animate-spin text-indigo-600" />
                        </div>
                    )}
                    <Icon
                        name={isSaving ? "Loader" : "Clock"}
                        size={16}
                        className={
                            isSaving ? 'text-indigo-600 animate-spin' :
                            color === 'bg-indigo-600' ? 'text-indigo-600' :
                            color === 'bg-amber-500' ? 'text-amber-500' :
                            'text-slate-400'
                        }
                    />
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

interface SelectOption {
    value: string | number;
    label: string;
}

interface SelectGroup {
    label: string;
    options: SelectOption[];
    id?: string;
}

interface SearchableSelectProps {
    options: SelectOption[] | SelectGroup[];
    value: string | number | null;
    onChange: (value: string | number) => void;
    placeholder?: string;
    groupBy?: boolean;
}

export const SearchableSelect = ({ options, value, onChange, placeholder = "Выберите...", groupBy }: SearchableSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { 
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    const flatOptions = groupBy ? (options as SelectGroup[]).flatMap((g) => g.options) : (options as SelectOption[]);
    const selectedLabel = flatOptions.find((o) => o.value === value)?.label || placeholder;
    
    const filteredOptionsGroups = groupBy 
        ? (options as SelectGroup[]).map((g) => ({ 
            ...g, 
            options: g.options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) 
        })).filter((g) => g.options.length > 0)
        : null;
        
    const filteredOptionsSimple = !groupBy
        ? (options as SelectOption[]).filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : null;

    return (
        <div className="relative w-full" ref={ref}>
            <div onClick={() => setIsOpen(!isOpen)} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl p-3 text-sm bg-white dark:bg-slate-700 dark:text-white cursor-pointer flex justify-between items-center">
                <span className={!value ? "text-slate-400" : ""}>{selectedLabel}</span>
                <Icon name="Filter" size={14} className="text-slate-400" />
            </div>
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-600 rounded-xl shadow-xl max-h-96 overflow-auto custom-scrollbar">
                    <div className="p-2 sticky top-0 bg-white dark:bg-slate-800 z-10">
                        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск..." className="w-full bg-slate-100 dark:bg-slate-700 rounded-lg p-2 text-sm outline-none dark:text-white" />
                    </div>
                    {groupBy && filteredOptionsGroups ? filteredOptionsGroups.map((g) => (
                        <div key={g.id || g.label}>
                            <div className="px-3 py-1 text-xs font-bold text-slate-400 bg-slate-50 dark:bg-slate-700/50 sticky top-10 z-0">{g.label}</div>
                            {g.options.map((opt) => (
                                <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(""); }} className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:text-slate-200 ${value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : ''}`}>
                                    {opt.label}
                                </div>
                            ))}
                        </div>
                    )) : filteredOptionsSimple ? filteredOptionsSimple.map((opt) => (
                        <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(""); }} className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 dark:text-slate-200 ${value === opt.value ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : ''}`}>
                            {opt.label}
                        </div>
                    )) : null}
                </div>
            )}
        </div>
    );
};

interface StaggerContainerProps {
    children?: React.ReactNode;
    className?: string;
}

export const StaggerContainer = ({ children, className = "" }: StaggerContainerProps) => {
    const childrenArray = React.Children.toArray(children);
    return (
        <div className={className}>
            {childrenArray.map((child, i) => {
                const key = React.isValidElement(child) && child.key ? child.key : i;
                return (
                    <div key={key} style={{ animation: `fadeIn 0.3s ease-out forwards ${i * 0.05}s`, opacity: 0 }}>
                        {child}
                    </div>
                );
            })}
        </div>
    );
};

interface BarChartItem {
    label: string;
    value: number;
    id?: string | number;
}

interface BarChartProps {
    items: BarChartItem[];
    max: number;
    barClassName?: string;
}

export const BarChart = ({ items, max, barClassName = "bg-indigo-500" }: BarChartProps) => {
    const safeMax = max > 0 ? max : 1; 
    
    return (
        <div className="space-y-3">
            {items.map((item) => {
                const key = item.id ?? item.label;
                const width = Math.min(100, Math.max(0, (item.value / safeMax) * 100));
                
                return (
                    <div key={key} className="flex items-center gap-3 text-sm">
                        <div className="w-32 truncate font-medium text-slate-700 dark:text-slate-300" title={item.label}>{item.label}</div>
                        <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barClassName} transition-all duration-500`} style={{ width: `${width}%` }}></div>
                        </div>
                        <div className="w-12 text-right font-bold text-slate-800 dark:text-slate-200">{item.value}</div>
                    </div>
                );
            })}
        </div>
    );
};

interface BottomNavProps {
    onMenuClick: () => void;
    role: string | null;
}

export const BottomNavigation = ({ onMenuClick, role }: BottomNavProps) => {
    const isAdmin = role === 'admin';
    const isTeacher = role === 'teacher';
    const isGuest = role === 'guest';
    const showDashboard = isAdmin || isTeacher;
    const showSchedule = isAdmin || isTeacher || isGuest;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-dark-800/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 z-40 pb-safe md:hidden transition-all duration-300 no-select">
            <div className="flex justify-around items-center h-20">
                {showDashboard && (
                    <NavLink to="/dashboard" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl transition-all duration-300 flex-1 h-full ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/30'}`}>
                        <Icon name="Home" size={26} strokeWidth={2.5} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Рабочий</span>
                    </NavLink>
                )}
                
                {showSchedule && (
                    <NavLink to="/schedule" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl transition-all duration-300 flex-1 h-full ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/30'}`}>
                        <Icon name="Calendar" size={26} strokeWidth={2.5} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Расписание</span>
                    </NavLink>
                )}

                {isAdmin && (
                    <NavLink to="/substitutions" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl transition-all duration-300 flex-1 h-full ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-700/30'}`}>
                        <Icon name="Repeat" size={26} strokeWidth={2.5} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Замены</span>
                    </NavLink>
                )}

                <button onClick={onMenuClick} className="flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 active:text-indigo-600 active:bg-indigo-50/50 dark:active:bg-indigo-900/20 transition-all duration-300 flex-1 h-full hover:bg-slate-100/50 dark:hover:bg-slate-700/30">
                    <Icon name="Menu" size={26} strokeWidth={2.5} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Меню</span>
                </button>
            </div>
        </div>
    );
};

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
    const navigate = useNavigate();
    const { teachers, classes, subjects } = useStaticData();
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Group actions
    const filteredActions = useMemo(() => {
        if (!isOpen) return [];
        const q = query.toLowerCase().trim();
        
        const actions = [];
        
        // Navigation Actions
        if (!q || 'рабочий стол'.includes(q)) actions.push({ type: 'nav', label: 'Рабочий стол', icon: 'Home', path: '/dashboard' });
        if (!q || 'расписание'.includes(q)) actions.push({ type: 'nav', label: 'Расписание', icon: 'Calendar', path: '/schedule' });
        if (!q || 'замены'.includes(q)) actions.push({ type: 'nav', label: 'Замены', icon: 'Repeat', path: '/substitutions' });
        if (!q || 'администрация'.includes(q)) actions.push({ type: 'nav', label: 'Администрация', icon: 'Settings', path: '/admin' });

        if (q) {
            // Teachers
            teachers.forEach(t => {
                if (t.name.toLowerCase().includes(q)) {
                    actions.push({ type: 'teacher', label: t.name, icon: 'User', id: t.id });
                }
            });
            // Classes
            classes.forEach(c => {
                if (c.name.toLowerCase().includes(q)) {
                    actions.push({ type: 'class', label: c.name, icon: 'GraduationCap', id: c.id });
                }
            });
            // Subjects
            subjects.forEach(s => {
                if (s.name.toLowerCase().includes(q)) {
                    actions.push({ type: 'subject', label: s.name, icon: 'BookOpen', id: s.id });
                }
            });
        }
        
        return actions.slice(0, 10); // Limit results
    }, [query, teachers, classes, subjects, isOpen]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setActiveIndex(0);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }, [isOpen]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1) % filteredActions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 + filteredActions.length) % filteredActions.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredActions[activeIndex]) {
                executeAction(filteredActions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const executeAction = (action: any) => {
        if (action.type === 'nav') {
            navigate(action.path);
        } else if (action.type === 'teacher') {
            navigate(`/schedule?view=teacher&id=${action.id}`);
        } else if (action.type === 'class') {
            navigate(`/schedule?view=class&id=${action.id}`);
        } else if (action.type === 'subject') {
            navigate(`/schedule?view=subject&id=${action.id}`);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-slate-900/60 backdrop-blur-sm transition-all" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-xl bg-white dark:bg-dark-800 rounded-2xl shadow-2xl overflow-hidden animate-fade-in ring-1 ring-slate-900/5">
                <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-700">
                    <Icon name="Search" className="text-slate-400" size={20}/>
                    <input 
                        ref={inputRef}
                        inputMode="search"
                        className="flex-1 bg-transparent outline-none text-lg text-slate-800 dark:text-white placeholder:text-slate-400"
                        placeholder="Куда перейти? Или кого найти..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-md">ESC</div>
                </div>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                    {filteredActions.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-sm">Нет результатов</div>
                    ) : (
                        filteredActions.map((action, idx) => (
                            <button 
                                key={idx}
                                onClick={() => executeAction(action)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${idx === activeIndex ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                            >
                                <Icon name={action.icon} size={18} className={idx === activeIndex ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}/>
                                <div className="flex-1 font-medium">{action.label}</div>
                                {action.type !== 'nav' && <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">{action.type}</span>}
                            </button>
                        ))
                    )}
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-4 text-[10px] text-slate-400 font-medium px-4">
                    <span className="flex items-center gap-1"><span className="bg-white dark:bg-slate-600 px-1 rounded shadow-sm">↵</span> выбрать</span>
                    <span className="flex items-center gap-1"><span className="bg-white dark:bg-slate-600 px-1 rounded shadow-sm">↑↓</span> навигация</span>
                </div>
            </div>
        </div>
    );
};
