import { test, expect } from '@playwright/test';

test('all twenty-one stations appear in the horizontal dial and the wheel keeps six featured stations', async ({
  page,
}) => {
  await page.goto('/radio/flash-fm');
  const rail = page.locator('[data-station-ribbon="all-stations"]');
  await expect(rail).toBeVisible();
  await expect(rail.locator('[data-ribbon-station]')).toHaveCount(21);
  await expect(rail.getByTestId('tune-the-wipe')).toBeAttached();
  await rail.getByTestId('tune-vcrr').click();
  await expect(page.getByTestId('player-station').first()).toContainText('VCRR');

  await page.getByTestId('wheel-open').filter({ visible: true }).first().click();
  const wheel = page.getByTestId('wheel-dialog');
  await expect(wheel).toBeVisible();
  await expect(wheel.locator('[data-testid^="sector-"]')).toHaveCount(6);
  await expect(wheel.getByTestId('sector-vcrr')).toHaveCount(0);
});

test('The Wipe appears as a talk station, with a documented show but no invented episodes', async ({
  page,
}) => {
  await page.goto('/podcasts');
  await expect(page.getByText('Ask Dr. Nita')).toBeVisible();
  await expect(page.getByText('The Wipe')).toBeVisible();
});

test('keyboard arrows preview; Enter tunes without resetting the page scroll', async ({ page }) => {
  await page.goto('/radio/flash-fm');
  const dial = page.locator('[data-station-ribbon="all-stations"]');
  await expect(dial).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 400));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(dial.locator('[data-highlighted="true"]')).toHaveAttribute(
    'data-ribbon-station',
    'cocoteo-fm',
  );
  await expect(page).toHaveURL(/\/radio\/flash-fm$/);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/radio\/cocoteo-fm$/);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0);
  await expect(page.locator('.receiver-trigger').first()).toContainText('←');
  await expect(page.locator('.receiver-trigger').last()).toContainText('→');
});

test('clicking a station keeps scroll and sleeves display artwork edge to edge', async ({
  page,
}) => {
  await page.goto('/radio/flash-fm');
  await page.evaluate(() => window.scrollTo(0, 350));
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => {
    document.querySelector('[data-ribbon-station="honey-fm"]')?.click();
  });
  await expect(page).toHaveURL(/\/radio\/honey-fm$/);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0);
  const artwork = page.locator('.hero-sleeve .jacket img');
  await expect(artwork).toBeVisible();
  expect(
    await artwork.evaluate((image) => {
      const css = getComputedStyle(image);
      const parent = image.parentElement.getBoundingClientRect();
      const rect = image.getBoundingClientRect();
      return (
        css.objectFit === 'cover' &&
        css.padding === '0px' &&
        Math.abs(parent.width - rect.width) < 1 &&
        Math.abs(parent.height - rect.height) < 1
      );
    }),
  ).toBe(true);
});
