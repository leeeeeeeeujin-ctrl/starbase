// Minimal jest setup: set env vars and guarded jest mocks

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'test-service-role-key';

// Set React act environment flag used by react-test-renderer / react-dom
if (typeof globalThis !== 'undefined') {
  try {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  } catch (e) {
    /* ignore */
  }
}

// Suppress React act dev warnings in console.error during tests to avoid
// failing suites where act-related updates are noisy. Tests that need to
// assert on these warnings should re-enable or spy on console.error.
if (typeof console !== 'undefined' && typeof console.error === 'function') {
  const _origConsoleError = console.error.bind(console);
  console.error = (...args) => {
    try {
      const msg = args[0] || '';
      if (typeof msg === 'string' && msg.includes('not wrapped in act(')) return;
      if (typeof msg === 'string' && msg.includes('wrap-tests-with-act')) return;
    } catch (e) {
      // ignore
    }
    _origConsoleError(...args);
  };
}

// Guarded jest-only mocks so importing this file outside of jest is safe
if (typeof jest !== 'undefined' && typeof jest.mock === 'function') {
  // Note: Avoid requiring or mocking React here synchronously because that
  // can recurse into Jest's module system. If multiple copies of React in
  // the workspace cause hooks to break, prefer setting moduleNameMapper in
  // jest.config.js to point ^react$ and ^react-test-renderer$ to this
  // package's node_modules. We keep this file minimal and guarded.
  jest.mock('@/lib/realtime/broadcast', () => ({
    subscribeToBroadcastTopic: () => () => {},
    subscribeToBroadcastTopics: () => [],
  }));

  jest.mock('next/router', () => ({
    useRouter: () => ({
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(() => Promise.resolve()),
      replace: jest.fn(() => Promise.resolve()),
      prefetch: jest.fn(() => Promise.resolve()),
      reload: jest.fn(() => {}),
      back: jest.fn(() => {}),
      events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() },
    }),
  }));

  // Wrap listeners registered via subscribeGameMatchData so emitted updates run inside act()
  try {
    const actualMatchData = jest.requireActual('modules/rank/matchDataStore');
    jest.mock('modules/rank/matchDataStore', () => ({
      ...actualMatchData,
      subscribeGameMatchData: (gameId, listener) => {
        const wrapped = snapshot => {
          try {
            const { act } = require('react-test-renderer');
            act(() => {
              listener(snapshot);
            });
          } catch (e) {
            // fallback without act if something goes wrong
            listener(snapshot);
          }
        };
        return actualMatchData.subscribeGameMatchData(gameId, wrapped);
      },
    }));
  } catch (e) {
    // ignore if module can't be required in this context
  }
}

