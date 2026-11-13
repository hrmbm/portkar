import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const configured = SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR-PROJECT') &&
  SUPABASE_PUBLISHABLE_KEY.length > 30 &&
  !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE');

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;
export const isConfigured = configured;

export function requireSupabase() {
  if (!supabase) throw new Error('Konfigurasi Supabase belum diisi.');
  return supabase;
}
