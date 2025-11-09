import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addDebugEvent,
  clearDebugEvents,
  getDebugEvents,
  subscribeDebugEvents,
} from '@/lib/debugCollector';

import styles from './DebugOverlay.module.css';

const ACTIVATION_KEYS = ['d', 'b'];
const ACTIVATION_SEQUENCE = ['d', 'b'];
const ACTIVATION_WINDOW_MS = 1000;
const ACTIVATION_LABEL = 'Press D + B';

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return String(timestamp);
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  } catch (error) {
    return String(timestamp);
  }
}

function stringifyDetails(event) {
  if (!event) return '';
  const { details, payload, meta } = event;
  const merged = {};
  if (details && typeof details === 'object') {
    merged.details = details;
  }
  if (payload !== undefined) {
    merged.payload = payload;
  }
  if (meta && typeof meta === 'object') {
    merged.meta = meta;
  }
  if (!Object.keys(merged).length) {
    return '';
  }
  try {
    return JSON.stringify(merged, null, 2);
  } catch (error) {
    return String(merged);
  }
}

export default function DebugOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState(() => getDebugEvents());
  const [copyState, setCopyState] = useState('');

  useEffect(() => {
    return subscribeDebugEvents(snapshot => {
      setEvents(snapshot);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const pressedKeys = new Set();
    let sequenceIndex = 0;
    let lastSequenceAt = 0;

    const resetSequence = () => {
      sequenceIndex = 0;
      lastSequenceAt = 0;
    };

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        pressedKeys.clear();
        resetSequence();
        return;
      }

      const key = String(event.key || '').toLowerCase();
      if (!key) return;

      if (ACTIVATION_KEYS.includes(key)) {
        pressedKeys.add(key);
        const now = Date.now();

        if (ACTIVATION_KEYS.every(activationKey => pressedKeys.has(activationKey))) {
          event.preventDefault();
          setIsOpen(true);
          pressedKeys.clear();
          resetSequence();
          return;
        }

        const expectedKey = ACTIVATION_SEQUENCE[sequenceIndex];
        const withinWindow =
          sequenceIndex === 0 || (lastSequenceAt && now - lastSequenceAt <= ACTIVATION_WINDOW_MS);

        if (key === expectedKey && withinWindow) {
          sequenceIndex += 1;
          lastSequenceAt = now;
          if (sequenceIndex === ACTIVATION_SEQUENCE.length) {
            event.preventDefault();
            setIsOpen(true);
            pressedKeys.clear();
            resetSequence();
          }
        } else if (key === ACTIVATION_SEQUENCE[0]) {
          sequenceIndex = 1;
          lastSequenceAt = now;
        } else {
          resetSequence();
        }

        return;
      }

      if (['control', 'meta', 'shift', 'alt'].includes(key)) {
        return;
      }

      pressedKeys.clear();
      resetSequence();
    };

    const handleKeyUp = event => {
      const key = String(event.key || '').toLowerCase();
      if (!key) return;
      if (ACTIVATION_KEYS.includes(key)) {
        pressedKeys.delete(key);
        return;
      }

      if (key === 'control' || key === 'meta') {
        pressedKeys.clear();
        resetSequence();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleClear = useCallback(() => {
    clearDebugEvents();
    setCopyState('');
  }, []);

  const handleCopy = useCallback(async () => {
    const snapshot = getDebugEvents();
    const payload = JSON.stringify(snapshot, null, 2);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(payload);
        setCopyState('copied');
      } else {
        throw new Error('clipboard_unavailable');
      }
    } catch (error) {
      try {
        const element = document.createElement('textarea');
        element.value = payload;
        element.setAttribute('readonly', '');
        element.style.position = 'absolute';
        element.style.left = '-9999px';
        document.body.appendChild(element);
        element.select();
        document.execCommand('copy');
        document.body.removeChild(element);
        setCopyState('copied');
      } catch (fallbackError) {
        setCopyState('copy_failed');
        addDebugEvent({
          level: 'warn',
          source: 'debug-overlay',
          message: 'Failed to copy debug events',
          details: { error: fallbackError?.message || 'copy_failed' },
        });
      }
    }

    window.setTimeout(() => setCopyState(''), 2000);
  }, []);

  const formattedEvents = useMemo(
    () =>
      events
        .slice()
        .reverse()
        .map(event => ({
          ...event,
          formattedTimestamp: formatTimestamp(event.timestamp),
          serializedDetails: stringifyDetails(event),
        })),
    [events]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>Starbase Debug Collector</div>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={handleCopy}>
              Copy JSON
            </button>
            <button type="button" className={styles.button} onClick={handleClear}>
              Clear Logs
            </button>
            <button type="button" className={styles.button} onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
        <div className={styles.body}>
          {formattedEvents.length === 0 ? (
            <div className={styles.emptyState}>
              현재 수집된 디버그 이벤트가 없습니다. {ACTIVATION_LABEL}를 눌러 언제든 이 창을 불러올
              수 있습니다.
            </div>
          ) : (
            formattedEvents.map(event => (
              <div key={event.id} className={styles.event}>
                <div className={styles.eventMeta}>
                  <span>{event.formattedTimestamp}</span>
                  <span>{event.level?.toUpperCase?.() || 'INFO'}</span>
                  {event.source ? <span>{event.source}</span> : null}
                </div>
                <div className={styles.eventMessage}>{event.message || '(no message)'}</div>
                {event.serializedDetails ? (
                  <pre className={styles.eventDetails}>{event.serializedDetails}</pre>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className={styles.footer}>
          <span className={styles.shortcutHint}>단축키: {ACTIVATION_LABEL}</span>
          {copyState ? <span className={styles.copyStatus}>{copyState}</span> : null}
        </div>
      </div>
    </div>
  );
}
