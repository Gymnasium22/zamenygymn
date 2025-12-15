
import { AppData } from '../types';
import { INITIAL_DATA } from '../constants';
import { firestoreDB, auth } from './firebase';
import { 
    collection, 
    doc, 
    setDoc, 
    writeBatch, 
    onSnapshot, 
    getDocs, 
    query,
    deleteDoc
} from "firebase/firestore";

// Конфигурация коллекций
const COLLECTIONS = {
    TEACHERS: 'teachers',
    SUBJECTS: 'subjects',
    CLASSES: 'classes',
    ROOMS: 'rooms',
    SCHEDULE_1: 'schedule_sem1',
    SCHEDULE_2: 'schedule_sem2',
    SUBSTITUTIONS: 'substitutions',
    CONFIG: 'config', // Тут храним settings и bells
    PUBLIC: 'publicSchedules'
};

// Хелпер для разбивки массива на чанки (лимит Firestore batch = 500 операций)
const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

export const dbService = {
    // Синхронизация массива данных с коллекцией (Create, Update, Delete)
    // Это ключевая функция, позволяющая оставить логику приложения на массивах,
    // но хранить данные в масштабируемых коллекциях.
    syncCollection: async (collectionName: string, items: any[]) => {
        if (!firestoreDB) return;

        // 1. Получаем текущие ID в базе, чтобы понять, что нужно удалить
        const q = query(collection(firestoreDB, collectionName));
        const querySnapshot = await getDocs(q);
        const existingIds = new Set(querySnapshot.docs.map(d => d.id));
        const newIds = new Set(items.map(i => i.id));

        // 2. Определяем операции
        const toDelete = [...existingIds].filter(id => !newIds.has(id));
        const toUpsert = items; // Все элементы обновляем/создаем (проще, чем сравнивать поля)

        // 3. Выполняем операции пачками (batches)
        const operations = [
            ...toDelete.map(id => ({ type: 'delete', id })),
            ...toUpsert.map(item => ({ type: 'set', item }))
        ];

        const chunks = chunkArray(operations, 450); // Берем с запасом меньше 500

        for (const chunk of chunks) {
            const batch = writeBatch(firestoreDB);
            chunk.forEach((op: any) => {
                const docRef = doc(firestoreDB, collectionName, op.id || op.item.id);
                if (op.type === 'delete') {
                    batch.delete(docRef);
                } else {
                    batch.set(docRef, op.item);
                }
            });
            await batch.commit();
        }
    },

    save: async (data: Partial<AppData>) => {
        if (!firestoreDB) {
            console.error("Database not initialized");
            return;
        }
        
        const user = auth?.currentUser;
        if (!user || user.email !== "admin@gymnasium22.com") {
            console.warn("Отменено сохранение: нет прав администратора.");
            return;
        }

        try {
            const promises = [];

            // Синхронизируем только те коллекции, которые были изменены
            if (data.teachers) promises.push(dbService.syncCollection(COLLECTIONS.TEACHERS, data.teachers));
            if (data.subjects) promises.push(dbService.syncCollection(COLLECTIONS.SUBJECTS, data.subjects));
            if (data.classes) promises.push(dbService.syncCollection(COLLECTIONS.CLASSES, data.classes));
            if (data.rooms) promises.push(dbService.syncCollection(COLLECTIONS.ROOMS, data.rooms));
            
            // Расписание 1
            if (data.schedule) promises.push(dbService.syncCollection(COLLECTIONS.SCHEDULE_1, data.schedule));
            // Расписание 2
            if (data.schedule2ndHalf) promises.push(dbService.syncCollection(COLLECTIONS.SCHEDULE_2, data.schedule2ndHalf));
            
            if (data.substitutions) promises.push(dbService.syncCollection(COLLECTIONS.SUBSTITUTIONS, data.substitutions));

            // Настройки и звонки храним как отдельные документы в коллекции config
            if (data.settings) {
                promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), data.settings));
            }
            if (data.bellSchedule) {
                promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'), { items: data.bellSchedule }));
            }

            await Promise.all(promises);
            console.log("Data saved successfully to collections");

        } catch (error) {
            console.error("Ошибка сохранения в Firebase:", error);
            if ((error as any)?.code === 'permission-denied') {
                alert("Ошибка доступа: Недостаточно прав для сохранения данных.");
            }
            throw error;
        }
    },

    // Функция подписки на изменения
    subscribe: (
        onNext: (data: AppData) => void,
        onError: (error: Error) => void
    ) => {
        if (!firestoreDB) {
            return () => {};
        }

        // Локальный кэш данных для сборки полного объекта
        let localData: AppData = { ...INITIAL_DATA };
        let hasInitialLoad = false;

        // Дебаунс, чтобы не дергать обновление стейта React на каждое изменение в каждой коллекции
        let updateTimeout: any;
        const triggerUpdate = () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                onNext({ ...localData });
                hasInitialLoad = true;
            }, 50); // 50мс задержка для группировки обновлений
        };

        const unsubs: any[] = [];

        // Хелпер для подписки на коллекцию
        const subColl = (colName: string, key: keyof AppData) => {
            const q = query(collection(firestoreDB, colName));
            return onSnapshot(q, (snapshot) => {
                const items = snapshot.docs.map(d => d.data());
                (localData as any)[key] = items;
                triggerUpdate();
            }, (err) => {
                // Игнорируем ошибку permission-denied при первой загрузке, если пользователь гость
                // (хотя правила должны разрешать чтение)
                console.warn(`Error reading ${colName}:`, err);
            });
        };

        // Подписки на основные коллекции
        unsubs.push(subColl(COLLECTIONS.TEACHERS, 'teachers'));
        unsubs.push(subColl(COLLECTIONS.SUBJECTS, 'subjects'));
        unsubs.push(subColl(COLLECTIONS.CLASSES, 'classes'));
        unsubs.push(subColl(COLLECTIONS.ROOMS, 'rooms'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_1, 'schedule'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_2, 'schedule2ndHalf'));
        unsubs.push(subColl(COLLECTIONS.SUBSTITUTIONS, 'substitutions'));

        // Подписка на конфиги (settings)
        unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), (doc) => {
            if (doc.exists()) {
                localData.settings = { ...INITIAL_DATA.settings, ...doc.data() };
                triggerUpdate();
            }
        }));

        // Подписка на конфиги (bells)
        unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                localData.bellSchedule = data.items || INITIAL_DATA.bellSchedule;
                triggerUpdate();
            }
        }));

        return () => {
            unsubs.forEach(unsub => unsub());
            clearTimeout(updateTimeout);
        };
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

    // Публичные расписания (пока оставим как один документ, так как они обычно read-only и создаются разово)
    setPublicData: async (id: string, data: AppData) => {
        if (!firestoreDB) throw new Error("Database not initialized");
        const user = auth?.currentUser;
        if (!user || user.email !== "admin@gymnasium22.com") throw new Error("Нет прав.");

        const publicDataSubset = {
            // ... (оставляем логику фильтрации, она хорошая)
            subjects: data.subjects,
            teachers: data.teachers.map(t => ({ 
                id: t.id,
                name: t.name,
                subjectIds: t.subjectIds,
                shifts: t.shifts,
                unavailableDates: [], 
                telegramChatId: '', 
            })),
            classes: data.classes,
            rooms: data.rooms,
            schedule: data.schedule,
            schedule2ndHalf: data.schedule2ndHalf,
            substitutions: data.substitutions,
            bellSchedule: data.bellSchedule,
            settings: { 
                telegramToken: '', 
                publicScheduleId: data.settings.publicScheduleId
            }
        };
        // Для публичного расписания можно оставить один документ, так как он создается редко и не меняется часто
        const cleanData = JSON.parse(JSON.stringify(publicDataSubset));
        await setDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id), cleanData);
    },

    getPublicData: async (id: string): Promise<AppData | null> => {
        if (!firestoreDB) return null;
        try {
            const d = await import("firebase/firestore").then(m => m.getDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id)));
            if (d.exists()) return d.data() as AppData;
            return null;
        } catch (error) {
            console.error(error);
            return null;
        }
    },

    deletePublicData: async (id: string) => {
        if (!firestoreDB) return;
        await deleteDoc(doc(firestoreDB, COLLECTIONS.PUBLIC, id));
    }
};
