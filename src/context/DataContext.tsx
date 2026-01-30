
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AppData, Shift, StaticAppData, ScheduleAndSubstitutionData, ScheduleItem } from '../types';
import { INITIAL_DATA, DEFAULT_BELLS, DEFAULT_DUTY_ZONES } from '../constants';
import { dbService } from '../services/db';
import { useAuth } from './AuthContext';

interface FullDataContextType {
    data: AppData;
    isLoading: boolean;
    saveData: (newData: Partial<AppData>, addToHistory?: boolean) => Promise<void>;
    resetData: () => Promise<void>;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

const FullDataContext = createContext<FullDataContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'gym_data_local_backup_v2';

export const DataProvider: React.FC<{ children: React.ReactNode; initialData?: AppData }> = ({ children, initialData }) => {
    const [data, setInternalData] = useState<AppData>(INITIAL_DATA);
    const [isLoading, setIsLoading] = useState(true);
    const [history, setHistory] = useState<AppData[]>([]);
    const [historyPointer, setHistoryPointer] = useState(-1);
    
    // Получаем user и role для проверки прав
    const { user, role, loading: authLoading } = useAuth();

    // Загрузка данных
    useEffect(() => {
        // 1. Если переданы начальные данные (публичный вид)
        if (initialData) {
            setInternalData(initialData);
            setHistory([initialData]);
            setHistoryPointer(0);
            setIsLoading(false);
            return;
        }

        // Ждем инициализации аутентификации
        if (authLoading) return;

        // 2. Пытаемся загрузить локальную копию сразу, чтобы пользователь что-то видел
        const localBackup = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localBackup) {
            try {
                const parsed = JSON.parse(localBackup);
                // Простая валидация
                if (parsed && parsed.teachers) {
                    setInternalData(prev => ({ ...prev, ...parsed }));
                    console.log('Loaded from local storage backup');
                }
            } catch (e) {
                console.error('Error parsing local backup', e);
            }
        }

        const canLoadData = user || role === 'guest';
        if (!canLoadData) {
            if (!localBackup) setInternalData(INITIAL_DATA);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // 3. Подписываемся на Firebase
        const unsubscribe = dbService.subscribe(
            (loaded) => {
                const fixedData = { ...INITIAL_DATA, ...loaded };
                
                // Нормализация данных
                if (!fixedData.teachers) fixedData.teachers = [];
                // Fix: apply defaults safely to avoid overwriting or TS warnings
                fixedData.teachers = fixedData.teachers.map(t => ({ 
                    telegramChatId: '', 
                    ...t,
                    shifts: t.shifts || [Shift.First, Shift.Second]
                }));

                if (!fixedData.schedule) fixedData.schedule = [];
                if (!fixedData.schedule2ndHalf) fixedData.schedule2ndHalf = []; 
                if (!fixedData.substitutions) fixedData.substitutions = [];
                if (!fixedData.bellSchedule) fixedData.bellSchedule = DEFAULT_BELLS;
                if (!fixedData.dutyZones || fixedData.dutyZones.length === 0) fixedData.dutyZones = DEFAULT_DUTY_ZONES;
                if (!fixedData.dutySchedule) fixedData.dutySchedule = [];
                
                if (!fixedData.settings) fixedData.settings = INITIAL_DATA.settings;
                else fixedData.settings = { ...INITIAL_DATA.settings, ...fixedData.settings };
                
                setInternalData(fixedData);
                
                // Обновляем локальный бэкап актуальными данными из облака
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(fixedData));
                
                setHistory(prev => {
                    if (prev.length === 0) return [fixedData];
                    return prev; 
                });
                setHistoryPointer(prev => {
                    if (prev === -1) return 0;
                    return prev;
                });
                
                setIsLoading(false);
            },
            (error) => {
                console.error("Failed to subscribe to data:", error);
                // Если ошибка квоты или сети - мы уже загрузили localBackup выше, так что данные не пропадут
                setIsLoading(false); 
            }
        );

        return () => {
            if (unsubscribe) unsubscribe();
        };

    }, [initialData, user, role, authLoading]); 

    const saveData = useCallback(async (newData: Partial<AppData>, addToHistory = true) => {
        const isGuest = !user && role === 'guest';
        
        // 1. Оптимистичное обновление интерфейса (сразу меняем стейт)
        const mergedData = { ...data, ...newData };
        setInternalData(mergedData);
        
        // 2. Всегда сохраняем в LocalStorage как резерв
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
        } catch (e) {
            console.error("Local storage quota exceeded", e);
        }

        // 3. Пробуем отправить в облако
        if (!initialData && user && !isGuest) {
            try {
                await dbService.save(newData); 
            } catch (e: any) {
                console.error("Save failed:", e);
                // Специальная обработка для исчерпания квоты
                if (e?.code === 'resource-exhausted') {
                    console.warn("Quota exceeded. Saved locally only.");
                } else if (e?.code === 'permission-denied') {
                    alert("⚠️ Ошибка доступа. Изменения сохранены только локально.");
                } else {
                    console.warn("Cloud save error. Saved locally.", e.message);
                }
            }
        } else if (isGuest) {
            console.warn("Гости не могут сохранять изменения в базу данных.");
        }

        if (addToHistory) {
            const newHistory = history.slice(0, historyPointer + 1);
            newHistory.push(mergedData);
            if (newHistory.length > 50) newHistory.shift(); 
            setHistory(newHistory);
            setHistoryPointer(newHistory.length - 1);
        }
    }, [data, history, historyPointer, user, role, initialData]);

    const undo = useCallback(async () => {
        if (historyPointer > 0) {
            const prevData = history[historyPointer - 1];
            setHistoryPointer(historyPointer - 1);
            setInternalData(prevData);
            // Сохраняем локально
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(prevData));
            
            if (!initialData && user) {
                try {
                    await dbService.save(prevData);
                } catch(e) { console.error(e); }
            }
        }
    }, [history, historyPointer, user, initialData]);

    const redo = useCallback(async () => {
        if (historyPointer < history.length - 1) {
            const nextData = history[historyPointer + 1];
            setHistoryPointer(historyPointer + 1);
            setInternalData(nextData);
            // Сохраняем локально
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextData));

            if (!initialData && user) {
                 try {
                    await dbService.save(nextData);
                } catch(e) { console.error(e); }
            }
        }
    }, [history, historyPointer, user, initialData]);

    const resetData = useCallback(async () => { await saveData(INITIAL_DATA); }, [saveData]);

    const contextValue = useMemo(() => ({
        data, isLoading, saveData, resetData,
        undo, redo, canUndo: historyPointer > 0, canRedo: historyPointer < history.length - 1
    }), [data, isLoading, saveData, resetData, undo, redo, historyPointer]);

    return (
        <FullDataContext.Provider value={contextValue}>
            {children}
        </FullDataContext.Provider>
    );
};

const useFullData = () => {
    const context = useContext(FullDataContext);
    if (!context) throw new Error("useFullData must be used within DataProvider");
    return context;
};

interface StaticDataContextType extends StaticAppData {
    saveStaticData: (newData: Partial<StaticAppData>, addToHistory?: boolean) => Promise<void>;
}

interface ScheduleContextType extends ScheduleAndSubstitutionData {
    saveScheduleData: (newData: Partial<ScheduleAndSubstitutionData>, addToHistory?: boolean) => Promise<void>;
}

const StaticDataContext = createContext<StaticDataContextType | undefined>(undefined);
const ScheduleDataContext = createContext<ScheduleContextType | undefined>(undefined);

export const StaticDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { data, saveData } = useFullData();

    const staticData: StaticAppData = useMemo(() => ({
        subjects: data.subjects,
        teachers: data.teachers,
        classes: data.classes,
        rooms: data.rooms,
        bellSchedule: data.bellSchedule,
        settings: data.settings,
        dutyZones: data.dutyZones,
    }), [data.subjects, data.teachers, data.classes, data.rooms, data.bellSchedule, data.settings, data.dutyZones]);

    const saveStaticData = useCallback(async (newData: Partial<StaticAppData>, addToHistory?: boolean) => {
        await saveData(newData, addToHistory);
    }, [saveData]);

    const contextValue = useMemo(() => ({
        ...staticData,
        saveStaticData,
    }), [staticData, saveStaticData]);

    return (
        <StaticDataContext.Provider value={contextValue}>
            {children}
        </StaticDataContext.Provider>
    );
};

export const ScheduleDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { data, saveData } = useFullData();

    const currentMonth = new Date().getMonth();
    const isSecondSemester = currentMonth >= 0 && currentMonth <= 4;
    const activeSchedule = isSecondSemester ? (data.schedule2ndHalf || []) : data.schedule;

    const saveSemesterSchedule = useCallback(async (semester: 1 | 2, newData: ScheduleItem[]) => {
        if (semester === 1) {
            await saveData({ schedule: newData });
        } else {
            await saveData({ schedule2ndHalf: newData });
        }
    }, [saveData]);

    const saveScheduleData = useCallback(async (newData: Partial<ScheduleAndSubstitutionData>, addToHistory?: boolean) => {
        await saveData(newData as any, addToHistory);
    }, [saveData]);

    const scheduleData: ScheduleAndSubstitutionData = useMemo(() => ({
        schedule: activeSchedule,
        schedule1: data.schedule,
        schedule2: data.schedule2ndHalf || [],
        substitutions: data.substitutions,
        dutySchedule: data.dutySchedule,
        saveSemesterSchedule,
        saveScheduleData
    }), [activeSchedule, data.schedule, data.schedule2ndHalf, data.substitutions, data.dutySchedule, saveSemesterSchedule, saveScheduleData]);

    const contextValue = useMemo(() => ({
        ...scheduleData,
        saveScheduleData,
    }), [scheduleData, saveScheduleData]);

    return (
        <ScheduleDataContext.Provider value={contextValue}>
            {children}
        </ScheduleDataContext.Provider>
    );
};


export const useStaticData = () => {
    const context = useContext(StaticDataContext);
    if (!context) throw new Error("useStaticData must be used within StaticDataProvider");
    const fullContext = useFullData(); 
    return { ...context, isLoading: fullContext.isLoading, undo: fullContext.undo, redo: fullContext.redo, canUndo: fullContext.canUndo, canRedo: fullContext.canRedo, resetData: fullContext.resetData };
};

export const useScheduleData = () => {
    const context = useContext(ScheduleDataContext);
    if (!context) throw new Error("useScheduleData must be used within ScheduleDataProvider");
    const fullContext = useFullData(); 
    return { ...context, isLoading: fullContext.isLoading, undo: fullContext.undo, redo: fullContext.redo, canUndo: fullContext.canUndo, canRedo: fullContext.canRedo, resetData: fullContext.resetData };
};

export const useData = () => {
    const context = useContext(FullDataContext);
    if (!context) throw new Error("useData must be used within DataProvider");
    return context;
};
