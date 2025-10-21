process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'test-service-role-key'

// Suppress console.warn and console.error during tests to prevent test failures
// while keeping them available for debugging
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  // Keep log and info for test debugging
}
