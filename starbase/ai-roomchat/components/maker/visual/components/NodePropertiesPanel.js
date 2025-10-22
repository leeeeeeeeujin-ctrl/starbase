import React, { useState } from 'react';

const NodePropertiesPanel = ({ node, onNodeUpdate, onClose, isMobile }) => {
  const [parameters, setParameters] = useState(node.data.parameters || {});
  
  const updateParameter = (key, value) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    
    const updatedNode = {
      ...node,
      data: {
        ...node.data,
        parameters: newParameters
      }
    };
    
    onNodeUpdate(updatedNode);
  };
  
  return (
    <div style={{
      position: isMobile ? 'fixed' : 'absolute',
      top: isMobile ? '50%' : '20px',
      right: isMobile ? '50%' : '20px',
      transform: isMobile ? 'translate(50%, -50%)' : 'none',
      width: isMobile ? '90%' : '250px',
      maxWidth: isMobile ? '350px' : 'none',
      background: 'rgba(15, 23, 42, 0.95)',
      border: '2px solid rgba(255,255,255,0.2)',
      borderRadius: 12,
      padding: 16,
      zIndex: 1001,
      boxShadow: '0 15px 35px -5px rgba(0,0,0,0.5)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <h4 style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 16,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span>{node.data.icon}</span>
          <span>{node.data.label}</span>
        </h4>
        
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 6,
            color: '#ffffff',
            width: 24,
            height: 24,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14
          }}
        >
          ×
        </button>
      </div>
      
      {Object.entries(parameters).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block',
            color: '#e2e8f0',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 6
          }}>
            {key}
          </label>
          
          <input
            type={typeof value === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => updateParameter(
              key, 
              typeof value === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
            )}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: '#ffffff',
              padding: '8px 12px',
              fontSize: 14
            }}
          />
        </div>
      ))}
      
      {Object.keys(parameters).length === 0 && (
        <div style={{
          color: '#64748b',
          fontSize: 14,
          textAlign: 'center',
          fontStyle: 'italic'
        }}>
          이 노드에는 설정 가능한 매개변수가 없습니다.
        </div>
      )}
    </div>
  );
};

export default NodePropertiesPanel;
