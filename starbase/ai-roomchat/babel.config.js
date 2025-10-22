module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // 호환성 중심 브라우저 타겟 설정
        targets: {
          browsers: [
            'ie >= 11',           // Internet Explorer 11+
            'edge >= 14',         // Edge 14+  
            'chrome >= 70',       // Chrome 70+
            'firefox >= 65',      // Firefox 65+
            'safari >= 12',       // Safari 12+
            'ios >= 12',          // iOS Safari 12+
            'android >= 70',      // Android Chrome 70+
            'samsung >= 10'       // Samsung Internet 10+
          ],
          // Node.js 환경도 고려
          node: '14'
        },
        // 필요한 폴리필만 자동 주입
        useBuiltIns: 'usage',
        corejs: {
          version: 3,
          proposals: true
        },
        // 모듈 시스템 설정
        modules: false, // Next.js가 처리하도록 함
        
        // 개발/프로덕션별 설정
        debug: process.env.NODE_ENV === 'development',
        
        // 변환 옵션
        loose: true,        // 더 빠른 코드 생성
        bugfixes: true,     // 버그 수정 포함
        
        // 제외할 변환들 (성능상 이유로)
        exclude: [
          'transform-typeof-symbol'  // 불필요한 변환 제외
        ]
      }
    ],
    [
      '@babel/preset-react',
      {
        runtime: 'automatic',
        development: process.env.NODE_ENV === 'development',
        // IE에서도 동작하도록 클래식 JSX 변환 옵션
        pragma: process.env.NODE_ENV === 'production' ? 'React.createElement' : undefined
      }
    ]
  ],
  
  // 추가 플러그인
  plugins: [
    // 클래스 속성 지원 (IE 호환)
    '@babel/plugin-proposal-class-properties',
    
    // Optional Chaining & Nullish Coalescing (IE 호환)
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator',
    
    // Private 메서드 (최신 브라우저 지원)
    '@babel/plugin-proposal-private-methods',
    
    // 동적 import (코드 분할용)
    '@babel/plugin-syntax-dynamic-import',
    
    // 환경별 조건부 컴파일
    [
      'babel-plugin-transform-define',
      {
        'process.env.BABEL_ENV': process.env.BABEL_ENV || process.env.NODE_ENV,
        'process.env.SUPPORT_IE': process.env.SUPPORT_IE === 'true'
      }
    ]
  ],
  
  // 환경별 설정
  env: {
    // 개발 환경
    development: {
      plugins: [
        // Hot reloading 지원
        'react-refresh/babel'
      ]
    },
    
    // 프로덕션 환경
    production: {
      plugins: [
        // Dead code elimination
        'babel-plugin-transform-remove-console',
        
        // 번들 크기 최적화
        [
          'babel-plugin-transform-imports',
          {
            'lodash': {
              transform: 'lodash/${member}',
              preventFullImport: true
            }
          }
        ]
      ]
    },
    
    // 테스트 환경
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: { node: 'current' },
            modules: 'commonjs'  // Jest가 요구하는 형식
          }
        ]
      ]
    }
  }
}
