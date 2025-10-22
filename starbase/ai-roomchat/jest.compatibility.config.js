/**
 * Jest 호환성 테스트 설정
 * IE11+, Safari 12+, Chrome 70+, Firefox 65+ 호환성 검증
 */

module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: [
    '<rootDir>/__tests__/compatibility/**/*.test.js',
    '<rootDir>/**/*.compatibility.test.js'
  ],
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', {
          targets: {
            "ie": "11",
            "chrome": "70",
            "firefox": "65", 
            "safari": "12",
            "ios": "12"
          },
          useBuiltIns: 'usage',
          corejs: 3
        }],
        ['@babel/preset-react', {
          runtime: 'automatic'
        }]
      ]
    }]
  },
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  testEnvironmentOptions: {
    customExportConditions: ['']
  },
  collectCoverageFrom: [
    'utils/browserCompatibility.js',
    'utils/compatibilityManager.js',
    'utils/polyfills.js',
    'utils/mobileOptimizationManager.js',
    'utils/gameResourceManager.js',
    'utils/apiCompatibilityLayer.js',
    'components/game/UnifiedGameSystem.js',
    'components/maker/visual/VisualNodeEditor.js'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};