import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { documentFits, openWheel } from './helpers.mjs';

for (const [description, route] of [
  ['landing', '/'],
  ['player', '/radio/flash-fm'],
  ['station directory', '/stations'],
  ['music explorer', '/music'],
  ['status', '/status'],
  ['settings', '/settings'],
  ['radio wheel', '/radio/flash-fm'],
]) {
  test('axe AA audit on the ' + description, async ({ page }, info) => {
    await page.goto(route);
    if (description === 'radio wheel') await openWheel(page);
    await expect(page.getByRole('main')).toBeAttached();
    await page.evaluate(() => document.fonts.ready);
    await documentFits(page);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
      .analyze();
    const issues = result.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      url: item.helpUrl,
      nodes: item.nodes.map((node) => ({ target: node.target, failure: node.failureSummary })),
    }));
    await info.attach('axe-wcag-aa.json', {
      body: Buffer.from(
        JSON.stringify(
          { description, tool: result.testEngine, issues, incomplete: result.incomplete.length },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    expect(issues).toEqual([]);
  });
}
