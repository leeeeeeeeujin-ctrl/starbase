/**
 * 서버 측 매칭 검증 엔드포인트
 *
 * 클라이언트에서 계산한 매칭 결과를 검증
 * - 치트 방지
 * - 데이터 일관성 보장
 * - 최종 승인
 */

import { supabase } from '@/lib/rank/db';
import { runMatching } from '@/lib/rank/matchmakingService';
import { loadMatchingResources } from '@/lib/rank/matchingPipeline';
import { withTable } from '@/lib/supabaseTables';

function assignmentsMatch(clientAssignments, serverAssignments) {
  if (clientAssignments.length !== serverAssignments.length) {
    return false;
  }

  // 단순 비교: 각 assignment의 hero_id 리스트가 동일한지
  for (let i = 0; i < clientAssignments.length; i++) {
    const clientMembers = clientAssignments[i]?.members || [];
    const serverMembers = serverAssignments[i]?.members || [];

    if (clientMembers.length !== serverMembers.length) {
      return false;
    }

    const clientHeroIds = clientMembers.map(m => m.hero_id || m.heroId).sort();
    const serverHeroIds = serverMembers.map(m => m.hero_id || m.heroId).sort();

    if (JSON.stringify(clientHeroIds) !== JSON.stringify(serverHeroIds)) {
      return false;
    }
  }

  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { gameId, mode, host, clientResult } = req.body || {};

  if (!gameId || !clientResult) {
    return res.status(400).json({ error: 'missing_required_fields' });
  }

  try {
    // Step 1: 서버에서 독립적으로 매칭 재계산
    const { roles, slotLayout, queue } = await loadMatchingResources(supabase, {
      gameId,
      mode,
      host,
    });

    const serverResult = runMatching({ mode, roles, queue });

    // Step 2: 클라이언트 결과와 서버 결과 비교
    const isValid = assignmentsMatch(
      clientResult.assignments || [],
      serverResult.assignments || []
    );

    if (!isValid) {
      return res.status(409).json({
        verified: false,
        error: 'mismatch',
        reason: 'Client and server matching results differ',
        serverResult: {
          ready: serverResult.ready,
          assignmentCount: serverResult.assignments?.length || 0,
        },
      });
    }

    // Step 3: 검증 성공 - 서버 결과 반환
    return res.status(200).json({
      verified: true,
      ready: serverResult.ready,
      assignments: serverResult.assignments,
      rooms: serverResult.rooms,
      totalSlots: serverResult.totalSlots,
      maxWindow: serverResult.maxWindow,
      error: serverResult.error,
      validation: {
        clientExecutionTime: clientResult.metadata?.executionTime,
        serverRecalculated: true,
        matchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Match Verify] Error:', error);
    return res.status(500).json({
      verified: false,
      error: 'server_error',
      message: error.message,
    });
  }
}
