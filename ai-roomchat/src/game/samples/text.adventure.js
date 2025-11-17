import { createTextEngine } from '../../../lib/game/text/TextSceneEngine.js';

const adventureScript = {
  start: 'intro',
  nodes: {
    intro: {
      text: '어두운 동굴 입구에 도착했습니다. 당신의 이름은 {{name}}입니다.',
      choices: [
        { label: '동굴 안으로 들어간다', to: 'cave_entrance' },
        { label: '돌아간다', to: 'exit_game' },
      ],
    },
    cave_entrance: {
      text: '동굴 입구는 습하고 어둡습니다. 바닥에 반짝이는 무언가가 있습니다.',
      choices: [
        { label: '반짝이는 것을 줍는다', to: 'get_item', effects: [{ set: ['hasShinyObject', true] }] },
        { label: '그냥 지나친다', to: 'dark_path' },
      ],
    },
    get_item: {
      text: '낡은 열쇠를 주웠습니다. 이제 동굴 안으로 더 깊이 들어갈 수 있을 것 같습니다.',
      choices: [
        { label: '어두운 길로 간다', to: 'dark_path' },
      ],
    },
    dark_path: {
      text: '어두운 길을 따라가니 굳게 닫힌 문이 나타납니다.',
      choices: [
        { label: '열쇠로 문을 연다', to: 'open_door', when: 'hasShinyObject' },
        { label: '다른 길을 찾아본다', to: 'dead_end' },
      ],
    },
    open_door: {
      text: '열쇠가 딱 맞습니다! 문이 열리고 빛이 쏟아져 들어옵니다. 당신은 동굴을 탈출했습니다!',
      choices: [],
    },
    dead_end: {
      text: '다른 길은 막혀 있습니다. 다시 돌아가야 할 것 같습니다.',
      choices: [
        { label: '문으로 돌아간다', to: 'dark_path' },
      ],
    },
    exit_game: {
      text: '당신은 동굴 탐험을 포기하고 집으로 돌아갔습니다. 게임 종료.',
      choices: [],
    },
  },
};

export function createAdventureEngine(initialVars = { name: '모험가' }) {
  return createTextEngine(adventureScript, initialVars);
}

