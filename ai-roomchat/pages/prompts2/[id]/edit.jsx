import React from 'react';

export function SimpleEditor({ id }) {
  return (
    <div style={{ padding: 8 }}>
      <h3>SimpleEditor (placeholder)</h3>
      <p>Editing prompt: {id}</p>
      <textarea style={{ width: '100%', height: 200 }} defaultValue={`// prompt ${id}`} />
    </div>
  );
}

export default SimpleEditor;
