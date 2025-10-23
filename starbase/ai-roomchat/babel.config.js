module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // 호환성 중심 브라우저 타겟 설정
        targets: {
          browsers: [
            'ie >= 11', // Internet Explorer 11+
            'edge >= 14', // Edge 14+
            'chrome >= 70', // Chrome 70+
            'firefox >= 65', // Firefox 65+
            'safari >= 12', // Safari 12+
            'ios >= 12', // iOS Safari 12+
            'android >= 70', // Android Chrome 70+
            'samsung >= 10', // Samsung Internet 10+
          ],
          // Node.js 환경도 고려
          node: '14',
        },
        // 필요한 폴리필만 자동 주입
        useBuiltIns: 'usage',
        corejs: {
          version: 3,
          proposals: true,
        },
        // 모듈 시스템 설정
        modules: false, // Next.js가 처리하도록 함

        // 개발/프로덕션별 설정
        debug: process.env.NODE_ENV === 'development',

        // 변환 옵션
        loose: true, // 더 빠른 코드 생성
        bugfixes: true, // 버그 수정 포함

        // 제외할 변환들 (성능상 이유로)
        exclude: [
          'transform-typeof-symbol', // 불필요한 변환 제외
        ],
      },
    ],
    [
      '@babel/preset-react',
      {
        runtime: 'automatic',
        development: process.env.NODE_ENV === 'development',
        // IE에서도 동작하도록 클래식 JSX 변환 옵션
        pragma: process.env.NODE_ENV === 'production' ? 'React.createElement' : undefined,
      },
    ],
  ],

  // 추가 플러그인
  plugins: [
    // 클래스 속성 지원 (IE 호환)
    '@babel/plugin-transform-class-properties',

    // Optional Chaining & Nullish Coalescing (IE 호환)
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-nullish-coalescing-operator',

    // Private 메서드 (최신 브라우저 지원)
    '@babel/plugin-transform-private-methods',
  ],

  // 환경별 설정
  env: {
    // 개발 환경
    development: {
      plugins: [],
    },

    // 프로덕션 환경
    production: {
      plugins: [],
    },

    // 테스트 환경
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: { node: 'current' },
            modules: 'commonjs', // Jest가 요구하는 형식
          },
        ],
      ],
    },
  },
};
