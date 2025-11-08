// Robust JSON plan extraction for AI Code Chat
// Attempts to parse a JSON object or array from mixed AI output (with commentary, fences, prefixes).
// Returns { plan, parsed, rawJson }.
export default function parsePlan(rawText) {
  const src = String(rawText || '').trim();
  if (!src) return { plan: null, parsed: false, rawJson: '' };
  const cleaned = stripLeadingCommentary(stripFences(src));

  // Try direct parse first
  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === 'object') {
      return { plan: direct, parsed: true, rawJson: cleaned };
    }
  } catch {}

  // Attempt to extract first top-level JSON object
  const objectCandidate = extractBalanced(cleaned, '{', '}');
  if (objectCandidate) {
    try {
      const obj = JSON.parse(objectCandidate);
      if (obj && typeof obj === 'object') {
        return { plan: obj, parsed: true, rawJson: objectCandidate };
      }
    } catch {}
  }

  // Attempt array candidate (in case agent returns an array of steps/actions only)
  const arrayCandidate = extractBalanced(cleaned, '[', ']');
  if (arrayCandidate) {
    try {
      const arr = JSON.parse(arrayCandidate);
      if (Array.isArray(arr)) {
        // Wrap into plan shape if raw is an actions array
        const plan = inferArrayPlan(arr);
        return { plan, parsed: true, rawJson: arrayCandidate };
      }
    } catch {}
  }

  // Fallback: scan lines for JSON-like substring
  const lineCandidate = scanLinesForJson(cleaned);
  if (lineCandidate) {
    try {
      const obj = JSON.parse(lineCandidate);
      if (obj && typeof obj === 'object') {
        return { plan: obj, parsed: true, rawJson: lineCandidate };
      }
    } catch {}
  }

  return { plan: null, parsed: false, rawJson: '' };
}

function stripFences(s) {
  return s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function stripLeadingCommentary(s) {
  // Remove leading lines that clearly aren't JSON (e.g., headings, explanations) until first '{' or '['
  const firstBrace = s.search(/[\[{]/);
  if (firstBrace <= 0) return s;
  return s.slice(firstBrace);
}

function extractBalanced(text, openChar, closeChar) {
  const len = text.length;
  for (let i = 0; i < len; i++) {
    if (text[i] === openChar) {
      let depth = 0;
      for (let j = i; j < len; j++) {
        const c = text[j];
        if (c === openChar) depth++;
        else if (c === closeChar) {
          depth--;
          if (depth === 0) {
            const cand = text.slice(i, j + 1).trim();
            // Quick heuristic: must contain at least one key (for object) or element comma (for array)
            if (openChar === '{' && !/["']\w+["']\s*:/m.test(cand)) continue;
            return cand;
          }
        }
      }
    }
  }
  return null;
}

function inferArrayPlan(arr) {
  // If array of actions (objects with type/path) -> wrap
  if (Array.isArray(arr) && arr.every(x => x && typeof x === 'object' && (x.type || x.path))) {
    return { mode: 'work', actions: arr };
  }
  return { mode: 'chat', steps: arr };
}

function scanLinesForJson(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/[{\[]/.test(ln)) {
      // Try accumulate until balanced
      let chunk = lines[i];
      let depthObj = 0, depthArr = 0;
      const pushDepth = (str) => {
        for (let k = 0; k < str.length; k++) {
          const c = str[k];
          if (c === '{') depthObj++;
          else if (c === '}') depthObj--;
          else if (c === '[') depthArr++;
          else if (c === ']') depthArr--;
        }
      };
      pushDepth(chunk);
      for (let j = i + 1; j < lines.length && (depthObj > 0 || depthArr > 0); j++) {
        chunk += '\n' + lines[j];
        pushDepth(lines[j]);
      }
      if (depthObj === 0 && depthArr === 0) {
        const cand = chunk.trim();
        if (/^{[\s\S]*}$/.test(cand) || /^\[[\s\S]*\]$/.test(cand)) return cand;
      }
    }
  }
  return null;
}
