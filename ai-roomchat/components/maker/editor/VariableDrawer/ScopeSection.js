import { useMemo } from 'react';

import {
  createActiveRule,
  createAutoRule,
  createManualRule,
  makeEmptyVariableRules,
} from '../../../../lib/variableRules';
import ModeSelector from './ModeSelector';
import AutoRuleList from './AutoRuleList';
import ManualRuleList from './ManualRuleList';
import ActiveRuleList from './ActiveRuleList';

function ScopeSection({
  scopeKey,
  label,
  rules,
  onCommit,
  availableNames = [],
  slotSuggestions = [],
  characterSuggestions = [],
}) {
  const safeRules = rules || makeEmptyVariableRules();
  const mode = safeRules.mode || 'auto';

  const suggestionTokens = useMemo(() => {
    const entries = [];
    const seen = new Set();

    slotSuggestions.forEach(item => {
      if (!item?.token) return;
      const token = String(item.token);
      if (seen.has(token)) return;
      seen.add(token);
      entries.push({ token, label: item.label || token });
    });

    characterSuggestions.forEach(name => {
      if (typeof name !== 'string') return;
      const token = name.trim();
      if (!token || seen.has(token)) return;
      seen.add(token);
      entries.push({ token, label: token });
    });

    return entries;
  }, [slotSuggestions, characterSuggestions]);

  const variableOptions = useMemo(() => {
    const options = new Set();
    availableNames.forEach(name => {
      if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed) {
          options.add(trimmed);
        }
      }
    });
    suggestionTokens.forEach(item => options.add(item.token));
    return Array.from(options);
  }, [availableNames, suggestionTokens]);

  const datalistId = `${scopeKey}-variable-names`;

  const appendToken = (value, token) => {
    if (!value) return token;
    if (value.includes(token)) return value;
    const needsSpace = value.length > 0 && !/\s$/.test(value);
    return `${value}${needsSpace ? ' ' : ''}${token}`;
  };

  const withCommit = updater => {
    if (typeof onCommit === 'function') {
      onCommit(updater);
    }
  };

  const setMode = nextMode => {
    if (nextMode === mode) return;
    withCommit(current => ({ ...current, mode: nextMode }));
  };

  const addAutoRule = () => {
    withCommit(current => ({ ...current, auto: [...current.auto, createAutoRule()] }));
  };

  const updateAutoRule = (index, patch) => {
    withCommit(current => ({
      ...current,
      auto: current.auto.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }));
  };

  const removeAutoRule = index => {
    withCommit(current => ({
      ...current,
      auto: current.auto.filter((_, idx) => idx !== index),
    }));
  };

  const addManualRule = () => {
    withCommit(current => ({ ...current, manual: [...current.manual, createManualRule()] }));
  };

  const updateManualRule = (index, patch) => {
    withCommit(current => ({
      ...current,
      manual: current.manual.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }));
  };

  const removeManualRule = index => {
    withCommit(current => ({
      ...current,
      manual: current.manual.filter((_, idx) => idx !== index),
    }));
  };

  const addActiveRule = () => {
    withCommit(current => ({ ...current, active: [...current.active, createActiveRule()] }));
  };

  const updateActiveRule = (index, patch) => {
    withCommit(current => ({
      ...current,
      active: current.active.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)),
    }));
  };

  const removeActiveRule = index => {
    withCommit(current => ({
      ...current,
      active: current.active.filter((_, idx) => idx !== index),
    }));
  };

  return (
    <div
      style={{
        border: '1px solid #cbd5f5',
        borderRadius: 16,
        background: '#ffffff',
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <datalist id={datalistId}>
        {variableOptions.map(option => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, color: '#0f172a' }}>{label}</span>
        <ModeSelector activeMode={mode} onSelect={setMode} />
      </div>
      {mode === 'auto' && (
        <AutoRuleList
          rules={safeRules.auto}
          datalistId={datalistId}
          onAdd={addAutoRule}
          onUpdate={updateAutoRule}
          onRemove={removeAutoRule}
          suggestions={suggestionTokens}
        />
      )}
      {mode === 'manual' && (
        <ManualRuleList
          rules={safeRules.manual}
          datalistId={datalistId}
          onAdd={addManualRule}
          onUpdate={updateManualRule}
          onRemove={removeManualRule}
          suggestions={suggestionTokens}
          appendToken={appendToken}
        />
      )}
      {mode === 'active' && (
        <ActiveRuleList
          rules={safeRules.active}
          onAdd={addActiveRule}
          onUpdate={updateActiveRule}
          onRemove={removeActiveRule}
          suggestions={suggestionTokens}
          appendToken={appendToken}
        />
      )}
    </div>
  );
}

export default ScopeSection;

//
