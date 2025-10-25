// Minimal stub for useRunTurnApi to allow local builds when the full implementation
// is missing or intentionally excluded. This returns a factory that takes options
// and exposes a runTurn function which performs a no-op response. Replace with
// the real implementation when available.

function createRunTurnApi(_opts = {}) {
  async function runTurn(payload, _opts) {
    // Return a harmless stub response so the app can build and run locally.
    return {
      ok: false,
      data: null,
      error: 'useRunTurnApi stub: implementation not present in this working tree.'
    };
  }

  return { runTurn };
}

export default createRunTurnApi;
