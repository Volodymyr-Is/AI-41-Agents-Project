import { expect, test } from '@playwright/test';

test('головна сторінка FitPulse AI відображає інтерфейс спортивного щоденника', async ({ page }, testInfo) => {
  await page.goto('/');

  await expect(page.getByText('FitPulse').first()).toBeVisible();

  const screenshotPath = testInfo.outputPath('home.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach('home', { path: screenshotPath, contentType: 'image/png' });
});
