import React from 'react';

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const MENTION_REGEX = /@([0-9A-Za-z_가-힣]+)/g;
const HASHTAG_REGEX = /#([0-9A-Za-z_가-힣]+)/g;

function normaliseNumber(value, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return value;
}

function markRange(registry, start, length) {
  if (!registry || length <= 0) return;
  for (let offset = 0; offset < length; offset += 1) {
    registry[start + offset] = true;
  }
}

function isRangeFree(registry, start, length) {
  if (!registry || length <= 0) return true;
  for (let offset = 0; offset < length; offset += 1) {
    if (registry[start + offset]) {
      return false;
    }
  }
  return true;
}

export function normalizeDrafty(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return {
      txt: raw,
      fmt: [],
      ent: [],
    };
  }
  if (typeof raw === 'object') {
    const txt = typeof raw.txt === 'string' ? raw.txt : '';
    const fmt = Array.isArray(raw.fmt) ? raw.fmt.slice() : [];
    const ent = Array.isArray(raw.ent) ? raw.ent.slice() : [];
    return { txt, fmt, ent };
  }
  return null;
}

export function createDraftyFromText(input) {
  const text = typeof input === 'string' ? input : '';
  const doc = {
    txt: text,
    fmt: [],
    ent: [],
  };
  if (!text) {
    return doc;
  }

  const occupancy = [];

  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;
    const length = token.length;
    if (!token || !length) continue;

    const key = doc.ent.length;
    doc.ent.push({ tp: 'LN', data: { url: token } });
    doc.fmt.push({ at: start, len: length, key });
    markRange(occupancy, start, length);
  }

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const token = match[0];
    const value = match[1];
    const start = match.index;
    const length = token.length;
    if (!token || !value || !length) continue;
    if (!isRangeFree(occupancy, start, length)) continue;

    const key = doc.ent.length;
    doc.ent.push({ tp: 'MN', data: { val: value } });
    doc.fmt.push({ at: start, len: length, key });
    markRange(occupancy, start, length);
  }

  HASHTAG_REGEX.lastIndex = 0;
  while ((match = HASHTAG_REGEX.exec(text)) !== null) {
    const token = match[0];
    const value = match[1];
    const start = match.index;
    const length = token.length;
    if (!token || !value || !length) continue;
    if (!isRangeFree(occupancy, start, length)) continue;

    const key = doc.ent.length;
    doc.ent.push({ tp: 'HT', data: { val: value } });
    doc.fmt.push({ at: start, len: length, key });
    markRange(occupancy, start, length);
  }

  return doc;
}

export function extractPlainText(raw) {
  const doc = normalizeDrafty(raw);
  if (!doc) return '';
  return typeof doc.txt === 'string' ? doc.txt : '';
}

function resolveEntryType(entry, entities) {
  if (!entry) return null;
  if (entry.tp) return String(entry.tp).toUpperCase();
  if (typeof entry.key === 'number' && Array.isArray(entities)) {
    const entity = entities[entry.key];
    if (entity && entity.tp) {
      return String(entity.tp).toUpperCase();
    }
  }
  return null;
}

function resolveEntryData(entry, entities) {
  if (!entry) return {};
  if (typeof entry.key === 'number' && Array.isArray(entities)) {
    const entity = entities[entry.key];
    if (entity && entity.data && typeof entity.data === 'object') {
      return entity.data;
    }
  }
  return {};
}

function sameOps(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export function draftyToSegments(raw) {
  const doc = normalizeDrafty(raw);
  if (!doc) return [];

  const textArray = Array.from(doc.txt || '');
  const inlineOps = [];
  const breakMap = new Map();
  const entityOps = [];
  const length = textArray.length;

  for (const entry of doc.fmt || []) {
    const type = resolveEntryType(entry, doc.ent);
    if (!type) continue;

    const at = Math.max(0, Math.min(normaliseNumber(entry.at, 0), length));
    const len = Math.max(0, normaliseNumber(entry.len, length));
    const data = resolveEntryData(entry, doc.ent);

    if (type === 'BR') {
      const bucket = breakMap.get(at) || [];
      bucket.push({ type, data });
      breakMap.set(at, bucket);
      continue;
    }

    if (len <= 0) {
      entityOps.push({ type, data, index: at, entry });
      continue;
    }

    const end = Math.max(at, Math.min(at + len, length));
    inlineOps.push({ type, data, start: at, end, entry });
  }

  inlineOps.sort((a, b) => {
    if (a.start === b.start) {
      return b.end - a.end;
    }
    return a.start - b.start;
  });

  entityOps.sort((a, b) => a.index - b.index);

  const segments = [];
  let currentOps = [];
  let buffer = '';
  let bufferStart = 0;

  const flush = atIndex => {
    if (!buffer) {
      bufferStart = atIndex;
      return;
    }
    segments.push({
      type: 'text',
      text: buffer,
      marks: currentOps.slice(),
      start: bufferStart,
      end: atIndex,
    });
    buffer = '';
    bufferStart = atIndex;
  };

  for (let index = 0; index < length; index += 1) {
    if (breakMap.has(index)) {
      flush(index);
      const entries = breakMap.get(index) || [];
      for (const br of entries) {
        segments.push({ type: 'break', start: index, data: br.data });
      }
    }

    const nextOps = inlineOps.filter(op => index >= op.start && index < op.end);
    if (!sameOps(currentOps, nextOps)) {
      flush(index);
      currentOps = nextOps;
    }

    if (!buffer) {
      bufferStart = index;
    }
    buffer += textArray[index];
  }

  flush(length);

  if (breakMap.has(length)) {
    const entries = breakMap.get(length) || [];
    for (const br of entries) {
      segments.push({ type: 'break', start: length, data: br.data });
    }
  }

  if (entityOps.length) {
    const merged = [];
    let entityCursor = 0;

    for (const segment of segments) {
      const boundary = segment?.start ?? 0;
      while (entityCursor < entityOps.length && entityOps[entityCursor].index <= boundary) {
        merged.push({ type: 'entity', entity: entityOps[entityCursor] });
        entityCursor += 1;
      }
      merged.push(segment);
    }

    while (entityCursor < entityOps.length) {
      merged.push({ type: 'entity', entity: entityOps[entityCursor] });
      entityCursor += 1;
    }

    return merged;
  }

  return segments;
}

export function inspectDrafty(raw) {
  const doc = normalizeDrafty(raw);
  if (!doc) {
    return {
      doc: null,
      plainText: '',
      hasLinks: false,
      hasMentions: false,
      hasHashtags: false,
    };
  }

  let hasLinks = false;
  let hasMentions = false;
  let hasHashtags = false;

  for (const entry of doc.fmt || []) {
    const type = resolveEntryType(entry, doc.ent);
    if (!type) continue;
    if (type === 'LN') hasLinks = true;
    if (type === 'MN') hasMentions = true;
    if (type === 'HT') hasHashtags = true;
  }

  return {
    doc,
    plainText: typeof doc.txt === 'string' ? doc.txt : '',
    hasLinks,
    hasMentions,
    hasHashtags,
  };
}

export function renderDraftySegments(raw, { keyPrefix = 'drafty' } = {}) {
  const segments = draftyToSegments(raw);
  const rendered = [];
  let counter = 0;

  const wrapWithMark = (children, mark) => {
    const key = `${keyPrefix}-mark-${counter}`;
    counter += 1;
    const data = mark?.data || {};
    const normalizedType = mark?.type || '';
    const childArray = React.Children.toArray(children);

    switch (normalizedType) {
      case 'ST':
        return React.createElement('strong', { key }, ...childArray);
      case 'EM':
        return React.createElement('em', { key }, ...childArray);
      case 'CO':
        return React.createElement(
          'code',
          {
            key,
            style: {
              background: '#0f172a',
              color: '#f8fafc',
              padding: '0 4px',
              borderRadius: 4,
              fontSize: '0.85em',
            },
          },
          ...childArray
        );
      case 'HL':
        return React.createElement(
          'span',
          {
            key,
            style: {
              background: '#fef3c7',
              padding: '0 4px',
              borderRadius: 4,
            },
          },
          ...childArray
        );
      case 'DL':
        return React.createElement(
          'span',
          {
            key,
            style: { textDecoration: 'line-through' },
          },
          ...childArray
        );
      case 'MN':
        return React.createElement(
          'span',
          {
            key,
            style: { color: '#2563eb', fontWeight: 600 },
          },
          ...childArray
        );
      case 'HT':
        return React.createElement(
          'span',
          {
            key,
            style: { color: '#0f766e', fontWeight: 600 },
          },
          ...childArray
        );
      case 'LN': {
        const url = typeof data.url === 'string' && data.url.trim().length ? data.url : undefined;
        return React.createElement(
          'a',
          {
            key,
            href: url || '#',
            target: '_blank',
            rel: 'noopener noreferrer',
            style: { color: '#2563eb', textDecoration: 'underline' },
          },
          ...childArray
        );
      }
      default:
        return React.createElement('span', { key }, ...childArray);
    }
  };

  const renderText = text => {
    if (text.includes('\n')) {
      const parts = text.split('\n');
      const nodes = [];
      parts.forEach((part, index) => {
        nodes.push(
          React.createElement(React.Fragment, { key: `${keyPrefix}-part-${counter}` }, part)
        );
        counter += 1;
        if (index < parts.length - 1) {
          nodes.push(React.createElement('br', { key: `${keyPrefix}-br-${counter}` }));
          counter += 1;
        }
      });
      return nodes;
    }
    return [text];
  };

  segments.forEach((segment, index) => {
    if (segment.type === 'break') {
      rendered.push(React.createElement('br', { key: `${keyPrefix}-line-${counter}` }));
      counter += 1;
      return;
    }

    if (segment.type === 'entity') {
      const entity = segment.entity || {};
      const entityType = entity.type;
      const entityData = entity.data || {};
      rendered.push(
        React.createElement(
          'span',
          {
            key: `${keyPrefix}-entity-${counter}`,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 6,
              background: '#e0f2fe',
              color: '#0369a1',
              fontSize: '0.8em',
            },
          },
          `${entityType || 'ENTITY'}`,
          entityData?.url ? ` · ${entityData.url}` : ''
        )
      );
      counter += 1;
      return;
    }

    const key = `${keyPrefix}-segment-${index}`;
    const base = renderText(segment.text || '');
    const content = (segment.marks || []).reduce((acc, mark) => wrapWithMark(acc, mark), base);
    rendered.push(React.createElement(React.Fragment, { key }, ...React.Children.toArray(content)));
  });

  return rendered;
}
