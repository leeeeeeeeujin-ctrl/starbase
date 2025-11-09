let admin = null;
export function getSupabaseAdmin() {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    // Lazy require to avoid bundling issues if not installed in some envs
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { createClient } = require('@supabase/supabase-js');
    admin = createClient(url, key, { auth: { persistSession: false } });
    return admin;
  } catch (e) {
    return null;
  }
}

