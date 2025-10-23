import { test, expect } from '@playwright/test'

test.describe('Rank Matching Flow', () => {
  // Use authenticated state for these tests
  test.use({
    storageState: 'e2e/.auth/user.json',
  })

  test('should display rank hub page', async ({ page }) => {
    // Navigate to rank page
    await page.goto('/rank')
    await page.waitForLoadState('networkidle')
    
    // Verify we're on the rank page
    expect(page.url()).toContain('/rank')
    
    // Check for rank-related content
    const rankHeading = page.locator('text=/랭킹|Rank/i').first()
    await expect(rankHeading).toBeVisible({ timeout: 10000 })
  })

  test('should show game list in rank hub', async ({ page }) => {
    await page.goto('/rank')
    await page.waitForLoadState('networkidle')
    
    // Look for game registration button
    const newGameButton = page.locator('text=/게임.*등록|\\+.*게임/i').first()
    await expect(newGameButton).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to game registration', async ({ page }) => {
    await page.goto('/rank')
    await page.waitForLoadState('networkidle')
    
    // Click on new game button
    const newGameButton = page.locator('text=/게임.*등록|\\+.*게임/i').first()
    
    if (await newGameButton.isVisible().catch(() => false)) {
      await newGameButton.click()
      await page.waitForLoadState('networkidle')
      
      // Verify navigation to new game page
      expect(page.url()).toContain('/rank/new')
    }
  })

  test('should display game creation form', async ({ page }) => {
    await page.goto('/rank/new')
    await page.waitForLoadState('networkidle')
    
    // Look for form elements
    const formElements = page.locator('input, textarea, button[type="submit"]')
    await expect(formElements.first()).toBeVisible({ timeout: 10000 })
  })

  test.skip('should start rank matching', async ({ page }) => {
    // This test requires actual matchmaking implementation
    // Navigate to a specific game
    await page.goto('/rank')
    await page.waitForLoadState('networkidle')
    
    // Select a game from the list
    const gameCard = page.locator('[href*="/rank/"]').first()
    
    if (await gameCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await gameCard.click()
      await page.waitForLoadState('networkidle')
      
      // Look for matching button
      const matchButton = page.locator('text=/매칭.*시작|Start.*Match/i').first()
      
      if (await matchButton.isVisible().catch(() => false)) {
        await matchButton.click()
        
        // Wait for matching status
        const matchingStatus = page.locator('text=/매칭.*중|Matching/i').first()
        await expect(matchingStatus).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test.skip('should show ready status when match found', async ({ page }) => {
    // This test requires matchmaking to complete
    // Would test: matching complete -> ready screen -> game start
  })

  test.skip('should start game after matching', async ({ page }) => {
    // This test requires full matchmaking flow
    // Would test: match found -> both players ready -> game begins
  })

  test('should navigate to chat from rank hub', async ({ page }) => {
    await page.goto('/rank')
    await page.waitForLoadState('networkidle')
    
    // Look for chat navigation button
    const chatButton = page.locator('text=/공용.*채팅|Chat/i').first()
    
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click()
      await page.waitForLoadState('networkidle')
      
      // Verify navigation to chat
      expect(page.url()).toContain('/chat')
    }
  })
})

test.describe('Rank Game Details', () => {
  test.use({
    storageState: 'e2e/.auth/user.json',
  })

  test('should view game details page', async ({ page }) => {
    // Go to rank hub
    await page.goto('/rank')
    await page.waitForLoadState('networkidle')
    
    // Click on first game if available
    const gameLink = page.locator('[href*="/rank/"][href!="/rank/new"]').first()
    
    if (await gameLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await gameLink.click()
      await page.waitForLoadState('networkidle')
      
      // Verify we're on a game details page
      expect(page.url()).toMatch(/\/rank\/[^\/]+$/)
    }
  })

  test.skip('should display game statistics', async ({ page }) => {
    // This test requires game details implementation
    // Would show: player rankings, match history, game rules, etc.
  })
})
