import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { webkit, devices, expect } from '@playwright/test';
import { baseURL, evidenceDirectory } from './environment.mjs';
import {
  confirmSector,
  documentFits,
  expectAdvancingClock,
  expectPlayback,
  openWheel,
  waitForArtwork,
} from './helpers.mjs';

export async function checkMobileWebKit() {
  const browser = await webkit.launch();
  const cases = [];
  const startedAt = new Date().toISOString();
  const output = path.join(evidenceDirectory, 'screenshots');
  await mkdir(output, { recursive: true });
  try {
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      deviceScaleFactor: 1,
      baseURL,
      locale: 'en-US',
    });
    const page = await context.newPage();
    await page.goto('/');
    await waitForArtwork(page);
    await expect(page.getByTestId('enter')).toBeVisible();
    await documentFits(page);
    await page.screenshot({
      path: path.join(output, 'landing-mobile-webkit.png'),
      animations: 'disabled',
    });
    cases.push('Landing fits the iPhone viewport');
    await page.getByTestId('enter').tap();
    await expectPlayback(page, 'flash-fm');
    await expectAdvancingClock(page);
    cases.push('A user gesture starts the actual Flash FM recording');
    await expect(await openWheel(page)).toBeVisible();
    await confirmSector(page, 'cocoteo-fm');
    await expectPlayback(page, 'cocoteo-fm');
    await expectAdvancingClock(page);
    cases.push('Touching a radial sector switches the decoded MP3');
    await page.reload();
    await expect(page.getByTestId('player-station')).toContainText(/Cocoteo FM/i);
    await page.getByTestId('play').tap();
    await expectPlayback(page, 'cocoteo-fm');
    cases.push('Reload preserves the station and resumes after a new gesture');
    await context.close();
    await writeFile(
      path.join(evidenceDirectory, 'mobile-webkit.json'),
      JSON.stringify(
        {
          engine: 'Playwright WebKit',
          host: process.platform,
          deviceProfile: 'iPhone 13',
          physicalDevice: false,
          version: browser.version(),
          startedAt,
          endedAt: new Date().toISOString(),
          cases,
        },
        null,
        2,
      ) + '\n',
    );
    console.info('WebKit iPhone-profile smoke passed:', cases.length, 'checks');
  } finally {
    await browser.close();
  }
}
