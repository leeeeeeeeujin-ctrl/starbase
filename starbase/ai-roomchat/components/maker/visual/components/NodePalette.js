import React from 'react';
import { NODE_TYPES, NODE_CATEGORIES } from '../constants.js';

const NodePalette = ({
  activeCategory,
  onCategoryChange,
  onDragStart,
  isMobile,
  deviceTier,
  mobileOptimized,
}) => {
  return (
    <div
      style={{
        width: isMobile ? '100%' : '280px',
        background: 'rgba(15, 23, 42, 0.9)',
        borderRight: isMobile ? 'none' : '2px solid rgba(255,255,255,0.1)',
        borderBottom: isMobile ? '2px solid rgba(255,255,255,0.1)' : 'none',
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        maxHeight: isMobile ? '120px' : 'none',
        overflowX: isMobile ? 'auto' : 'visible',
        overflowY: isMobile ? 'hidden' : 'auto',
      }}
    >
      {/* 카테고리 탭 */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          padding: 8,
          gap: 4,
          borderBottom: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)',
          borderRight: isMobile ? '1px solid rgba(255,255,255,0.1)' : 'none',
          minWidth: isMobile ? '100px' : 'auto',
        }}
      >
        {NODE_CATEGORIES.map(category => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            style={{
              background: activeCategory === category.id ? category.color : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 6,
              color: '#ffffff',
              padding: isMobile ? '6px' : '8px 12px',
              cursor: 'pointer',
              fontSize: isMobile ? 10 : 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
              flex: isMobile ? '0 0 auto' : 'none',
            }}
          >
            <span>{category.icon}</span>
            {!isMobile && <span>{category.label}</span>}
          </button>
        ))}
      </div>

      {/* 노드 목록 */}
      <div
        style={{
          flex: 1,
          padding: 8,
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          gap: 6,
          overflowX: isMobile ? 'auto' : 'visible',
          overflowY: isMobile ? 'hidden' : 'auto',
        }}
      >
        {Object.entries(NODE_TYPES[activeCategory.toUpperCase()] || {}).map(([key, nodeType]) => (
          <div
            key={key}
            draggable
            onDragStart={e => onDragStart(e, key)}
            style={{
              background: `linear-gradient(135deg, ${nodeType.color}dd, ${nodeType.color}aa)`,
              border: '2px solid rgba(255,255,255,0.3)',
              borderRadius: 8,
              padding: isMobile ? '6px 8px' : '8px 12px',
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: mobileOptimized.fontSize - 2,
              fontWeight: 600,
              color: '#ffffff',
              transition: deviceTier === 'high' ? 'all 0.2s ease' : 'none',
              minWidth: isMobile ? '120px' : 'auto',
              flexShrink: 0,
            }}
            onMouseDown={e => (e.currentTarget.style.cursor = 'grabbing')}
            onMouseUp={e => (e.currentTarget.style.cursor = 'grab')}
          >
            <span style={{ fontSize: mobileOptimized.fontSize }}>{nodeType.icon}</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {nodeType.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NodePalette;
