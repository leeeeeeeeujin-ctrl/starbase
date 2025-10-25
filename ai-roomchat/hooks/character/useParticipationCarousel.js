import { useCallback, useEffect, useRef } from 'react';

export default function useParticipationCarousel({ entries, selectedGameId, onSelect }) {
  const itemRefs = useRef(new Map());
  const trackRef = useRef(null);
  const scrollStateRef = useRef({ frame: null, timeout: null });

  const registerItem = useCallback(
    gameId => node => {
      if (!gameId) return;
      if (!node) {
        itemRefs.current.delete(gameId);
        return;
      }
      itemRefs.current.set(gameId, node);
    },
    []
  );

  const scrollToSelected = useCallback(() => {
    if (!selectedGameId) return;
    const node = itemRefs.current.get(selectedGameId);
    if (!node || typeof node.scrollIntoView !== 'function') return;
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
  }, [selectedGameId]);

  useEffect(() => {
    scrollToSelected();
  }, [scrollToSelected, entries.length]);

  const syncFromScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const mapEntries = Array.from(itemRefs.current.entries());
    if (!mapEntries.length) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let closestId = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    mapEntries.forEach(([gameId, node]) => {
      if (!node) return;
      const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
      const distance = Math.abs(nodeCenter - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = gameId;
      }
    });
    if (closestId && closestId !== selectedGameId) {
      onSelect(closestId);
    }
  }, [onSelect, selectedGameId]);

  const handleScroll = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = scrollStateRef.current;
    if (state.frame) {
      window.cancelAnimationFrame(state.frame);
    }
    state.frame = window.requestAnimationFrame(() => {
      state.frame = null;
      syncFromScroll();
    });
    if (state.timeout) {
      window.clearTimeout(state.timeout);
    }
    state.timeout = window.setTimeout(() => {
      state.timeout = null;
      syncFromScroll();
    }, 150);
  }, [syncFromScroll]);

  const finalizeScroll = useCallback(() => {
    if (typeof window === 'undefined') return;
    const state = scrollStateRef.current;
    if (state.frame) {
      window.cancelAnimationFrame(state.frame);
      state.frame = null;
    }
    if (state.timeout) {
      window.clearTimeout(state.timeout);
      state.timeout = null;
    }
    syncFromScroll();
  }, [syncFromScroll]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onScroll = () => handleScroll();
    const onInteractionEnd = () => finalizeScroll();
    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('touchend', onInteractionEnd, { passive: true });
    track.addEventListener('pointerup', onInteractionEnd, { passive: true });
    track.addEventListener('mouseup', onInteractionEnd, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      track.removeEventListener('touchend', onInteractionEnd);
      track.removeEventListener('pointerup', onInteractionEnd);
      track.removeEventListener('mouseup', onInteractionEnd);
    };
  }, [finalizeScroll, handleScroll]);

  useEffect(
    () => () => {
      if (typeof window === 'undefined') return;
      const state = scrollStateRef.current;
      if (state.frame) {
        window.cancelAnimationFrame(state.frame);
        state.frame = null;
      }
      if (state.timeout) {
        window.clearTimeout(state.timeout);
        state.timeout = null;
      }
    },
    []
  );

  const handleCardClick = useCallback(
    gameId => {
      if (!gameId) return;
      onSelect(gameId);
    },
    [onSelect]
  );

  const handleIndicatorClick = useCallback(
    gameId => {
      if (!gameId) return;
      onSelect(gameId);
      scrollToSelected();
    },
    [onSelect, scrollToSelected]
  );

  return {
    trackRef,
    registerItem,
    handleCardClick,
    handleIndicatorClick,
  };
}
