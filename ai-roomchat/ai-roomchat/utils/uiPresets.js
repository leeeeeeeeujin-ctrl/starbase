// Shared UI preset utilities to avoid duplication across editors/panels

// Return the standard modules for the Main Game UI preset
export function getMainUiModules() {
  return [
    { type: 'MainGameChat', id: 'gameChat' },
    { type: 'SharedChat', id: 'sharedChat', enabled: true, realtimeOnly: true },
    { type: 'NextBar', id: 'nextBar', policy: { timeoutSec: 60, roleThreshold: 0.5 } },
    { type: 'CharacterCards', id: 'charCards', behavior: { tapCycle: ['desc', 'abilities', 'score', 'image'], darkenOnOverlay: true } },
    { type: 'WidgetRow', id: 'widgetRow' },
  ];
}

// Apply the Main Game UI preset to a template object and return a new object
export function applyMainUiPresetObject(obj) {
  const base = obj && typeof obj === 'object' ? obj : {};
  return {
    ...base,
    ui: {
      ...(base.ui || {}),
      main: {
        modules: getMainUiModules(),
      },
    },
  };
}

// Apply the preset to a JSON string, returning pretty JSON string
export function applyMainUiPresetText(jsonText) {
  let obj = {};
  try { obj = JSON.parse(String(jsonText || '{}')); } catch {}
  const out = applyMainUiPresetObject(obj);
  return JSON.stringify(out, null, 2);
}
