import { AuditLogEntry } from '../types';
import { generateId } from '../utils/helpers';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/localStorage';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'gym_audit_log';
const MAX_ENTRIES = 200;

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

        // 2. Write to Supabase
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
    }

    async getEntries(limit = 100, organizationId?: string | null): Promise<AuditLogEntry[]> {
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
        return this.readEntries().slice(-limit).reverse();
    }

    /**
     * Очистка журнала.
     * @param organizationId — если задан, удаляем только эту организацию.
     *   Если null/undefined — все записи (нужен фильтр для PostgREST, иначе delete не сработает).
     */
    async clear(organizationId?: string | null) {
        // PostgREST запрещает DELETE без WHERE — всегда нужен фильтр.
        if (organizationId) {
            const { error: errOrg } = await supabase
                .from('audit_log')
                .delete()
                .eq('organization_id', organizationId);
            if (errOrg) {
                logger.warn('Failed to clear org audit log:', errOrg);
                throw errOrg;
            }
        } else {
            const { error: errAll } = await supabase
                .from('audit_log')
                .delete()
                .lte('created_at', new Date(Date.now() + 86400000).toISOString());
            if (errAll) {
                const { error: err2 } = await supabase.from('audit_log').delete().not('id', 'is', null);
                if (err2) {
                    logger.warn('Failed to clear all audit log:', err2);
                    throw err2;
                }
            }
        }

        let check = supabase.from('audit_log').select('id', { count: 'exact', head: true });
        if (organizationId) check = check.eq('organization_id', organizationId);
        const { count, error: countErr } = await check;
        if (!countErr && count && count > 0) {
            logger.warn(`Audit log clear: still ${count} rows in Supabase (RLS?)`);
            throw new Error(
                `В облаке осталось ${count} записей. Возможно, нет прав на удаление (RLS). Обратитесь к суперадмину или проверьте политики audit_log.`
            );
        }
        safeLocalStorageRemove(STORAGE_KEY);
    }

    exportJson(): string {
        return JSON.stringify(this.readEntries(), null, 2);
    }
}

export const auditLog = new AuditLogService();
