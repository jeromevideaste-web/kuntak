import { createDemoBackend } from './demoBackend';
import { createSupabaseBackend } from './supabaseBackend';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Sans configuration Supabase, l'application démarre en mode démo.
export const backend = url && anonKey ? createSupabaseBackend(url, anonKey) : createDemoBackend();
