const nextJest = require('next/jest');

// Use Next's Jest preset which uses SWC for transforms and matches Next's
// module resolution. This avoids requiring a Babel config for Jest while
// keeping Next's SWC enabled for builds.
const createJestConfig = nextJest({ dir: './' });

const customJestConfig = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^.+\\.module\\.css$': '<rootDir>/ai-roomchat/__mocks__/styleMock.js',
    // Ensure Jest resolves to this package's React copies when workspace has
    // nested app copies (avoids multiple-react-copies and hooks errors).
    '^react$': '<rootDir>/node_modules/react',
    '^react-test-renderer$': '<rootDir>/node_modules/react-test-renderer',
  },
  modulePathIgnorePatterns: [
    '<rootDir>/docs/reference_data',
    '<rootDir>/reference_data',
    '<rootDir>/__mocks__',
    '<rootDir>/ai-roomchat',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/reports/junit',
        outputName: 'junit.xml',
        addFileAttribute: 'true',
      },
    ],
  ],
};

module.exports = createJestConfig(customJestConfig);
