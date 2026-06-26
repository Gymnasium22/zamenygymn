import { User } from 'firebase/auth';
import { auth as firebaseAuth } from './firebase';
import { supabase } from './supabase';
import { isSupabase } from './dbProvider';
import { usersService } from './users';
import { supabaseUsersService } from './supabase/users';
import { UserProfile } from '../types';

export interface AuthAdapter {
    getCurrentUser: () => User | { id: string; email: string | undefined } | null;
    onAuthStateChanged: (callback: (user: User | { id: string; email: string | undefined } | null) => void) => () => void;
    signIn: (email: string, password: string) => Promise<{ user: { id: string; email: string } | null; error: Error | null }>;
    signOut: () => Promise<void>;
    getUsersService: () => typeof usersService | typeof supabaseUsersService;
}

export const firebaseAdapter: AuthAdapter = {
    getCurrentUser: () => {
        return firebaseAuth?.currentUser || null;
    },
    onAuthStateChanged: (callback) => {
        if (!firebaseAuth) return () => {};
        const unsubscribe = firebaseAuth.onAuthStateChanged((user) => {
            callback(user);
        });
        return unsubscribe;
    },
    signIn: async (email, password) => {
        if (!firebaseAuth) return { user: null, error: new Error('Firebase not initialized') };
        try {
            const { signInWithEmailAndPassword } = await import('firebase/auth');
            const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
            return { user: { id: result.user.uid, email: result.user.email || '' }, error: null };
        } catch (error) {
            return { user: null, error: error as Error };
        }
    },
    signOut: async () => {
        if (!firebaseAuth) return;
        const { signOut } = await import('firebase/auth');
        await signOut(firebaseAuth);
    },
    getUsersService: () => usersService
};

export const supabaseAdapter: AuthAdapter = {
    getCurrentUser: () => {
        const user = supabase.auth.getUser();
        return user ? { id: user.data.user?.id || '', email: user.data.user?.email || '' } : null;
    },
    onAuthStateChanged: (callback) => {
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                callback({ id: session.user.id, email: session.user.email || '' });
            } else {
                callback(null);
            }
        });
        return data.subscription.unsubscribe;
    },
    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { user: null, error };
        return { user: data.user ? { id: data.user.id, email: data.user.email || '' } : null, error: null };
    },
    signOut: async () => {
        await supabase.auth.signOut();
    },
    getUsersService: () => supabaseUsersService
};

export const authAdapter = isSupabase ? supabaseAdapter : firebaseAdapter;
