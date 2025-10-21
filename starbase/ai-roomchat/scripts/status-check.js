#!/usr/bin/env node
/**
 * Quick status check script
 * Shows git status, test status, and build health in one command
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(command, silent = false) {
  try {
    return execSync(command, { 
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit'
    });
  } catch (error) {
    return null;
  }
}

function checkFileExists(filePath) {
  return fs.existsSync(path.join(__dirname, '..', filePath));
}

console.log('🔍 Project Status Check\n');
console.log('='.repeat(50));

// 1. Git Status
console.log('\n📁 Git Status:');
run('git status --short');
const branch = run('git branch --show-current', true)?.trim();
console.log(`   Branch: ${branch || 'unknown'}`);

// 2. Environment Check
console.log('\n🔧 Environment:');
const hasEnv = checkFileExists('.env.local');
const hasEnvExample = checkFileExists('.env.local.example');
console.log(`   .env.local: ${hasEnv ? '✅' : '❌ Missing'}`);
console.log(`   .env.local.example: ${hasEnvExample ? '✅' : '❌ Missing'}`);

// 3. Dependencies
console.log('\n📦 Dependencies:');
const hasNodeModules = checkFileExists('node_modules');
console.log(`   node_modules: ${hasNodeModules ? '✅' : '❌ Run npm install'}`);

// 4. Build Check
console.log('\n🏗️  Build Status:');
const hasNext = checkFileExists('.next');
console.log(`   .next folder: ${hasNext ? '✅ Built' : '⚠️  Not built'}`);

// 5. Test Status (quick check)
console.log('\n🧪 Test Check:');
console.log('   Running quick test...');
const testResult = run('npm test -- --listTests 2>&1 | findstr /C:"test"', true);
if (testResult) {
  const testCount = (testResult.match(/\.test\.js/g) || []).length;
  console.log(`   Test files found: ${testCount}`);
}

// 6. Recent Activity
console.log('\n📝 Recent Commits:');
run('git log --oneline -3');

console.log('\n' + '='.repeat(50));
console.log('✨ Status check complete!\n');
