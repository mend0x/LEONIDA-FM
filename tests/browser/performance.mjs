import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { baseURL, evidenceDirectory, executablePath, projectRoot } from './environment.mjs';

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Lighthouse exited with ' + code)),
    );
  });
}

export async function measureLighthouse() {
  const require = createRequire(import.meta.url);
  // Keeping this optional prevents installing Lighthouse in the production image.
  const cli =
    process.env.LIGHTHOUSE_CLI ||
    (require.resolve.paths('lighthouse') ?? [])
      .map((root) => path.join(root, 'lighthouse', 'cli', 'index.js'))
      .find((file) => existsSync(file));
  if (!cli)
    throw new Error(
      'Install the optional Lighthouse CLI or set LIGHTHOUSE_CLI to its cli/index.js entry point.',
    );
  const raw = path.join(projectRoot, 'test-results', 'lighthouse');
  await mkdir(raw, { recursive: true });
  await mkdir(evidenceDirectory, { recursive: true });
  const samples = [];
  for (const [route, label] of [
    ['/', 'entry'],
    ['/radio/flash-fm', 'receiver'],
  ]) {
    for (const profile of ['mobile', 'desktop']) {
      const destination = path.join(raw, label + '-' + profile + '.json');
      const args = [
        cli,
        new URL(route, baseURL).href,
        '--quiet',
        '--only-categories=performance,accessibility,best-practices,seo',
        '--chrome-flags=--headless --disable-dev-shm-usage' +
          (process.env.LIGHTHOUSE_CI_NO_SANDBOX === '1' ? ' --no-sandbox' : ''),
        '--output=json',
        '--output-path=' + destination,
        '--max-wait-for-load=30000',
      ];
      if (profile === 'desktop') args.push('--preset=desktop');
      console.info('Auditing', route, profile);
      await run(process.execPath, args, {
        ...process.env,
        ...(executablePath ? { CHROME_PATH: executablePath } : {}),
      });
      const lhr = JSON.parse(await readFile(destination, 'utf8'));
      if (lhr.runtimeError) throw new Error(lhr.runtimeError.message || lhr.runtimeError.code);
      const metrics = {};
      for (const id of [
        'first-contentful-paint',
        'largest-contentful-paint',
        'total-blocking-time',
        'cumulative-layout-shift',
        'speed-index',
        'total-byte-weight',
      ]) {
        const audit = lhr.audits[id];
        if (audit)
          metrics[id] = { value: audit.numericValue ?? null, unit: audit.numericUnit ?? null };
      }
      const categories = Object.fromEntries(
        Object.entries(lhr.categories).map(([key, value]) => [
          key,
          Number.isFinite(value.score) ? Math.round(value.score * 100) : null,
        ]),
      );
      const unsuccessful = Object.values(lhr.audits).filter(
        (audit) => typeof audit.score === 'number' && audit.score < 1,
      );
      samples.push({
        route,
        profile,
        timestamp: lhr.fetchTime,
        lighthouse: lhr.lighthouseVersion,
        hostBrowser: lhr.environment.hostUserAgent,
        throttling: lhr.configSettings.throttling,
        throttlingMethod: lhr.configSettings.throttlingMethod,
        categories,
        metrics,
        incompleteAudits: Object.values(lhr.audits)
          .filter((a) => a.scoreDisplayMode === 'error')
          .map((a) => a.id),
        auditsBelowFullScore: unsuccessful.map((a) => ({ id: a.id, score: a.score })),
        warnings: lhr.runWarnings,
      });
      console.info(categories);
    }
  }
  await writeFile(
    path.join(evidenceDirectory, 'lighthouse.json'),
    JSON.stringify(
      {
        method:
          'One cold navigation per route and Lighthouse profile. Separate Chrome process and temporary profile for each run.',
        samples,
      },
      null,
      2,
    ) + '\n',
  );
}
