import React from 'react';

export function ConditionParameterFields({ definition, values, onChange }) {
  if (!definition) return null;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {definition.params.map(param => {
        if (param.type === 'select') {
          return (
            <label key={param.key} style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#555' }}>{param.label}</span>
              <select
                value={values[param.key] ?? param.defaultValue ?? ''}
                onChange={event => onChange(param.key, event.target.value)}
              >
                {(param.options || []).map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={param.key} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#555' }}>{param.label}</span>
            <input
              type={param.type}
              step={param.step}
              min={param.min}
              max={param.max}
              placeholder={param.placeholder}
              value={values[param.key] ?? param.defaultValue ?? ''}
              onChange={event => onChange(param.key, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
