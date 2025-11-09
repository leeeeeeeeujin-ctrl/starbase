// lib/variables.js
// 변수 유형 정의 + 규칙 텍스트 빌더

export const VariableTypes = {
  MANUAL: 'manual', // [조건] 만족 시 둘째줄에 변수명 출력
  ACTIVE: 'active', // 변수명이 활성 상태면 규칙 텍스트 추가
};

export function buildManualVarLine({ name, instruction, scope }) {
  if (!name) return '';
  return `- ${scope} 변수 ${name}: ${instruction} → 만족 시 응답 둘째 줄에 "${name}"`;
}

export function buildActiveVarLine({ name, ruleText, scope }, activeNames) {
  if (!name || !ruleText) return '';
  if (!activeNames.includes(name)) return '';
  return `- [${scope}:${name}] 규칙: ${ruleText}`;
}

export function compileVariables({
  manualGlobal = [],
  manualLocal = [],
  activeGlobal = [],
  activeLocal = [],
  activeGlobalNames = [],
  activeLocalNames = [],
}) {
  const lines = [];
  manualGlobal.forEach(v => lines.push(buildManualVarLine({ ...v, scope: '전역' })));
  manualLocal.forEach(v => lines.push(buildManualVarLine({ ...v, scope: '로컬' })));
  activeGlobal.forEach(v =>
    lines.push(buildActiveVarLine({ ...v, scope: '전역' }, activeGlobalNames))
  );
  activeLocal.forEach(v =>
    lines.push(buildActiveVarLine({ ...v, scope: '로컬' }, activeLocalNames))
  );
  return lines.join('\n');
}
