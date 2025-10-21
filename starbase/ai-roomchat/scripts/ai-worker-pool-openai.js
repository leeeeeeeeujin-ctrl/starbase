#!/usr/bin/env node
/**
 * Practical AI Worker Pool using OpenAI API
 * 
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. npm run ai-workers tasks.json
 * 
 * tasks.json format:
 * [
 *   {
 *     "description": "Write tests for matching.js",
 *     "files": ["lib/rank/matching.js"],
 *     "instruction": "Write comprehensive Jest tests"
 *   }
 * ]
 */

const fs = require('fs');
const path = require('path');

async function callOpenAI(prompt, files = []) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  // Read file contents
  let context = '';
  for (const file of files) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      context += `\n\n=== ${file} ===\n${content}`;
    }
  }

  const fullPrompt = `${prompt}\n\nContext:${context}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert software engineer. Provide code solutions and analysis.'
          },
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${data.error?.message || response.statusText}`);
    }

    return data.choices[0].message.content;
  } catch (error) {
    throw new Error(`Failed to call OpenAI: ${error.message}`);
  }
}

async function executeWorkerPool(tasksFile) {
  console.log('🚀 Starting AI Worker Pool\n');
  
  // Load tasks
  const tasksPath = path.join(__dirname, '..', tasksFile);
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  
  console.log(`📋 Loaded ${tasks.length} tasks\n`);

  // Execute all tasks in parallel
  const startTime = Date.now();
  const promises = tasks.map(async (task, index) => {
    console.log(`🤖 Worker ${index + 1}: Starting "${task.description}"`);
    
    try {
      const result = await callOpenAI(task.instruction, task.files || []);
      console.log(`✅ Worker ${index + 1}: Complete`);
      
      return {
        taskIndex: index + 1,
        description: task.description,
        success: true,
        result: result
      };
    } catch (error) {
      console.error(`❌ Worker ${index + 1}: Failed - ${error.message}`);
      
      return {
        taskIndex: index + 1,
        description: task.description,
        success: false,
        error: error.message
      };
    }
  });

  const results = await Promise.all(promises);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Generate report
  console.log('\n' + '='.repeat(70));
  console.log('📊 AI Worker Pool - Execution Report');
  console.log('='.repeat(70));
  console.log(`⏱️  Total time: ${duration}s`);
  console.log(`✅ Successful: ${results.filter(r => r.success).length}`);
  console.log(`❌ Failed: ${results.filter(r => !r.success).length}`);
  console.log('='.repeat(70));

  // Save detailed results
  const reportPath = path.join(__dirname, '..', 'reports', 'ai-workers-report.json');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    duration: duration,
    tasks: tasks.length,
    results: results
  }, null, 2));

  console.log(`\n💾 Detailed report saved to: ${reportPath}`);

  // Print summaries
  results.forEach(result => {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🤖 Worker ${result.taskIndex}: ${result.description}`);
    console.log('─'.repeat(70));
    
    if (result.success) {
      console.log(result.result.substring(0, 500));
      if (result.result.length > 500) {
        console.log('\n... (see full report for complete output)');
      }
    } else {
      console.log(`❌ Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('✨ AI Worker Pool Complete!');
  console.log('='.repeat(70));
}

// Main
const tasksFile = process.argv[2];

if (!tasksFile) {
  console.error('Usage: node ai-worker-pool-openai.js <tasks.json>');
  console.error('\nExample tasks.json:');
  console.error(JSON.stringify([
    {
      description: "Write tests",
      files: ["lib/rank/matching.js"],
      instruction: "Write comprehensive Jest tests for this file"
    }
  ], null, 2));
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Error: OPENAI_API_KEY environment variable not set');
  console.error('\nSet it with:');
  console.error('  export OPENAI_API_KEY="sk-..."  # Linux/Mac');
  console.error('  $env:OPENAI_API_KEY="sk-..."   # PowerShell');
  process.exit(1);
}

executeWorkerPool(tasksFile).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
