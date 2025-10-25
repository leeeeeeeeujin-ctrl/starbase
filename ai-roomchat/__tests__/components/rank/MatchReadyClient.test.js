/**
 * @jest-environment jsdom
 */

import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('@/components/rank/MatchReadyClient.module.css', () => ({}), { virtual: true });

jest.mock('@/modules/rank/matchRealtimeSync', () => ({
  loadMatchFlowSnapshot: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('@/lib/rank/readyCheckClient', () => ({
  requestMatchReadySignal: jest.fn(() => Promise.resolve({ readyCheck: null })),
}));

jest.mock('@/lib/debugCollector', () => ({
  addDebugEvent: jest.fn(),
}));

import MatchReadyClient from '@/components/rank/MatchReadyClient';
import {
  clearGameMatchData,
  setGameMatchHeroSelection,
  setGameMatchParticipation,
  setGameMatchSessionMeta,
  setGameMatchSlotTemplate,
  setGameMatchSnapshot,
} from '@/modules/rank/matchDataStore';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

const mockAuthSnapshot = { userId: 'user-1', ownerId: 'owner-1', heroId: 'hero-77' };

jest.mock('@/lib/rank/rankAuthStorage', () => ({
  readRankAuthSnapshot: jest.fn(() => mockAuthSnapshot),
  createEmptyRankAuthSnapshot: jest.fn(() => ({ userId: '', ownerId: '', heroId: '' })),
}));

jest.mock('@/lib/rank/keyringStorage', () => ({
  readRankKeyringSnapshot: jest.fn(() => ({ entries: [], updatedAt: Date.now() })),
  createEmptyRankKeyringSnapshot: jest.fn(() => ({})),
  hasActiveKeyInSnapshot: jest.fn(() => true),
}));

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((message = '', ...args) => {
    if (typeof message === 'string' && message.includes('act(')) {
      return;
    }
    originalConsoleError.call(console, message, ...args);
  });
  jest.spyOn(console, 'warn').mockImplementation((message = '', ...args) => {
    if (typeof message === 'string' && message.includes('act(')) {
      return;
    }
    originalConsoleWarn.call(console, message, ...args);
  });
});

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

function seedMatchData(gameId) {
  clearGameMatchData(gameId);

  setGameMatchSnapshot(gameId, {
    match: {
      matchCode: 'ROOM-ABCD',
      matchType: 'standard',
      assignments: [],
      rooms: [
        {
          id: 'room-1',
          code: 'ROOM-1',
          mode: '랭크',
          realtimeMode: 'standard',
          blindMode: false,
        },
      ],
    },
    mode: '랭크',
    viewerId: 'user-1',
    role: '전략가',
  });

  setGameMatchSlotTemplate(gameId, {
    version: 1,
    source: 'seed',
    updatedAt: Date.now(),
    slots: [
      {
        slotIndex: 0,
        role: '전략가',
        active: true,
      },
    ],
    roles: [
      {
        role: '전략가',
        slots: 1,
      },
    ],
  });

  setGameMatchParticipation(gameId, {
    roster: [
      {
        slotIndex: 0,
        role: '전략가',
        ownerId: 'owner-1',
        heroId: 'hero-1',
        heroName: '알파',
        ready: true,
      },
    ],
    participantPool: [],
    heroOptions: [],
    heroMap: {},
    realtimeMode: 'standard',
    hostOwnerId: 'owner-1',
  });

  setGameMatchHeroSelection(gameId, {
    heroId: 'hero-1',
    viewerId: 'user-1',
    ownerId: 'owner-1',
    role: '전략가',
  });

  const now = Date.now();
  setGameMatchSessionMeta(gameId, {
    turnTimer: {
      baseSeconds: 60,
      source: 'seed',
      updatedAt: now,
    },
    vote: {
      turnTimer: {
        selections: { 60: 2 },
        voters: { 'user-1': 60 },
        updatedAt: now,
      },
    },
    source: 'seed',
  });
}

function extractText(renderer) {
  const tree = renderer.toJSON();
  return collectText(tree).join(' ').replace(/\s+/g, ' ').trim();
}

describe('MatchReadyClient store integration', () => {
  const gameId = 'match-ready-test';

  beforeEach(() => {
    act(() => {
      seedMatchData(gameId);
    });
  });

  afterEach(() => {
    if (console.error && typeof console.error.mockRestore === 'function') {
      console.error.mockRestore();
    }
    if (console.warn && typeof console.warn.mockRestore === 'function') {
      console.warn.mockRestore();
    }
    clearGameMatchData(gameId);
  });

  it('refreshes the applied turn timer when session meta updates in the store', async () => {
    let renderer;

    await act(async () => {
      renderer = create(<MatchReadyClient gameId={gameId} />);
      await Promise.resolve();
    });

    const initialText = extractText(renderer);
    expect(initialText).toContain('현재 적용된 제한시간: 1분');

    await act(async () => {
      const updatedAt = Date.now();
      setGameMatchSessionMeta(gameId, {
        turnTimer: {
          baseSeconds: 120,
          source: 'store-update',
          updatedAt,
        },
        vote: {
          turnTimer: {
            selections: { 120: 3, 60: 1 },
            voters: { 'user-1': 120 },
            updatedAt,
          },
        },
        source: 'store-update',
      });
      await Promise.resolve();
    });

    const updatedText = extractText(renderer);
    expect(updatedText).toContain('현재 적용된 제한시간: 2분');
    expect(updatedText).toContain('2분 3표');
  });

  it('shows a waiting hint when the ready check is pending', async () => {
    const now = Date.now();
    await act(async () => {
      setGameMatchSessionMeta(gameId, {
        extras: {
          readyCheck: {
            status: 'pending',
            windowSeconds: 15,
            startedAtMs: now,
            expiresAtMs: now + 15000,
            readyOwnerIds: ['owner-1'],
            missingOwnerIds: ['owner-2'],
            readyCount: 1,
            totalCount: 2,
          },
        },
      });
    });

    let renderer;
    await act(async () => {
      renderer = create(<MatchReadyClient gameId={gameId} />);
      await Promise.resolve();
    });

    const text = extractText(renderer);
    expect(text).toContain('다른 참가자를 기다리는 중');
  });

  it('opens diagnostics panel when the toggle button is clicked', async () => {
    let renderer;

    await act(async () => {
      renderer = create(<MatchReadyClient gameId={gameId} />);
      await Promise.resolve();
    });

    const toggleButtons = renderer.root.findAll(
      node => node.type === 'button' && node.props.children === '디버그 보기'
    );
    expect(toggleButtons.length).toBeGreaterThan(0);

    expect(renderer.root.findAllByProps({ 'data-testid': 'match-ready-diagnostics' }).length).toBe(
      0
    );

    await act(async () => {
      toggleButtons[0].props.onClick();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({ 'data-testid': 'match-ready-diagnostics' }).length).toBe(
      1
    );
  });
});
