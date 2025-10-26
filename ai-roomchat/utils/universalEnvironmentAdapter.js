/**
 * Runtime chooser for UniversalEnvironmentAdapter
 *
 * This file deliberately avoids top-level requires of Node built-ins so that
 * client bundles (Next.js/webpack) don't accidentally include server-only
 * modules like `fs`. It selects the proper implementation at runtime using
 * an indirection that avoids static analysis by bundlers.
 */

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

let mod = null;

if (isNode) {
  try {
    // Use eval('require') to avoid bundler static analysis including Node built-ins
    const _req = eval('require');
    mod = _req('./universalEnvironmentAdapter.node.js');
  } catch (err) {
    // Fallback to browser implementation if node one fails to load
    try {
      const _req = eval('require');
      mod = _req('./universalEnvironmentAdapter.browser.js');
    } catch (e) {
      mod = null;
    }
  }
} else {
  try {
    // In browser/build, prefer the browser implementation. Using eval to avoid
    // static require detection.
    const _req = eval('require');
    mod = _req('./universalEnvironmentAdapter.browser.js');
  } catch (err) {
    mod = null;
  }
}

const universalAdapter = (mod && (mod.universalAdapter || mod.default || mod)) || null;

export { universalAdapter };
export const isNodeEnvironment = () => isNode;
export const isBrowserEnvironment = () => !isNode;
export default universalAdapter;
