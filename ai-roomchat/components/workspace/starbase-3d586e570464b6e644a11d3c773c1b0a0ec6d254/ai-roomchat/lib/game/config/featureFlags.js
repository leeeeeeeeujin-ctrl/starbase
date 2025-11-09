// Runtime feature flags for the game runtime and play scaffold.
// Defaults aim for full parity (everything on). Overrides via env or URL query.

export const DEFAULT_FLAGS = {
  canvas: true,
  chat: true,
  ai: true,
  mobileControls: true,
  characterAutoload: true,
  runtimeLoader: false,
};

function fromEnv() {
  if (typeof process === "undefined" || !process.env) return {};
  const v = (k, d) => {
    const raw = process.env[k];
    if (raw == null) return d;
    return /^(1|true|on|yes)$/i.test(String(raw));
  };
  return {
    canvas: v("NEXT_PUBLIC_GAME_CANVAS", undefined),
    chat: v("NEXT_PUBLIC_GAME_CHAT", undefined),
    ai: v("NEXT_PUBLIC_GAME_AI", undefined),
    mobileControls: v("NEXT_PUBLIC_GAME_MOBILE", undefined),
    characterAutoload: v("NEXT_PUBLIC_GAME_CHAR_AUTOLOAD", undefined),
    runtimeLoader: v("NEXT_PUBLIC_GAME_RUNTIME_LOADER", undefined),
  };
}

function fromQuery() {
  if (typeof window === "undefined") return {};
  const url = new URL(window.location.href);
  // Pattern 1: ff=list e.g., ?ff=canvas,chat,ai
  const list = (url.searchParams.get("ff") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = {};
  if (list.length) {
    // if ff present, disable all then enable listed
    for (const k of Object.keys(DEFAULT_FLAGS)) out[k] = false;
    for (const k of list) if (k in DEFAULT_FLAGS) out[k] = true;
  }
  // Pattern 2: explicit keys e.g., ?chat=0&ai=1
  for (const k of Object.keys(DEFAULT_FLAGS)) {
    if (url.searchParams.has(k)) {
      out[k] = /^(1|true|on|yes)$/i.test(url.searchParams.get(k));
    }
  }
  return out;
}

export function getFeatureFlags() {
  const env = fromEnv();
  const q = fromQuery();
  return { ...DEFAULT_FLAGS, ...env, ...q };
}

export function useFeatureFlags() {
  const [flags, setFlags] = require("react").useState(getFeatureFlags());
  require("react").useEffect(() => {
    const onPop = () => setFlags(getFeatureFlags());
    if (typeof window !== "undefined") window.addEventListener("popstate", onPop);
    return () => { if (typeof window !== "undefined") window.removeEventListener("popstate", onPop); };
  }, []);
  return flags;
}
