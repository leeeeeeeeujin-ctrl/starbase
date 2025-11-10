import { useCallback, useEffect, useRef, useState } from 'react';

function resolveInitial(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

/**
 * Small helper to keep a piece of state in sync with localStorage.
 * Accepts custom serializer/deserializer so we can store simple strings as needed.
 */
export function usePersistentState(key, initialValue, options = {}) {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
  } = options;
  const keyRef = useRef(key);

  const readValue = useCallback(() => {
    if (typeof window === 'undefined') {
      return resolveInitial(initialValue);
    }
    try {
      const stored = window.localStorage.getItem(key);
      if (stored == null) return resolveInitial(initialValue);
      return deserializer(stored);
    } catch {
      return resolveInitial(initialValue);
    }
  }, [key, initialValue, deserializer]);

  const [value, setValue] = useState(readValue);

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(keyRef.current, serializer(value));
    } catch {
      // ignore write failures (e.g., storage quota)
    }
  }, [value, serializer]);

  return [value, setValue];
}
