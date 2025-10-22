import React from 'react';

const CodeViewer = ({ code, onCodeChange, isMobile }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: 20,
      background: '#0f172a',
      color: '#f1f5f9',
      fontFamily: 'monospace',
      fontSize: isMobile ? 12 : 14,
      overflow: 'auto'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <h3 style={{ margin: 0, color: '#3b82f6' }}>생성된 코드</h3>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          style={{
            background: 'rgba(59, 130, 246, 0.2)',
            border: '1px solid #3b82f6',
            borderRadius: 6,
            color: '#3b82f6',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          📋 복사
        </button>
      </div>
      
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word'
      }}>
        {code}
      </pre>
    </div>
  );
};

export default CodeViewer;
