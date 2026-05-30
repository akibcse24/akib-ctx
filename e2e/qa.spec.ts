import { test, expect } from '@playwright/test';

test.describe('CtxNote QA Tests', () => {
  let testEmail;
  let testPassword;

  test.beforeEach(async ({ page }) => {
    testEmail = `test_${Date.now()}@example.com`;
    testPassword = 'Password123!';

    // Sign up
    await page.goto('/signup');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button:has-text("Create Account")');
    await page.waitForURL('**/', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
  });

  test('create a new workspace and verify canvas interactions', async ({ page }) => {
    // Click exactly on the big primary "Create Workspace" button inside the main view
    const createWorkspaceBtn = page.getByRole('button', { name: 'Create Workspace' }).first();
    await createWorkspaceBtn.click();

    // Fill the dialog input directly using a robust locator
    await page.fill('input[placeholder="My Study Board"]', 'QA Test Workspace');

    // Click the actual Create button in the dialog
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Wait for the workspace to load and the canvas to be visible
    await page.waitForSelector('.react-flow__pane', { timeout: 15000 });

    // Wait for tutorial to be ready and clear it
    await page.waitForTimeout(2000);

    const closeBtns = await page.locator('button svg.lucide-x').all();
    for (const btn of closeBtns) {
        if (await btn.isVisible()) {
            await btn.click({ force: true });
        }
    }

    let nextBtn = page.getByRole('button', { name: /next/i }).first();
    while (await nextBtn.isVisible()) {
        await nextBtn.click({ force: true });
        await page.waitForTimeout(500);
        nextBtn = page.getByRole('button', { name: /next/i }).first();
    }

    const finishBtn = page.getByRole('button', { name: /finish/i }).first();
    if (await finishBtn.isVisible()) {
        await finishBtn.click({ force: true });
    }

    await page.waitForTimeout(1000);

    // Double-click is disabled in code, so use the Add Content toolbar
    // Click "Add content" (Plus icon)
    await page.getByTitle('Add content').click();
    await page.waitForTimeout(500);

    // Click "Text" in the menu
    await page.getByText('Text', { exact: true }).click();
    await page.waitForTimeout(1000);

    const nodes = page.locator('.react-flow__node');
    await expect(nodes.first()).toBeVisible({ timeout: 5000 });

    // Add another node (e.g., Image)
    await page.getByTitle('Add content').click();
    await page.waitForTimeout(500);
    await page.getByText('Image', { exact: true }).click();
    await page.waitForTimeout(1000);

    await expect(nodes).toHaveCount(2);

    // Move the second node so they aren't completely overlapping
    await page.mouse.move(page.viewportSize().width / 2, page.viewportSize().height / 2);
    await page.mouse.down();
    await page.mouse.move(page.viewportSize().width / 2 + 300, page.viewportSize().height / 2);
    await page.mouse.up();
    await page.waitForTimeout(1000);

    // Try connecting nodes
    // First, verify there are handles (source/target ports)
    const sourceHandle = page.locator('.react-flow__node').nth(0).locator('.react-flow__handle').first();
    const targetHandle = page.locator('.react-flow__node').nth(1).locator('.react-flow__handle').first();

    // React flow connecting (drag from source to target)
    if (await sourceHandle.isVisible() && await targetHandle.isVisible()) {
      await sourceHandle.hover();
      await page.mouse.down();
      await targetHandle.hover();
      await page.mouse.up();

      // Check if an edge was created
      await expect(page.locator('.react-flow__edge').first()).toBeVisible({ timeout: 5000 });
    }

    await page.screenshot({ path: 'qa-canvas-success.png' });
  });
});
