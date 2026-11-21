import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createNodeHandler } from '../server/node.mjs';
if (existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('-')
    ? args[index + 1]
    : fallback;
};
const managed = process.env.SITES_MANAGED_LINUX_CONTAINER === '1';
const host = value('--host', process.env.HOST || (managed ? '0.0.0.0' : '127.0.0.1'));
const port = Number(value('--port', process.env.PORT || 3000));
const handler = createNodeHandler();
await handler.api.ready();
if ((managed || args.includes('--production')) && existsSync('dist/client/index.html')) {
  const server = createServer(handler);
  server.on('close', () => handler.close());
  server.listen(port, host, () =>
    console.log('Leonida FM production preview on http://' + host + ':' + port),
  );
} else {
  const { createServer: createVite } = await import('vite');
  const vite = await createVite({
    server: { host, port, strictPort: true, allowedHosts: ['terminal.local'] },
    plugins: [
      {
        name: 'radio-api',
        configureServer(server) {
          server.middlewares.use(handler);
          server.httpServer?.once('close', () => handler.close());
        },
      },
    ],
  });
  await vite.listen();
  vite.printUrls();
}
