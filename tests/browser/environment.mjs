import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const resultsDirectory = path.join(projectRoot, 'test-results', 'browser');
export const evidenceDirectory = path.join(projectRoot, 'docs', 'qa');
export const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:4179';
export const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.platform === 'linux' && existsSync('/usr/bin/chromium')
    ? '/usr/bin/chromium'
    : undefined);
