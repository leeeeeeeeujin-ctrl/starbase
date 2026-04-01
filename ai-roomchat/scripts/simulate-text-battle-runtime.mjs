#!/usr/bin/env node

import minimist from 'minimist';

const { createBattleSession, getCurrentTurn, submitBattleTurn } = await import(
  '../lib/battle/session.js'
);
const { buildRuntimePromptFromTurn } = await import('../lib/battle/agentRuntime.js');

const argv = minimist(process.argv.slice(2), {
  string: ['inputs'],
  alias: { i: 'inputs' },
});

const scriptedInputs = String(argv.inputs || 'attack,guard')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const definition = {
  version: 1,
  id: 'simulation-battle',
  name: '시뮬레이션 배틀',
  entryTurnId: 'turn-open',
  turns: [
    {
      id: 'turn-open',
      title: '첫 행동',
      kind: 'user',
      display: '첫 행동을 선택합니다.',
      promptTemplate: '플레이어는 어떤 첫 행동을 할지 정한다.',
      input: {
        mode: 'text',
        label: '행동',
        placeholder: '',
        resultKey: 'action_choice',
      },
      participantScope: ['self', 'enemies'],
    },
    {
      id: 'turn-counter',
      title: '상대 반응',
      kind: 'ai',
      display: '상대가 반응합니다.',
      promptTemplate: '상대는 {{values.action_choice}} 행동에 대응한다.',
      input: {
        mode: 'none',
        label: '',
        placeholder: '',
        resultKey: '',
      },
      participantScope: ['all'],
    },
    {
      id: 'turn-end',
      title: '정리',
      kind: 'system',
      display: '행동 결과를 정리합니다.',
      promptTemplate: '결과를 정리한다.',
      input: {
        mode: 'none',
        label: '',
        placeholder: '',
        resultKey: '',
      },
      participantScope: ['all'],
    },
  ],
  transitions: [
    {
      id: 'edge-1',
      from: 'turn-open',
      to: 'turn-counter',
      conditions: [{ key: 'action_choice', equals: 'attack' }],
      priority: 10,
      fallback: false,
      triggerWords: [],
    },
    {
      id: 'edge-2',
      from: 'turn-open',
      to: 'turn-end',
      conditions: [],
      priority: 0,
      fallback: true,
      triggerWords: [],
    },
    {
      id: 'edge-3',
      from: 'turn-counter',
      to: 'turn-end',
      conditions: [],
      priority: 0,
      fallback: true,
      triggerWords: [],
    },
  ],
};

const participants = [
  {
    id: 'participant-1',
    heroId: 'hero-1',
    ownerId: 'owner-1',
    team: 'blue',
    role: 'captain',
    name: '주인공',
    meta: {
      description: '판단이 빠른 검사',
      abilities: ['베기', '반격'],
      agent_profile: {
        systemPrompt: '침착하게 전황을 읽는다.',
        runtimeCache: {
          gameSummary: '관찰 후 반격을 선호한다.',
        },
      },
    },
  },
  {
    id: 'participant-2',
    heroId: 'hero-2',
    ownerId: 'owner-2',
    team: 'red',
    role: 'challenger',
    name: '라이벌',
    meta: {
      description: '거칠게 밀어붙이는 전사',
      abilities: ['돌진'],
      agent_profile: {
        runtimeCache: {
          gameSummary: '공격적인 선택을 자주 한다.',
        },
      },
    },
  },
];

let session = createBattleSession({
  definition,
  participants,
  actorId: 'participant-1',
  sessionId: 'sim-session',
});

console.log('--- text battle runtime simulation ---');
console.log(`session=${session.id}`);

let step = 0;
while (session.status !== 'completed' && step < 10) {
  const turn = getCurrentTurn(session);
  if (!turn) break;

  const runtime = buildRuntimePromptFromTurn(session, turn, session.actorId);
  console.log(`\n[turn ${session.turnIndex}] ${turn.title}`);
  console.log(`display: ${turn.display || '-'}`);
  console.log(`prompt preview: ${runtime.runtimePrompt.slice(0, 200)}${runtime.runtimePrompt.length > 200 ? '...' : ''}`);

  const input =
    (turn.input?.mode || 'none') !== 'none'
      ? scriptedInputs.shift() || 'wait'
      : null;
  const result = input ? `input:${input}` : `auto:${turn.id}`;

  session = submitBattleTurn(session, {
    actorId: session.actorId,
    input,
    result,
  });

  console.log(`result: ${result}`);
  console.log(`nextTurn: ${session.currentTurnId || '(completed)'}`);
  step += 1;
}

console.log('\nfinal status:', session.status);
console.log('values:', JSON.stringify(session.values, null, 2));
console.log('logs:', JSON.stringify(session.logs, null, 2));
