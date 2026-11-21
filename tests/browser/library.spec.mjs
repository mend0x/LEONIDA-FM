import { test, expect } from '@playwright/test';
import { expectPlayback, launchStation } from './helpers.mjs';

test('favorite stations can be filtered and survive a new page load', async ({ page }) => {
  await page.goto('/stations');
  await page.getByRole('button', { name: /^Save favorite .*Cocoteo FM$/i }).click();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.getByTestId('tune-cocoteo-fm')).toBeVisible();
  await expect(page.getByTestId('tune-flash-fm')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.getByTestId('tune-cocoteo-fm')).toBeVisible();
  await page.getByRole('button', { name: /^Remove favorite .*Cocoteo FM$/i }).click();
  await expect(page.getByTestId('tune-cocoteo-fm')).toHaveCount(0);
});

test('Spanish, expanded stations and live bitrate preferences persist across page loads', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByLabel('Language', { exact: true }).selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  const quality = page.getByLabel('Calidad del directo');
  await quality.selectOption('lowest');
  await expect(page.getByText(/demos incluidas usan MP3 estéreo a 128 kbit/)).toBeVisible();
  await page.reload();
  await expect(quality).toHaveValue('lowest');
  await page.getByRole('switch', { name: 'Mostrar emisoras sin confirmar' }).click();
  await page.goto('/stations');
  await expect(page.getByRole('heading', { name: 'Señales sin confirmar' })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Buscar emisoras' });
  await search.fill('V-Rock');
  await expect(page.getByText('V-Rock', { exact: true })).toBeVisible();
  await page.goto('/radio/cocoteo-fm');
  await expect(page.getByTestId('play')).toHaveAccessibleName('Escuchar radio');
});

test('search exposes a real evidence link and mounts the artist player only after an explicit click', async ({
  page,
  request,
}) => {
  const list = await (await request.get('/api/stations')).json();
  const station = list.stations.find((item) => item.tracks.some((track) => track.youtubeId));
  const track = station.tracks.find((item) => item.youtubeId);
  const requested = [];
  await page.route('https://www.youtube-nocookie.com/embed/**', async (route) => {
    requested.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Provider test fixture</title>',
    });
  });
  await launchStation(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Music library' })
    .click();
  await expectPlayback(page, 'flash-fm');
  await page.getByRole('textbox', { name: 'Find track or artist' }).fill(track.title);
  const row = page
    .getByRole('article')
    .filter({ has: page.getByText(track.artist, { exact: true }) })
    .first();
  await expect(row.getByRole('link', { name: 'Source' })).toHaveAttribute('href', track.sourceUrl);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(requested).toEqual([]);
  await row.getByRole('button', { name: 'Watch' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    new RegExp('/embed/' + track.youtubeId),
  );
  await expect.poll(() => requested).toContain('/embed/' + track.youtubeId);
  expect(
    await page.locator('audio').evaluateAll((elements) => elements.every((el) => el.paused)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
