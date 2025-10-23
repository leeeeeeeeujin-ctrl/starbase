# E2E Testing Documentation

## Overview

This project uses [Playwright](https://playwright.dev/) for end-to-end testing. The E2E test suite covers critical user flows including character creation, rank matching, and social chat functionality.

## Quick Start

### Install Playwright Browsers

```bash
npx playwright install
```

Or install specific browsers:

```bash
npx playwright install chromium
npx playwright install firefox
npx playwright install webkit
```

### Run Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run specific test file
npx playwright test e2e/character-to-game.spec.ts

# Run tests on specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
npx playwright test --project=mobile-chrome
npx playwright test --project=mobile-safari
```

### Debug Tests

```bash
# Run tests in UI mode (interactive debugging)
npx playwright test --ui

# Debug specific test
npx playwright test --debug e2e/character-to-game.spec.ts

# Show test report
npx playwright show-report
```

## Test Structure

### Test Files

All E2E tests are located in the `e2e/` directory:

- **`auth.setup.ts`** - Authentication setup that runs before all tests
- **`character-to-game.spec.ts`** - Character creation and game flow (7 tests)
- **`rank-matching.spec.ts`** - Rank system and matchmaking (9 tests)
- **`social-chat.spec.ts`** - Chat functionality (11 tests)
- **`battle-log.spec.ts`** - Battle log replay (placeholder)

### Configuration

Test configuration is defined in `playwright.config.ts`:

- **Test Directory**: `./e2e`
- **Base URL**: `http://localhost:3000` (configurable via `PLAYWRIGHT_BASE_URL`)
- **Timeout**: 30 seconds per test
- **Retries**: 2 automatic retries on failure
- **Parallel Execution**: Enabled for faster test runs
- **Screenshots**: Captured only on failure
- **Videos**: Recorded only on failure
- **Trace**: Recorded on first retry

### Browser Coverage

Tests run on multiple browsers and devices:

- **Desktop**: Chrome, Firefox, Safari
- **Mobile**: Chrome (Pixel 5), Safari (iPhone 12)

## Test Scenarios

### Character Creation Flow

Tests in `character-to-game.spec.ts`:

1. ✅ Navigate to character creation page
2. ✅ Display character creation form
3. ✅ Create character with valid data
4. ✅ Navigate to character dashboard after creation
5. ✅ Show game start option on character page
6. ⏭️ Start game and show game interface (skipped - pending implementation)
7. ⏭️ Handle game completion flow (skipped - pending implementation)

### Rank Matching Flow

Tests in `rank-matching.spec.ts`:

1. ✅ Display rank hub page
2. ✅ Show game list in rank hub
3. ✅ Navigate to game registration
4. ✅ Display game creation form
5. ⏭️ Start rank matching (skipped - requires matchmaking)
6. ⏭️ Show ready status when match found (skipped)
7. ⏭️ Start game after matching (skipped)
8. ✅ Navigate to chat from rank hub
9. ✅ View game details page
10. ⏭️ Display game statistics (skipped)

### Social Chat Flow

Tests in `social-chat.spec.ts`:

1. ✅ Display chat page
2. ✅ Show message input field
3. ✅ Show send button
4. ✅ Send a message
5. ✅ Display message history
6. ⏭️ Receive real-time messages (skipped - requires multiple contexts)
7. ✅ Show user information in messages
8. ✅ Handle empty message submission
9. ⏭️ Support message scrolling (skipped)
10. ⏭️ Create new chat room (skipped)
11. ⏭️ Join existing chat room (skipped)

Legend: ✅ Active test | ⏭️ Skipped (pending feature implementation)

## Authentication

### Setup

The `e2e/auth.setup.ts` file handles authentication before tests run. It:

1. Navigates to the authentication flow
2. Attempts to authenticate (OAuth or other method)
3. Saves the authenticated state to `e2e/.auth/user.json`

### Using Auth in Tests

Tests that require authentication use the saved state:

```typescript
test.use({
  storageState: 'e2e/.auth/user.json',
})
```

### Note on Test Credentials

For automated testing, you may need to:

- Configure test user credentials as environment variables
- Set up a test-specific authentication flow
- Use Supabase test authentication methods

## CI/CD Integration

### GitHub Actions

E2E tests run automatically on:

- Push to `main` branch
- Pull requests
- Manual workflow dispatch

See `.github/workflows/e2e-tests.yml` for configuration.

### Workflow Steps

1. Checkout code
2. Setup Node.js 18
3. Install dependencies
4. Install Playwright browsers
5. Build application
6. Start development server
7. Wait for server to be ready
8. Run Playwright tests
9. Upload test reports and results as artifacts

### Viewing Results

Test reports and screenshots/videos are uploaded as GitHub Actions artifacts:

- `playwright-report` - HTML test report
- `playwright-test-results` - Test results including screenshots and videos

## Best Practices

### Writing Tests

1. **Use descriptive test names** that explain what is being tested
2. **Keep tests focused** - each test should verify one specific behavior
3. **Use meaningful selectors** - prefer semantic selectors over CSS classes
4. **Handle async operations** properly with `waitFor` methods
5. **Add timeouts** for elements that may take time to load
6. **Skip incomplete features** with `test.skip()` instead of removing tests

### Debugging Failed Tests

1. **Check screenshots** - automatically captured on failure
2. **Review videos** - recorded for failed tests
3. **Use trace viewer** - `npx playwright show-trace trace.zip`
4. **Run in headed mode** - see what the browser is doing
5. **Use Playwright Inspector** - step through tests interactively

### Performance Tips

1. **Reuse authentication** - use setup project to authenticate once
2. **Run tests in parallel** - enabled by default in config
3. **Use specific selectors** - faster than broad searches
4. **Minimize network calls** - tests run faster with good selectors

## Troubleshooting

### Common Issues

**"Browser executable doesn't exist at..."**
- Solution: Run `npx playwright install`

**"Test timeout exceeded"**
- Solution: Increase timeout in test or config
- Check if server is running properly

**"Page navigation timeout"**
- Solution: Ensure app is running on correct port
- Check PLAYWRIGHT_BASE_URL environment variable

**"Element not found"**
- Solution: Check if element exists on page
- Add proper wait conditions
- Verify selectors are correct

### Getting Help

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Discord](https://aka.ms/playwright/discord)
- Check test reports in `playwright-report/`

## Future Enhancements

Planned improvements for E2E test suite:

- [ ] Complete skipped tests as features are implemented
- [ ] Add visual regression testing
- [ ] Add API testing with Playwright
- [ ] Add performance monitoring
- [ ] Expand mobile device coverage
- [ ] Add accessibility testing with Playwright's accessibility features
- [ ] Implement test data management
- [ ] Add cross-browser screenshot comparison

## Environment Variables

Configure test behavior with environment variables:

- `PLAYWRIGHT_BASE_URL` - Base URL for tests (default: http://localhost:3000)
- `CI` - Set to true to enable CI-specific behavior

## File Structure

```
e2e/
├── .auth/                    # Authenticated state (gitignored)
│   └── user.json            # Saved authentication state
├── auth.setup.ts            # Authentication setup
├── character-to-game.spec.ts # Character creation tests
├── rank-matching.spec.ts     # Rank matching tests
├── social-chat.spec.ts       # Chat functionality tests
└── battle-log.spec.ts        # Battle log tests

playwright.config.ts          # Playwright configuration
playwright-report/            # Test reports (gitignored)
test-results/                 # Test results (gitignored)
```

---

Last Updated: 2025-10-23
