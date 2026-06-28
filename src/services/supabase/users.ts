import { supabase } from '../supabase';
import { UserProfile, UserRole, Permission, PageId } from '../../types';
import { getRoleDefaults } from '../users';

export const supabaseUsersService = {
    subscribe: (uid: string, onNext: (profile: UserProfile | null) => void, onError?: (error: Error) => void) => {
        const channelName = `profiles_changes_${uid}_${Date.now()}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
                (payload) => {
                    const data = payload.new as Record<string, unknown>;
                    if (!data) {
                        onNext(null);
                        return;
                    }
                    onNext(mapProfile(data));
                }
            )
            .subscribe();

        // Initial fetch
        supabaseUsersService.getById(uid).then(onNext).catch(onError);

        return () => {
            supabase.removeChannel(channel);
        };
    },

    getAll: async (): Promise<UserProfile[]> => {
        const { data, error } = await supabase.from('profiles').select('*').order('display_name');
        if (error) throw error;
        return (data || []).map(mapProfile);
    },

    getById: async (uid: string): Promise<UserProfile | null> => {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }
        return data ? mapProfile(data) : null;
    },

    create: async (params: {
        email: string;
        password: string;
        displayName: string;
        firstName?: string;
        role: UserRole;
        permissions?: Permission[];
        allowedPages?: PageId[];
        teacherId?: string;
        organizationId?: string;
        createdBy?: string;
    }): Promise<UserProfile> => {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_auth_user', {
            p_email: params.email,
            p_password: params.password
        });
        if (rpcError || !rpcData) throw rpcError || new Error('Failed to create user');

        const newUserId = rpcData as string;
        const defaults = getRoleDefaults(params.role);
        const profile = {
            id: newUserId,
            email: params.email,
            display_name: params.displayName,
            first_name: params.firstName || '',
            role: params.role,
            is_active: true,
            permissions: params.permissions ?? defaults.defaultPermissions,
            allowed_pages: params.allowedPages ?? defaults.defaultPages,
            teacher_id: params.teacherId || null,
            organization_id: params.organizationId || null
        };

        const { error } = await supabase.from('profiles').insert(profile);
        if (error) throw error;

        return {
            id: newUserId,
            email: params.email,
            displayName: params.displayName,
            firstName: params.firstName || '',
            role: params.role,
            isActive: true,
            permissions: params.permissions ?? defaults.defaultPermissions,
            allowedPages: params.allowedPages ?? defaults.defaultPages,
            teacherId: params.teacherId
        };
    },

    update: async (
        uid: string,
        changes: Partial<Omit<UserProfile, 'id' | 'email'>> & { password?: string; firstName?: string }
    ): Promise<void> => {
        const updates: Record<string, unknown> = {};
        if (changes.displayName !== undefined) updates.display_name = changes.displayName;
        if (changes.firstName !== undefined) updates.first_name = changes.firstName;
        if (changes.role !== undefined) updates.role = changes.role;
        if (changes.isActive !== undefined) updates.is_active = changes.isActive;
        if (changes.permissions !== undefined) updates.permissions = changes.permissions;
        if (changes.allowedPages !== undefined) updates.allowed_pages = changes.allowedPages;
        if (changes.teacherId !== undefined) updates.teacher_id = changes.teacherId || null;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('profiles').update(updates).eq('id', uid);
        if (error) throw error;

        if (changes.password) {
            const { error: pwdError } = await supabase.rpc('update_auth_password', {
                p_user_id: uid,
                p_password: changes.password
            });
            if (pwdError) throw pwdError;
        }
    },

    delete: async (uid: string): Promise<void> => {
        const { error } = await supabase.from('profiles').delete().eq('id', uid);
        if (error) throw error;

        const { error: authError } = await supabase.rpc('delete_auth_user', {
            p_user_id: uid
        });
        if (authError) throw authError;
    },

    setActive: async (uid: string, isActive: boolean): Promise<void> => {
        const { error } = await supabase.from('profiles').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', uid);
        if (error) throw error;
    },

    updateLastLogin: async (): Promise<void> => {
        return Promise.resolve();
    }
};

function mapProfile(data: Record<string, unknown>): UserProfile {
    const role = data.role as UserRole;
    const defaults = getRoleDefaults(role);
    return {
        id: data.id as string,
        email: data.email as string,
        displayName: data.display_name as string,
        firstName: (data.first_name as string) || '',
        role,
        isActive: (data.is_active as boolean) !== false,
        permissions: ((data.permissions as string[])?.length ? (data.permissions as Permission[]) : defaults.defaultPermissions) || [],
        allowedPages: ((data.allowed_pages as string[])?.length ? (data.allowed_pages as PageId[]) : defaults.defaultPages) || [],
        teacherId: (data.teacher_id as string) || undefined,
        createdAt: data.created_at as string,
        createdBy: undefined,
        lastLoginAt: undefined
    };
}
