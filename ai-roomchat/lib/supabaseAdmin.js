import { createClient } from '@supabase/supabase-js';

import { sanitizeSupabaseUrl } from './supabaseEnv';
import { createSupabaseAuthConfig } from './supabaseAuthConfig';

export { createSupabaseAuthConfig } from './supabaseAuthConfig';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY; // ⚠️ server-only

// Avoid throwing at module evaluation time so this module can be imported
// safely in environments where SUPABASE env vars are not provided (for
// example during local dev or in middleware/Edge bundling). If the envs are
// present we create a real client; otherwise we export a proxy that will
// raise a clear error when any property is accessed.
let supabaseAdmin;
if (url && key) {
  const serviceAuthConfig = createSupabaseAuthConfig(url, {
    apikey: key,
    authorization: `Bearer ${key}`,
  });

  supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { ...serviceAuthConfig.headers },
      fetch: serviceAuthConfig.fetch,
    },
  });
} else {
  // Create a throwing proxy so existing imports (e.g. `supabaseAdmin.from(...)`)
  // will still produce a helpful error, but only at the time of use instead
  // of during module import/compilation.
  const missingErr = new Error('Missing SUPABASE envs - set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE');
  const thrower = () => {
    throw missingErr;
  };

  supabaseAdmin = new Proxy({}, {
    get() {
      throw missingErr;
    },
    apply() {
      throw missingErr;
    },
    construct() {
      throw missingErr;
    },
  });
}

// Backwards-compatible named export expected by some modules
export { supabaseAdmin as supabase };
export { supabaseAdmin };
