import { useMemo, useState } from 'react';
import { ConditionParameterFields } from './conditions/ConditionParameterFields';
import { CONDITION_DEFINITIONS } from './conditions/definitions';
import { buildEdgeLabel } from './conditions/edgeLabels';

export default function ConditionBuilder({ selectedEdge, setEdges, pushToForm }) {
  const [typeIdx, setTypeIdx] = useState(0);
  const [values, setValues] = useState({});

  const definition = useMemo(
    () => CONDITION_DEFINITIONS[typeIdx] ?? CONDITION_DEFINITIONS[0],
    [typeIdx]
  );

  function handleValueChange(key, value) {
    setValues(prev => ({ ...prev, [key]: value }));
  }

  function resetValues() {
    setValues({});
  }

  function addCondition() {
    if (!selectedEdge) return;
    const json = definition.toJSON(values);

    setEdges(edges =>
      edges.map(edge => {
        if (edge.id !== selectedEdge.id) return edge;
        const previous = edge.data?.conditions || [];
        const conditions = [...previous, json];
        const data = { ...(edge.data || {}), conditions };
        return { ...edge, data, label: buildEdgeLabel(data) };
      })
    );

    if (pushToForm) pushToForm(json);
    resetValues();
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 700 }}>조건 만들기</div>

      <select
        value={String(typeIdx)}
        onChange={event => {
          setTypeIdx(Number(event.target.value));
          resetValues();
        }}
      >
        {CONDITION_DEFINITIONS.map((def, index) => (
          <option key={def.type} value={index}>
            {def.label}
          </option>
        ))}
      </select>

      <ConditionParameterFields
        definition={definition}
        values={values}
        onChange={handleValueChange}
      />

      <button
        type="button"
        onClick={addCondition}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: '#111827',
          color: '#fff',
          fontWeight: 700,
        }}
      >
        조건 추가
      </button>
    </div>
  );
}
