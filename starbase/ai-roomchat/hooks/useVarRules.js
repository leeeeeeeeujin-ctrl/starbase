// hooks/useVarRules.js
import { useCallback, useState } from 'react';
import { sanitizeVarRules, isSameVarRules } from '../lib/varRulesModel';

/** 전역/로컬 규칙을 동일 방식으로 다루기 위한 편의 훅 */
export function useVarRules(initial = []) {
  const [rules, setRules] = useState(sanitizeVarRules(initial));

  const set = useCallback(next => {
    const clean = sanitizeVarRules(next);
    setRules(prev => (isSameVarRules(prev, clean) ? prev : clean));
  }, []);

  return { rules, setRules: set };
}
