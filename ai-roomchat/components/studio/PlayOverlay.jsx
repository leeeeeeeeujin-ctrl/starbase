"use client";

import { useMemo } from 'react';
import { useStudioTemplate } from '../../contexts/StudioStore';
import MobileTextBattlePlayer from '../battle/MobileTextBattlePlayer.jsx';
import { buildBattleDefinitionFromGraph } from '../../lib/battle/definition.js';

export default function PlayOverlay({ onClose }) {
  const { templateText } = useStudioTemplate();

  const battleDefinition = useMemo(() => {
    try {
      const parsed = JSON.parse(templateText || '{}');
      return buildBattleDefinitionFromGraph({
        setInfo: {
          id: parsed?.id || '',
          name: parsed?.name || parsed?.title || '스튜디오 배틀',
          description: parsed?.description || '',
        },
        nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
        edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
      });
    } catch {
      return null;
    }
  }, [templateText]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#e2e8f0',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1001 }}>
        <button onClick={onClose} style={{ padding: '8px 12px' }}>
          닫기
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '56px 16px 24px' }}>
        <MobileTextBattlePlayer definition={battleDefinition} />
      </div>
    </div>
  );
}
