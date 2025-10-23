import { test as setup, expect } from '@playwright/test'

const authFile = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/auth-callback')
  
  // Note: This setup assumes OAuth login flow
  // For testing purposes, you may need to:
  // 1. Use a test user account
  // 2. Configure environment variables for test credentials
  // 3. Or use Supabase test authentication
  
  // Wait for authentication to complete
  // This will need to be adjusted based on your actual auth flow
  await page.waitForURL('/', { timeout: 10000 }).catch(() => {
    console.log('Auth flow may need manual configuration for E2E tests')
  })
  
  // Check if we're authenticated by looking for user-specific elements
  const isAuthenticated = await page.locator('text=/로그아웃|Logout/i').isVisible().catch(() => false)
  
  if (isAuthenticated) {
    // Save signed-in state to 'e2e/.auth/user.json'
    await page.context().storageState({ path: authFile })
    console.log('Authentication state saved successfully')
  } else {
    console.log('Warning: Authentication may not have completed. Some tests may fail.')
    // Save the current state anyway for tests that don't require auth
    await page.context().storageState({ path: authFile })
  }
})
