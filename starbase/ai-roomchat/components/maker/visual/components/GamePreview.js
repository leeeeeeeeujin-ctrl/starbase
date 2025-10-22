import React from 'react';
import { NODE_CATEGORIES, NODE_TYPES } from '../constants.js';

const GamePreview = ({ nodes, generatedCode, isMobile }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      padding: 20,
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: 40,
        textAlign: 'center',
        maxWidth: isMobile ? '90%' : '500px'
      }}>
        <div style={{ fontSize: isMobile ? 48 : 64, marginBottom: 20 }}>🎮</div>
        <h3 style={{ 
          margin: 0, 
          color: '#ffffff', 
          fontSize: isMobile ? 18 : 24,
          marginBottom: 15 
        }}>
          게임 미리보기
        </h3>
        <p style={{ 
          color: '#cbd5e1', 
          fontSize: isMobile ? 14 : 16,
          marginBottom: 20,
          lineHeight: 1.6
        }}>
          현재 {nodes.length}개의 노드로 구성된 게임 로직이 있습니다.
          실제 게임 실행은 코드 생성 후 가능합니다.
        </p>
        
        {nodes.length > 0 && (
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 8,
            padding: 15,
            marginTop: 20
          }}>
            <h4 style={{ 
              color: '#22c55e', 
              fontSize: 14, 
              margin: '0 0 10px 0' 
            }}>
              노드 구성:
            </h4>
            {NODE_CATEGORIES.map(category => {
              const count = nodes.filter(node => 
                NODE_TYPES[category.id.toUpperCase()]?.[node.type]
              ).length;
              return count > 0 ? (
                <div key={category.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#e2e8f0',
                  fontSize: 12,
                  marginBottom: 4
                }}>
                  <span>{category.icon} {category.label}</span>
                  <span>{count}개</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GamePreview;
