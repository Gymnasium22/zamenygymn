import { AppData } from '../types';
import { INITIAL_DATA } from '../constants';
import { firestoreDB, auth } from './firebase';

// Названия коллекций в Firebase ДОЛЖНЫ совпадать с firestore.rules
const MAIN_COLLECTION = 'schoolData'; // Было 'schools'
const MAIN_DOC_ID = 'main'; // Было 'root'
const PUBLIC_COLLECTION = 'publicSchedules'; // Было 'public_schedules'

export const dbService = {
    // Метод open больше не нужен для Firestore, но оставим заглушку если где-то используется напрямую (хотя не должно)
    open: async () => { console.log('Firestore connected'); return {} as any; },
    
    save: async (data: AppData) => {
        if (!firestoreDB) {
            console.error("Database not initialized (missing API key)");
            return;
        }
        
        // Проверка прав перед записью, чтобы избежать лишних запросов, которые все равно будут отклонены
        // Правила: allow write: if request.auth != null && request.auth.token.email == "admin@gymnasium22.com";
        const user = auth?.currentUser;
        if (!user || user.email !== "admin@gymnasium22.com") {
            console.warn("Отменено сохранение: У текущего пользователя нет прав на запись (нужен admin@gymnasium22.com).");
            return;
        }

        try {
            // Firestore не любит undefined, JSON.parse(JSON.stringify(data)) - быстрый способ очистить их
            const cleanData = JSON.parse(JSON.stringify(data));
            await firestoreDB.collection(MAIN_COLLECTION).doc(MAIN_DOC_ID).set(cleanData);
        } catch (error) {
            console.error("Ошибка сохранения в Firebase:", error);
            if ((error as { code?: string })?.code === 'permission-denied') {
                alert("Ошибка доступа: Недостаточно прав для сохранения данных в облаке.");
            }
            throw error;
        }
    },

    load: async (): Promise<AppData> => {
        if (!firestoreDB) {
            console.warn("Database not initialized. Returning initial data.");
            return INITIAL_DATA;
        }

        try {
            const doc = await firestoreDB.collection(MAIN_COLLECTION).doc(MAIN_DOC_ID).get();
            
            if (doc.exists) {
                const loadedData = doc.data() as Partial<AppData>;
                // Объединяем загруженные данные с начальными, чтобы избежать ошибок отсутствующих полей при обновлении структуры
                const mergedData = { ...INITIAL_DATA, ...loadedData };
                
                // Дополнительная проверка вложенных объектов настроек
                if (loadedData.settings) { 
                    mergedData.settings = { ...INITIAL_DATA.settings, ...loadedData.settings };
                }
                return mergedData;
            } else {
                // Если документа нет в облаке, возвращаем начальные данные
                return INITIAL_DATA;
            }
        } catch (error) {
            console.error("Ошибка загрузки из Firebase:", error);
            if ((error as { code?: string })?.code === 'permission-denied') {
                console.error("Нет прав на чтение. Проверьте правила (allow read: if true).");
            }
            // В случае ошибки (например, нет прав или интернета) возвращаем начальные данные, чтобы приложение не падало
            return INITIAL_DATA;
        }
    },

    subscribe: (
        onNext: (data: AppData) => void,
        onError: (error: Error) => void
    ) => {
        if (!firestoreDB) {
            console.warn("Database not initialized. Cannot subscribe.");
            return () => {};
        }

        // Подписываемся на изменения документа
        return firestoreDB.collection(MAIN_COLLECTION).doc(MAIN_DOC_ID).onSnapshot(
            (doc) => {
                if (doc.exists) {
                    const loadedData = doc.data() as Partial<AppData>;
                    const mergedData = { ...INITIAL_DATA, ...loadedData };
                    if (loadedData.settings) {
                        mergedData.settings = { ...INITIAL_DATA.settings, ...loadedData.settings };
                    }
                    onNext(mergedData);
                } else {
                    // Документа нет, возвращаем начальные данные
                    onNext(INITIAL_DATA);
                }
            },
            (error) => {
                console.error("Firestore subscription error:", error);
                if (error.code === 'permission-denied') {
                    console.error("Нет прав на чтение (subscribe).");
                }
                onError(error);
            }
        );
    },

    exportJson: (data: AppData) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gymnasium_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    setPublicData: async (id: string, data: AppData) => {
        if (!firestoreDB) throw new Error("Database not initialized");
        
        const user = auth?.currentUser;
        if (!user || user.email !== "admin@gymnasium22.com") {
             throw new Error("Только администратор может публиковать расписание.");
        }

        try {
            const publicDataSubset = {
                subjects: data.subjects,
                teachers: data.teachers.map(t => ({ 
                    id: t.id,
                    name: t.name,
                    subjectIds: t.subjectIds,
                    shifts: t.shifts,
                    unavailableDates: [], 
                    telegramChatId: '', 
                    birthDate: undefined, 
                    absenceReasons: undefined 
                })),
                classes: data.classes,
                rooms: data.rooms,
                schedule: data.schedule,
                substitutions: data.substitutions,
                bellSchedule: data.bellSchedule,
                settings: { 
                    telegramToken: '', 
                    publicScheduleId: data.settings.publicScheduleId
                }
            };
            const cleanData = JSON.parse(JSON.stringify(publicDataSubset));
            await firestoreDB.collection(PUBLIC_COLLECTION).doc(id).set(cleanData);
        } catch (error) {
            console.error("Ошибка публикации расписания:", error);
            throw error;
        }
    },

    getPublicData: async (id: string): Promise<AppData | null> => {
        if (!firestoreDB) return null;
        try {
            const doc = await firestoreDB.collection(PUBLIC_COLLECTION).doc(id).get();
            if (doc.exists) {
                return doc.data() as AppData;
            }
            return null;
        } catch (error) {
            console.error("Ошибка получения публичного расписания:", error);
            return null;
        }
    },

    deletePublicData: async (id: string) => {
        if (!firestoreDB) throw new Error("Database not initialized");
        
        const user = auth?.currentUser;
        if (!user || user.email !== "admin@gymnasium22.com") {
             throw new Error("Только администратор может удалять публичное расписание.");
        }

        try {
            await firestoreDB.collection(PUBLIC_COLLECTION).doc(id).delete();
        } catch (error) {
            console.error("Ошибка удаления публичного расписания:", error);
            throw error;
        }
    }
};