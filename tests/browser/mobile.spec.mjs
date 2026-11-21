import { test, expect, devices } from '@playwright/test';
import {
  confirmSector,
  documentFits,
  expectPlayback,
  launchStation,
  openWheel,
} from './helpers.mjs';

test.use({
  ...devices['Pixel 7'],
  defaultBrowserType: 'chromium',
  viewport: { width: 412, height: 915 },
});

test('touch controls and the station wheel work on a portrait phone', async ({ page }) => {
  await page.goto('/');
  await documentFits(page);
  await page.getByTestId('enter').tap();
  await expectPlayback(page, 'flash-fm');
  const dialog = await openWheel(page);
  await expect(dialog).toBeVisible();
  await documentFits(page);
  await confirmSector(page, 'afro-bank');
  await expectPlayback(page, 'afro-bank');
  await documentFits(page);
  const target = await page.getByTestId('play').first().boundingBox();
  expect(target?.width).toBeGreaterThanOrEqual(40);
  expect(target?.height).toBeGreaterThanOrEqual(40);
});

test('a horizontal touchscreen swipe tunes the adjacent station', async ({ page, context }) => {
  await launchStation(page);
  const target = page.getByTestId('dial-swipe').first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  const device = await context.newCDPSession(page);
  const viewport = page.viewportSize();
  const left = Math.max(16, Math.min(box.x + box.width / 4, viewport.width - 130));
  const y = Math.min(viewport.height - 105, Math.max(35, box.y + Math.min(box.height * 0.42, 90)));
  const send = (type, x) =>
    device.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  try {
    await send('touchStart', left + 105);
    for (const distance of [85, 60, 35, 0]) await send('touchMove', left + distance);
    await send('touchEnd');
  } finally {
    await device.detach();
  }
  await expectPlayback(page, 'cocoteo-fm');
});
