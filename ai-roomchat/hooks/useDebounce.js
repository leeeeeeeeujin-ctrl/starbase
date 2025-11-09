import { useRef, useEffect } from 'react';

export function useDebouncedCallback(fn, delay = 200) {
  const ref = useRef();
  useEffect(() => {
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);

  return (...args) => {
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => {
      try {
        fn(...args);
      } catch (e) {
        // swallow
      }
    }, delay);
  };
}
