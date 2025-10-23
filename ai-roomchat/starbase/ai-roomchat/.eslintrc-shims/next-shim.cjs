// Minimal shim for @next/next rules used in comments/config
// This defines a no-op 'no-img-element' rule so ESLint won't error when the real
// Next.js ESLint plugin is not require()-able in this environment.
module.exports = {
  rules: {
    'no-img-element': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Shim for @next/next/no-img-element (noop in this repo)',
        },
        schema: [],
      },
      create(context) {
        // no-op implementation: do not report anything
        return {};
      },
    },
  },
};
