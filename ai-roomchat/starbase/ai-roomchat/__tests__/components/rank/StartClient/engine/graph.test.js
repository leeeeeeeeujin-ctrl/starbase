import { pickNextEdge } from '@/components/rank/StartClient/engine/graph';

describe('pickNextEdge priority handling', () => {
  function makeContext(overrides = {}) {
    return {
      activeGlobalNames: [],
      historyAiText: '',
      historyUserText: '',
      turn: 1,
      ...overrides,
    };
  }

  function makeEdge(id, data) {
    return {
      id,
      to: `${id}-next`,
      data,
    };
  }

  it('prefers variable-driven bridges over other matches', () => {
    const edges = [
      makeEdge('response', {
        priority: 5,
        conditions: [{ type: 'prev_ai_contains', value: 'hello' }],
      }),
      makeEdge('variable', {
        priority: 1,
        conditions: [{ type: 'var_on', names: ['alpha'], scope: 'global' }],
      }),
    ];

    const next = pickNextEdge(
      edges,
      makeContext({
        activeGlobalNames: ['alpha'],
        historyAiText: 'hello world',
      })
    );

    expect(next?.id).toBe('variable');
  });

  it('breaks ties within the same priority group using numeric priority', () => {
    const edges = [
      makeEdge('low', {
        priority: 1,
        conditions: [{ type: 'var_on', names: ['alpha'], scope: 'global' }],
      }),
      makeEdge('high', {
        priority: 10,
        conditions: [{ type: 'var_on', names: ['alpha'], scope: 'global' }],
      }),
    ];

    const next = pickNextEdge(edges, makeContext({ activeGlobalNames: ['alpha'] }));

    expect(next?.id).toBe('high');
  });

  it('prefers response-driven bridges over prompt/turn checks', () => {
    const edges = [
      makeEdge('prompt', {
        priority: 20,
        conditions: [{ type: 'prev_prompt_contains', value: 'attack' }],
      }),
      makeEdge('response', {
        priority: 1,
        conditions: [{ type: 'prev_ai_contains', value: 'attack' }],
      }),
    ];

    const next = pickNextEdge(
      edges,
      makeContext({
        historyAiText: 'attack executed',
        historyUserText: 'attack now',
      })
    );

    expect(next?.id).toBe('response');
  });

  it('falls back to prompt/turn bridges when no higher tier matches', () => {
    const edges = [
      makeEdge('turn', {
        priority: 3,
        conditions: [{ type: 'turn_gte', value: 1 }],
      }),
      makeEdge('default', {
        priority: 100,
        conditions: [{ type: 'session_flag', name: 'missing', value: true }],
      }),
    ];

    const next = pickNextEdge(edges, makeContext({ turn: 2 }));

    expect(next?.id).toBe('turn');
  });

  it('returns fallback edge when no candidates match', () => {
    const edges = [
      makeEdge('nope', {
        priority: 1,
        conditions: [{ type: 'var_on', names: ['beta'], scope: 'global' }],
      }),
      {
        id: 'fallback',
        to: 'fallback-next',
        data: { fallback: true, priority: 50 },
      },
    ];

    const next = pickNextEdge(edges, makeContext());

    expect(next?.id).toBe('fallback');
  });
});
