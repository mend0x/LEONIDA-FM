import { build as bundleClient } from 'vite';
import { build as bundleWorker } from 'esbuild';
import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = process.cwd(),
  dist = path.join(root, 'dist'),
  client = path.join(dist, 'client');
await rm(dist, { recursive: true, force: true });
await bundleClient({
  build: { outDir: client, emptyOutDir: true, assetsInlineLimit: 0, target: 'es2022' },
  base: '/',
});
async function files(dir) {
  const list = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      list.map((v) => (v.isDirectory() ? files(path.join(dir, v.name)) : path.join(dir, v.name))),
    )
  ).flat();
}
const rel = (f) => '/' + path.relative(client, f).split(path.sep).join('/');
const resources = await files(client),
  shell = resources
    .map(rel)
    .filter(
      (x) =>
        x === '/index.html' ||
        x === '/manifest.webmanifest' ||
        x.startsWith('/assets/') ||
        x.startsWith('/brand/') ||
        x.startsWith('/art/'),
    );
const hash = createHash('sha256');
for (const f of resources) hash.update(await readFile(f));
const version = hash.digest('hex').slice(0, 16);
const sw = (await readFile('scripts/sw.template.js', 'utf8'))
  .replace('__REV__', version)
  .replace('const shell=__SHELL__;', 'const shell=' + JSON.stringify(shell) + ';');
await writeFile(path.join(client, 'sw.js'), sw);
if (existsSync('.openai/hosting.json')) {
  const types = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    woff: 'font/woff',
    woff2: 'font/woff2',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    png: 'image/png',
    ico: 'image/x-icon',
    webmanifest: 'application/manifest+json',
    json: 'application/json',
  };
  const map = Object.create(null);
  for (const file of await files(client)) {
    const bytes = await readFile(file);
    map[rel(file)] = [
      bytes.toString('base64'),
      types[path.extname(file).slice(1)] || 'application/octet-stream',
      bytes.length,
      '"' + createHash('sha256').update(bytes).digest('hex').slice(0, 20) + '"',
    ];
  }
  await mkdir(path.join(dist, 'server'), { recursive: true });
  await bundleWorker({
    entryPoints: ['worker/index.mjs'],
    outfile: path.join(dist, 'server/index.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: true,
    plugins: [
      {
        name: 'project-assets',
        setup(build) {
          build.onResolve({ filter: /^leonida:assets$/ }, () => ({
            path: 'manifest',
            namespace: 'local-assets',
          }));
          build.onLoad({ filter: /.*/, namespace: 'local-assets' }, () => ({
            contents: JSON.stringify(map),
            loader: 'json',
          }));
        },
      },
    ],
  });
  await mkdir(path.join(dist, '.openai'), { recursive: true });
  await copyFile('.openai/hosting.json', path.join(dist, '.openai/hosting.json'));
}
console.log('Built Leonida FM ' + version);
