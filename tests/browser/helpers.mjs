import { expect } from '@playwright/test';

export const audio = (page) => page.getByTestId('radio-audio');
export const state = (page) => page.getByTestId('audio-state').first();

export async function launchStation(page, slug = 'flash-fm') {
  await page.goto('/radio/' + slug);
  await page.getByTestId('play').first().click();
  await expectPlayback(page, slug);
}

export async function expectPlayback(page, slug) {
  await expect(state(page)).toHaveAttribute('data-state', 'playing');
  await expect
    .poll(() =>
      audio(page).evaluate((element) => ({
        playing: !element.paused && !element.ended && element.readyState >= 2,
        source: new URL(element.currentSrc || location.href).pathname,
      })),
    )
    .toEqual({
      playing: true,
      source: expect.stringMatching(new RegExp('/audio/' + slug + '-[12]\\.mp3$')),
    });
}

// Compare movement within a single decoded file. Rolling into the following cut
// while we sample still counts as progress once the next media clock advances.
export async function expectAdvancingClock(page) {
  await expect
    .poll(
      async () =>
        audio(page).evaluate(async (element) => {
          const before = { src: element.currentSrc, time: element.currentTime };
          await new Promise((resolve) => setTimeout(resolve, 320));
          return (
            element.currentSrc === before.src &&
            !element.paused &&
            element.currentTime > before.time + 0.1
          );
        }),
      { message: 'The browser decodes the MP3 and its playback time advances' },
    )
    .toBe(true);
}

export async function waitForArtwork(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((img) => img.loading !== 'lazy')
        .map((img) => img.decode().catch(() => {})),
    );
  });
}

export async function openWheel(page) {
  const button = page.getByTestId('wheel-open').filter({ visible: true }).first();
  await button.click();
  return page.getByTestId('wheel-dialog');
}

export async function confirmSector(page, slug) {
  const dialog = page.getByTestId('wheel-dialog');
  const sector = dialog.getByTestId('sector-' + slug);
  // A wedge's SVG bounding box includes its clipped cover art and may extend
  // into its neighbours. Target the label's actual screen-space origin.
  const point = await sector.evaluate((element) => {
    const label = element.querySelector('.lfm-wheel-mark');
    const matrix = label?.getScreenCTM();
    if (!matrix) throw new Error('Wheel label is outside the rendered SVG');
    return { x: matrix.e, y: matrix.f, touch: navigator.maxTouchPoints > 0 };
  });
  if (point.touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  // Selecting a visible sector starts a 105 ms exit transition. A second
  // click during that interval could land on the page behind the dialog.
  await expect(dialog).toBeHidden();
}

export async function documentFits(page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
  }));
  expect(widths.content, 'The viewport must not scroll horizontally').toBeLessThanOrEqual(
    widths.viewport + 1,
  );
}
