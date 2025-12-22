import { createBridgeContext } from '../bridgeContext';
import { pickNextEdge } from '../graph';

/**
 * Pure helper to build bridge context and choose next edge
 * for the current node/turn. Does not touch React state.
 */
export function pickNextEdgeForTurn({
  graph,
  node,
  turn,
  history,
  visitedSlotIds,
  participantsStatus,
  activeGlobalNames,
  activeLocalNames,
  actorContext,
  brawlEnabled,
  gameVoided,
  winCount,
  lastDropInTurn,
  endTriggered,
}) {
  const context = createBridgeContext({
    turn,
    historyUserText: history.joinedText({ onlyPublic: true, last: 5 }),
    historyAiText: history.joinedText({ onlyPublic: false, last: 5 }),
    visitedSlotIds,
    participantsStatus,
    activeGlobalNames,
    activeLocalNames,
    currentRole: actorContext?.participant?.role || actorContext?.heroSlot?.role || null,
    sessionFlags: {
      brawlEnabled,
      gameVoided,
      winCount,
      lastDropInTurn,
      endTriggered,
      dropInGraceTurns: 0,
    },
  });

  const outgoing = graph.edges.filter(
    edge => edge.from === String(node.id) || edge.from === node.id
  );

  const chosenEdge = pickNextEdge(outgoing, context);
  return { context, chosenEdge };
}
