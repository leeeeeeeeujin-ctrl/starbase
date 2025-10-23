module.exports = [
  {
    ignores: ["node_modules/**"],
  },
  {
    languageOptions: {
      parser: require('@babel/eslint-parser'),
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [
            ["@babel/preset-react", { runtime: "automatic" }]
          ]
        }
      }
    },
    files: ["**/*.{js,jsx}"],
    plugins: {
      react: require("eslint-plugin-react"),
      'react-hooks': require('eslint-plugin-react-hooks'),
  import: require('eslint-plugin-import'),
  // eslint-plugin-next is ESM-only in some versions; use a local shim to
  // satisfy rule references used in comments/config without pulling the
  // full plugin. Register it under both 'next' and '@next/next' keys so
  // rule IDs in the code (e.g. @next/next/no-img-element) are recognized.
  next: require('./.eslintrc-shims/next-shim.cjs'),
  '@next/next': require('./.eslintrc-shims/next-shim.cjs')
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react/prop-types": "off",
      // react hooks rules for JS files
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // disable the Next.js specific img rule (project uses custom img patterns)
      '@next/next/no-img-element': 'off'
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    // TypeScript files: use @typescript-eslint parser and plugin
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: undefined,
        ecmaFeatures: { jsx: true }
      }
    },
    files: ["**/*.{ts,tsx}"],
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      'react-hooks': require('eslint-plugin-react-hooks')
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
