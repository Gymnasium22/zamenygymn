const DB_PROVIDER = import.meta.env.VITE_DB_PROVIDER || 'supabase';

console.log('[DB Provider] DB_PROVIDER:', DB_PROVIDER);

export const isSupabase = DB_PROVIDER === 'supabase';
export const isFirebase = DB_PROVIDER === 'firebase';
