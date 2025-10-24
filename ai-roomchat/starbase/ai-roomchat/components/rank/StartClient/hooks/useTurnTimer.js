import { useEffect } from 'react';

export default function useTurnTimer(turnDeadline, setTimeRemaining) {
  useEffect(() => {
    if (!turnDeadline || !setTimeRemaining) return undefined;

    const tick = () => {
      try {
        const deadline = new Date(turnDeadline).getTime();
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setTimeRemaining(remaining);
      } catch {
        // ignore invalid dates
        setTimeRemaining(null);
      }
    };

    // initial tick
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [turnDeadline, setTimeRemaining]);
}
import { useEffect } from 'react';

// useTurnTimer: 중앙 타이머 로직을 분리합니다.
// inputs:
// - turnDeadline: number | null (ms)
// - setTimeRemaining: (value) => void
export default function useTurnTimer(turnDeadline, setTimeRemaining) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!turnDeadline) {
      setTimeRemaining(null);
      return undefined;
    }

    const tick = () => {
      const diff = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
      setTimeRemaining(diff);
    };

    tick();

    const timerId = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [turnDeadline, setTimeRemaining]);
}
