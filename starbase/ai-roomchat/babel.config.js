module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
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
        bugfixes: true      // 버그 수정 포함
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
    // Runtime 변환 (IE 호환)
    '@babel/plugin-transform-runtime'
  ],
  
  // 환경별 설정
  env: {
    // 개발 환경
    development: {
      plugins: []
    },
    
    // 프로덕션 환경
    production: {
      plugins: []
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
