/**
 * 캐릭터 변수 시스템 단위 테스트
 * 
 * 캐릭터 데이터 → 게임 변수 연동 및 템플릿 컴파일 검증
 */

// 테스트용 캐릭터 데이터
const testCharacter = {
  id: 'test_hero_1',
  name: '전설의 기사',
  description: '용감하고 정의로운 전사',
  ability1: '검술의 달인',
  ability2: '방어 태세',
  ability3: '신성한 빛',
  ability4: '영웅의 외침',
  image_url: '/images/hero.jpg',
  background_url: '/images/castle.jpg',
  bgm_url: '/audio/heroic.mp3',
}

// 템플릿 컴파일 함수 (UnifiedGameSystem에서 복사)
function compileTemplate(template, variables = {}) {
  let compiled = template
  
  // 변수 치환
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(key.replace(/[{}]/g, '\\$&'), 'g')
    compiled = compiled.replace(regex, String(value))
  })

  // 조건부 블록 처리 {{#if 조건}} ... {{/if}}
  compiled = compiled.replace(/\{\{#if\s+(.+?)\}\}(.*?)\{\{\/if\}\}/gs, (match, condition, content) => {
    const conditionValue = variables[`{{${condition}}}`]
    return conditionValue ? content : ''
  })

  // 반복 블록 처리 {{#each 배열}} ... {{/each}}
  compiled = compiled.replace(/\{\{#each\s+(.+?)\}\}(.*?)\{\{\/each\}\}/gs, (match, arrayName, content) => {
    const arrayValue = variables[`{{${arrayName}}}`]
    if (Array.isArray(arrayValue)) {
      return arrayValue.map(item => content.replace(/\{\{this\}\}/g, item)).join('\n')
    }
    return ''
  })

  return compiled
}

// 캐릭터 변수 생성 함수
function generateCharacterVariables(character) {
  return {
    '{{캐릭터.이름}}': character.name != null ? String(character.name) : '익명',
    '{{캐릭터.설명}}': character.description != null ? String(character.description) : '',
    '{{캐릭터.능력1}}': character.ability1 != null ? String(character.ability1) : '',
    '{{캐릭터.능력2}}': character.ability2 != null ? String(character.ability2) : '',
    '{{캐릭터.능력3}}': character.ability3 != null ? String(character.ability3) : '',
    '{{캐릭터.능력4}}': character.ability4 != null ? String(character.ability4) : '',
    '{{캐릭터.이미지}}': character.image_url != null ? String(character.image_url) : '',
    '{{캐릭터.배경}}': character.background_url != null ? String(character.background_url) : '',
    '{{캐릭터.BGM}}': character.bgm_url != null ? String(character.bgm_url) : '',
    '{{캐릭터.HP}}': 100,
    '{{캐릭터.MP}}': 50,
    '{{캐릭터.레벨}}': 1,
  }
}

// 테스트 케이스들
const testCases = [
  {
    name: '기본 변수 치환 테스트',
    template: '안녕하세요! 저는 {{캐릭터.이름}}입니다. {{캐릭터.설명}}',
    expected: '안녕하세요! 저는 전설의 기사입니다. 용감하고 정의로운 전사',
  },
  {
    name: '능력 변수 테스트',
    template: '내 능력은: {{캐릭터.능력1}}, {{캐릭터.능력2}}, {{캐릭터.능력3}}, {{캐릭터.능력4}}',
    expected: '내 능력은: 검술의 달인, 방어 태세, 신성한 빛, 영웅의 외침',
  },
  {
    name: '조건부 블록 테스트 (능력1 존재)',
    template: '{{#if 캐릭터.능력1}}{{캐릭터.이름}}은(는) {{캐릭터.능력1}} 능력을 가지고 있습니다.{{/if}}',
    expected: '전설의 기사은(는) 검술의 달인 능력을 가지고 있습니다.',
  },
  {
    name: '조건부 블록 테스트 (빈 값)',
    template: '{{#if 캐릭터.존재하지않는능력}}이 텍스트는 나타나지 않아야 합니다.{{/if}}',
    expected: '',
  },
  {
    name: '복합 템플릿 테스트',
    template: `
🎭 캐릭터: {{캐릭터.이름}}
📝 설명: {{캐릭터.설명}}
{{#if 캐릭터.능력1}}⚡ 주요 능력: {{캐릭터.능력1}}{{/if}}
💚 생명력: {{캐릭터.HP}} | 💙 마나: {{캐릭터.MP}}
`,
    expected: `
🎭 캐릭터: 전설의 기사
📝 설명: 용감하고 정의로운 전사
⚡ 주요 능력: 검술의 달인
💚 생명력: 100 | 💙 마나: 50
`,
  },
]

// 테스트 실행
function runCharacterVariableTests() {
  console.log('🧪 캐릭터 변수 시스템 테스트 시작\n')
  
  const variables = generateCharacterVariables(testCharacter)
  let passedTests = 0
  let totalTests = testCases.length
  
  console.log('📊 생성된 변수들:')
  Object.entries(variables).forEach(([key, value]) => {
    console.log(`  ${key}: "${value}"`)
  })
  console.log('\n')
  
  testCases.forEach((testCase, index) => {
    console.log(`🔍 테스트 ${index + 1}: ${testCase.name}`)
    console.log(`   입력: "${testCase.template.trim()}"`)
    
    const result = compileTemplate(testCase.template, variables)
    const passed = result.trim() === testCase.expected.trim()
    
    console.log(`   출력: "${result.trim()}"`)
    console.log(`   예상: "${testCase.expected.trim()}"`)
    console.log(`   결과: ${passed ? '✅ 통과' : '❌ 실패'}\n`)
    
    if (passed) passedTests++
  })
  
  // 결과 요약
  console.log('📈 테스트 결과 요약:')
  console.log(`   총 테스트: ${totalTests}`)
  console.log(`   통과: ${passedTests}`)
  console.log(`   실패: ${totalTests - passedTests}`)
  console.log(`   성공률: ${Math.round(passedTests / totalTests * 100)}%`)
  
  return passedTests === totalTests
}

// 에지 케이스 테스트
function runEdgeCaseTests() {
  console.log('\n🔬 에지 케이스 테스트\n')
  
  const edgeTestCases = [
    {
      name: '빈 캐릭터 데이터',
      character: {},
      template: '{{캐릭터.이름}} {{캐릭터.설명}}',
      expected: '익명 ',
    },
    {
      name: 'null 값 처리',
      character: { name: null, description: null },
      template: '{{캐릭터.이름}} {{캐릭터.설명}}',
      expected: '익명 ',
    },
    {
      name: '특수문자 포함 템플릿',
      character: testCharacter,
      template: '{{캐릭터.이름}}의 "특별한" 모험! [레벨: {{캐릭터.레벨}}]',
      expected: '전설의 기사의 "특별한" 모험! [레벨: 1]',
    },
  ]
  
  let passed = 0
  
  edgeTestCases.forEach((testCase, index) => {
    console.log(`🧩 에지 케이스 ${index + 1}: ${testCase.name}`)
    
    const variables = generateCharacterVariables(testCase.character)
    const result = compileTemplate(testCase.template, variables)
    const success = result === testCase.expected
    
    console.log(`   결과: ${success ? '✅ 통과' : '❌ 실패'}`)
    console.log(`   출력: "${result}"`)
    console.log(`   예상: "${testCase.expected}"\n`)
    
    if (success) passed++
  })
  
  return passed === edgeTestCases.length
}

// 성능 테스트
function runPerformanceTest() {
  console.log('⚡ 성능 테스트\n')
  
  const variables = generateCharacterVariables(testCharacter)
  const complexTemplate = `
{{캐릭터.이름}}의 모험
설명: {{캐릭터.설명}}
능력1: {{캐릭터.능력1}}
능력2: {{캐릭터.능력2}}
능력3: {{캐릭터.능력3}}
능력4: {{캐릭터.능력4}}
{{#if 캐릭터.능력1}}주요 능력: {{캐릭터.능력1}}{{/if}}
{{#if 캐릭터.능력2}}보조 능력: {{캐릭터.능력2}}{{/if}}
상태: HP {{캐릭터.HP}}/100, MP {{캐릭터.MP}}/100
`
  
  const iterations = 1000
  const startTime = performance.now()
  
  for (let i = 0; i < iterations; i++) {
    compileTemplate(complexTemplate, variables)
  }
  
  const endTime = performance.now()
  const totalTime = endTime - startTime
  const avgTime = totalTime / iterations
  
  console.log(`📊 성능 측정 결과:`)
  console.log(`   반복 횟수: ${iterations}`)
  console.log(`   총 시간: ${totalTime.toFixed(2)}ms`)
  console.log(`   평균 시간: ${avgTime.toFixed(4)}ms`)
  console.log(`   초당 처리: ${Math.round(1000 / avgTime)}회`)
  
  return avgTime < 1 // 1ms 이내면 성능 양호
}

// 메인 테스트 실행
function runAllTests() {
  console.log('🚀 캐릭터 변수 시스템 전체 테스트 시작\n')
  console.log('='.repeat(60))
  
  const basicTestResult = runCharacterVariableTests()
  console.log('='.repeat(60))
  
  const edgeTestResult = runEdgeCaseTests()
  console.log('='.repeat(60))
  
  const perfTestResult = runPerformanceTest()
  console.log('='.repeat(60))
  
  console.log('\n🏁 전체 테스트 결과:')
  console.log(`   기본 테스트: ${basicTestResult ? '✅' : '❌'}`)
  console.log(`   에지 케이스: ${edgeTestResult ? '✅' : '❌'}`)
  console.log(`   성능 테스트: ${perfTestResult ? '✅' : '❌'}`)
  
  const allPassed = basicTestResult && edgeTestResult && perfTestResult
  console.log(`\n${allPassed ? '🎉 모든 테스트 통과!' : '⚠️  일부 테스트 실패'}`)
  
  return allPassed
}

// Node.js 환경에서 실행
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    runCharacterVariableTests,
    runEdgeCaseTests,
    runPerformanceTest,
    compileTemplate,
    generateCharacterVariables,
  }
}

// 브라우저 환경에서 실행
if (typeof window !== 'undefined') {
  window.CharacterVariableTests = {
    runAllTests,
    runCharacterVariableTests,
    runEdgeCaseTests,
    runPerformanceTest,
  }
}

// 직접 실행시 테스트 시작
if (require.main === module) {
  runAllTests()
}