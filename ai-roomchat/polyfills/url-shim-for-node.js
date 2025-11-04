// Webpack alias target to replace 'url' and 'node:url' during SSR build
// Exports everything from Node's 'url' but overrides URL to accept calls without `new`.
const nodeUrl = require('url');

function URLWrapper(u, b) {
  return new nodeUrl.URL(u, b);
}

// Copy static props if any (Node's URL usually doesn't carry browser static methods)
try {
  Object.setPrototypeOf(URLWrapper, nodeUrl.URL);
} catch {}

module.exports = {
  ...nodeUrl,
  URL: URLWrapper,
};

