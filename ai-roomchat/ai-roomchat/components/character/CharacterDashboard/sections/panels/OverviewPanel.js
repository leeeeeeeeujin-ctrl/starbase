import React from 'react';

import { useCharacterDashboardContext } from '../../context';
import HeroProfileCard from '../left/HeroProfileCard';

const styles = {
  panel: {
    display: 'grid',
    gap: 24,
  },
  descriptionCard: {
    borderRadius: 28,
    border: '1px solid rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.82)',
    padding: 24,
    display: 'grid',
    gap: 18,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
  },
  description: {
    margin: 0,
    lineHeight: 1.7,
    color: '#cbd5f5',
    whiteSpace: 'pre-line',
  },
  abilityGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  },
  abilityCard: {
    borderRadius: 22,
    padding: 18,
    background: 'rgba(30, 41, 59, 0.75)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    minHeight: 120,
    display: 'grid',
    gap: 8,
  },
  abilityLabel: {
    fontSize: 13,
    color: '#94a3b8',
    letterSpacing: 0.2,
  },
  abilityValue: {
    fontSize: 16,
    fontWeight: 600,
    color: '#f8fafc',
  },
};

export default function OverviewPanel() {
  const {
    hero,
    heroName,
    edit,
    abilityCards,
    openEditPanel,
    saving,
    onSave,
    onDelete,
    audioSource,
    bgmDuration,
  } = useCharacterDashboardContext();

  const description = edit?.description || hero?.description || '설명이 입력되지 않았습니다.';

  return (
    <div style={styles.panel}>
      <HeroProfileCard
        hero={hero}
        heroName={heroName}
        onOpenEdit={openEditPanel}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
        audioSource={audioSource}
        bgmDuration={bgmDuration}
      />

      <section style={styles.descriptionCard}>
        <h2 style={styles.sectionTitle}>설명</h2>
        <p style={styles.description}>{description}</p>
        <div>
          <h3 style={{ ...styles.sectionTitle, fontSize: 18 }}>능력</h3>
          <div style={styles.abilityGrid}>
            {abilityCards.map(ability => (
              <div key={ability.key} style={styles.abilityCard}>
                <span style={styles.abilityLabel}>{ability.label}</span>
                <span style={styles.abilityValue}>{ability.value ? ability.value : '미입력'}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
