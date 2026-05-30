import { test, expect } from '@playwright/test';

test('signup spec', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/CtxNote/);

  // Navigate to sign up
  await page.click('text=Sign up');
  await expect(page).toHaveURL(/.*signup/);

  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  // Fill in sign up form
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);

  // Find Create Account button and click
  await page.click('button:has-text("Create Account")');

  // Should redirect to dashboard or app
  await page.waitForURL('**/', { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: 'signup-success.png' });
});
