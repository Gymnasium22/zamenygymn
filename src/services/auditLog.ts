import { AuditLogEntry } from '../types';
import { generateId } from '../utils/helpers';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/localStorage';

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

    log(
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
            entityName,
            details
        };
        const entries = this.readEntries();
        entries.push(entry);
        this.writeEntries(entries);
    }

    getEntries(limit = 50): AuditLogEntry[] {
        return this.readEntries().slice(-limit).reverse();
    }

    clear() {
        safeLocalStorageRemove(STORAGE_KEY);
    }

    exportJson(): string {
        return JSON.stringify(this.readEntries(), null, 2);
    }
}

export const auditLog = new AuditLogService();
