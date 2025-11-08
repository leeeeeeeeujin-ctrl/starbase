// Fallback injector that tries multiple workspace APIs in priority order.
// It will prefer explicit addFiles/addFile/importFiles if available on the workspace
// context. If none exist, it will fall back to creating folders and writing files
// using the basic createFolder/createFile/writeFile functions.
export async function injectFilesWithFallback(workspace, files = []) {
  if (!workspace || !Array.isArray(files) || files.length === 0) return { injected: 0 };
  // Normalize file entries to { path, content, readonly?, dir? }
  const normalized = files.map((f) => {
    const raw = String(f?.path || f?.name || f?.filename || '').trim();
    const noLead = raw.replace(/^\/+/, '');
    const path = '/' + noLead;
    return { path, content: f?.content || '', readonly: !!f?.readonly, dir: !!f?.dir };
  });

  // 1) Prefer batch API if available
  if (typeof workspace.addFiles === 'function') {
    try {
      await workspace.addFiles(normalized);
      return { injected: normalized.length, method: 'addFiles' };
    } catch (e) {
      // fallthrough to next option
    }
  }

  // 2) Prefer single-file add API
  if (typeof workspace.addFile === 'function') {
    let ok = 0;
    for (const f of normalized) {
      try {
        await workspace.addFile(f.path, f.content, { readonly: !!f.readonly, dir: !!f.dir });
        ok++;
      } catch (e) {
        // continue on error
      }
    }
    if (ok > 0) return { injected: ok, method: 'addFile' };
  }

  // 3) Prefer importFiles API
  if (typeof workspace.importFiles === 'function') {
    try {
      await workspace.importFiles(normalized);
      return { injected: normalized.length, method: 'importFiles' };
    } catch (e) {}
  }

  // 4) Fallback: create folders + write/create files using minimal APIs
  let injected = 0;
  for (const f of normalized) {
    try {
      // Ensure parent folder exists if createFolder provided
      const parts = (f.path || '').split('/').filter(Boolean);
      if (parts.length > 1 && typeof workspace.createFolder === 'function') {
        const dir = '/' + parts.slice(0, parts.length - 1).join('/') + '/';
        try { workspace.createFolder(dir); } catch {}
      }
      if (typeof workspace.createFile === 'function') {
        try { workspace.createFile(f.path, f.content); injected++; continue; } catch {}
      }
      if (typeof workspace.writeFile === 'function') {
        try { workspace.writeFile(f.path, f.content); injected++; continue; } catch {}
      }
    } catch (e) {
      // ignore and continue
    }
  }
  return { injected, method: 'fallback' };
}
