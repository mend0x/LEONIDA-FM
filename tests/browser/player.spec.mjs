import { test, expect } from '@playwright/test';
import {
  audio,
  confirmSector,
  expectAdvancingClock,
  expectPlayback,
  launchStation,
  openWheel,
  state,
} from './helpers.mjs';

const allSlugs = [
  'flash-fm',
  'cocoteo-fm',
  'back-country',
  'the-chamber',
  'dirty-south',
  'afro-bank',
];

test('landing stays silent, then explicitly starts and pauses an actual original recording', async ({
  page,
}) => {
  const failures = [];
  page.on('pageerror', (err) => failures.push(err.message));
  await page.addInitScript(() => {
    const createAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function (...args) {
      const node = createAnalyser.apply(this, args);
      Object.defineProperty(window, '__lastRadioAnalyser', { value: node, configurable: true });
      return node;
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('enter')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('audio').evaluateAll((elements) => elements.every((item) => item.paused)),
    )
    .toBe(true);
  await page.getByTestId('enter').click();
  await expect(page.getByTestId('player-station').first()).toContainText(/Flash FM/i);
  await expectPlayback(page, 'flash-fm');
  await expectAdvancingClock(page);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const node = window.__lastRadioAnalyser;
          if (!node || node.context.state !== 'running') return 0;
          const samples = new Float32Array(node.fftSize);
          node.getFloatTimeDomainData(samples);
          return Math.max(...samples.map(Math.abs));
        }),
      { message: 'Original audio has decoded, non-silent samples in Web Audio' },
    )
    .toBeGreaterThan(0.001);
  await page.getByTestId('play').first().click();
  await expect(state(page)).toHaveAttribute('data-state', 'paused');
  expect(
    await page.locator('audio').evaluateAll((elements) => elements.every((el) => el.paused)),
  ).toBe(true);
  await page.getByTestId('play').first().click();
  await expectPlayback(page, 'flash-fm');
  expect(failures).toEqual([]);
});

test('station cards and wheel tune different labeled audio sources', async ({ page }) => {
  await launchStation(page);
  await page.getByTestId('tune-cocoteo-fm').first().click();
  await expect(page.getByTestId('player-station').first()).toContainText(/Cocoteo FM/i);
  await expectPlayback(page, 'cocoteo-fm');
  await expect(await openWheel(page)).toBeVisible();
  await confirmSector(page, 'the-chamber');
  await expect(page.getByTestId('player-station').first()).toContainText(/The Chamber/i);
  await expectPlayback(page, 'the-chamber');
  await expectAdvancingClock(page);
});

test('M, Space, W, Escape and arrows operate the radio from the keyboard', async ({ page }) => {
  await launchStation(page);
  // Move focus to the page; Space on a focused button has its native activation meaning.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('m');
  await expect.poll(() => audio(page).evaluate((el) => el.muted)).toBe(true);
  await page.keyboard.press('m');
  await expect.poll(() => audio(page).evaluate((el) => el.muted)).toBe(false);
  await page.keyboard.press('Space');
  await expect(state(page)).toHaveAttribute('data-state', 'paused');
  await page.keyboard.press('Space');
  await expectPlayback(page, 'flash-fm');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-highlighted="true"]')).toHaveAttribute(
    'data-ribbon-station',
    'cocoteo-fm',
  );
  await expectPlayback(page, 'flash-fm');
  await page.keyboard.press('Enter');
  await expectPlayback(page, 'cocoteo-fm');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-highlighted="true"]')).toHaveAttribute(
    'data-ribbon-station',
    'flash-fm',
  );
  await page.keyboard.press('Enter');
  await expectPlayback(page, 'flash-fm');
  await page.keyboard.press('w');
  await expect(page.getByTestId('wheel-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wheel-dialog')).toBeHidden();
  await page.keyboard.press('w');
  await expect(page.getByTestId('wheel-dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('wheel-dialog')).toBeHidden();
  await expectPlayback(page, 'cocoteo-fm');
});

test('five rapid tunes leave only the last media source playing', async ({ page }) => {
  await page.addInitScript(() => {
    const started = new Set();
    // Include media elements kept outside the document during a transition.
    Object.defineProperty(window, '__playingRadioElements', {
      value: () => [...started].filter((el) => !el.paused && !el.ended).length,
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      started.add(this);
      return play.apply(this, args);
    };
  });
  await launchStation(page);
  await page.evaluate(() => document.activeElement?.blur());
  for (const slug of allSlugs.slice(1)) {
    await page
      .getByTestId('tune-' + slug)
      .first()
      .click();
  }
  await expectPlayback(page, 'afro-bank');
  await expectAdvancingClock(page);
  await expect.poll(() => page.evaluate(() => window.__playingRadioElements())).toBe(1);
  await expect(audio(page)).toHaveCount(1);
});

test('mute, volume and selected station survive refresh; a saved link wins on direct entry', async ({
  page,
}) => {
  await launchStation(page, 'back-country');
  const slider = page.getByTestId('volume').first();
  await slider.focus();
  await slider.press('Home');
  for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  const rawValue = await slider.inputValue();
  const normalized = await slider.evaluate((input) => {
    const min = Number(input.min || 0),
      max = Number(input.max || 100);
    return (Number(input.value) - min) / (max - min);
  });
  expect(normalized).toBeGreaterThan(0);
  expect(normalized).toBeLessThan(1);
  await expect.poll(() => audio(page).evaluate((el) => el.volume)).toBeCloseTo(normalized, 2);
  await page.getByTestId('mute').first().click();
  await expect.poll(() => audio(page).evaluate((el) => el.muted)).toBe(true);
  await page.reload();
  await expect(page.getByTestId('player-station').first()).toContainText(/Back Country/i);
  await expect(slider).toHaveValue(rawValue);
  await page.getByTestId('play').first().click();
  await expectPlayback(page, 'back-country');
  await expect.poll(() => audio(page).evaluate((el) => el.muted)).toBe(true);
  await page.goto('/');
  await expect(page.getByTestId('player-station').first()).toContainText(/Back Country/i);
  await page.goto('/radio/dirty-south');
  await expect(page.getByTestId('player-station').first()).toContainText(/Dirty South/i);
  expect(
    await page.locator('audio').evaluateAll((elements) => elements.every((el) => el.paused)),
  ).toBe(true);
});

test('two independent listeners hear the same scheduled cut and phase', async ({
  page,
  browser,
}, info) => {
  await launchStation(page, 'flash-fm');
  await expectAdvancingClock(page);
  const second = await browser.newContext({
    baseURL: info.project.use.baseURL,
    serviceWorkers: 'block',
  });
  try {
    // Let the first receiver advance before the second joins.
    await page.waitForTimeout(2400);
    const later = await second.newPage();
    await launchStation(later, 'flash-fm');
    const read = (current) =>
      audio(current).evaluate((el) => ({ src: el.currentSrc, t: el.currentTime }));
    await expect
      .poll(
        async () => {
          const [first, other] = await Promise.all([read(page), read(later)]);
          return first.src && first.src === other.src ? Math.abs(first.t - other.t) : Infinity;
        },
        {
          message: 'Two local Chromium listeners should be within two seconds on the demo timeline',
        },
      )
      .toBeLessThan(2);
    await expectAdvancingClock(later);
  } finally {
    await second.close();
  }
});

test('a dropped MP3 moves the engine out of playing and a healthy source recovers', async ({
  page,
}) => {
  let brokenRequests = 0;
  let ready = false;
  await page.route('**/audio/cocoteo-fm-*.mp3*', async (route) => {
    if (ready) return route.continue();
    brokenRequests++;
    return route.abort('failed');
  });
  await launchStation(page);
  await page.getByTestId('tune-cocoteo-fm').first().click();
  await expect.poll(() => brokenRequests).toBeGreaterThan(0);
  await expect(state(page)).toHaveAttribute('data-state', /reconnecting|error|unavailable/);
  ready = true;
  // A switch is always available, even while the previous source is backing off.
  await page.getByTestId('tune-back-country').first().click();
  await expectPlayback(page, 'back-country');
  await page.getByTestId('tune-cocoteo-fm').first().click();
  await expectPlayback(page, 'cocoteo-fm');
  await expectAdvancingClock(page);
});

test('soundtrack mode reports missing disk songs and allows switching back to free radio', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByTestId('music-mode-soundtrack').click();
  await page.goto('/radio/flash-fm');
  const playButton = page.getByTestId('play').first();
  if (await playButton.isEnabled()) await playButton.click();
  await expect(state(page)).toHaveAttribute('data-state', /unavailable|error/);
  expect(
    await page.locator('audio').evaluateAll((elements) => elements.every((el) => el.paused)),
  ).toBe(true);
  await page.goto('/status');
  await expect(page.getByRole('main')).toContainText(/Flash FM/i);
  await page.goto('/settings');
  await page.getByTestId('music-mode-radio').click();
  await launchStation(page);
});

test('a transient network abort retries the selected station and decoded playback resumes', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/audio/dirty-south-*.mp3*', (route) => {
    requests++;
    return requests === 1 ? route.abort('connectionreset') : route.continue();
  });
  await launchStation(page);
  await page.getByTestId('tune-dirty-south').first().click();
  await expect.poll(() => requests, { timeout: 20_000 }).toBeGreaterThan(1);
  await expectPlayback(page, 'dirty-south');
  await expectAdvancingClock(page);
});
