import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices, expect } from '@playwright/test';
import { baseURL, evidenceDirectory, executablePath } from './environment.mjs';
import { documentFits, openWheel, state, waitForArtwork } from './helpers.mjs';

const cases = [
  { name: 'landing-desktop', width: 1920, height: 1080, route: '/' },
  { name: 'landing-laptop', width: 1440, height: 900, route: '/' },
  { name: 'radio-desktop', width: 1440, height: 900, route: '/radio/flash-fm', action: 'play' },
  { name: 'radio-wheel', width: 1440, height: 900, route: '/radio/cocoteo-fm', action: 'wheel' },
  {
    name: 'radio-tablet',
    width: 834,
    height: 1112,
    route: '/radio/cocoteo-fm',
    profile: 'iPad (gen 7)',
  },
  { name: 'landing-iphone', width: 390, height: 844, route: '/', profile: 'iPhone 13' },
  {
    name: 'radio-android',
    width: 412,
    height: 915,
    route: '/radio/the-chamber',
    profile: 'Pixel 7',
  },
  {
    name: 'radio-landscape',
    width: 844,
    height: 390,
    route: '/radio/dirty-south',
    profile: 'iPhone 13',
  },
  { name: 'reduced-motion', width: 1280, height: 800, route: '/radio/afro-bank', reduced: true },
  {
    name: 'connection-error',
    width: 1280,
    height: 800,
    route: '/radio/flash-fm',
    action: 'failure',
  },
  { name: 'broadcast-unavailable', width: 1280, height: 800, route: '/settings', action: 'live' },
];

export async function captureScreens() {
  const output = path.join(evidenceDirectory, 'screenshots');
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath });
  const records = [];
  try {
    for (const entry of cases) {
      const context = await browser.newContext({
        ...(entry.profile ? devices[entry.profile] : {}),
        baseURL,
        serviceWorkers: 'block',
        viewport: { width: entry.width, height: entry.height },
        deviceScaleFactor: 1,
        reducedMotion: entry.reduced ? 'reduce' : 'no-preference',
        locale: 'en-US',
      });
      try {
        const page = await context.newPage();
        if (entry.action === 'failure')
          await page.route('**/audio/*.mp3*', (route) => route.abort('failed'));
        await page.goto(entry.route);
        await expect(page.getByTestId('player-station').first()).toBeAttached();
        if (entry.action === 'play' || entry.action === 'failure') {
          await page.getByTestId('play').first().click();
          await expect(state(page)).toHaveAttribute(
            'data-state',
            entry.action === 'failure' ? /error|reconnecting|unavailable/ : 'playing',
          );
        } else if (entry.action === 'wheel') {
          const dialog = await openWheel(page);
          await expect(dialog).toBeVisible();
          await dialog.evaluate(async (element) => {
            const transitions = element
              .getAnimations({ subtree: true })
              .filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations));
            await Promise.allSettled(transitions.map((animation) => animation.finished));
          });
        } else if (entry.action === 'live') {
          await page.getByTestId('music-mode-soundtrack').click();
          await page.goto('/radio/flash-fm');
          const play = page.getByTestId('play').first();
          if (await play.isEnabled()) await play.click();
          await expect(state(page)).toHaveAttribute('data-state', /error|unavailable/);
        }
        await waitForArtwork(page);
        await documentFits(page);
        const filename = entry.name + '.png';
        await page.screenshot({
          path: path.join(output, filename),
          animations: 'disabled',
          fullPage: false,
        });
        records.push({
          name: entry.name,
          file: 'screenshots/' + filename,
          viewport: page.viewportSize(),
          displayScale: 1,
          deviceEmulation: entry.profile || null,
          reducedMotion: Boolean(entry.reduced),
          route: new URL(page.url()).pathname,
          playerState: await state(page).getAttribute('data-state'),
          capturedAt: new Date().toISOString(),
        });
        console.info('Captured', filename);
      } finally {
        await context.close();
      }
    }
    await writeFile(
      path.join(evidenceDirectory, 'visual-captures.json'),
      JSON.stringify(
        {
          browser: 'Chromium',
          version: browser.version(),
          screenshots: records,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await browser.close();
  }
}
