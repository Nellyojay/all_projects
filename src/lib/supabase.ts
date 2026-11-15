import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

function getSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before using Supabase.');
  }
  const client = createClient(supabaseUrl, supabasePublishableKey);
  return client;
}

export const supabase = getSupabaseClient();