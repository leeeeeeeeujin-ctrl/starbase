import { useEffect, useState } from 'react';

const MATCHING_INCREMENT = 8;
const MATCHING_INTERVAL = 280;
const MATCHING_READY_DELAY = 350;

export function useOverlaySteps(open) {
  const [step, setStep] = useState('preview');
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setStep('preview');
    setProgress(0);
  };

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open]);

  useEffect(() => {
    if (!open || step !== 'matching') return;

    setProgress(0);
    let cancelled = false;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (cancelled || prev >= 100) return prev;
        const next = Math.min(100, prev + MATCHING_INCREMENT);
        if (next === 100) {
          setTimeout(() => {
            if (!cancelled) setStep('ready');
          }, MATCHING_READY_DELAY);
        }
        return next;
      });
    }, MATCHING_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, step]);

  return { step, setStep, progress, reset };
}

//
