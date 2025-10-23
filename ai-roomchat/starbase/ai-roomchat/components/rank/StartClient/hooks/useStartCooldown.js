'use client';

import { useCallback } from 'react';

import { markApiKeyCooldown } from '../../../../lib/rank/apiKeyCooldown';
import { formatCooldownMessage } from '../engine/apiKeyUtils';

/**
 * API 키 쿨다운 검사와 세션 무효화를 관리하는 훅입니다.
 * @param {Object} params
 * @param {(apiKey: string) => (null|{active?: boolean, remainingMs?: number, keySample?: string, reason?: string})} params.evaluateApiKeyCooldown
 * @param {(info: null|{active?: boolean, remainingMs?: number, keySample?: string, reason?: string}) => void} params.applyCooldownInfo
 * @param {(value: string) => void} params.setStatusMessage
 * @param {(value: boolean) => void} params.setGameVoided
 * @param {(value: null) => void} params.setCurrentNodeId
 * @param {(value: null) => void} params.setTurnDeadline
 * @param {(value: null) => void} params.setTimeRemaining
 * @param {() => void} params.clearConsensusVotes
 * @param {(names: string[], context: any) => void} params.updateHeroAssets
 * @param {(payload: Object) => void} params.updateSessionRecord
 * @param {() => void} params.clearSessionRecord
 * @param {string} [params.viewerId]
 * @param {string} [params.apiVersion]
 * @param {string|number} [params.gameId]
 * @param {{ id?: string|number }|null} [params.game]
 * @param {{ id?: string|number }|null} [params.sessionInfo]
 * @returns {{
 *   ensureApiKeyReady: (apiKey: string|null|undefined) => boolean,
 *   voidSession: (message?: string|null, options?: Object) => void,
 * }}
 */
export function useStartCooldown({
  evaluateApiKeyCooldown,
  applyCooldownInfo,
  setStatusMessage,
  setGameVoided,
  setCurrentNodeId,
  setTurnDeadline,
  setTimeRemaining,
  clearConsensusVotes,
  updateHeroAssets,
  updateSessionRecord,
  clearSessionRecord,
  viewerId,
  apiVersion,
  gameId,
  game,
  sessionInfo,
  onSessionVoided = () => {},
}) {
  const ensureApiKeyReady = useCallback(
    apiKey => {
      if (!apiKey) return true;
      const info = evaluateApiKeyCooldown(apiKey);
      if (info?.active) {
        setStatusMessage(formatCooldownMessage(info));
        return false;
      }
      return true;
    },
    [evaluateApiKeyCooldown, setStatusMessage]
  );

  const voidSession = useCallback(
    (message, options = {}) => {
      if (options?.apiKey) {
        const info = markApiKeyCooldown(options.apiKey, {
          reason: options.reason,
          provider: options.provider || apiVersion || null,
          viewerId: options.viewerId || viewerId || null,
          gameId: options.gameId || gameId || game?.id || null,
          sessionId: options.sessionId || sessionInfo?.id || null,
          note: options.note || null,
        });
        if (info) {
          applyCooldownInfo(info);
        }
      }

      setGameVoided(true);
      setStatusMessage(
        message || '사용 가능한 모든 API 키가 오류를 반환해 게임이 무효 처리되었습니다.'
      );
      setCurrentNodeId(null);
      setTurnDeadline(null);
      setTimeRemaining(null);
      clearConsensusVotes();
      updateHeroAssets([], null);
      updateSessionRecord({ status: 'voided', actorNames: [] });
      try {
        onSessionVoided({ message, options });
      } catch (error) {
        console.warn('[useStartCooldown] onSessionVoided handler failed:', error);
      }
      clearSessionRecord();
    },
    [
      applyCooldownInfo,
      apiVersion,
      clearConsensusVotes,
      clearSessionRecord,
      game?.id,
      gameId,
      onSessionVoided,
      setCurrentNodeId,
      setGameVoided,
      setStatusMessage,
      setTimeRemaining,
      setTurnDeadline,
      sessionInfo?.id,
      updateHeroAssets,
      updateSessionRecord,
      viewerId,
    ]
  );

  return { ensureApiKeyReady, voidSession };
}
