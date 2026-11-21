import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { baseURL, evidenceDirectory, projectRoot } from '../tests/browser/environment.mjs';

const args = process.argv.slice(2);
const capture = args.includes('--capture');
const evidence = args.includes('--evidence');
const audit = args.includes('--audit');
const lighthouse = args.includes('--lighthouse');
const mobileWebKit = args.includes('--webkit');
const passThrough = args.filter(
  (value) => !['--capture', '--evidence', '--audit', '--lighthouse', '--webkit'].includes(value),
);

if (args.includes('--fixture')) {
  const { withLocalFixture } = await import('../tests/browser/local-fixture.mjs');
  await withLocalFixture(args.filter((arg) => arg !== '--fixture'));
} else if (mobileWebKit) {
  const { checkMobileWebKit } = await import('../tests/browser/webkit.mjs');
  await checkMobileWebKit();
} else if (lighthouse) {
  const { measureLighthouse } = await import('../tests/browser/performance.mjs');
  await measureLighthouse();
} else if (capture) {
  // Screens need a running instance at PLAYWRIGHT_BASE_URL.
  const { captureScreens } = await import('../tests/browser/capture.mjs');
  await captureScreens();
} else {
  const require = createRequire(import.meta.url);
  const cli = require.resolve('@playwright/test/cli');
  const jsonReport = path.join(projectRoot, 'test-results', 'browser-report.json');
  if (evidence) mkdirSync(path.dirname(jsonReport), { recursive: true });
  const cmd = [
    cli,
    'test',
    '--config',
    'tests/browser/playwright.config.mjs',
    ...(audit ? ['accessibility.spec.mjs'] : []),
    ...(evidence ? ['--reporter=list,json'] : []),
    ...passThrough,
  ];
  const result = spawnSync(process.execPath, cmd, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonReport },
  });
  if (result.error) throw result.error;
  if (evidence && !result.signal) {
    const report = JSON.parse(readFileSync(jsonReport, 'utf8'));
    const cases = [];
    function collect(suite) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
          const last = test.results.at(-1);
          cases.push({
            title: spec.title,
            file: spec.file,
            outcome: last?.status ?? test.status,
            milliseconds: last?.duration ?? null,
          });
        }
      }
      for (const child of suite.suites ?? []) collect(child);
    }
    for (const suite of report.suites) collect(suite);
    mkdirSync(evidenceDirectory, { recursive: true });
    writeFileSync(
      path.join(evidenceDirectory, 'browser-tests.json'),
      JSON.stringify(
        {
          tool: 'Playwright',
          browser: 'Chromium',
          node: process.version,
          startedAt: report.stats.startTime,
          elapsedMilliseconds: report.stats.duration,
          passed: cases.filter((row) => row.outcome === 'passed').length,
          failed: cases.filter((row) => !['passed', 'skipped'].includes(row.outcome)).length,
          skipped: cases.filter((row) => row.outcome === 'skipped').length,
          cases,
        },
        null,
        2,
      ) + '\n',
    );
  }
  if (result.status !== 0) {
    if (!process.env.PLAYWRIGHT_BASE_URL && process.env.SITES_MANAGED_LINUX_CONTAINER === '1') {
      console.error(
        'Set PLAYWRIGHT_BASE_URL to the running managed preview. Current target:',
        baseURL,
      );
    }
    process.exitCode = result.status ?? 1;
  }
}
