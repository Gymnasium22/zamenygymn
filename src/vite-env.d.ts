// Fix: Manually define types for Vite environment variables (`import.meta.env`).
// The default `/// <reference types="vite/client" />` was causing a "Cannot find type definition" error.
// This workaround provides the necessary types directly, resolving errors when accessing `import.meta.env`.
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'firebase/app' {
  export function initializeApp(config: any): any;
  export function getApps(): any[];
  export function getApp(name?: string): any;
}

declare module 'firebase/auth' {
  export function getAuth(app?: any): any;
  export function onAuthStateChanged(auth: any, observer: (user: User | null) => void): any;
  export function signOut(auth: any): Promise<void>;
  export function signInWithEmailAndPassword(auth: any, email: string, password: string): Promise<any>;
  export interface User {
      email: string | null;
      uid: string;
  }
}
