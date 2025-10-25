/**
 * @jest-environment jsdom
 */

import React from 'react';
import TestRenderer from 'react-test-renderer';

import RosterPanel from '@/components/rank/StartClient/RosterPanel';

const baseParticipants = [
  {
    id: 'seat-1',
    owner_id: 'owner-1',
    role: '전략가',
    status: 'active',
    score: 1200,
    battles: 10,
    win_rate: 0.6,
    hero: {
      id: 'hero-1',
      name: '알파',
      image_url: 'https://example.com/alpha.png',
      ability1: '창공 베기',
      ability2: '수호의 장막',
      description: '용맹한 전략가',
    },
  },
  {
    id: 'seat-2',
    owner_id: 'owner-2',
    role: '지원가',
    status: 'pending',
    score: 980,
    battles: 8,
    win_rate: 0.45,
    hero: {
      id: 'hero-2',
      name: '베타',
      ability1: '치유의 빛',
    },
  },
];

function collectText(node) {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) {
    return node.flatMap(collectText);
  }
  const children = Array.isArray(node.children)
    ? node.children
    : node.children
      ? [node.children]
      : [];
  return children.flatMap(collectText);
}

describe('RosterPanel visibility controls', () => {
  it('masks roster details for unauthorized viewers when details are hidden', () => {
    const renderer = TestRenderer.create(
      <RosterPanel
        participants={baseParticipants}
        realtimePresence={null}
        dropInSnapshot={null}
        showDetails={false}
        viewerOwnerId=""
        normalizedHostRole="전략가"
        normalizedViewerRole="탐험가"
      />
    );

    const textContent = collectText(renderer.toJSON()).join(' ');
    const normalized = textContent.replace(/\s+/g, ' ').trim();

    expect(normalized).toContain('비공개 참가자');
    expect(normalized).toContain('점수 숨김');
    expect(normalized).toContain('승률 숨김');
    expect(normalized).toContain('상세 능력 정보는 현재 비공개 상태입니다.');
    expect(normalized).not.toContain('창공 베기');
    expect(normalized).not.toContain('용맹한 전략가');
  });

  it('reveals full roster details when visibility is enabled', () => {
    const renderer = TestRenderer.create(
      <RosterPanel
        participants={baseParticipants}
        realtimePresence={null}
        dropInSnapshot={{ turn: 3, roles: [] }}
        showDetails
        viewerOwnerId=""
        normalizedHostRole="전략가"
        normalizedViewerRole="전략가"
      />
    );

    const textContent = collectText(renderer.toJSON()).join(' ');
    const normalized = textContent.replace(/\s+/g, ' ').trim();

    expect(normalized).toContain('알파');
    expect(normalized).toContain('점수 1200');
    expect(normalized).toContain('승률 60%');
    expect(normalized).toContain('창공 베기');
    expect(normalized).toContain('용맹한 전략가');
  });

  it('shows viewer seat details even when roster details are hidden globally', () => {
    const renderer = TestRenderer.create(
      <RosterPanel
        participants={baseParticipants}
        realtimePresence={null}
        dropInSnapshot={null}
        showDetails={false}
        viewerOwnerId="owner-1"
        normalizedHostRole="전략가"
        normalizedViewerRole="전략가"
      />
    );

    const textContent = collectText(renderer.toJSON()).join(' ');
    const normalized = textContent.replace(/\s+/g, ' ').trim();

    expect(normalized).toContain('알파');
    expect(normalized).toContain('점수 1200');
    expect(normalized).toContain('승률 60%');
    expect(normalized).toContain('내 좌석');
  });
});
