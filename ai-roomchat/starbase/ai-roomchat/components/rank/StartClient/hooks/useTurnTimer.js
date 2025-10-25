import { useEffect } from 'react';

// useTurnTimer2: clean, minimal countdown hook used by StartClient.
// Inputs:
// - turnDeadline: number | null (milliseconds since epoch)
// - setTimeRemaining: (seconds | null) => void
export default function useTurnTimer2(turnDeadline, setTimeRemaining) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (typeof setTimeRemaining !== 'function') return undefined;

    if (!turnDeadline) {
      try {
        setTimeRemaining(null);
      } catch {
        // ignore
      }
      return undefined;
    }

    const tick = () => {
      try {
        const remaining = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
        setTimeRemaining(remaining);
      } catch {
        setTimeRemaining(null);
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [turnDeadline, setTimeRemaining]);
}
