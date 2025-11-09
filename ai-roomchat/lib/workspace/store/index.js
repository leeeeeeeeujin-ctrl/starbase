import { memoryStore } from './memoryStore.js';
import { supabaseR2Store } from './supabaseR2Store.js';

export function getWorkspaceSetStore() {
  const useSupabase = process.env.USE_SUPABASE_R2 === '1';
  if (useSupabase) return supabaseR2Store();
  return memoryStore();
}

