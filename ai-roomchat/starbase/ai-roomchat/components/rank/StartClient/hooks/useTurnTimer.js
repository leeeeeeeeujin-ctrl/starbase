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
