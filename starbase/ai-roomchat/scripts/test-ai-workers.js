#!/usr/bin/env node
/**
 * Quick test runner for AI Worker Pool (OpenAI version)
 *
 * Usage:
 *   node scripts/test-ai-workers.js
 *
 * Environment:
 *   OPENAI_API_KEY - required
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY가 설정되지 않았습니다.\n');
  console.log('PowerShell에서 설정:');
  console.log('  $env:OPENAI_API_KEY="sk-your-key"\n');
  console.log('또는 .env 파일 생성:');
  console.log('  OPENAI_API_KEY=sk-your-key\n');
  process.exit(1);
}

console.log('🚀 AI Worker Pool 테스트 시작...\n');
console.log('📋 작업 파일: scripts/example-tasks.json');
console.log('🤖 사용 모델: OpenAI GPT-4\n');

try {
  // Check if example tasks exist
  const tasksPath = path.join(__dirname, 'example-tasks.json');
  if (!fs.existsSync(tasksPath)) {
    console.error('❌ example-tasks.json을 찾을 수 없습니다.');
    process.exit(1);
  }

  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  console.log(`✅ ${tasks.length}개 작업 로드됨\n`);

  tasks.forEach((task, i) => {
    console.log(`${i + 1}. ${task.description}`);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Execute
  const startTime = Date.now();

  execSync('node scripts/ai-worker-pool-openai.js scripts/example-tasks.json', {
    stdio: 'inherit',
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n✨ 완료! 총 소요 시간: ${duration}초`);
  console.log('\n📊 상세 결과: reports/ai-workers-report.json');
} catch (error) {
  console.error('\n❌ 실행 중 오류 발생:', error.message);
  process.exit(1);
}
