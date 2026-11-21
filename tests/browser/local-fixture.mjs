import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createNodeHandler } from '../../server/node.mjs';
import { projectRoot } from './environment.mjs';

/** Test the production handler with a disposable database and a loopback-only port. */
export async function withLocalFixture(args) {
  const handler = createNodeHandler({ databasePath: ':memory:', env: {} });
  await handler.api.ready();
  const server = createServer(handler);
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const target = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(target);
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('Build the production client before running the local test fixture.');
    }
    const child = spawn(process.execPath, ['scripts/test-browser.mjs', ...args], {
      cwd: projectRoot, stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BASE_URL: target }
    });
    const [code] = await once(child, 'exit');
    if (code !== 0) process.exitCode = code ?? 1;
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    handler.close();
  }
}
