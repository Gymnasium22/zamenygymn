
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
    CONFIG: 'config', 
    PUBLIC: 'publicSchedules'
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

// Helper to remove undefined values which Firebase doesn't support
const sanitizeForFirestore = (data: any) => {
    return JSON.parse(JSON.stringify(data));
};

export const dbService = {
    // Оптимизированная синхронизация: сравнивает данные перед записью
    syncCollection: async (collectionName: string, items: any[]) => {
        if (!firestoreDB) return;

        // 1. Получаем текущие данные из базы
        const q = query(collection(firestoreDB, collectionName));
        const querySnapshot = await awaitHZ(async() => await getDocs(q));
        
        const existingDocsMap = new Map();
        querySnapshot.docs.forEach((doc: any) => {
            existingDocsMap.set(doc.id, doc.data());
        });

        const newItemsMap = new Map();
        items.forEach(item => newItemsMap.set(item.id, item));

        // 2. Вычисляем разницу
        const operations: any[] = [];

        // Удаление
        existingDocsMap.forEach((_, id) => {
            if (!newItemsMap.has(id)) {
                operations.push({ type: 'delete', id });
            }
        });

        // Создание / Обновление
        items.forEach(item => {
            const existingData = existingDocsMap.get(item.id);
            // Используем JSON.stringify для сравнения, это также игнорирует порядок ключей в простых объектах,
            // но для надежности глубокого сравнения лучше использовать lodash.isEqual, 
            // однако здесь мы полагаемся на то, что sanitize уберет undefined, который мог вызвать ложные срабатывания или ошибки.
            const sanitizedItem = sanitizeForFirestore(item);
            
            if (!existingData || JSON.stringify(existingData) !== JSON.stringify(sanitizedItem)) {
                operations.push({ type: 'set', item: sanitizedItem });
            }
        });

        if (operations.length === 0) {
            return; 
        }

        console.log(`Syncing ${collectionName}: ${operations.length} changes.`);

        // 3. Запись пачками (Batch write)
        const chunks = chunkArray(operations, 450); 

        for (const chunk of chunks) {
            const batch = writeBatch(firestoreDB);
            chunk.forEach((op: any) => {
                const docRef = doc(firestoreDB, collectionName, op.id || op.item.id);
                if (op.type === 'delete') {
                    batch.delete(docRef);
                } else {
                    // Гарантируем, что undefined поля удалены перед записью
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

        const promises = [];

        if (data.teachers) promises.push(dbService.syncCollection(COLLECTIONS.TEACHERS, data.teachers));
        if (data.subjects) promises.push(dbService.syncCollection(COLLECTIONS.SUBJECTS, data.subjects));
        if (data.classes) promises.push(dbService.syncCollection(COLLECTIONS.CLASSES, data.classes));
        if (data.rooms) promises.push(dbService.syncCollection(COLLECTIONS.ROOMS, data.rooms));
        
        if (data.schedule) promises.push(dbService.syncCollection(COLLECTIONS.SCHEDULE_1, data.schedule));
        if (data.schedule2ndHalf) promises.push(dbService.syncCollection(COLLECTIONS.SCHEDULE_2, data.schedule2ndHalf));
        
        if (data.substitutions) promises.push(dbService.syncCollection(COLLECTIONS.SUBSTITUTIONS, data.substitutions));

        if (data.settings) {
            promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), sanitizeForFirestore(data.settings)));
        }
        if (data.bellSchedule) {
            promises.push(setDoc(doc(firestoreDB, COLLECTIONS.CONFIG, 'bells'), sanitizeForFirestore({ items: data.bellSchedule })));
        }

        await Promise.all(promises);
        console.log("Data saved successfully to collections");
    },

    subscribe: (
        onNext: (data: AppData) => void,
        onError: (error: Error) => void
    ) => {
        if (!firestoreDB) {
            return () => {};
        }

        let localData: AppData = { ...INITIAL_DATA };
        
        let updateTimeout: any;
        const triggerUpdate = () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                onNext({ ...localData });
            }, 50); 
        };

        const unsubs: any[] = [];

        const subColl = (colName: string, key: keyof AppData) => {
            const q = query(collection(firestoreDB, colName));
            return onSnapshot(q, (snapshot) => {
                const items = snapshot.docs.map(d => d.data());
                // Sort items based on 'order' property client-side
                items.sort((a: any, b: any) => {
                    const orderA = typeof a.order === 'number' ? a.order : 999999;
                    const orderB = typeof b.order === 'number' ? b.order : 999999;
                    return orderA - orderB;
                });
                (localData as any)[key] = items;
                triggerUpdate();
            }, (err) => {
                console.warn(`Error reading ${colName}:`, err);
            });
        };

        unsubs.push(subColl(COLLECTIONS.TEACHERS, 'teachers'));
        unsubs.push(subColl(COLLECTIONS.SUBJECTS, 'subjects'));
        unsubs.push(subColl(COLLECTIONS.CLASSES, 'classes'));
        unsubs.push(subColl(COLLECTIONS.ROOMS, 'rooms'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_1, 'schedule'));
        unsubs.push(subColl(COLLECTIONS.SCHEDULE_2, 'schedule2ndHalf'));
        unsubs.push(subColl(COLLECTIONS.SUBSTITUTIONS, 'substitutions'));

        unsubs.push(onSnapshot(doc(firestoreDB, COLLECTIONS.CONFIG, 'settings'), (doc) => {
            if (doc.exists()) {
                localData.settings = { ...INITIAL_DATA.settings, ...doc.data() };
                triggerUpdate();
            }
        }));

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

    setPublicData: async (id: string, data: AppData) => {
        if (!firestoreDB) throw new Error("Database not initialized");
        const user = auth?.currentUser;
        if (!user || user.email !== "admin@gymnasium22.com") throw new Error("Нет прав.");

        const publicDataSubset = {
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
        // sanitize here too just in case
        const cleanData = sanitizeForFirestore(publicDataSubset);
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

// Wrapper to safely execute getDocs even if it fails (simplistic retry logic could go here)
async function awaitHZ(fn: Function) {
    try {
        return await fn();
    } catch(e) {
        // If query fails (quota), return empty snapshot structure to prevent crash in loop
        console.error("Firestore read error (likely quota):", e);
        return { docs: [] };
    }
}
