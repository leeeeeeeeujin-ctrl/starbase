/**
 * Minimal flat ESLint config to prevent ESLint v9 from erroring when no
 * config is present. This intentionally keeps rules empty to avoid
 * changing lint behavior during this cleanup PR — it mainly prevents
 * the "ESLint couldn't find an eslint.config.(js|mjs|cjs) file" error.
 */
module.exports = [
  {
    // Only lint JavaScript/JSX files here to avoid requiring a
    // TypeScript parser for the whole workspace. CI uses the
    // repository's top-level ESLint config; this minimal config
    // prevents the "no config found" crash and keeps local lint
    // runs focused and fast.
    files: ['**/*.{js,jsx}'],
    ignores: [
      'node_modules/**',
      '.next/**',
      'public/**',
      'reports/**',
      'logs/**',
      // Exclude large third-party snapshots and archived copies
      // that cause parsing noise (TypeScript, enums, interfaces).
      'docs/reference_data/**',
      'archived/**',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // parserOptions must be nested under languageOptions in flat config
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // Register plugins so rule definitions are available locally.
    // This prevents "Definition for rule 'x' was not found" errors
    // when running eslint from the package folder.
    plugins: {
      import: require('eslint-plugin-import'),
      react: require('eslint-plugin-react'),
      'react-hooks': require('eslint-plugin-react-hooks'),
      '@next/next': require('@next/eslint-plugin-next'),
    },
    rules: {},
  },
];
