import { AuditLogEntry } from '../types';
import { generateId } from '../utils/helpers';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/localStorage';
import { firestoreDB } from './firebase';
import { logger } from '../utils/logger';
import { collection, addDoc, getDocs, query, orderBy, limit as firestoreLimit, writeBatch } from 'firebase/firestore';

const STORAGE_KEY = 'gym_audit_log';
const MAX_ENTRIES = 200;

const isPermissionDenied = (error: unknown): boolean => {
    const code = (error as { code?: string })?.code;
    return code === 'permission-denied' || code === 'PERMISSION_DENIED';
};

class AuditLogService {
    private readEntries(): AuditLogEntry[] {
        try {
            const raw = safeLocalStorageGet(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    private writeEntries(entries: AuditLogEntry[]) {
        try {
            safeLocalStorageSet(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
        } catch {
            // Ignore storage errors
        }
    }

    async log(
        userEmail: string,
        userRole: string,
        action: AuditLogEntry['action'],
        entityType: AuditLogEntry['entityType'],
        entityName?: string,
        details?: string
    ) {
        const entry: AuditLogEntry = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            userEmail,
            userRole,
            action,
            entityType,
            entityName: entityName || '',
            details: details || ''
        };

        // 1. Write to local storage (as fallback/backup)
        const entries = this.readEntries();
        entries.push(entry);
        this.writeEntries(entries);

        // 2. Write to Firestore directly if available
        if (firestoreDB) {
            try {
                const docRef = collection(firestoreDB, 'audit_log');
                await addDoc(docRef, entry);
            } catch (e) {
                if (!isPermissionDenied(e)) {
                    logger.warn('Failed to write audit log to Firestore:', e);
                }
            }
        }
    }

    async getEntries(limit = 100): Promise<AuditLogEntry[]> {
        if (firestoreDB) {
            try {
                const q = query(
                    collection(firestoreDB, 'audit_log'),
                    orderBy('timestamp', 'desc'),
                    firestoreLimit(limit)
                );
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const dbEntries = snapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            timestamp: data.timestamp || new Date().toISOString(),
                            userEmail: data.userEmail || 'unknown',
                            userRole: data.userRole || 'unknown',
                            action: data.action || 'update',
                            entityType: data.entityType || 'settings',
                            entityName: data.entityName || '',
                            details: data.details || ''
                        } as AuditLogEntry;
                    });
                    // Sync local storage with fetched logs
                    this.writeEntries([...dbEntries].reverse());
                    return dbEntries;
                }
            } catch (e) {
                if (!isPermissionDenied(e)) {
                    logger.warn('Failed to fetch audit log from Firestore, falling back to local storage:', e);
                }
            }
        }
        return this.readEntries().slice(-limit).reverse();
    }

    async clear() {
        safeLocalStorageRemove(STORAGE_KEY);
        if (firestoreDB) {
            try {
                const q = query(collection(firestoreDB, 'audit_log'));
                const snapshot = await getDocs(q);
                const batch = writeBatch(firestoreDB);
                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            } catch (e) {
                if (!isPermissionDenied(e)) {
                    logger.warn('Failed to clear Firestore audit log:', e);
                }
            }
        }
    }

    exportJson(): string {
        return JSON.stringify(this.readEntries(), null, 2);
    }
}

export const auditLog = new AuditLogService();
