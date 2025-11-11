import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';

/**
 * Tracks the Supabase session token and exposes a refresh helper.
 * Centralises error handling so callers don't have to request the session repeatedly.
 */
export function useSupabaseSessionToken() {
  const [state, setState] = useState({ token: null, user: null, loading: true, error: null });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyState = useCallback((next) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...next }));
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        applyState({ token: null, user: null, error, loading: false });
        return null;
      }
      const token = data?.session?.access_token || null;
      const user = data?.session?.user || null;
      applyState({ token, user, error: null, loading: false });
      return token;
    } catch (error) {
      applyState({ token: null, user: null, error, loading: false });
      return null;
    }
  }, [applyState]);

  useEffect(() => {
    refresh();
    const handler = supabase.auth.onAuthStateChange?.((_event, session) => {
      applyState({ token: session?.access_token || null, user: session?.user || null, loading: false, error: null });
    });
    return () => handler?.data?.subscription?.unsubscribe?.();
  }, [refresh, applyState]);

  return {
    token: state.token,
    user: state.user,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
