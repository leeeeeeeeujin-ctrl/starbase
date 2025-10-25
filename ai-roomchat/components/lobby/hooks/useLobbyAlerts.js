import { useMemo } from 'react';

export default function useLobbyAlerts() {
  return useMemo(
    () => [
      {
        id: 'notice-1',
        title: '랭킹 시즌 업데이트',
        body: '새로운 시즌이 시작되었습니다. 참여 가능한 게임을 확인하고 바로 입장해 보세요.',
        created_at: new Date().toLocaleString(),
      },
      {
        id: 'notice-2',
        title: '시스템 점검 안내',
        body: '이번 주말 오전 3시에는 짧은 점검이 예정되어 있습니다. 점검 시간 동안은 실시간 매칭이 제한됩니다.',
        created_at: new Date(Date.now() - 3600 * 1000).toLocaleString(),
      },
    ],
    []
  );
}
//
