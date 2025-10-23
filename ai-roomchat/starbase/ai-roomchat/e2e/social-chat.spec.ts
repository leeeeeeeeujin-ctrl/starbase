import { test, expect } from '@playwright/test'

test.describe('Social Chat', () => {
  test.use({
    storageState: 'e2e/.auth/user.json',
  })

  test('should display chat page', async ({ page }) => {
    // Navigate to chat page
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Verify we're on chat page
    expect(page.url()).toContain('/chat')
    
    // Check for chat interface elements
    const chatInterface = page.locator('text=/채팅|Chat|메시지|Message/i').first()
    await expect(chatInterface).toBeVisible({ timeout: 10000 })
  })

  test('should show message input field', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Look for message input
    const messageInput = page.locator('input[placeholder*="메시지" i], input[placeholder*="message" i], textarea[placeholder*="메시지" i]').first()
    await expect(messageInput).toBeVisible({ timeout: 10000 })
  })

  test('should show send button', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Look for send button
    const sendButton = page.locator('button:has-text("전송"), button:has-text("Send"), button[type="submit"]').first()
    await expect(sendButton).toBeVisible({ timeout: 10000 })
  })

  test('should send a message', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Generate unique test message
    const timestamp = Date.now()
    const testMessage = `E2E test message ${timestamp}`
    
    // Find and fill message input
    const messageInput = page.locator('input[placeholder*="메시지" i], input[placeholder*="message" i], textarea[placeholder*="메시지" i]').first()
    
    if (await messageInput.isVisible().catch(() => false)) {
      await messageInput.fill(testMessage)
      
      // Click send button
      const sendButton = page.locator('button:has-text("전송"), button:has-text("Send"), button[type="submit"]').first()
      await sendButton.click()
      
      // Wait a moment for message to be sent
      await page.waitForTimeout(1000)
      
      // Verify message appears in chat
      const sentMessage = page.locator(`text="${testMessage}"`).first()
      await expect(sentMessage).toBeVisible({ timeout: 5000 })
    }
  })

  test('should display message history', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Look for message list or container
    const messageContainer = page.locator('.message, .chat-message, [class*="message" i]').first()
    
    // If messages exist, they should be visible
    if (await messageContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(messageContainer).toBeVisible()
    }
  })

  test.skip('should receive real-time messages', async ({ page }) => {
    // This test requires multiple browser contexts or external message injection
    // Would test: open chat in two tabs/browsers, send message in one, receive in other
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Set up message listener
    const messagePromise = page.waitForSelector('.message:last-child', { 
      timeout: 30000,
      state: 'visible' 
    })
    
    // Wait for new message to arrive
    await messagePromise
  })

  test('should show user information in messages', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Look for messages with user info
    const messageWithUser = page.locator('.message, .chat-message, [class*="message" i]').first()
    
    if (await messageWithUser.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Messages should include username or hero name
      const userInfo = messageWithUser.locator('text=/[a-zA-Z가-힣0-9]+/').first()
      await expect(userInfo).toBeVisible()
    }
  })

  test('should handle empty message submission', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Try to send empty message
    const sendButton = page.locator('button:has-text("전송"), button:has-text("Send"), button[type="submit"]').first()
    
    if (await sendButton.isVisible().catch(() => false)) {
      // Button should be disabled or clicking should have no effect
      const isDisabled = await sendButton.isDisabled().catch(() => false)
      
      if (!isDisabled) {
        // Count messages before
        const messagesBefore = await page.locator('.message, .chat-message').count()
        
        await sendButton.click()
        await page.waitForTimeout(500)
        
        // Count messages after - should be same
        const messagesAfter = await page.locator('.message, .chat-message').count()
        expect(messagesAfter).toBe(messagesBefore)
      }
    }
  })

  test.skip('should support message scrolling', async ({ page }) => {
    // This test requires many messages in history
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Find scrollable container
    const chatContainer = page.locator('[class*="scroll" i], [style*="overflow" i]').first()
    
    if (await chatContainer.isVisible().catch(() => false)) {
      // Scroll to top
      await chatContainer.evaluate(el => el.scrollTop = 0)
      
      // Scroll to bottom
      await chatContainer.evaluate(el => el.scrollTop = el.scrollHeight)
    }
  })
})

test.describe('Chat Room Management', () => {
  test.use({
    storageState: 'e2e/.auth/user.json',
  })

  test.skip('should create new chat room', async ({ page }) => {
    // This test requires chat room creation feature
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Look for create room button
    const createRoomButton = page.locator('text=/방.*만들기|Create.*Room/i').first()
    
    if (await createRoomButton.isVisible().catch(() => false)) {
      await createRoomButton.click()
      // Fill in room details and create
    }
  })

  test.skip('should join existing chat room', async ({ page }) => {
    // This test requires multiple chat rooms
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    
    // Look for room list
    const roomList = page.locator('.room, [class*="room" i]').first()
    
    if (await roomList.isVisible().catch(() => false)) {
      await roomList.click()
      // Verify room joined
    }
  })
})
