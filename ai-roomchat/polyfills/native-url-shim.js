// Shim for Next's compiled native-url; provides a callable/constructable URL
const nodeUrl = require('url');

function URLShim(u, b) {
  return new nodeUrl.URL(u, b);
}

try { URLShim.prototype = nodeUrl.URL.prototype; } catch {}

module.exports = {
  URL: URLShim,
};

