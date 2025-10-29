const { verifyProviderResponse } = require('../lib/providers/verifyProviderResponse')

function testCase(renderedPrompt, providerResponse) {
  const result = verifyProviderResponse({ renderedPrompt, providerResponse })
  console.log('Rendered prompt:', renderedPrompt)
  console.log('Provider response:', JSON.stringify(providerResponse, null, 2))
  console.log('Verification result:', JSON.stringify(result, null, 2))
}

// Happy path
testCase('Hello Tester', { text: 'Hello Tester', rendered_prompt: 'Hello Tester' })

// Mismatch path
testCase('Hello Tester', { text: 'Hello Other', rendered_prompt: 'Hello Other' })

// Banned pattern
testCase('Hello Tester', { text: 'This contains SECRET_KEY=abc123' })
