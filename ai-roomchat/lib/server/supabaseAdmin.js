// Minimal supabase admin shim used for builds/tests when no real Supabase is configured.
export function getSupabaseAdmin() {
  if (process.env.USE_SUPABASE_SETS !== '1') return null;
  // Return a very small stub with the chainable methods used by the codebase.
  const stub = {
    from(table) {
      return {
        async upsert(payload, opts) {
          return { error: null };
        },
        select() {
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle() {
          return { data: null, error: null };
        }
      };
    }
  };
  return stub;
}
