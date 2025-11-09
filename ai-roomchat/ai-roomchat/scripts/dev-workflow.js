#!/usr/bin/env node
/**
 * Complete dev workflow automation
 * Runs tests, commits, and optionally pushes
 * Usage: npm run workflow <message>
 */

const { execSync } = require('child_process');

function run(command, description) {
  console.log(`\n🔄 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} complete`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed`);
    return false;
  }
}

const message = process.argv.slice(2).join(' ');
if (!message) {
  console.log('❌ Usage: npm run workflow <commit message>');
  console.log('Example: npm run workflow "add hybrid matching system"');
  process.exit(1);
}

console.log('🚀 Starting dev workflow...');
console.log('='.repeat(50));

// 1. Run tests
if (!run('npm test', 'Running tests')) {
  console.log('\n⚠️  Tests failed. Commit anyway? (Ctrl+C to cancel)');
  process.exit(1);
}

// 2. Git status
console.log('\n📋 Current changes:');
run('git status --short', 'Checking git status');

// 3. Commit
if (!run(`git add . && git commit -m "chore: ${message}"`, 'Committing changes')) {
  console.log('\n⚠️  Nothing to commit or commit failed');
}

// 4. Ask about push
console.log('\n' + '='.repeat(50));
console.log('✨ Workflow complete!');
console.log('\n📤 Ready to push. Run:');
console.log('   git push origin main');
