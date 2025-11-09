import React from 'react';
import EditorMonaco from './EditorMonaco.jsx';

export default function MonacoJsonEditor({ value, onChange, style }) {
  return (
    <div style={{ height: '100%', width: '100%', ...(style||{}) }}>
      <EditorMonaco value={value} onChange={onChange} language="json" />
    </div>
  );
}

