import { test, expect } from '@playwright/test';
import { openWheel } from './helpers.mjs';

const armPreferences = (page, confirmOnRelease) =>
  page.addInitScript((release) => {
    localStorage.setItem(
      'leonida.fm.preferences.v1',
      JSON.stringify({ confirmOnRelease: release, motion: 'reduce' }),
    );
  }, confirmOnRelease);

async function wheelPoints(dialog) {
  const box = await dialog.locator('svg.lfm-wheel-face').boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const count = (await dialog.getByRole('button', { pressed: false }).count()) + 1;
  const point = (index) => ({
    x: center.x + Math.sin((Math.PI * 2 * index) / count) * box.width * 0.35,
    y: center.y - Math.cos((Math.PI * 2 * index) / count) * box.height * 0.35,
  });
  return { center, first: point(0), second: point(1) };
}

async function move(mouse, point) {
  await mouse.move(point.x, point.y);
}

for (const release of [false, true]) {
  test(`wheel ${release ? 'hold/release' : 'click'} mode cancels a drag ending in the hub without changing the playing station`, async ({
    page,
  }) => {
    await armPreferences(page, release);
    await page.goto('/radio/flash-fm');
    const dialog = await openWheel(page);
    const { center, first, second } = await wheelPoints(dialog);
    await move(page.mouse, first);
    await page.mouse.down();
    await move(page.mouse, second);
    await expect(dialog.getByTestId('sector-cocoteo-fm')).toHaveAttribute('aria-pressed', 'true');
    await move(page.mouse, center);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('player-station').first()).toContainText(/Flash FM/i);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('wheel-open').filter({ visible: true }).first()).toBeFocused();
  });
}

for (const release of [false, true]) {
  test(`dragging across sectors ${release ? 'commits in hold mode' : 'only previews in click mode'}`, async ({
    page,
  }) => {
    await armPreferences(page, release);
    await page.goto('/radio/flash-fm');
    const dialog = await openWheel(page);
    const { first, second } = await wheelPoints(dialog);
    await move(page.mouse, first);
    await page.mouse.down();
    await move(page.mouse, second);
    await expect(dialog.getByTestId('sector-cocoteo-fm')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('player-station').first()).toContainText(/Flash FM/i);
    await page.mouse.up();
    if (release) {
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId('player-station').first()).toContainText(/Cocoteo FM/i);
    } else {
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('player-station').first()).toContainText(/Flash FM/i);
    }
  });
}

test('centered controller, stick navigation and mapped button release preserve explicit selection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'leonida.fm.preferences.v1',
      JSON.stringify({
        confirmOnRelease: true,
        gamepadConfirm: 3,
        gamepadCancel: 2,
        motion: 'reduce',
      }),
    );
    const buttons = Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0,
    }));
    window.__wheelTestPad = {
      index: 0,
      id: 'controlled input',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons,
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__wheelTestPad],
    });
  });
  await page.goto('/radio/flash-fm');
  const dialog = await openWheel(page);
  await expect(dialog.getByTestId('sector-flash-fm')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    window.__wheelTestPad.axes = [Math.sin(Math.PI / 3), -0.5, 0, 0];
  });
  await expect(dialog.getByTestId('sector-cocoteo-fm')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(async () => {
    window.__wheelTestPad.buttons[3].pressed = true;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(dialog).toBeVisible();
  await page.evaluate(() => {
    window.__wheelTestPad.buttons[3].pressed = false;
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('player-station').first()).toContainText(/Cocoteo FM/i);
});
