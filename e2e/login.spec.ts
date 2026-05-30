import { test, expect } from '@playwright/test';

test('login spec', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveTitle(/CtxNote/);
  await page.screenshot({ path: 'login.png' });
});
