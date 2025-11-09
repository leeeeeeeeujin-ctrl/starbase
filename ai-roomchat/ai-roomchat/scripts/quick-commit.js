#!/usr/bin/env node
/**
 * Quick commit script
 * Usage: npm run commit <type> <message>
 * Example: npm run commit feat "add matching engine"
 */

const { execSync } = require('child_process');

const validTypes = ['feat', 'fix', 'docs', 'chore', 'refactor', 'test', 'style'];
const type = process.argv[2];
const message = process.argv.slice(3).join(' ');

if (!type || !message) {
  console.log('❌ Usage: npm run commit <type> <message>');
  console.log('\nValid types:', validTypes.join(', '));
  console.log('\nExample:');
  console.log('  npm run commit feat "add new matching algorithm"');
  console.log('  npm run commit fix "resolve race condition in queue"');
  process.exit(1);
}

if (!validTypes.includes(type)) {
  console.log(`❌ Invalid commit type: ${type}`);
  console.log('Valid types:', validTypes.join(', '));
  process.exit(1);
}

try {
  console.log('📁 Staging changes...');
  execSync('git add .', { stdio: 'inherit' });

  console.log('💾 Committing...');
  execSync(`git commit -m "${type}: ${message}"`, { stdio: 'inherit' });

  console.log('\n✅ Committed successfully!');
  console.log(`   ${type}: ${message}`);

  // Show what's next
  console.log('\n📤 Next steps:');
  console.log('   git push origin main');
} catch (error) {
  console.error('❌ Commit failed:', error.message);
  process.exit(1);
}
