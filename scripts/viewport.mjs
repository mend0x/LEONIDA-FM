import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  dir = 'dist/client/qa';
await mkdir(dir, { recursive: true });
for (const asset of ['viewport.html', 'viewport.js'])
  await copyFile('tests/fixtures/' + asset, dir + '/' + asset);
await copyFile(require.resolve('axe-core/axe.min.js'), dir + '/axe.min.js');
console.log(
  'Local responsive fixture available at /qa/viewport.html?w=390&h=844&view=/ . Use &audit=1 for axe results. Rebuild before releasing.',
);
