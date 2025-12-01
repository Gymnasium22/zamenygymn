
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AppData, Shift, StaticAppData, ScheduleAndSubstitutionData, ScheduleItem } from '../types';
import { INITIAL_DATA, DEFAULT_BELLS } from '../constants';
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

export const DataProvider: React.FC<{ children: React.ReactNode; initialData?: AppData }> = ({ children, initialData }) => {
    const [data, setInternalData] = useState<AppData>(INITIAL_DATA);
    const [isLoading, setIsLoading] = useState(true);
    const [history, setHistory] = useState<AppData[]>([]);
    const [historyPointer, setHistoryPointer] = useState(-1);
    
    // Получаем user и role для проверки прав
    const { user, role, loading: authLoading } = useAuth();

    useEffect(() => {
        // Если переданы начальные данные (например, для публичного просмотра), используем их
        if (initialData) {
            setInternalData(initialData);
            setHistory([initialData]);
            setHistoryPointer(0);
            setIsLoading(false);
            return;
        }

        // Ждем инициализации аутентификации
        if (authLoading) return;

        // Разрешаем загрузку, если есть пользователь ИЛИ если это гость (родитель)
        // ВАЖНО: Правила Firestore должны разрешать чтение (allow read: if true) для работы гостей
        const canLoadData = user || role === 'guest';

        if (!canLoadData) {
            // Если не авторизован и не гость - используем локальные дефолтные данные
            setInternalData(INITIAL_DATA);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);

        // Используем подписку вместо одноразовой загрузки (load)
        const unsubscribe = dbService.subscribe(
            (loaded) => {
                const fixedData = { ...INITIAL_DATA, ...loaded };
                
                // Нормализация данных для предотвращения ошибок undefined
                if (!fixedData.teachers) fixedData.teachers = [];
                fixedData.teachers = fixedData.teachers.map(t => ({ shifts: [Shift.First, Shift.Second], telegramChatId: '', ...t }));

                if (!fixedData.schedule) fixedData.schedule = [];
                if (!fixedData.schedule2ndHalf) fixedData.schedule2ndHalf = []; // Инициализация 2 полугодия
                if (!fixedData.substitutions) fixedData.substitutions = [];
                if (!fixedData.bellSchedule) fixedData.bellSchedule = DEFAULT_BELLS;
                
                if (!fixedData.settings) fixedData.settings = INITIAL_DATA.settings;
                else fixedData.settings = { ...INITIAL_DATA.settings, ...fixedData.settings };
                
                setInternalData(fixedData);
                
                // Инициализируем историю только при первой загрузке, чтобы не сбивать undo/redo при внешних обновлениях
                // (хотя в реальном времени undo/redo сложнее, здесь простая реализация)
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
                // В случае ошибки (например, нет прав) загружаем дефолтные, чтобы приложение работало
                setInternalData(INITIAL_DATA);
                setIsLoading(false); 
            }
        );

        // Очистка подписки при размонтировании или смене пользователя
        return () => {
            if (unsubscribe) unsubscribe();
        };

    }, [initialData, user, role, authLoading]); 

    const saveData = useCallback(async (newData: Partial<AppData>, addToHistory = true) => {
        // Запрещаем сохранение, если пользователь не авторизован (гости не могут сохранять)
        const isGuest = !user && role === 'guest';
        
        const mergedData = { ...data, ...newData };
        setInternalData(mergedData);
        
        // Сохраняем в облако только если это не публичный просмотр и пользователь авторизован
        if (!initialData && user && !isGuest) {
            try {
                await dbService.save(mergedData);
            } catch (e) {
                console.error("Save failed silently in background", e);
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
            if (!initialData && user) await dbService.save(prevData);
        }
    }, [history, historyPointer, user, initialData]);

    const redo = useCallback(async () => {
        if (historyPointer < history.length - 1) {
            const nextData = history[historyPointer + 1];
            setHistoryPointer(historyPointer + 1);
            setInternalData(nextData);
            if (!initialData && user) await dbService.save(nextData);
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
    }), [data.subjects, data.teachers, data.classes, data.rooms, data.bellSchedule, data.settings]);

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

    // Логика определения текущего семестра
    // 1 полугодие: Сентябрь (8) - Декабрь (11)
    // 2 полугодие: Январь (0) - Май (4)
    // Лето (5,6,7): Можно настроить по умолчанию на 1 или 2. Пусть будет 1.
    const currentMonth = new Date().getMonth();
    const isSecondSemester = currentMonth >= 0 && currentMonth <= 4;

    // Выбираем активное расписание для отображения в "Рабочем столе", "Заменах" и т.д.
    const activeSchedule = isSecondSemester ? (data.schedule2ndHalf || []) : data.schedule;

    const saveSemesterSchedule = useCallback(async (semester: 1 | 2, newData: ScheduleItem[]) => {
        if (semester === 1) {
            await saveData({ schedule: newData });
        } else {
            await saveData({ schedule2ndHalf: newData });
        }
    }, [saveData]);

    const saveScheduleData = useCallback(async (newData: Partial<ScheduleAndSubstitutionData>, addToHistory?: boolean) => {
        // Этот метод используется для обратной совместимости, если кто-то вызывает saveScheduleData({schedule: ...})
        // Он сохранит в "текущий" (1 полугодие в структуре данных, так как 'schedule' мапится туда)
        // Но лучше использовать saveSemesterSchedule
        await saveData(newData as any, addToHistory);
    }, [saveData]);

    const scheduleData: ScheduleAndSubstitutionData = useMemo(() => ({
        schedule: activeSchedule, // Автоматическое "активное" расписание
        schedule1: data.schedule,
        schedule2: data.schedule2ndHalf || [],
        substitutions: data.substitutions,
        saveSemesterSchedule,
        saveScheduleData
    }), [activeSchedule, data.schedule, data.schedule2ndHalf, data.substitutions, saveSemesterSchedule, saveScheduleData]);

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
