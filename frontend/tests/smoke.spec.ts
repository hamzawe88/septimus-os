import { test, expect } from '@playwright/test';

test.describe('Septimus OS Smoke Tests', () => {
  test('App loads cleanly and renders login screen', async ({ page }) => {
    // Navigate to local frontend instance or test server
    await page.goto(process.env.TEST_URL || 'http://localhost:3000');

    // Verify page title / heading is present without crash or fatal console errors
    await expect(page).toHaveTitle(/Septimus|Next/i);

    // Verify company name or login container renders
    const loginContainer = page.locator('.login-screen');
    await expect(loginContainer).toBeVisible({ timeout: 10000 });

    // Verify admin default email is populated or input exists
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    await expect(emailInput).toBeVisible();
  });
});
