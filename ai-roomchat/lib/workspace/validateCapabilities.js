"use client";

/**
 * Lightweight helpers to validate that a workspace set
 * satisfies the file-level parts of its selected capabilities.
 *
 * This intentionally does NOT fetch contracts or meta by itself:
 * callers are expected to pass in:
 *   - files: current workspace files (array or map)
 *   - contracts: capability contracts (from API)
 *   - selectedIds: capability ids active for this set (meta.capabilities)
 */

/**
 * Normalize workspace files into a simple path → meta map.
 * Accepts either:
 *   - array: [{ path, content, readonly, dir }]
 *   - map: { "/path": { content, readonly, dir } }
 */
export function buildFilesIndex(files) {
  const index = {};
  if (!files) return index;
  if (Array.isArray(files)) {
    for (const f of files) {
      if (!f || !f.path) continue;
      const path = String(f.path);
      index[path] = {
        content: typeof f.content === 'string' ? f.content : '',
        readonly: !!f.readonly,
        dir: !!f.dir,
      };
    }
    return index;
  }
  if (typeof files === 'object') {
    Object.entries(files).forEach(([path, meta]) => {
      if (!path) return;
      const m = meta || {};
      index[String(path)] = {
        content: typeof m.content === 'string' ? m.content : '',
        readonly: !!m.readonly,
        dir: !!m.dir,
      };
    });
  }
  return index;
}

/**
 * @typedef {Object} CapabilityIssue
 * @property {"missing_file"|"unknown_capability"} type
 * @property {string} capabilityId
 * @property {string=} path           // for missing_file
 * @property {string=} message
 */

/**
 * Validate selected capabilities against the current files.
 *
 * @param {Object} params
 * @param {any} params.files                     - workspace files (array or map)
 * @param {Array<any>} params.contracts          - capability contracts from API
 * @param {Array<string>} params.selectedIds     - capability ids active for this set
 * @returns {CapabilityIssue[]}                  - list of issues
 */
export function validateCapabilities({ files, contracts, selectedIds }) {
  /** @type {CapabilityIssue[]} */
  const issues = [];
  const idx = buildFilesIndex(files);
  const byId = new Map();
  if (Array.isArray(contracts)) {
    for (const c of contracts) {
      if (!c || !c.id) continue;
      byId.set(String(c.id), c);
    }
  }
  const ids = Array.isArray(selectedIds) && selectedIds.length
    ? selectedIds
    : Array.from(byId.keys());

  for (const rawId of ids) {
    const id = String(rawId);
    const contract = byId.get(id);
    if (!contract) {
      issues.push({
        type: 'unknown_capability',
        capabilityId: id,
        message: '등록되지 않은 capability id 입니다.',
      });
      continue;
    }
    const reqFiles = Array.isArray(contract.files) ? contract.files : [];
    for (const p of reqFiles) {
      const path = String(p);
      if (!idx[path]) {
        issues.push({
          type: 'missing_file',
          capabilityId: id,
          path,
          message: `필수 파일이 없습니다: ${path}`,
        });
      }
    }
  }
  return issues;
}

