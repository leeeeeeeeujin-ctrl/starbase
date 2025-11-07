// Lightweight feature detection for client-side compute offload.
// Returns a plain object summarizing capabilities and heuristics.

export async function detectCapabilities() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const win = typeof window !== 'undefined' ? window : {};

  const hasWasm = typeof WebAssembly === 'object';
  const hasWorker = typeof Worker !== 'undefined';
  const hasOffscreenCanvas = typeof win.OffscreenCanvas !== 'undefined';
  const hasWebGPU = typeof win.navigator !== 'undefined' && !!(win.navigator.gpu);
  const hasWebGL2 = (() => {
    try {
      const canvas = win.document ? win.document.createElement('canvas') : null;
      return !!(canvas && canvas.getContext && canvas.getContext('webgl2'));
    } catch {
      return false;
    }
  })();
  const hasWebCodecs = typeof win.VideoEncoder !== 'undefined' || typeof win.AudioEncoder !== 'undefined';
  const hasFSAccess = typeof win.showOpenFilePicker === 'function' || typeof win.chooseFileSystemEntries === 'function';
  const crossOriginIsolated = typeof win.crossOriginIsolated === 'boolean' ? win.crossOriginIsolated : false;
  const sab = typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolated;

  const cores = (nav.hardwareConcurrency) || 2;
  const devMem = (nav.deviceMemory) || 2; // in GB, chromium only

  // naive device tier heuristic
  const score = (
    (hasWasm ? 2 : 0) +
    (hasWorker ? 2 : 0) +
    (hasWebGPU ? 3 : 0) +
    (hasWebGL2 ? 2 : 0) +
    (hasWebCodecs ? 2 : 0) +
    (sab ? 2 : 0) +
    Math.min(cores, 8) / 2 +
    Math.min(devMem, 8) / 2
  );
  const deviceTier = score >= 10 ? 'high' : score >= 6 ? 'mid' : 'low';

  return {
    wasm: hasWasm,
    workers: hasWorker,
    offscreenCanvas: hasOffscreenCanvas,
    webgpu: hasWebGPU,
    webgl2: hasWebGL2,
    webcodecs: hasWebCodecs,
    fsAccess: hasFSAccess,
    crossOriginIsolated,
    sharedArrayBuffer: sab,
    cores,
    deviceMemoryGB: devMem,
    deviceTier,
    ts: Date.now(),
  };
}
