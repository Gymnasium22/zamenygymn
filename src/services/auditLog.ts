import { AuditLogEntry } from '../types';
import { generateId } from '../utils/helpers';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/localStorage';
import { firestoreDB } from './firebase';
import { supabase } from './supabase';
import { isSupabase } from './dbProvider';
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
        details?: string,
        organizationId?: string | null
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

        // 2. Write to database if available
        if (isSupabase) {
            try {
                await supabase.from('audit_log').insert({
                    organization_id: organizationId || null,
                    user_email: userEmail || null,
                    action: action,
                    collection: entityType,
                    target_id: entityName || null,
                    details: details ? { info: details } : null
                });
            } catch (e) {
                logger.warn('Failed to write audit log to Supabase:', e);
            }
        } else if (firestoreDB) {
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

    async getEntries(limit = 100, organizationId?: string | null): Promise<AuditLogEntry[]> {
        if (isSupabase) {
            try {
                let query = supabase
                    .from('audit_log')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(limit);
                if (organizationId) query = query.eq('organization_id', organizationId);
                const { data, error } = await query;
                if (error) throw error;
                if (data && data.length > 0) {
                    const dbEntries = data.map((d: Record<string, unknown>) => {
                        const rawDetails = d.details;
                        let detailsStr = '';
                        if (typeof rawDetails === 'string') {
                            detailsStr = rawDetails;
                        } else if (rawDetails && typeof rawDetails === 'object' && 'info' in rawDetails) {
                            detailsStr = (rawDetails as { info?: string }).info || '';
                        }
                        return {
                            id: d.id as string,
                            timestamp: (d.created_at as string) || new Date().toISOString(),
                            userEmail: (d.user_email as string) || 'unknown',
                            userRole: (d.user_role as string) || 'unknown',
                            action: (d.action as string) || 'update',
                            entityType: (d.collection as string) || (d.entity_type as string) || 'settings',
                            entityName: (d.target_id as string) || (d.entity_name as string) || '',
                            details: detailsStr
                        } as AuditLogEntry;
                    });
                    this.writeEntries([...dbEntries].reverse());
                    return dbEntries;
                }
            } catch (e) {
                logger.warn('Failed to fetch audit log from Supabase, falling back to local storage:', e);
            }
        } else if (firestoreDB) {
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

    /**
     * Очистка журнала.
     * @param organizationId — если задан, удаляем только эту организацию.
     *   Если null/undefined — все записи (нужен фильтр для PostgREST, иначе delete не сработает).
     */
    async clear(organizationId?: string | null) {
        if (isSupabase) {
            // PostgREST запрещает DELETE без WHERE — всегда нужен фильтр.
            // Также многие записи могли писаться с organization_id = null.
            if (organizationId) {
                const { error: errOrg } = await supabase
                    .from('audit_log')
                    .delete()
                    .eq('organization_id', organizationId);
                if (errOrg) {
                    logger.warn('Failed to clear org audit log:', errOrg);
                    throw errOrg;
                }
                // Записи без org (старые / без привязки) — не трогаем при очистке одной org
            } else {
                // Удалить всё: фильтр «created_at не в будущем» покрывает все реальные строки
                const { error: errAll } = await supabase
                    .from('audit_log')
                    .delete()
                    .lte('created_at', new Date(Date.now() + 86400000).toISOString());
                if (errAll) {
                    // fallback: по id is not null
                    const { error: err2 } = await supabase.from('audit_log').delete().not('id', 'is', null);
                    if (err2) {
                        logger.warn('Failed to clear all audit log:', err2);
                        throw err2;
                    }
                }
            }

            // Проверка: остались ли строки
            let check = supabase.from('audit_log').select('id', { count: 'exact', head: true });
            if (organizationId) check = check.eq('organization_id', organizationId);
            const { count, error: countErr } = await check;
            if (!countErr && count && count > 0) {
                logger.warn(`Audit log clear: still ${count} rows in Supabase (RLS?)`);
                throw new Error(
                    `В облаке осталось ${count} записей. Возможно, нет прав на удаление (RLS). Обратитесь к суперадмину или проверьте политики audit_log.`
                );
            }
        } else if (firestoreDB) {
            try {
                const q = query(collection(firestoreDB, 'audit_log'));
                const snapshot = await getDocs(q);
                const batch = writeBatch(firestoreDB);
                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            } catch (e) {
                logger.warn('Failed to clear Firestore audit log:', e);
                throw e;
            }
        }
        safeLocalStorageRemove(STORAGE_KEY);
    }

    exportJson(): string {
        return JSON.stringify(this.readEntries(), null, 2);
    }
}

export const auditLog = new AuditLogService();
