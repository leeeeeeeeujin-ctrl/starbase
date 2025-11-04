// A minimal string replace loader to convert bare `URL(` to `new URL(`.
// Skips common safe patterns: createObjectURL, revokeObjectURL, toDataURL.
module.exports = function transformURLLoader(source) {
  if (typeof source !== 'string') source = String(source);
  if (!source.includes('URL(')) return source;
  const re = /(^|[^A-Za-z_.$])URL\s*\(/g;
  const skipRe = /(createObjectURL\s*\(|revokeObjectURL\s*\(|toDataURL\s*\()/;
  if (skipRe.test(source)) {
    // Still replace other occurrences line-by-line to be conservative
  }
  return source.replace(re, (m, p1) => `${p1 || ''}new URL(`);
};

