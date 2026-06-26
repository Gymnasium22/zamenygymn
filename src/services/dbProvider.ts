const DB_PROVIDER = import.meta.env.VITE_DB_PROVIDER || 'firebase';

export const isSupabase = DB_PROVIDER === 'supabase';
export const isFirebase = DB_PROVIDER === 'firebase';
