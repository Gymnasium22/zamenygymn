import { supabase } from '../supabase';
import { AuditLogEntry } from '../../types';

export const supabaseAuditLogService = {
    log: async (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> => {
        const { error } = await supabase.from('audit_log').insert({
            user_id: entry.userId || null,
            user_email: entry.userEmail || null,
            action: entry.action,
            collection: entry.collection || null,
            target_id: entry.targetId || null,
            details: entry.details || null,
            organization_id: entry.organizationId
        });
        if (error) throw error;
    },

    getAll: async (): Promise<AuditLogEntry[]> => {
        const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map((a: Record<string, unknown>) => ({
            id: a.id as string,
            userId: (a.user_id as string) || undefined,
            userEmail: (a.user_email as string) || undefined,
            action: a.action as string,
            collection: (a.collection as string) || undefined,
            targetId: (a.target_id as string) || undefined,
            details: (a.details as Record<string, unknown>) || undefined,
            timestamp: a.created_at as string,
            organizationId: a.organization_id as string
        }));
    }
};
